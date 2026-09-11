"""
Service layer for plan_next: size-group derivation and target validation.

Derivation is a Calculate-time sweep. It rewrites size_group_derived on every
franchise and series and never reads or writes size_group_manual, which is what
lets the admin's override survive every run.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.domain.size_group import bucket_for
from app.utils.media_resolver import OWNER_TABLES
from app.utils.plan_next_kinds import (
    PLAN_FLAG_FIELDS,
    SIZE_MEASURE,
    owner_kwargs,
    scope_allowed,
)

logger = logging.getLogger(__name__)

# The entry models a grouping tier can hold, per media type key. Only the five
# bucketed types appear: the other three have no vocabulary to derive into.
# Comic is series-only - it has no franchise scope, and comic entries bucket on
# their own issue_total, so a franchise-level comic key would never be read.
_DERIVABLE = {
    "anime": models.Anime,
    "tv-show": models.TVShows,
    "cartoon": models.Cartoon,
    "movie": models.Movies,
    "comic": models.Comic,
}
_SERIES_ONLY = {"comic"}


def _measure(entries: list, media_type: str) -> Optional[int]:
    """The number this type's thresholds are read against."""
    kind = SIZE_MEASURE[media_type]
    if kind == "count":
        return len(entries)
    column = "ep_total" if kind == "sum_ep_total" else "issue_total"
    return sum(getattr(e, column) or 0 for e in entries)


def _map_for(db: Session, tier: str, group_id: UUID) -> dict:
    """The full derived map for one franchise or series."""
    result: dict = {}
    for media_type, model in _DERIVABLE.items():
        if tier == "franchise" and media_type in _SERIES_ONLY:
            continue
        entries = db.query(model).filter(getattr(model, f"{tier}_id") == group_id).all()
        if not entries:
            continue
        bucket = bucket_for(media_type, _measure(entries, media_type))
        if bucket:
            result[media_type] = bucket
    return result


def derive_size_groups(db: Session) -> int:
    """
    Rewrite size_group_derived on every franchise and series.

    Returns how many groups changed, so Calculate can log something useful.
    Never touches size_group_manual.
    """
    changed = 0
    for tier, model in (("franchise", models.Franchise), ("series", models.Series)):
        for group in db.query(model).all():
            fresh = _map_for(db, tier, group.system_id)
            if group.size_group_derived != fresh:
                group.size_group_derived = fresh
                changed += 1
    logger.info("Derived size groups for %d group(s).", changed)
    return changed


def target_exists(db: Session, scope: str, media_type: str, target_id: UUID) -> bool:
    """
    True when the planned thing is really there.

    Entry scope resolves through OWNER_TABLES by media type; the two grouping
    scopes resolve by scope name, since a franchise is a franchise whichever
    tab it is queued under.
    """
    key = media_type if scope == "entry" else scope
    ref = OWNER_TABLES.get(key)
    if ref is None:
        return False
    return (
        db.query(ref.model).filter(ref.model.system_id == target_id).first() is not None
    )


def target_visible(db: Session, viewer, scope: str, media_type: str, target_id: UUID) -> bool:
    """
    Whether this viewer may see the planned target.

    Only entry scope can carry a content label - franchise and series are
    groups, not labelled media - so group-scope targets are always visible
    here and the row's own existence is the only gate.
    """
    if scope != "entry":
        return True
    from app.services.rbac.enforcement import entry_visible

    return entry_visible(db, viewer, media_type, target_id)


def validate_plan_target(
    db: Session, scope: str, media_type: str, target_id: UUID, kind: str = "next", *, viewer=None
):
    """
    Returns None when the triple is plannable, else a human-readable reason.

    A target that exists but is hidden from this viewer (a content label they
    lack) reads back the same "No {scope} with id {target_id}." a genuinely
    missing target does - the caller turns that into a 404, never a 403, so a
    hidden entry is indistinguishable from a missing one. viewer is optional
    so existing internal callers (Pull) that have no viewer keep working.

    Kept here rather than in the router so Pull can reuse it later.
    """
    if not scope_allowed(kind, media_type, scope):
        return f"{media_type} cannot be planned at {scope} scope."
    if not target_exists(db, scope, media_type, target_id):
        return f"No {scope} with id {target_id}."
    if not target_visible(db, viewer, scope, media_type, target_id):
        return f"No {scope} with id {target_id}."
    return None


def entry_flag(
    db: Session, media_type: str, entry_id: UUID, kind: str = "next", *, user_id
) -> bool:
    """Whether one entry is queued BY THIS USER. Backs watch_next / read_next."""
    if user_id is None:
        return False
    return (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
        is not None
    )


def planned_entry_ids(
    db: Session, media_type: str, kind: str = "next", *, user_id
) -> set:
    """Every entry id of one media type this user has queued, for list endpoints."""
    if user_id is None:
        return set()
    rows = (
        db.query(models.PlanNext.media_id)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id.isnot(None),
            models.PlanNext.kind == kind,
        )
        .all()
    )
    return {row[0] for row in rows}


def set_entry_flag(
    db: Session,
    media_type: str,
    entry_id: UUID,
    planned: bool,
    kind: str = "next",
    *,
    user_id,
) -> None:
    """
    Upsert or delete THIS USER's entry-scope row behind watch_next / read_next.

    The flag stays on the entry schemas so the Add and Modify forms, the detail
    pages and the library filters keep working unchanged; plan_next is the only
    place the fact is stored.
    """
    if user_id is None:
        return
    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
    )
    if planned and existing is None:
        db.add(
            models.PlanNext(
                user_id=user_id,
                media_type=media_type,
                kind=kind,
                **owner_kwargs("entry", entry_id),
            )
        )
    elif not planned and existing is not None:
        db.delete(existing)


def pop_plan_flag(media_type: str, data: dict):
    """
    Split watch_next/read_next/to_rewatch/to_reread out of a write payload.

    Shaped like pop_remark in app/services/domain/remark_field.py, and for the
    same reason: these fields are on the schema but not on the table. Returns
    (rest, [(kind, value), ...]) - only the fields that were actually present
    are included, so a PATCH that never mentions a flag leaves that plan_next
    row alone, while one that sends false deletes it.
    """
    rest = dict(data)
    present = []
    for field, kind in PLAN_FLAG_FIELDS.get(media_type, ()):
        if field in rest:
            present.append((kind, rest.pop(field)))
    return rest, present


def attach_plan_flag(db: Session, media_type: str, entry, *, user_id) -> None:
    """
    Set every virtual flag on an ORM instance before it is serialized.

    The response schema reads from attributes, and the column is gone, so the
    value has to be put back on the object. A plain instance attribute is enough
    - SQLAlchemy does not manage it.
    """
    for field, kind in PLAN_FLAG_FIELDS.get(media_type, ()):
        setattr(
            entry,
            field,
            entry_flag(db, media_type, entry.system_id, kind, user_id=user_id),
        )
