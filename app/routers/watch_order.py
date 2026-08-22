"""
routers/watch_order.py
Handles Watch Orders - named, ordered, cross-media-type viewing guides owned by
a Franchise or a Collection.

Reads are public (guests browse guides); every write is admin-only.

Separate from the per-entry `watch_order` Float column on anime/tv_show/etc,
which is untouched by this router.
"""

import logging
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.database import get_taipei_now
from app.dependencies import get_current_admin, get_db
from app.services.domain.watch_order import (
    MEDIA_TYPE_MODELS,
    build_release_items,
    VALID_WATCH_ORDER_MEDIA_TYPES,
    entry_exists,
    list_candidate_entries,
    resolve_items,
)
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watch-order", tags=["Watch Order"])


# ==========================================
# HELPERS
# ==========================================


def _get_list_or_404(db: Session, list_id: str) -> models.WatchOrderList:
    db_list = (
        db.query(models.WatchOrderList)
        .filter(models.WatchOrderList.system_id == list_id)
        .first()
    )
    if not db_list:
        raise HTTPException(status_code=404, detail="Watch order not found.")
    return db_list


def _get_item_or_404(db: Session, item_id: str) -> models.WatchOrderItem:
    db_item = (
        db.query(models.WatchOrderItem)
        .filter(models.WatchOrderItem.system_id == item_id)
        .first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Watch order item not found.")
    return db_item


def _validate_owner(franchise_id, collection_id, series_id=None) -> None:
    """
    Mirrors the ck_watch_order_list_single_owner check constraint.

    Caught here so a bad payload returns 400 instead of a 500 from the database.
    """
    if sum(1 for owner in (franchise_id, collection_id, series_id) if owner) != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "A watch order must belong to exactly one franchise, "
                "collection or series."
            ),
        )


def _validate_entry(db: Session, media_type, entry_id) -> None:
    """Rejects items pointing at an unknown media type or a nonexistent entry."""
    if media_type not in VALID_WATCH_ORDER_MEDIA_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    if entry_id is None or not entry_exists(db, media_type, entry_id):
        raise HTTPException(
            status_code=400, detail="Referenced entry does not exist."
        )


RELEASE_SOURCE = "release"
RELEASE_ANIME_SOURCE = "release-anime"

# The built-in orders, by auto_source. Each says how it is named and which
# media types it draws on; None means every type.
BUILT_IN_KINDS = {
    RELEASE_SOURCE: {"name": "Release Order", "media_types": None},
    RELEASE_ANIME_SOURCE: {"name": "Release Order (Anime)", "media_types": ["anime"]},
}

# A franchise holding a single work - one movie, one TV series, one novel - has
# nothing to put in an order. Below this, a release order is just noise.
MIN_ENTRIES_FOR_RELEASE = 2


def _owner_franchise_ids(db: Session, db_list: models.WatchOrderList) -> List[Any]:
    """The franchises whose entries a generated list draws on."""
    if db_list.franchise_id:
        return [db_list.franchise_id]
    if db_list.series_id:
        return []
    return [
        row[0]
        for row in db.query(models.Franchise.system_id)
        .filter(models.Franchise.collection_id == db_list.collection_id)
        .all()
    ]


def _generated_scope(db: Session, db_list: models.WatchOrderList) -> dict:
    """The arguments build_release_items needs for one generated list."""
    kind = BUILT_IN_KINDS.get(db_list.auto_source, BUILT_IN_KINDS[RELEASE_SOURCE])
    return {
        "franchise_ids": _owner_franchise_ids(db, db_list),
        "series_ids": [db_list.series_id] if db_list.series_id else None,
        "media_types": kind["media_types"],
    }


def _reject_if_generated(db_list: models.WatchOrderList) -> None:
    """
    Steps of a generated list have no rows behind them, so there is nothing to
    add to, edit, reorder or delete. Refused here rather than failing obscurely.
    """
    if db_list.auto_source:
        raise HTTPException(
            status_code=400,
            detail=(
                "This order's steps are generated from release dates and cannot "
                "be edited. Its name, type, note and flags still can."
            ),
        )


