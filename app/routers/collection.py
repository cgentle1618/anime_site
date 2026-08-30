"""
routers/collection.py
Handles all operations for Collections (the optional umbrella tier above Franchise).
Includes public lookups with multi-language search and secure administrative CRUD lifecycle.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_current_admin, get_db
from app.routers._patching import apply_column_patch
from app.services.domain import pop_remark, upsert_remark
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/collection", tags=["Collection Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.CollectionResponse], summary="Get All Collections"
)
def get_all_collections(
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieves all Collections from the database.
    If 'search_query' is provided, it searches across EN, CN, roman, JP, and Alt names.
    Used by the frontend to populate the Collection library and form dropdowns.
    """
    query = db.query(models.Collection)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Collection.collection_name_en.ilike(search_term),
                models.Collection.collection_name_cn.ilike(search_term),
                models.Collection.collection_name_roman.ilike(search_term),
                models.Collection.collection_name_jp.ilike(search_term),
                models.Collection.collection_name_alt.ilike(search_term),
            )
        )

    return (
        query.order_by(models.Collection.collection_name_en)
        .limit(limit)
        .offset(offset)
        .all()
    )


@router.get(
    "/{system_id}",
    response_model=schemas.CollectionResponse,
    summary="Get Collection by ID",
)
def get_collection_by_id(system_id: str, db: Session = Depends(get_db)):
    """Retrieves a single collection by its UUID."""
    db_collection = (
        db.query(models.Collection)
        .filter(models.Collection.system_id == system_id)
        .first()
    )
    if not db_collection:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return db_collection


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/", response_model=schemas.CollectionResponse, summary="Create Collection"
)
def create_collection(
    payload: schemas.CollectionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new Collection."""
    try:
        # Build from the validated payload rather than field-by-field, so newly
        # added schema fields persist automatically instead of being dropped.
        data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
        new_collection = models.Collection(
            **data,
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
        )

        db.add(new_collection)
        db.commit()
        db.refresh(new_collection)

        if has_remark:
            upsert_remark(db, "collection", new_collection.system_id, remark)
            db.commit()
            db.refresh(new_collection)

        return new_collection
    except Exception as e:
        logger.error(f"CRITICAL ERROR creating collection: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database Insertion Error: {str(e)}"
        )


@router.put(
    "/{system_id}",
    response_model=schemas.CollectionResponse,
    summary="Update Collection",
)
def update_collection(
    system_id: str,
    payload: schemas.CollectionUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a Collection's metadata."""
    db_collection = (
        db.query(models.Collection)
        .filter(models.Collection.system_id == system_id)
        .first()
    )
    if not db_collection:
        raise HTTPException(status_code=404, detail="Collection not found.")

    update_data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
    for key, value in update_data.items():
        setattr(db_collection, key, value)
    if has_remark:
        upsert_remark(db, "collection", db_collection.system_id, remark)

    db_collection.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_collection)

    return db_collection


@router.patch(
    "/{system_id}",
    response_model=schemas.CollectionResponse,
    summary="Patch Collection",
)
def patch_collection(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a Collection (used for quick inline hub edits)."""
    db_collection = (
        db.query(models.Collection)
        .filter(models.Collection.system_id == system_id)
        .first()
    )
    if not db_collection:
        raise HTTPException(status_code=404, detail="Collection not found.")

    payload, remark, has_remark = pop_remark(payload)
    apply_column_patch(db_collection, payload)
    if has_remark:
        upsert_remark(db, "collection", db_collection.system_id, remark)

    db_collection.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_collection)

    return db_collection


@router.delete("/{system_id}", summary="Delete Collection")
def delete_collection(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a Collection.
    Note: member Franchises are NOT deleted. Their collection_id is simply set to
    NULL by the ON DELETE SET NULL constraint, leaving them uncollected.
    """
    db_collection = (
        db.query(models.Collection)
        .filter(models.Collection.system_id == system_id)
        .first()
    )
    if not db_collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_collection, "Collection")

    db.delete(db_collection)
    db.commit()

    return {"status": "success", "message": "Collection deleted successfully."}
