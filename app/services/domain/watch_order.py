"""
Watch Order resolution.

A watch_order_item stores only (media_type, entry_id) - no foreign key can span
the eight media tables. This module turns those pairs into display data.

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
    Comic,
    Manga,
    Movies,
    Novel,
    TVShows,
)
from app.utils import release_date

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
    "comic": Comic,
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
    "comic": "reading_status",
}

_TOTAL_FIELDS = {
    "anime": "ep_total",
    "tv-show": "ep_total",
    "cartoon": "ep_total",
    "manga": "ch_total",
    "novel": "ch_total",
    "comic": "issue_total",
}

VALID_WATCH_ORDER_MEDIA_TYPES = frozenset(MEDIA_TYPE_MODELS)

# The rungs a step can sit on, most important first. Mirrors
# ITEM_IMPORTANCE in frontend/src/components/tracker/WatchOrderEditor.jsx.
# One column rather than a pair of booleans, because a step has exactly one.
ITEM_IMPORTANCE = ("Essential", "Recommended", "Normal", "Optional")
DEFAULT_IMPORTANCE = "Normal"


def normalize_importance(value: Any) -> str:
    """
    Coerces a stored or incoming importance to one of the three rungs.

    Anything unrecognized - NULL from a row written before the column existed,
    a blank Google Sheets cell, a typo restored by Pull - falls back to
    "Normal", which is what an unmarked step has always meant.
    """
    if value is None:
        return DEFAULT_IMPORTANCE
    text = str(value).strip().title()
    return text if text in ITEM_IMPORTANCE else DEFAULT_IMPORTANCE


def _entry_payload(entry: Any, media_type: str) -> Dict[str, Any]:
    """Pulls the display fields the guide needs off a resolved entry."""
    total = getattr(entry, _TOTAL_FIELDS[media_type], None) if media_type in _TOTAL_FIELDS else None
    return {
        "missing": False,
        "display_name": entry.display_name,
        "release_display": release_display(entry, media_type),
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
    "release_display": None,
    "cover_image_file": None,
    "franchise_id": None,
    "status": None,
    "total_episodes": None,
    "ep_special": None,
}


def sort_items_by_reading_order(items: Iterable[Any]) -> List[Any]:
    """
    Puts a list's steps into reading order.

    Reading order is the step's own `position`, and nothing else. Parts do not
    sort the guide - they are drawn around whichever runs of adjacent steps
    share a `section_id`, so a part sits wherever its steps sit.

    This is what lets an unfiled step live anywhere: before the first part,
    between two parts, or after the last one. The older rule ranked steps by
    their section first and read every unfiled step ahead of every part, which
    made those positions unexpressible.

    A step with no position sorts last. Sorting is stable, so steps sharing a
    position keep the order the caller supplied rather than swapping run to run.
    """
    return sorted(
        items,
        key=lambda item: (item.position is None, item.position or 0.0),
    )


def first_section_break(items: Iterable[Any]) -> Optional[UUID]:
    """
    Returns the id of the first part that is interrupted, or None if none is.

    A part owns one unbroken run of steps: a `section_id` may not reappear once
    its run has ended. Without that rule one part would draw as two boxes
    carrying the same name, and "move this part" would have no single block to
    move.

    `items` must already be in reading order - the caller sorts, this only
    checks. Consecutive steps sharing a section form one run, so this walks the
    list once, remembering which sections have already closed.
    """
    closed = set()
    previous = None
    for item in items:
        current = item.section_id
        if current == previous:
            continue
        if current is not None and current in closed:
            return current
        if previous is not None:
            closed.add(previous)
        previous = current
    return None


def resolve_items(
    db: Session, items: Iterable[Any], viewer=None
) -> List[Dict[str, Any]]:
    """
    Enriches watch_order_item rows with their referenced entry's display data.

    Issues at most one query per media type present (never one per item), so a
    200-step guide still costs eight queries. Items whose entry_id no longer
    resolves - the entry was deleted, or the media_type is unknown - come back
    with missing=True rather than being dropped, so the admin can see and
    remove the broken step.
    """
    items = list(items)
    if viewer is not None and not viewer.is_superuser:
        from app.services.rbac.enforcement import drop_hidden_rows

        # A step is removed rather than flagged missing: missing means "broken
        # reference, go fix it", and a hidden entry is neither broken nor the
        # viewer's business.
        items = drop_hidden_rows(db, viewer, items, "media_type", "entry_id")

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
            "section_id": item.section_id,
            "media_type": item.media_type,
            "entry_id": item.entry_id,
            "ep_start": item.ep_start,
            "ep_end": item.ep_end,
            "importance": normalize_importance(item.importance),
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
    db: Session,
    franchise_ids: List[UUID],
    series_ids: List[UUID] = None,
    media_types: List[str] = None,
    viewer=None,
) -> List[Dict[str, Any]]:
    """
    Every entry belonging to the given franchises, flattened across the eight
    media tables into one pickable list.

    Backs the admin editor's entry picker. A collection-owned order spans
    several franchises, so doing this client-side would mean one request per
    franchise per media type - eight queries total is cheaper by far.

    `series_ids` narrows to the middle tier instead. Note anime_movies has no
    series_id column, so that type is simply absent from a series-scoped
    result - there is no way to attribute an anime movie to a series today.
    `media_types` restricts which tables are scanned at all, which is how the
    anime-only built-in order is produced.
    """
    if series_ids is None and not franchise_ids:
        return []
    if series_ids is not None and not series_ids:
        return []

    wanted = media_types or list(MEDIA_TYPE_MODELS)

    candidates: List[Dict[str, Any]] = []
    for media_type, model in MEDIA_TYPE_MODELS.items():
        if media_type not in wanted:
            continue
        if series_ids is not None:
            if not hasattr(model, "series_id"):
                continue
            query = db.query(model).filter(model.series_id.in_(series_ids))
        else:
            query = db.query(model).filter(model.franchise_id.in_(franchise_ids))
        # The picker must not offer an entry the viewer cannot see.
        if viewer is not None:
            from app.services.rbac.enforcement import apply_entry_visibility

            query = apply_entry_visibility(query, model, media_type, db, viewer)
        rows = query.all()
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
                    # Computed here, where the row is already loaded, so
                    # build_release_items never has to re-fetch entries. Not
                    # part of WatchOrderCandidate, so it is dropped from the
                    # API response by the response model.
                    "release_key": release_sort_key(row, media_type),
                    "display_name": row.display_name,
                    # Human-readable, at whatever precision the entry stores.
                    "release_display": release_display(row, media_type),
                    # Every title the entry answers to, lowercased. The picker
                    # filters client-side, and display_name is only ever one of
                    # these - searching "cowboy bebop" must find an entry
                    # displayed under its Chinese title.
                    "search_names": sorted(row.get_all_names()),
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


def release_sort_key(entry: Any, media_type: str) -> tuple:
    """
    (year, month, day) for an entry, or UNDATED when nothing parses.

    The column consulted, and the order for the multi-region types, comes from
    release_date.RELEASE_PRIORITY — the single source of truth. Precision is
    limited by whatever the entry stores: a manga carrying only a year cannot
    be placed accurately against a movie with a full date, so entries sharing a
    year sort together and are then broken by name.
    """
    for field in release_date.RELEASE_PRIORITY.get(media_type, ()):
        parsed = release_date.sort_key(getattr(entry, field, None))
        if parsed is not None:
            return parsed
    return release_date.UNDATED


def release_display(entry: Any, media_type: str) -> Optional[str]:
    """
    The entry's release date as stored, for showing next to a step.

    Deliberately NOT derived from release_sort_key: that key invents missing
    precision ("2020" becomes 2020-01-01) so entries can be ordered against one
    another. Displaying that invented day would claim a precision the entry
    does not have.
    """
    for field in release_date.RELEASE_PRIORITY.get(media_type, ()):
        shown = release_date.display(getattr(entry, field, None))
        if shown is not None:
            return shown
    return None


def build_release_items(
    db: Session,
    franchise_ids: List[UUID],
    list_id: UUID = None,
    series_ids: List[UUID] = None,
    media_types: List[str] = None,
) -> List[Dict[str, Any]]:
    """
    Those entries as an ordered release-order step list.

    Computed on read rather than stored, so entries added later appear without
    anyone regenerating anything. Undated entries sort to the bottom by name.
    """
    candidates = list_candidate_entries(
        db, franchise_ids, series_ids=series_ids, media_types=media_types
    )

    # Sorted on the key list_candidate_entries already computed - no second
    # pass over the media tables.
    candidates.sort(key=lambda c: (c["release_key"], c["display_name"] or ""))

    items = []
    for index, c in enumerate(candidates, start=1):
        items.append(
            {
                # Synthetic, stable within one response. These steps have no
                # watch_order_item rows behind them, so nothing may be written
                # back against these ids.
                "system_id": c["entry_id"],
                # The step really does belong to this list, even though no
                # watch_order_item row backs it.
                "list_id": list_id,
                "position": float(index),
                "media_type": c["media_type"],
                "entry_id": c["entry_id"],
                "ep_start": None,
                "ep_end": None,
                # Generated steps have no watch_order_item row to carry a
                # rung, so every one of them is Normal - the same reason they
                # carry no note and no episode range.
                "importance": DEFAULT_IMPORTANCE,
                "note": None,
                "created_at": None,
                "updated_at": None,
                "missing": False,
                "display_name": c["display_name"],
                "release_display": c["release_display"],
                "cover_image_file": c["cover_image_file"],
                "franchise_id": c["franchise_id"],
                "status": c["status"],
                "total_episodes": c["total_episodes"],
                "ep_special": c["ep_special"],
            }
        )
    return items


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
