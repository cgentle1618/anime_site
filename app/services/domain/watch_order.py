"""
Watch Order resolution.

A watch_order_item stores only (media_type, entry_id) - no foreign key can span
the seven media tables. This module turns those pairs into display data.

Resolution happens on the backend rather than in the page because a
collection-scoped order spans franchises, so the frontend has no reason to
already hold the referenced entries.
"""

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Manga,
    Movies,
    Novel,
    TVShows,
)

# Slug -> model. Slugs mirror frontend/src/config/mediaRegistry.js and the
# VALID_MEDIA_TYPES set in app/routers/form_defaults.py.
MEDIA_TYPE_MODELS = {
    "anime": Anime,
    "anime-movie": AnimeMovies,
    "movie": Movies,
    "tv-show": TVShows,
    "cartoon": Cartoon,
    "manga": Manga,
    "novel": Novel,
}

# Per type: which column holds the progress status, and which holds the unit
# count an episode range would be measured against. Movies and anime movies
# have neither a count nor episodes, so their total stays None.
_STATUS_FIELDS = {
    "anime": "watching_status",
    "anime-movie": "watching_status",
    "movie": "watching_status",
    "tv-show": "watching_status",
    "cartoon": "watching_status",
    "manga": "reading_status",
    "novel": "reading_status",
}

_TOTAL_FIELDS = {
    "anime": "ep_total",
    "tv-show": "ep_total",
    "cartoon": "ep_total",
    "manga": "ch_total",
    "novel": "ch_total",
}

VALID_WATCH_ORDER_MEDIA_TYPES = frozenset(MEDIA_TYPE_MODELS)


def _entry_payload(entry: Any, media_type: str) -> Dict[str, Any]:
    """Pulls the display fields the guide needs off a resolved entry."""
    total = getattr(entry, _TOTAL_FIELDS[media_type], None) if media_type in _TOTAL_FIELDS else None
    return {
        "missing": False,
        "display_name": entry.display_name,
        "cover_image_file": entry.cover_image_file,
        "franchise_id": entry.franchise_id,
        "status": getattr(entry, _STATUS_FIELDS[media_type], None),
        # Float on novel, Integer elsewhere; the schema wants an int.
        "total_episodes": int(total) if total is not None else None,
        # Anime only - the episode number a special sits at (0, 14.5), not a
        # count. Left as a float: 14.5 is the point of the field. Every other
        # media type simply has no such column.
        "ep_special": getattr(entry, "ep_special", None),
    }


_MISSING_PAYLOAD = {
    "missing": True,
    "display_name": None,
    "cover_image_file": None,
    "franchise_id": None,
    "status": None,
    "total_episodes": None,
    "ep_special": None,
}


def resolve_items(db: Session, items: Iterable[Any]) -> List[Dict[str, Any]]:
    """
    Enriches watch_order_item rows with their referenced entry's display data.

    Issues at most one query per media type present (never one per item), so a
    200-step guide still costs seven queries. Items whose entry_id no longer
    resolves - the entry was deleted, or the media_type is unknown - come back
    with missing=True rather than being dropped, so the admin can see and
    remove the broken step.
    """
    items = list(items)

    # Group the ids to look up, so each table is queried once.
    ids_by_type: Dict[str, set] = defaultdict(set)
    for item in items:
        if item.media_type in MEDIA_TYPE_MODELS and item.entry_id is not None:
            ids_by_type[item.media_type].add(item.entry_id)

    resolved: Dict[str, Dict[UUID, Any]] = {}
    for media_type, entry_ids in ids_by_type.items():
        model = MEDIA_TYPE_MODELS[media_type]
        rows = (
            db.query(model).filter(model.system_id.in_(list(entry_ids))).all()
        )
        resolved[media_type] = {row.system_id: row for row in rows}

    output: List[Dict[str, Any]] = []
    for item in items:
        base = {
            "system_id": item.system_id,
            "list_id": item.list_id,
            "position": item.position,
            "media_type": item.media_type,
            "entry_id": item.entry_id,
            "ep_start": item.ep_start,
            "ep_end": item.ep_end,
            "is_optional": item.is_optional,
            "note": item.note,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        entry = resolved.get(item.media_type, {}).get(item.entry_id)
        base.update(
            _entry_payload(entry, item.media_type) if entry else _MISSING_PAYLOAD
        )
        output.append(base)

    return output


def list_candidate_entries(
    db: Session, franchise_ids: List[UUID]
) -> List[Dict[str, Any]]:
    """
    Every entry belonging to the given franchises, flattened across the seven
    media tables into one pickable list.

    Backs the admin editor's entry picker. A collection-owned order spans
    several franchises, so doing this client-side would mean one request per
    franchise per media type - seven queries total is cheaper by far.
    """
    if not franchise_ids:
        return []

    candidates: List[Dict[str, Any]] = []
    for media_type, model in MEDIA_TYPE_MODELS.items():
        rows = (
            db.query(model)
            .filter(model.franchise_id.in_(franchise_ids))
            .all()
        )
        for row in rows:
            total = (
                getattr(row, _TOTAL_FIELDS[media_type], None)
                if media_type in _TOTAL_FIELDS
                else None
            )
            candidates.append(
                {
                    "media_type": media_type,
                    "entry_id": row.system_id,
                    "display_name": row.display_name,
                    "cover_image_file": row.cover_image_file,
                    "franchise_id": row.franchise_id,
                    # Same shape the resolver returns, so the admin editor can
                    # append a picked entry to its local list without refetching.
                    "status": getattr(row, _STATUS_FIELDS[media_type], None),
                    "total_episodes": int(total) if total is not None else None,
                    "ep_special": getattr(row, "ep_special", None),
                }
            )

    candidates.sort(key=lambda c: (c["media_type"], (c["display_name"] or "")))
    return candidates


def entry_exists(db: Session, media_type: str, entry_id: UUID) -> bool:
    """True when (media_type, entry_id) points at a row that actually exists."""
    model = MEDIA_TYPE_MODELS.get(media_type)
    if model is None:
        return False
    return (
        db.query(model.system_id).filter(model.system_id == entry_id).first()
        is not None
    )


def get_entry_franchise_id(
    db: Session, media_type: str, entry_id: UUID
) -> Optional[UUID]:
    """Returns the franchise an entry belongs to, or None if it doesn't resolve."""
    model = MEDIA_TYPE_MODELS.get(media_type)
    if model is None:
        return None
    row = (
        db.query(model.franchise_id).filter(model.system_id == entry_id).first()
    )
    return row[0] if row else None