def _next_position(db: Session, list_id) -> float:
    """One past the list's current highest position, so new items append."""
    highest = (
        db.query(func.max(models.WatchOrderItem.position))
        .filter(models.WatchOrderItem.list_id == list_id)
        .scalar()
    )
    return float(highest) + 1.0 if highest is not None else 1.0


def _ordered_types(media_types) -> List[str]:
    """
    Distinct media types in a fixed order, so a list's scope reads the same on
    every surface instead of shifting with insertion order.
    """
    return [t for t in MEDIA_TYPE_MODELS if t in media_types]


def _summarize(db: Session, list_ids: List[Any]) -> dict:
    """
    Item count and distinct media types for many lists in ONE grouped query.

    Both are derived rather than stored: whether an order is single-type or
    cross-type is simply what its items are, and a column would have to be kept
    in step with every add and remove.
    """
    if not list_ids:
        return {}

    rows = (
        db.query(
            models.WatchOrderItem.list_id,
            models.WatchOrderItem.media_type,
            func.count(models.WatchOrderItem.system_id),
        )
        .filter(models.WatchOrderItem.list_id.in_(list_ids))
        .group_by(models.WatchOrderItem.list_id, models.WatchOrderItem.media_type)
        .all()
    )

    summary: dict = {}
    for list_id, media_type, count in rows:
        bucket = summary.setdefault(list_id, {"item_count": 0, "media_types": set()})
        bucket["item_count"] += count
        if media_type:
            bucket["media_types"].add(media_type)
    return summary


def _summarize_generated(db: Session, auto_lists: List[Any]) -> dict:
    """
    Item count and media types for built-in lists, batched.

    A built-in list has no watch_order_item rows, so _summarize returns zero for
    it. Counting per list would mean a query per media type each - with one per
    franchise and series that is thousands. Instead every owner is resolved
    once, then each media table is grouped by franchise_id and by series_id in
    a single query, so a page costs a fixed number of queries however many
    built-in lists it holds.
    """
    if not auto_lists:
        return {}

    # Collection-owned lists span their member franchises; resolve them all in
    # one query rather than one per list.
    collection_ids = [l.collection_id for l in auto_lists if l.collection_id]
    members: dict = {}
    if collection_ids:
        for fid, cid in (
            db.query(models.Franchise.system_id, models.Franchise.collection_id)
            .filter(models.Franchise.collection_id.in_(collection_ids))
            .all()
        ):
            members.setdefault(cid, []).append(fid)

    franchise_scope = {}
    series_scope = {}
    for l in auto_lists:
        if l.series_id:
            series_scope[l.system_id] = [l.series_id]
        elif l.franchise_id:
            franchise_scope[l.system_id] = [l.franchise_id]
        else:
            franchise_scope[l.system_id] = members.get(l.collection_id, [])

    every_franchise = {fid for ids in franchise_scope.values() for fid in ids}
    every_series = {sid for ids in series_scope.values() for sid in ids}

    # (franchise_id | series_id) -> {media_type: count}
    by_franchise: dict = {}
    by_series: dict = {}
    for media_type, model in MEDIA_TYPE_MODELS.items():
        if every_franchise:
            for franchise_id, count in (
                db.query(model.franchise_id, func.count(model.system_id))
                .filter(model.franchise_id.in_(list(every_franchise)))
                .group_by(model.franchise_id)
                .all()
            ):
                by_franchise.setdefault(franchise_id, {})[media_type] = count
        # anime_movies has no series_id, so it never appears in a series scope.
        if every_series and hasattr(model, "series_id"):
            for series_key, count in (
                db.query(model.series_id, func.count(model.system_id))
                .filter(model.series_id.in_(list(every_series)))
                .group_by(model.series_id)
                .all()
            ):
                by_series.setdefault(series_key, {})[media_type] = count

    summary = {}
    for l in auto_lists:
        wanted = BUILT_IN_KINDS.get(l.auto_source, {}).get("media_types")
        source_counts = (
            [by_series.get(k, {}) for k in series_scope.get(l.system_id, [])]
            if l.system_id in series_scope
            else [by_franchise.get(k, {}) for k in franchise_scope.get(l.system_id, [])]
        )

        count = 0
        types = set()
        for counts in source_counts:
            for media_type, n in counts.items():
                if wanted is not None and media_type not in wanted:
                    continue
                count += n
                types.add(media_type)
        summary[l.system_id] = {"item_count": count, "media_types": types}
    return summary


