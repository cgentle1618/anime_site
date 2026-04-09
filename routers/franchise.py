"""
routers/franchise.py
Handles all operations for Franchises (the top-level V2 database entity).
Includes public lookups with multi-language search and secure administrative CRUD lifecycle.
"""

import uuid
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import or_

import models
import schemas
from database import get_taipei_now
from dependencies import get_db, get_current_admin
from utils.data_control_utils import log_deleted_record

# Setup basic logging
logger = logging.getLogger(__name__)

# Initialize the router with a standard prefix
router = APIRouter(prefix="/api/franchise", tags=["Franchise Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.FranchiseResponse], summary="Get All Franchises"
)
def get_all_franchises(
    search_query: Optional[str] = None, db: Session = Depends(get_db)
):
    """
    Retrieves all high-level Franchises from the database.
    If 'search_query' is provided, it intelligently searches across EN, CN, Romanji, JP, and Alt names.
    Used by the frontend to populate autocomplete search dropdowns.
    """
    query = db.query(models.Franchise)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Franchise.franchise_name_en.ilike(search_term),
                models.Franchise.franchise_name_cn.ilike(search_term),
                models.Franchise.franchise_name_romanji.ilike(search_term),
                models.Franchise.franchise_name_jp.ilike(search_term),
                models.Franchise.franchise_name_alt.ilike(search_term),
            )
        )

    return query.order_by(models.Franchise.franchise_name_en).all()


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
        # Explicitly assign UUID and Timestamps in Python to bypass missing database default constraints
        new_franchise = models.Franchise(
            system_id=uuid.uuid4(),
            franchise_type=payload.franchise_type,
            franchise_name_en=payload.franchise_name_en,
            franchise_name_cn=payload.franchise_name_cn,
            franchise_name_romanji=payload.franchise_name_romanji,
            franchise_name_jp=payload.franchise_name_jp,
            franchise_name_alt=payload.franchise_name_alt,
            my_rating=payload.my_rating,
            franchise_expectation=payload.franchise_expectation,
            favorite_3x3_slot=payload.favorite_3x3_slot,
            remark=payload.remark,
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
        )

        db.add(new_franchise)
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

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_franchise, key, value)

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

    for key, value in payload.items():
        if hasattr(db_franchise, key):
            setattr(db_franchise, key, value)

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

    db.delete(db_franchise)
    db.commit()

    return {"status": "success", "message": "Franchise deleted successfully."}
