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


def validate_plan_target(db: Session, scope: str, media_type: str, target_id: UUID):
    """
    Returns None when the triple is plannable, else a human-readable reason.

    Kept here rather than in the router so Pull can reuse it later.
    """
    if not scope_allowed(media_type, scope):
        return f"{media_type} cannot be planned at {scope} scope."
    if not target_exists(db, scope, media_type, target_id):
        return f"No {scope} with id {target_id}."
    return None
