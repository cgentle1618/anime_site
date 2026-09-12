"""
Access-mode policy: which objects a session may reach.

The role axis (permissions.py, resolver.py) answers "what kinds of operation
may this account perform". This module answers "which objects can those
operations reach", and the two are disjoint by construction - the role axis
holds admin.*, manage.*, media_type.* and self.*; this axis holds content
labels and field groups, and neither can express the other.

Effective access = (the role's permissions) applied to (the active mode's
object set). A mode is a CEILING: per-account denials only subtract, so an
account's reach is always a subset of its mode's.

Resolution is fail-closed at every step, matching role_for_user's existing
"least access, not most" rule.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.resolver import Viewer, get_viewer
from app.services.rbac.seed_modes import (
    MODE_SAFE,
    MODE_UNRESTRICTED,
    seeded_modes,
)

if TYPE_CHECKING:  # pragma: no cover
    pass


@dataclass(frozen=True)
class ModeSets:
    """
    What a mode carries, or what a grant subtracts.

    One shape for both, because the resolution step is a set difference.
    """

    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ResolvedMode:
    """The active mode of one session, after denials."""

    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


EMPTY_MODE = ResolvedMode()


def resolve_mode(
    db: Session, user: Optional[models.User], token_mode_id: Optional[UUID]
) -> ResolvedMode:
    """
    Which objects this session may reach.

        token.mode  ->  still granted to this user?
                          yes -> effective = mode's sets - this pair's denials
                          no  -> effective = EMPTY SET
        no token    ->  the `safe` mode, or EMPTY SET if it is missing

    The claim NAMES A CHOICE, NOT A GRANT. Whether the account may still use
    the mode is resolved from the database on every request, exactly as the
    role already is - today's `role` claim is decorative and resolver.py says
    so. Revoking a mode or ticking a new denial therefore takes effect on the
    viewer's next request, even with a live cookie.

    The fallback for a revoked mode is the EMPTY SET, never the account's
    default. "Narrowest" is not well defined once modes are deliberately
    unordered, and falling back to is_default could WIDEN a session: sitting
    in `safe` when an admin revokes `safe` would hand the viewer
    `unrestricted` with no password. The empty set is the only fallback that
    cannot widen.

    A signed-in caller with no usable claim does NOT fall through to the guest
    default either. That mode is the anonymous policy, not this account's, and
    inheriting it would be a second fallback that can widen.
    """
    if user is None:
        # `safe` BY KEY, and not a flag on the table. Which mode an anonymous
        # visitor gets is not an administrator's choice: it is the definition
        # of the mode, and storing it as data means a Pull All, a migration or
        # a hand-edit can move it to `unrestricted` - a change that publishes
        # every labelled entry to the internet while looking like a successful
        # restore, and that nothing on any screen would report. The key is
        # safe to depend on because it is deliberately not patchable
        # (schemas/rbac.py): renaming one would detach the seeder from the row
        # it maintains.
        mode = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == MODE_SAFE)
            .first()
        )
        if mode is None:
            return EMPTY_MODE
        sets = cache.mode_sets(db, mode.system_id)
        return ResolvedMode(
            mode.system_id, mode.key, sets.label_ids, sets.field_groups
        )

    if token_mode_id is None:
        return EMPTY_MODE

    grant = (
        db.query(models.UserAccessMode)
        .filter(
            models.UserAccessMode.user_id == user.id,
            models.UserAccessMode.mode_id == token_mode_id,
        )
        .first()
    )
    if grant is None:
        return EMPTY_MODE

    mode = db.get(models.AccessMode, token_mode_id)
    if mode is None:
        return EMPTY_MODE

    sets = cache.mode_sets(db, mode.system_id)
    denials = cache.denials_for(db, grant.system_id)
    return ResolvedMode(
        mode.system_id,
        mode.key,
        sets.label_ids - denials.label_ids,
        sets.field_groups - denials.field_groups,
    )


def switch_requires_password(current: ResolvedMode, target: ResolvedMode) -> bool:
    """
    Whether moving from `current` to `target` needs the password again.

    A SET COMPARISON, not an ordering (spec decision 3). Narrowing is free;
    adding even one label or one field group asks for the password. Modes are
    deliberately unordered - with per-account denials they are genuinely not a
    total order - so "is the target narrower" can only mean "is its effective
    set a subset of mine".

    Both sides are EFFECTIVE sets, after denials. An account holding
    `borderline` minus `nsfw` reaches no more than `normal` does, so switching
    between them is free even though the mode is nominally wider.

    Computed here and published by /api/auth/me so the SPA never models this
    rule. Two implementations of one rule is how they drift, and the one in
    the browser would be the one nobody tested.
    """
    return not (
        target.label_ids <= current.label_ids
        and target.field_groups <= current.field_groups
    )


def held_modes(
    db: Session, user: Optional[models.User], active: ResolvedMode
) -> list[dict]:
    """
    Every mode this account holds, each with the cost of switching to it.

    A guest holds none - they have no account, so there is nothing to switch
    between; wanting more means logging in.
    """
    if user is None:
        return []

    rows = (
        db.query(models.UserAccessMode, models.AccessMode)
        .join(
            models.AccessMode,
            models.AccessMode.system_id == models.UserAccessMode.mode_id,
        )
        .filter(models.UserAccessMode.user_id == user.id)
        .order_by(models.AccessMode.sort_order, models.AccessMode.key)
        .all()
    )

    out = []
    for grant, mode in rows:
        sets = cache.mode_sets(db, mode.system_id)
        denials = cache.denials_for(db, grant.system_id)
        effective = ResolvedMode(
            mode.system_id,
            mode.key,
            sets.label_ids - denials.label_ids,
            sets.field_groups - denials.field_groups,
        )
        is_active = mode.system_id == active.mode_id
        out.append(
            {
                "id": str(mode.system_id),
                "key": mode.key,
                "label": mode.label,
                "is_active": is_active,
                # Switching to where you already are is a no-op, never a
                # widening - and the subset test would say so anyway, but
                # saying it explicitly keeps a denial edge from making the
                # active row ask for a password.
                "requires_password": (
                    False
                    if is_active
                    else switch_requires_password(active, effective)
                ),
            }
        )
    return out


def default_mode_id(db: Session, user: models.User) -> Optional[UUID]:
    """
    The mode a fresh login lands in: the account's is_default grant.

    None when the account holds no default, which resolve_mode turns into the
    empty set - so a login with no mode shows nothing rather than everything.
    """
    row = (
        db.query(models.UserAccessMode.mode_id)
        .filter(
            models.UserAccessMode.user_id == user.id,
            models.UserAccessMode.is_default.is_(True),
        )
        .first()
    )
    return row[0] if row else None


def grant_all_modes_to_existing_accounts(db: Session) -> None:
    """
    Every existing account holds all four modes and lands in `unrestricted`.

    This is what makes Phase B behaviour-neutral: for the owner's admin
    account, `unrestricted` is the faithful mapping of today's is_root,
    which sees everything. A NEW account gets `safe` only - that is runtime
    code in users.py's create handler, and it belongs with the admin panel
    that shows what an account holds.

    Idempotent, and deliberately all-or-nothing per account: an account that
    already holds ANY mode is left alone, including its is_default flag, so
    re-running never overwrites a choice somebody made.
    """
    modes = {m.key: m.system_id for m in db.query(models.AccessMode)}
    if len(modes) < len(seeded_modes()):
        return
    for user in db.query(models.User):
        held = (
            db.query(models.UserAccessMode)
            .filter(models.UserAccessMode.user_id == user.id)
            .first()
        )
        if held is not None:
            continue
        for key, mode_id in modes.items():
            db.add(
                models.UserAccessMode(
                    user_id=user.id,
                    mode_id=mode_id,
                    is_default=(key == MODE_UNRESTRICTED),
                )
            )
    db.flush()


def is_unscoped(db: Session, viewer: Viewer) -> bool:
    """
    Whether this session's mode reaches EVERYTHING.

    Computed against the two full sets, never a comparison against the key
    `unrestricted`: editing that mode must not silently widen the set of
    sessions that qualify, and an admin's own equivalent custom mode must
    qualify. A label minted today narrows every mode that does not carry it,
    which is the fail-closed direction.
    """
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS

    all_labels = {
        system_id for (system_id,) in db.query(models.ContentLabel.system_id)
    }
    return all_labels <= set(viewer.visible_label_ids) and set(
        FIELD_GROUP_KEYS
    ) <= set(viewer.field_groups)


def require_unscoped_mode(
    viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
) -> Viewer:
    """
    Gate a pipeline on the session's mode as well as on its permissions.

    Decision 14. A pipeline's object set is EVERY entry: the sheet holds one
    version of the data and Backup overwrites every tab, so a per-viewer
    filter would write a PARTIAL sheet over the complete one and a Pull All
    would restore a partial database - silent data loss rather than the
    information leak it was meant to close. The permission is therefore
    declared unscoped, and this dependency is what stops that being merely a
    trust assertion.

    This does NOT contradict "a mode never changes which KINDS of operation an
    account may perform". The mode still only decides which objects an
    operation reaches; it is the OPERATION that refuses to run against a
    subset, because a partial Backup is not a smaller version of the job, it
    is a corrupt one. The test is the same subset comparison a mode switch
    uses, with `required` fixed at everything. viewer.has(manage.pipelines)
    answers the same in `safe` as in `unrestricted`.

    401, not 404: the route's existence is not a secret, and the caller is
    being told to widen - which is a thing they can act on. 404 is the object
    axis, where indistinguishability is the property being protected.
    """
    if not is_unscoped(db, viewer):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Running a pipeline requires an unscoped access mode. Switch "
                "to a mode that carries every content label and field group."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer
