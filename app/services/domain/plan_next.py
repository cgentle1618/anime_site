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
from app.utils.plan_next_kinds import SIZE_MEASURE, scope_allowed

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


def validate_plan_target(
    db: Session, scope: str, media_type: str, target_id: UUID, kind: str = "next"
):
    """
    Returns None when the triple is plannable, else a human-readable reason.

    Kept here rather than in the router so Pull can reuse it later.
    """
    if not scope_allowed(kind, media_type, scope):
        return f"{media_type} cannot be planned at {scope} scope."
    if not target_exists(db, scope, media_type, target_id):
        return f"No {scope} with id {target_id}."
    return None


def entry_flag(db: Session, media_type: str, entry_id: UUID, kind: str = "next") -> bool:
    """Whether one entry is queued. Backs the watch_next / read_next fields."""
    return (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.scope == "entry",
            models.PlanNext.media_type == media_type,
            models.PlanNext.target_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
        is not None
    )


def planned_entry_ids(db: Session, media_type: str, kind: str = "next") -> set:
    """Every queued entry id of one media type, for list endpoints."""
    rows = (
        db.query(models.PlanNext.target_id)
        .filter(
            models.PlanNext.scope == "entry",
            models.PlanNext.media_type == media_type,
            models.PlanNext.kind == kind,
        )
        .all()
    )
    return {row[0] for row in rows}


def set_entry_flag(
    db: Session, media_type: str, entry_id: UUID, planned: bool, kind: str = "next"
) -> None:
    """
    Upsert or delete the entry-scope row behind watch_next / read_next.

    The flag stays on the entry schemas so the Add and Modify forms, the detail
    pages and the library filters keep working unchanged; plan_next is the only
    place the fact is stored.
    """
    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.scope == "entry",
            models.PlanNext.media_type == media_type,
            models.PlanNext.target_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
    )
    if planned and existing is None:
        db.add(
            models.PlanNext(
                media_type=media_type, scope="entry", target_id=entry_id, kind=kind
            )
        )
    elif not planned and existing is not None:
        db.delete(existing)


# The schema field name each media type uses for its plan flag. Keys are
# MediaTypeSpec.owner_type, which is already the hyphenated media_type value.
PLAN_FLAG_FIELD: dict[str, str] = {
    "anime": "watch_next",
    "anime-movie": "watch_next",
    "movie": "watch_next",
    "tv-show": "watch_next",
    "cartoon": "watch_next",
    "manga": "read_next",
    "novel": "read_next",
    "comic": "read_next",
}


def pop_plan_flag(media_type: str, data: dict):
    """
    Split watch_next / read_next out of a write payload.

    Shaped exactly like pop_remark in app/services/domain/remark_field.py, and
    for the same reason: the field is on the schema but not on the table. The
    third return value matters - a PATCH that never mentions the flag must leave
    the plan_next row alone, while a PUT that sends false must delete it.
    """
    field = PLAN_FLAG_FIELD.get(media_type)
    if field is None or field not in data:
        return data, None, False
    rest = {k: v for k, v in data.items() if k != field}
    return rest, data[field], True


def attach_plan_flag(db: Session, media_type: str, entry) -> None:
    """
    Set the virtual flag on an ORM instance before it is serialized.

    The response schema reads from attributes, and the column is gone, so the
    value has to be put back on the object. A plain instance attribute is enough
    - SQLAlchemy does not manage it.
    """
    field = PLAN_FLAG_FIELD.get(media_type)
    if field:
        setattr(entry, field, entry_flag(db, media_type, entry.system_id))


def delete_plans_for(db: Session, scope: str, target_id: UUID) -> int:
    """
    Remove every plan row pointing at one deleted thing.

    The target is FK-less - no single foreign key can span the eight entry
    tables plus series and franchise - so nothing cascades and each delete path
    has to call this, the same obligation media_relation already carries.
    Scoped by (scope, target_id) rather than by target_id alone, so the eight
    system_id spaces cannot collide.
    """
    rows = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.scope == scope,
            models.PlanNext.target_id == target_id,
        )
        .all()
    )
    for row in rows:
        db.delete(row)
    return len(rows)
