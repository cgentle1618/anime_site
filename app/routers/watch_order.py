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
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.database import get_taipei_now
from app.dependencies import get_current_admin, get_db
from app.services.domain.watch_order import (
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


def _validate_owner(franchise_id, collection_id) -> None:
    """
    Mirrors the ck_watch_order_list_single_owner check constraint.

    Caught here so a bad payload returns 400 instead of a 500 from the database.
    """
    if bool(franchise_id) == bool(collection_id):
        raise HTTPException(
            status_code=400,
            detail="A watch order must belong to exactly one franchise or collection.",
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


def _next_position(db: Session, list_id) -> float:
    """One past the list's current highest position, so new items append."""
    highest = (
        db.query(func.max(models.WatchOrderItem.position))
        .filter(models.WatchOrderItem.list_id == list_id)
        .scalar()
    )
    return float(highest) + 1.0 if highest is not None else 1.0


def _with_count(db: Session, db_list: models.WatchOrderList) -> dict:
    """Serializes a list plus its item_count, which is not a column."""
    count = (
        db.query(func.count(models.WatchOrderItem.system_id))
        .filter(models.WatchOrderItem.list_id == db_list.system_id)
        .scalar()
    )
    return {
        "system_id": db_list.system_id,
        "franchise_id": db_list.franchise_id,
        "collection_id": db_list.collection_id,
        "list_name": db_list.list_name,
        "list_type": db_list.list_type,
        "is_default": db_list.is_default,
        "is_most_recommended": db_list.is_most_recommended,
        "sort_index": db_list.sort_index,
        "remark": db_list.remark,
        "item_count": count or 0,
        "created_at": db_list.created_at,
        "updated_at": db_list.updated_at,
    }


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
    search_query: Optional[str] = None,
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
    if search_query:
        query = query.filter(
            models.WatchOrderList.list_name.ilike(f"%{search_query}%")
        )

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
    return [_with_count(db, row) for row in rows]


@router.get(
    "/lists/{system_id}",
    response_model=schemas.WatchOrderListDetailResponse,
    summary="Get Watch Order with Items",
)
def get_watch_order_list(system_id: str, db: Session = Depends(get_db)):
    """Retrieves one watch order with its items resolved to display data."""
    db_list = _get_list_or_404(db, system_id)

    items = (
        db.query(models.WatchOrderItem)
        .filter(models.WatchOrderItem.list_id == db_list.system_id)
        .order_by(models.WatchOrderItem.position.asc().nullslast())
        .all()
    )

    payload = _with_count(db, db_list)
    payload["items"] = resolve_items(db, items)
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
    _validate_owner(payload.franchise_id, payload.collection_id)

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

    _validate_owner(db_list.franchise_id, db_list.collection_id)
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

    _validate_owner(db_list.franchise_id, db_list.collection_id)
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