def _serialize(db_list: models.WatchOrderList, summary: dict = None) -> dict:
    """Serializes a list plus item_count and media_types, neither a column."""
    summary = summary or {"item_count": 0, "media_types": set()}
    return {
        "system_id": db_list.system_id,
        "franchise_id": db_list.franchise_id,
        "collection_id": db_list.collection_id,
        "series_id": db_list.series_id,
        "list_name": db_list.list_name,
        "list_type": db_list.list_type,
        "is_default": db_list.is_default,
        "is_most_recommended": db_list.is_most_recommended,
        "auto_source": db_list.auto_source,
        "sort_index": db_list.sort_index,
        "remark": db_list.remark,
        "item_count": summary["item_count"],
        "media_types": _ordered_types(summary["media_types"]),
        "created_at": db_list.created_at,
        "updated_at": db_list.updated_at,
    }


def _with_count(db: Session, db_list: models.WatchOrderList) -> dict:
    """Single-list convenience wrapper around _serialize."""
    if db_list.auto_source:
        summary = _summarize_generated(db, [db_list]).get(db_list.system_id)
    else:
        summary = _summarize(db, [db_list.system_id]).get(db_list.system_id)
    return _serialize(db_list, summary)


# Flags that at most one list per owner may carry. is_default decides which
# order opens first; is_most_recommended marks the single one to follow when
# several are recommended. They are independent and may sit on different lists.
_SINGLE_WINNER_FLAGS = ("is_default", "is_most_recommended")


def _clear_other_winners(
    db: Session, db_list: models.WatchOrderList, flag: str
) -> None:
    """Strips `flag` from the owner's other lists, leaving this one holding it."""
    column = getattr(models.WatchOrderList, flag)
    query = db.query(models.WatchOrderList).filter(
        models.WatchOrderList.system_id != db_list.system_id,
        column.is_(True),
    )
    if db_list.franchise_id:
        query = query.filter(
            models.WatchOrderList.franchise_id == db_list.franchise_id
        )
    else:
        query = query.filter(
            models.WatchOrderList.collection_id == db_list.collection_id
        )
    for sibling in query.all():
        setattr(sibling, flag, False)


