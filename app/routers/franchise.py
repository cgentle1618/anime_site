"""
routers/franchise.py
Handles all operations for Franchises (the top-level V2 database entity).
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
from app.services.domain.plan_next import delete_plans_for
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/franchise", tags=["Franchise Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.FranchiseResponse], summary="Get All Franchises"
)
def get_all_franchises(
    collection_id: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieves all high-level Franchises from the database.
    - If 'collection_id' is provided, filters strictly to that parent collection.
      Used by the Collection hub to list its member franchises.
    - If 'search_query' is provided, it intelligently searches across EN, CN, roman, JP, and Alt names.
    Used by the frontend to populate autocomplete search dropdowns.
    """
    query = db.query(models.Franchise)

    if collection_id:
        query = query.filter(models.Franchise.collection_id == collection_id)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Franchise.franchise_name_en.ilike(search_term),
                models.Franchise.franchise_name_cn.ilike(search_term),
                models.Franchise.franchise_name_roman.ilike(search_term),
                models.Franchise.franchise_name_jp.ilike(search_term),
                models.Franchise.franchise_name_alt.ilike(search_term),
            )
        )

    return query.order_by(models.Franchise.franchise_name_en).limit(limit).offset(offset).all()


@router.get(
    "/{system_id}",
    response_model=schemas.FranchiseResponse,
    summary="Get Franchise by ID",
)
def get_franchise_by_id(system_id: str, db: Session = Depends(get_db)):
    """Retrieves a single franchise by its UUID."""
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Franchise not found.")
    return db_franchise


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.FranchiseResponse, summary="Create Franchise")
def create_franchise(
    payload: schemas.FranchiseCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new Franchise. Does NOT trigger a background Google Sheets backup in V2."""
    try:
        # Build from the validated payload rather than field-by-field. The previous
        # explicit form silently dropped cover_entry_id, type_covers, type_slots
        # and watch_next_group on every create.
        # Explicitly assign UUID and Timestamps in Python to bypass missing database default constraints
        data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
        new_franchise = models.Franchise(
            **data,
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
        )

        db.add(new_franchise)
        db.commit()
        db.refresh(new_franchise)

        if has_remark:
            upsert_remark(db, "franchise", new_franchise.system_id, remark)
            db.commit()
            db.refresh(new_franchise)

        return new_franchise
    except Exception as e:
        logger.error(f"CRITICAL ERROR creating franchise: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database Insertion Error: {str(e)}"
        )


@router.put(
    "/{system_id}", response_model=schemas.FranchiseResponse, summary="Update Franchise"
)
def update_franchise(
    system_id: str,
    payload: schemas.FranchiseUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a Franchise's metadata."""
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Franchise not found.")

    update_data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
    for key, value in update_data.items():
        setattr(db_franchise, key, value)
    if has_remark:
        upsert_remark(db, "franchise", db_franchise.system_id, remark)

    db_franchise.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_franchise)

    return db_franchise


@router.patch(
    "/{system_id}", response_model=schemas.FranchiseResponse, summary="Patch Franchise"
)
def patch_franchise(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a Franchise (useful for quick inline rating edits)."""
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Franchise not found.")

    payload, remark, has_remark = pop_remark(payload)
    apply_column_patch(db_franchise, payload)
    if has_remark:
        upsert_remark(db, "franchise", db_franchise.system_id, remark)

    db_franchise.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_franchise)

    return db_franchise


@router.delete("/{system_id}", summary="Delete Franchise")
def delete_franchise(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a Franchise.
    Note: Series and Anime entries linked to this Franchise will simply have their
    franchise_id set to NULL due to the V2 PostgreSQL ON DELETE SET NULL constraint.
    """
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Franchise not found")

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_franchise, "Franchise")

    delete_plans_for(db, "franchise", db_franchise.system_id)

    db.delete(db_franchise)
    db.commit()

    return {"status": "success", "message": "Franchise deleted successfully."}
