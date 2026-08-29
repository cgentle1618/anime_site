"""
routers/options.py
Handles the CRUD lifecycle for System Options (Reference Data).
Used dynamically by the frontend to populate dropdowns like Studios, Genres, etc.
Strictly handles database updates. Backups to Google Sheets are handled manually via Data Control.
"""

import logging
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.dependencies import get_db, get_current_admin
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/options", tags=["System Options"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get All System Options",
)
def get_all_system_options(
    scope: Optional[str] = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Fetches all system options across all categories.
    Used by the frontend UI to populate all dropdowns dynamically at once.
    """
    query = db.query(models.SystemOption)
    if scope:
        query = query.filter(
            or_(
                ~models.SystemOption.scopes.any(),
                models.SystemOption.scopes.any(
                    models.SystemOptionScope.scope == scope
                ),
            )
        )
    options = (
        query.order_by(
            models.SystemOption.category,
            models.SystemOption.sort_order,
            models.SystemOption.value,
        )
        .limit(limit)
        .offset(offset)
        .all()
    )
    return options


@router.get(
    "/{category}",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get System Options by Category",
)
def get_system_options(
    category: str,
    scope: Optional[str] = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Fetches a list of system options for a specific category (e.g., 'Studio', 'Genre Main').
    Used extensively by the frontend UI to populate dropdowns dynamically.
    """
    query = db.query(models.SystemOption).filter(models.SystemOption.category == category)
    if scope:
        query = query.filter(
            or_(
                ~models.SystemOption.scopes.any(),
                models.SystemOption.scopes.any(
                    models.SystemOptionScope.scope == scope
                ),
            )
        )
    options = (
        query.order_by(models.SystemOption.sort_order, models.SystemOption.value)
        .limit(limit)
        .offset(offset)
        .all()
    )
    return options


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.SystemOptionResponse, summary="Add System Option")
def add_system_option(
    payload: schemas.SystemOptionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Adds a new dropdown option to the database.
    Does NOT trigger a background Google Sheets backup in V2.
    """
    existing_option = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.value == payload.value,
        )
        .first()
    )

    if existing_option:
        raise HTTPException(status_code=400, detail="This option already exists.")

    new_option = models.SystemOption(
        category=payload.category,
        value=payload.value,
        sort_order=payload.sort_order,
        remark=payload.remark,
    )
    new_option.scopes = [
        models.SystemOptionScope(scope=s) for s in payload.scopes
    ]
    db.add(new_option)
    db.commit()
    db.refresh(new_option)

    return new_option


@router.put(
    "/{option_id}",
    response_model=schemas.SystemOptionResponse,
    summary="Update System Option",
)
def update_system_option(
    option_id: UUID,
    payload: schemas.SystemOptionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Updates an existing dropdown option in the database.
    Does NOT trigger a background Google Sheets backup in V2.
    """
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.system_id == option_id)
        .first()
    )

    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    # Prevent updating to a category+value combination that already exists
    duplicate_check = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.value == payload.value,
            models.SystemOption.system_id != option_id,
        )
        .first()
    )
    if duplicate_check:
        raise HTTPException(status_code=400, detail="This exact option already exists.")

    db_option.category = payload.category
    db_option.value = payload.value
    db_option.sort_order = payload.sort_order
    db_option.remark = payload.remark
    db_option.scopes = [
        models.SystemOptionScope(scope=s) for s in payload.scopes
    ]
    db.commit()
    db.refresh(db_option)

    return db_option


@router.delete("/{option_id}", dependencies=[Depends(get_current_admin)])
def delete_option(option_id: UUID, db: Session = Depends(get_db)):
    """Deletes an option and logs it to the deleted_record table."""
    db_opt = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.system_id == option_id)
        .first()
    )
    if not db_opt:
        raise HTTPException(status_code=404, detail="Option not found")

    log_deleted_record(db, db_opt, "System Options")

    db.delete(db_opt)
    db.commit()
    return {"status": "success", "message": "System option deleted successfully"}
