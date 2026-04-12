"""
routers/series.py
Handles all operations for Series (the intermediate V2 database entity).
Includes public lookups with multi-language search, franchise filtering,
and secure administrative CRUD lifecycle.
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

from services.other_logics import resolve_series_parent_hierarchy

from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/series", tags=["Series Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.SeriesResponse], summary="Get All Series")
def get_all_series(
    franchise_id: Optional[str] = None,
    search_query: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Retrieves Series from the database.
    - If 'franchise_id' is provided, filters strictly to that parent franchise.
    - If 'search_query' is provided, searches across EN, CN, and Alt names.
    Used by the frontend to populate autocomplete search and form dropdowns.
    """
    query = db.query(models.Series)

    if franchise_id:
        query = query.filter(models.Series.franchise_id == franchise_id)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Series.series_name_en.ilike(search_term),
                models.Series.series_name_cn.ilike(search_term),
                models.Series.series_name_alt.ilike(search_term),
            )
        )

    return query.order_by(models.Series.series_name_en).all()


@router.get(
    "/{system_id}",
    response_model=schemas.SeriesResponse,
    summary="Get Series by ID",
)
def get_series_by_id(system_id: str, db: Session = Depends(get_db)):
    """Retrieves a single series by its UUID."""
    db_series = (
        db.query(models.Series).filter(models.Series.system_id == system_id).first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series not found.")
    return db_series


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/", response_model=schemas.SeriesResponse, status_code=201, summary="Create Series"
)
def create_series(
    series_in: schemas.SeriesCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a new Series.
    Smartly resolves or auto-creates its parent Franchise if missing.
    """
    new_series = models.Series(**series_in.model_dump())
    new_series.system_id = uuid.uuid4()

    new_series.franchise_id = resolve_series_parent_hierarchy(
        db, new_series.franchise_id, new_series.names_dict
    )

    db.add(new_series)
    db.commit()
    db.refresh(new_series)

    return new_series


@router.put(
    "/{system_id}", response_model=schemas.SeriesResponse, summary="Update Series"
)
def update_series(
    system_id: str,
    series_in: schemas.SeriesUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a Series' metadata and smartly resolves hierarchy changes."""
    db_series = (
        db.query(models.Series).filter(models.Series.system_id == system_id).first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series not found.")

    update_data = series_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_series, key, value)

    db_series.franchise_id = resolve_series_parent_hierarchy(
        db, db_series.franchise_id, db_series.names_dict
    )

    db.commit()
    db.refresh(db_series)

    return db_series


@router.patch(
    "/{system_id}", response_model=schemas.SeriesResponse, summary="Patch Series"
)
def patch_series(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a Series."""
    db_series = (
        db.query(models.Series).filter(models.Series.system_id == system_id).first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series not found.")

    for key, value in payload.items():
        if hasattr(db_series, key):
            setattr(db_series, key, value)

    db_series.franchise_id = resolve_series_parent_hierarchy(
        db, db_series.franchise_id, db_series.names_dict
    )

    db.commit()
    db.refresh(db_series)

    return db_series


@router.delete("/{system_id}", summary="Delete Series")
def delete_series(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a Series.
    Note: Anime entries linked to this Series will simply have their
    series_id set to NULL due to the V2 PostgreSQL ON DELETE SET NULL constraint.
    """
    db_series = (
        db.query(models.Series).filter(models.Series.system_id == system_id).first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series not found")

    log_deleted_record(db, db_series, "Series")

    db.delete(db_series)
    db.commit()

    return {"status": "success", "message": "Series deleted successfully."}
