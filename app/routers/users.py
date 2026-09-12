"""
routers/users.py
User accounts, created and managed by the admin.

There is no self-registration by design: accounts exist so one person can hand
out a level of access, not so strangers can ask for one.

Two guards exist because both mistakes lock the admin out of their own site:
you cannot delete yourself, and you cannot remove the last account that can
still administer anything.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ
from app.services.rbac.resolver import Viewer, require_admin_authz, role_for_user
from app.services.rbac.seed_modes import MODE_SAFE
from app.services.security import get_password_hash

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/users",
    tags=["User Management"],
    dependencies=[Depends(require_admin_authz)],
)


def _held_access_modes(db: Session, user: models.User) -> list:
    """This account's modes, with the items it is denied from each.

    Rendered by the per-account panel as the MODE's own list with
    tick-to-deny, which is what makes decision 8 visible: denials only
    subtract, so a control that shows the ceiling and lets you remove from it
    cannot express something outside it.
    """
    label_names = {
        system_id: key
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        )
    }
    out = []
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
    for grant, mode in rows:
        denied_labels, denied_groups = [], []
        for label_id, group_key in db.query(
            models.UserAccessModeDenial.label_id,
            models.UserAccessModeDenial.field_group_key,
        ).filter(
            models.UserAccessModeDenial.user_access_mode_id == grant.system_id
        ):
            if label_id is not None and label_id in label_names:
                denied_labels.append(label_names[label_id])
            if group_key is not None:
                denied_groups.append(group_key)
        out.append(
            schemas.HeldAccessMode(
                mode_id=mode.system_id,
                key=mode.key,
                label=mode.label,
                is_default=bool(grant.is_default),
                denied_label_keys=sorted(denied_labels),
                denied_field_group_keys=sorted(denied_groups),
            )
        )
    return out


def _to_response(
    user: models.User, db: Session = None
) -> schemas.ManagedUserResponse:
    return schemas.ManagedUserResponse(
        id=user.id,
        username=user.username,
        role_id=user.role_id,
        role_name=user.role_ref.name if user.role_ref else None,
        list_is_public=bool(user.list_is_public),
        access_modes=_held_access_modes(db, user) if db is not None else [],
    )


def _get_or_404(db: Session, user_id: UUID) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _role_or_422(db: Session, role_id: UUID) -> models.Role:
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="Unknown role.")
    return role


def _can_administer(db: Session, role: models.Role) -> bool:
    if role is None:
        return False
    if role.is_root:
        return True
    # No role can be GRANTED admin.authz any more - it is locked off for every
    # one of them (permissions.locked_permissions), so in practice the branch
    # above is the only one that answers True. The row lookup stays because
    # this guard decides whether the last administrator may be demoted, and a
    # guard that reads the grants directly keeps answering correctly if the
    # lock table ever widens.
    return (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == role.system_id,
            models.RolePermission.permission == PERM_ADMIN_AUTHZ,
        )
        .first()
        is not None
    )


def _admin_count(db: Session, excluding: UUID = None) -> int:
    count = 0
    for user in db.query(models.User).all():
        if excluding is not None and user.id == excluding:
            continue
        if _can_administer(db, role_for_user(db, user)):
            count += 1
    return count


@router.get("/", response_model=List[schemas.ManagedUserResponse], summary="List Users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.username).all()
    return [_to_response(user, db) for user in users]


@router.post(
    "/",
    response_model=schemas.ManagedUserResponse,
    status_code=201,
    summary="Create User",
)
def create_user(payload: schemas.ManagedUserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="That username is taken.")
    role = _role_or_422(db, payload.role_id)

    user = models.User(
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        role_id=role.system_id,
    )
    db.add(user)
    db.flush()
    _grant_starting_mode(db, user)
    db.commit()
    db.refresh(user)
    return _to_response(user, db)


def _grant_starting_mode(db: Session, user: models.User) -> None:
    """A new account holds `safe` and nothing else (decision 4).

    An invitee starts narrow and is widened deliberately, rather than starting
    wide and being narrowed if somebody remembers. Granting it here rather
    than leaving the account mode-less is not politeness: an account holding
    NO mode resolves the empty object set, which is fail-closed and correct
    but looks exactly like a broken site to the person who just got an
    invitation.

    Silently does nothing if `safe` is absent - a database that has not been
    seeded is not this handler's problem to solve, and refusing the account
    creation over it would be worse.
    """
    safe = (
        db.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_SAFE)
        .first()
    )
    if safe is None:
        return
    db.add(
        models.UserAccessMode(
            user_id=user.id, mode_id=safe.system_id, is_default=True
        )
    )


@router.put(
    "/{user_id}/access-modes",
    response_model=schemas.ManagedUserResponse,
    summary="Replace an account's access modes",
)
def replace_access_modes(
    user_id: UUID,
    payload: schemas.UserAccessModes,
    db: Session = Depends(get_db),
):
    """
    Replace an account's whole set - grants, login default and denials.

    One payload, one write, one bump(), no partial states: the same contract
    PUT /roles/{id}/permissions has, and for the same reason - a half-applied
    authorization change is worse than a refused one.
    """
    user = _get_or_404(db, user_id)

    defaults = [grant for grant in payload.modes if grant.is_default]
    if len(defaults) > 1:
        # ix_one_default_mode_per_user would raise and surface as a 500. It is
        # a payload error, so it answers as one.
        raise HTTPException(
            status_code=422, detail="An account can have only one default access mode."
        )

    modes = {}
    for grant in payload.modes:
        mode = db.get(models.AccessMode, grant.mode_id)
        if mode is None:
            raise HTTPException(
                status_code=422, detail=f"Unknown access mode: {grant.mode_id}."
            )
        modes[grant.mode_id] = mode

    # DECISION 8: a mode is a CEILING. A denial naming something the mode does
    # not carry subtracts nothing, so storing it would be a no-op that reads
    # like a setting. The per-account panel is built so it cannot ask for one;
    # this is what makes that a guarantee rather than a rendering choice.
    for grant in payload.modes:
        mode = modes[grant.mode_id]
        carried_labels = {
            key
            for (key,) in db.query(models.ContentLabel.key)
            .join(
                models.AccessModeLabel,
                models.AccessModeLabel.label_id == models.ContentLabel.system_id,
            )
            .filter(models.AccessModeLabel.mode_id == mode.system_id)
        }
        stray = set(grant.denied_label_keys) - carried_labels
        if stray:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{mode.key} does not carry content label(s): "
                    f"{', '.join(sorted(stray))}. A mode is a ceiling - a "
                    "denial can only subtract what it already holds."
                ),
            )
        carried_groups = {
            key
            for (key,) in db.query(
                models.AccessModeFieldGroup.field_group_key
            ).filter(models.AccessModeFieldGroup.mode_id == mode.system_id)
        }
        stray_groups = set(grant.denied_field_group_keys) - carried_groups
        if stray_groups:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{mode.key} does not carry field group(s): "
                    f"{', '.join(sorted(stray_groups))}. A mode is a ceiling - "
                    "a denial can only subtract what it already holds."
                ),
            )

    # Replace wholesale. The denial rows hang off the grant rows, so deleting
    # those takes the adjustments with them through the FK cascade.
    db.query(models.UserAccessMode).filter(
        models.UserAccessMode.user_id == user.id
    ).delete(synchronize_session=False)
    db.flush()

    label_ids = {
        key: system_id
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        )
    }
    for grant in payload.modes:
        row = models.UserAccessMode(
            user_id=user.id, mode_id=grant.mode_id, is_default=grant.is_default
        )
        db.add(row)
        db.flush()
        for key in sorted(set(grant.denied_label_keys)):
            db.add(
                models.UserAccessModeDenial(
                    user_access_mode_id=row.system_id, label_id=label_ids[key]
                )
            )
        for key in sorted(set(grant.denied_field_group_keys)):
            db.add(
                models.UserAccessModeDenial(
                    user_access_mode_id=row.system_id, field_group_key=key
                )
            )

    db.commit()
    # _DENIAL_CACHE is keyed on the grant row's id, and those ids just changed.
    cache.bump()
    db.refresh(user)
    return _to_response(user, db)


@router.patch(
    "/{user_id}", response_model=schemas.ManagedUserResponse, summary="Update User"
)
def update_user(
    user_id: UUID,
    payload: schemas.ManagedUserUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    user = _get_or_404(db, user_id)

    if payload.username and payload.username != user.username:
        clash = (
            db.query(models.User)
            .filter(models.User.username == payload.username)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="That username is taken.")
        user.username = payload.username

    if payload.password:
        user.hashed_password = get_password_hash(payload.password)

    if payload.role_id and payload.role_id != user.role_id:
        role = _role_or_422(db, payload.role_id)
        would_lose_admin = _can_administer(
            db, role_for_user(db, user)
        ) and not _can_administer(db, role)
        if would_lose_admin and _admin_count(db, excluding=user.id) == 0:
            raise HTTPException(
                status_code=409,
                detail="This is the last account that can administer the site.",
            )
        user.role_id = role.system_id

    db.commit()
    db.refresh(user)
    cache.bump()
    return _to_response(user, db)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    user = _get_or_404(db, user_id)

    if admin.username == user.username:
        raise HTTPException(status_code=409, detail="You cannot delete yourself.")
    if _can_administer(db, role_for_user(db, user)) and _admin_count(
        db, excluding=user.id
    ) == 0:
        raise HTTPException(
            status_code=409,
            detail="This is the last account that can administer the site.",
        )

    db.delete(user)
    db.commit()
    return None