def _enforce_single_winners(db: Session, db_list: models.WatchOrderList) -> None:
    """Applies the one-per-owner rule for every single-winner flag this list sets."""
    for flag in _SINGLE_WINNER_FLAGS:
        if getattr(db_list, flag):
            _clear_other_winners(db, db_list, flag)


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/lists",
    response_model=List[schemas.WatchOrderListResponse],
    summary="Get Watch Orders",
)
def get_watch_order_lists(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    series_id: Optional[str] = None,
    search_query: Optional[str] = None,
    auto: Optional[str] = Query(
        default=None,
        description="'exclude' hides generated lists, 'only' shows just them.",
    ),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieves watch order summaries (no items).

    Filtered by owner when franchise_id or collection_id is given; unfiltered it
    backs the admin Watch Orders page, which lists every order.
    """
    query = db.query(models.WatchOrderList)

    if franchise_id:
        query = query.filter(models.WatchOrderList.franchise_id == franchise_id)
    if collection_id:
        query = query.filter(models.WatchOrderList.collection_id == collection_id)
    if series_id:
        query = query.filter(models.WatchOrderList.series_id == series_id)
    if search_query:
        query = query.filter(
            models.WatchOrderList.list_name.ilike(f"%{search_query}%")
        )
    # Backfilling one generated list per owner would otherwise bury the
    # hand-built ones in any view that lists orders across owners.
    if auto == "exclude":
        query = query.filter(models.WatchOrderList.auto_source.is_(None))
    elif auto == "only":
        query = query.filter(models.WatchOrderList.auto_source.isnot(None))

    rows = (
        query.order_by(
            models.WatchOrderList.is_most_recommended.desc().nullslast(),
            models.WatchOrderList.is_default.desc().nullslast(),
            models.WatchOrderList.sort_index.asc().nullslast(),
            models.WatchOrderList.list_name.asc(),
        )
        .limit(limit)
        .offset(offset)
        .all()
    )
    # One grouped query for the stored lists, one batch for the generated ones.
    stored = [row for row in rows if not row.auto_source]
    generated = [row for row in rows if row.auto_source]
    summaries = _summarize(db, [row.system_id for row in stored])
    summaries.update(_summarize_generated(db, generated))
    return [_serialize(row, summaries.get(row.system_id)) for row in rows]


@router.get(
    "/lists/{system_id}",
    response_model=schemas.WatchOrderListDetailResponse,
    summary="Get Watch Order with Items",
)
def get_watch_order_list(system_id: str, db: Session = Depends(get_db)):
    """Retrieves one watch order with its items resolved to display data."""
    db_list = _get_list_or_404(db, system_id)

    # Any built-in kind, not just the cross-type one.
    if db_list.auto_source in BUILT_IN_KINDS:
        # Generated on read, so entries added since last time are simply there.
        scope = _generated_scope(db, db_list)
        resolved = build_release_items(
            db,
            scope["franchise_ids"],
            db_list.system_id,
            series_ids=scope["series_ids"],
            media_types=scope["media_types"],
        )
    else:
        items = (
            db.query(models.WatchOrderItem)
            .filter(models.WatchOrderItem.list_id == db_list.system_id)
            .order_by(models.WatchOrderItem.position.asc().nullslast())
            .all()
        )
        resolved = resolve_items(db, items)

    payload = _serialize(
        db_list,
        {
            "item_count": len(resolved),
            "media_types": {i["media_type"] for i in resolved if i["media_type"]},
        },
    )
    payload["items"] = resolved
    return payload


@router.get(
    "/candidates",
    response_model=List[schemas.WatchOrderCandidate],
    summary="Get Addable Entries",
)
def get_watch_order_candidates(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Every entry an order owned by this franchise (or collection) may include,
    flattened across the seven media tables.

    Backs the admin editor's entry picker. A collection resolves to its member
    franchises first, so one request covers an order that spans several.
    """
    if bool(franchise_id) == bool(collection_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of franchise_id or collection_id.",
        )

    if franchise_id:
        franchise_ids = [franchise_id]
    else:
        franchise_ids = [
            row[0]
            for row in db.query(models.Franchise.system_id)
            .filter(models.Franchise.collection_id == collection_id)
            .all()
        ]

    return list_candidate_entries(db, franchise_ids)


# ==========================================
# PROTECTED LIST WRITES (Admin Only)
# ==========================================


@router.post(
    "/lists",
    response_model=schemas.WatchOrderListResponse,
    summary="Create Watch Order",
)
def create_watch_order_list(
    payload: schemas.WatchOrderListCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new watch order owned by one franchise or one collection."""
    _validate_owner(payload.franchise_id, payload.collection_id, payload.series_id)

    try:
        # Build from the validated payload rather than field-by-field, so newly
        # added schema fields persist automatically instead of being dropped.
        data = payload.model_dump(exclude_unset=True)
        new_list = models.WatchOrderList(
            **data,
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
        )
        db.add(new_list)
        db.flush()

        _enforce_single_winners(db, new_list)

        db.commit()
        db.refresh(new_list)
        return _with_count(db, new_list)
    except Exception as e:
        logger.error(f"CRITICAL ERROR creating watch order: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database Insertion Error: {str(e)}"
        )


def _count_owner_entries(
    db: Session,
    franchise_ids: List[Any],
    series_ids: List[Any] = None,
    media_types: List[str] = None,
) -> int:
    """How many entries the owner holds within the given scope."""
    wanted = media_types or list(MEDIA_TYPE_MODELS)
    total = 0
    for media_type, model in MEDIA_TYPE_MODELS.items():
        if media_type not in wanted:
            continue
        if series_ids is not None:
            if not hasattr(model, "series_id") or not series_ids:
                continue
            column = model.series_id
            values = series_ids
        else:
            if not franchise_ids:
                continue
            column = model.franchise_id
            values = franchise_ids
        total += (
            db.query(func.count(model.system_id)).filter(column.in_(values)).scalar()
            or 0
        )
    return total


def _collection_blocks_built_ins(db: Session, franchise_id) -> bool:
    """
    True when the franchise sits under a collection that opts out.

    Umbrellas like 迪士尼 group unrelated standalone works, so a release order
    over one of their members is meaningless.
    """
    row = (
        db.query(models.Collection.no_built_in_orders)
        .join(
            models.Franchise,
            models.Franchise.collection_id == models.Collection.system_id,
        )
        .filter(models.Franchise.system_id == franchise_id)
        .first()
    )
    return bool(row and row[0])


def _existing_release_list(
    db: Session, franchise_id, collection_id, series_id=None, source=RELEASE_SOURCE
):
    """The owner's built-in order of this kind, if it already has one."""
    query = db.query(models.WatchOrderList).filter(
        models.WatchOrderList.auto_source == source
    )
    if franchise_id:
        query = query.filter(models.WatchOrderList.franchise_id == franchise_id)
    elif series_id:
        query = query.filter(models.WatchOrderList.series_id == series_id)
    else:
        query = query.filter(models.WatchOrderList.collection_id == collection_id)
    return query.first()


def _create_release_list(
    db: Session,
    franchise_id=None,
    collection_id=None,
    series_id=None,
    source=RELEASE_SOURCE,
):
    """Creates one built-in order. No items are stored; the steps are computed."""
    return models.WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=franchise_id,
        collection_id=collection_id,
        series_id=series_id,
        list_name=BUILT_IN_KINDS[source]["name"],
        list_type="Release",
        auto_source=source,
        is_default=False,
        is_most_recommended=False,
        created_at=get_taipei_now(),
        updated_at=get_taipei_now(),
    )


@router.post(
    "/lists/release",
    response_model=schemas.WatchOrderListResponse,
    summary="Create Built-in Order",
)
def create_release_list(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    series_id: Optional[str] = None,
    anime_only: bool = False,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Gives one owner a built-in order whose steps are generated on read.

    `anime_only` selects the anime-only variant instead of the cross-type one.
    Idempotent per kind: an owner that already has that kind gets it back, so
    the button cannot produce duplicates.
    """
    _validate_owner(franchise_id, collection_id, series_id)

    source = RELEASE_ANIME_SOURCE if anime_only else RELEASE_SOURCE

    existing = _existing_release_list(
        db, franchise_id, collection_id, series_id, source
    )
    if existing:
        return _with_count(db, existing)

    if franchise_id and _collection_blocks_built_ins(db, franchise_id):
        raise HTTPException(
            status_code=400,
            detail=(
                "This franchise belongs to a collection that opts out of "
                "built-in orders."
            ),
        )

    if series_id:
        franchise_ids, series_ids = [], [series_id]
    elif franchise_id:
        franchise_ids, series_ids = [franchise_id], None
    else:
        franchise_ids, series_ids = (
            [
                row[0]
                for row in db.query(models.Franchise.system_id)
                .filter(models.Franchise.collection_id == collection_id)
                .all()
            ],
            None,
        )

    count = _count_owner_entries(
        db, franchise_ids, series_ids, BUILT_IN_KINDS[source]["media_types"]
    )
    if count < MIN_ENTRIES_FOR_RELEASE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A built-in order needs at least {MIN_ENTRIES_FOR_RELEASE} "
                "entries in scope. A single work has nothing to order."
            ),
        )

    new_list = _create_release_list(
        db, franchise_id, collection_id, series_id, source
    )
    db.add(new_list)
    db.commit()
    db.refresh(new_list)
    return _with_count(db, new_list)


@router.post("/lists/release/backfill", summary="Backfill Built-in Orders")
def backfill_release_lists(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Gives every franchise, series and collection its built-in orders, skipping
    owners that already have them. Safe to re-run, and hand-built lists are
    never touched.

    Skipped: owners with fewer than MIN_ENTRIES_FOR_RELEASE entries in scope,
    and franchises under a collection that opts out.
    """
    owned = {
        (row.franchise_id, row.collection_id, row.series_id, row.auto_source)
        for row in db.query(models.WatchOrderList)
        .filter(models.WatchOrderList.auto_source.isnot(None))
        .all()
    }

    created = 0
    skipped_too_small = 0
    skipped_opted_out = 0

    # Entries per franchise and per series, split by media type, in one grouped
    # query per table rather than per owner.
    by_franchise: dict = {}
    by_series: dict = {}
    for media_type, model in MEDIA_TYPE_MODELS.items():
        for franchise_id, count in (
            db.query(model.franchise_id, func.count(model.system_id))
            .group_by(model.franchise_id)
            .all()
        ):
            if franchise_id is not None:
                bucket = by_franchise.setdefault(franchise_id, {})
                bucket[media_type] = bucket.get(media_type, 0) + count

        if hasattr(model, "series_id"):
            for series_key, count in (
                db.query(model.series_id, func.count(model.system_id))
                .group_by(model.series_id)
                .all()
            ):
                if series_key is not None:
                    bucket = by_series.setdefault(series_key, {})
                    bucket[media_type] = bucket.get(media_type, 0) + count

    # Franchises whose collection opts out.
    blocked = {
        row[0]
        for row in db.query(models.Franchise.system_id)
        .join(
            models.Collection,
            models.Franchise.collection_id == models.Collection.system_id,
        )
        .filter(models.Collection.no_built_in_orders.is_(True))
        .all()
    }

    def scoped_count(counts: dict, source: str) -> int:
        wanted = BUILT_IN_KINDS[source]["media_types"]
        if wanted is None:
            return sum(counts.values())
        return sum(counts.get(t, 0) for t in wanted)

    for source in BUILT_IN_KINDS:
        for franchise_id, counts in by_franchise.items():
            if (franchise_id, None, None, source) in owned:
                continue
            if franchise_id in blocked:
                skipped_opted_out += 1
                continue
            if scoped_count(counts, source) < MIN_ENTRIES_FOR_RELEASE:
                skipped_too_small += 1
                continue
            db.add(_create_release_list(db, franchise_id=franchise_id, source=source))
            created += 1

        for series_key, counts in by_series.items():
            if (None, None, series_key, source) in owned:
                continue
            if scoped_count(counts, source) < MIN_ENTRIES_FOR_RELEASE:
                skipped_too_small += 1
                continue
            db.add(_create_release_list(db, series_id=series_key, source=source))
            created += 1

    # Collections get the cross-type order only; an anime-only order across an
    # umbrella has not been asked for.
    members_by_collection: dict = {}
    for fid, cid in (
        db.query(models.Franchise.system_id, models.Franchise.collection_id)
        .filter(models.Franchise.collection_id.isnot(None))
        .all()
    ):
        members_by_collection.setdefault(cid, []).append(fid)

    for row in db.query(
        models.Collection.system_id, models.Collection.no_built_in_orders
    ).all():
        collection_id, opted_out = row
        if (None, collection_id, None, RELEASE_SOURCE) in owned:
            continue
        if opted_out:
            skipped_opted_out += 1
            continue
        total = sum(
            sum(by_franchise.get(fid, {}).values())
            for fid in members_by_collection.get(collection_id, [])
        )
        if total < MIN_ENTRIES_FOR_RELEASE:
            skipped_too_small += 1
            continue
        db.add(_create_release_list(db, collection_id=collection_id))
        created += 1

    db.commit()
    return {
        "status": "success",
        "created": created,
        "skipped_too_small": skipped_too_small,
        "skipped_opted_out": skipped_opted_out,
    }


@router.put(
    "/lists/{system_id}",
    response_model=schemas.WatchOrderListResponse,
    summary="Update Watch Order",
)
def update_watch_order_list(
    system_id: str,
    payload: schemas.WatchOrderListUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a watch order's metadata."""
    db_list = _get_list_or_404(db, system_id)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_list, key, value)

    _validate_owner(db_list.franchise_id, db_list.collection_id, db_list.series_id)
    _enforce_single_winners(db, db_list)

    db_list.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_list)
    return _with_count(db, db_list)


@router.patch(
    "/lists/{system_id}",
    response_model=schemas.WatchOrderListResponse,
    summary="Patch Watch Order",
)
def patch_watch_order_list(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a watch order (used for quick inline edits)."""
    db_list = _get_list_or_404(db, system_id)

    for key, value in payload.items():
        if hasattr(db_list, key):
            setattr(db_list, key, value)

    _validate_owner(db_list.franchise_id, db_list.collection_id, db_list.series_id)
    _enforce_single_winners(db, db_list)

    db_list.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_list)
    return _with_count(db, db_list)


@router.delete("/lists/{system_id}", summary="Delete Watch Order")
def delete_watch_order_list(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a watch order. Its items go with it via ON DELETE
    CASCADE; the referenced media entries are of course untouched.
    """
    db_list = _get_list_or_404(db, system_id)

    log_deleted_record(db, db_list, "Watch Order")

    db.delete(db_list)
    db.commit()
    return {"status": "success", "message": "Watch order deleted successfully."}


# ==========================================
# PROTECTED ITEM WRITES (Admin Only)
# ==========================================


@router.post(
    "/lists/{system_id}/items",
    response_model=schemas.WatchOrderItemResponse,
    summary="Add Watch Order Item",
)
def create_watch_order_item(
    system_id: str,
    payload: schemas.WatchOrderItemCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Adds a step to a watch order. Appends unless `position` is given, which
    slots the item in without renumbering (positions are floats).

    The same entry may be added more than once - that is how a split run
    (A ep 1-10 -> B -> A ep 11-12) is expressed.
    """
    db_list = _get_list_or_404(db, system_id)
    _reject_if_generated(db_list)
    _validate_entry(db, payload.media_type, payload.entry_id)

    data = payload.model_dump(exclude_unset=True)
    if data.get("position") is None:
        data["position"] = _next_position(db, db_list.system_id)

    new_item = models.WatchOrderItem(
        **data,
        system_id=uuid.uuid4(),
        list_id=db_list.system_id,
        created_at=get_taipei_now(),
        updated_at=get_taipei_now(),
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.put(
    "/items/{item_id}",
    response_model=schemas.WatchOrderItemResponse,
    summary="Update Watch Order Item",
)
def update_watch_order_item(
    item_id: str,
    payload: schemas.WatchOrderItemUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates one step of a watch order."""
    db_item = _get_item_or_404(db, item_id)
    _reject_if_generated(db_item.parent_list)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    _validate_entry(db, db_item.media_type, db_item.entry_id)

    db_item.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_item)
    return db_item


@router.patch(
    "/items/{item_id}",
    response_model=schemas.WatchOrderItemResponse,
    summary="Patch Watch Order Item",
)
def patch_watch_order_item(
    item_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a step (episode range, optional flag, note)."""
    db_item = _get_item_or_404(db, item_id)
    _reject_if_generated(db_item.parent_list)

    for key, value in payload.items():
        if hasattr(db_item, key):
            setattr(db_item, key, value)

    _validate_entry(db, db_item.media_type, db_item.entry_id)

    db_item.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/items/{item_id}", summary="Delete Watch Order Item")
def delete_watch_order_item(
    item_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Removes one step from a watch order. The media entry is not touched."""
    db_item = _get_item_or_404(db, item_id)
    _reject_if_generated(db_item.parent_list)
    db.delete(db_item)
    db.commit()
    return {"status": "success", "message": "Watch order item deleted successfully."}


@router.put(
    "/lists/{system_id}/reorder",
    response_model=schemas.WatchOrderListDetailResponse,
    summary="Reorder Watch Order Items",
)
def reorder_watch_order_items(
    system_id: str,
    payload: schemas.WatchOrderReorder,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Renumbers positions to 1..N in the order the item ids are given.

    This is what drag-and-drop commits. The payload must name every item in the
    list exactly once - a partial payload would silently leave stale positions.
    """
    db_list = _get_list_or_404(db, system_id)
    _reject_if_generated(db_list)

    items = (
        db.query(models.WatchOrderItem)
        .filter(models.WatchOrderItem.list_id == db_list.system_id)
        .all()
    )
    by_id = {item.system_id: item for item in items}

    if len(payload.item_ids) != len(set(payload.item_ids)):
        raise HTTPException(status_code=400, detail="Duplicate item ids in payload.")
    if set(payload.item_ids) != set(by_id):
        raise HTTPException(
            status_code=400,
            detail="Reorder payload must list every item of this watch order exactly once.",
        )

    for index, item_id in enumerate(payload.item_ids, start=1):
        by_id[item_id].position = float(index)
        by_id[item_id].updated_at = get_taipei_now()

    db_list.updated_at = get_taipei_now()
    db.commit()

    return get_watch_order_list(system_id, db)
