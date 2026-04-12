"""
routers/options.py
Handles the CRUD lifecycle for System Options (Reference Data).
Used dynamically by the frontend to populate dropdowns like Studios, Genres, etc.
Strictly handles database updates. Backups to Google Sheets are handled manually via Data Control.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from dependencies import get_db, get_current_admin
from utils.data_control_utils import log_deleted_record

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
def get_all_system_options(db: Session = Depends(get_db)):
    """
    Fetches all system options across all categories.
    Used by the frontend UI to populate all dropdowns dynamically at once.
    """
    options = (
        db.query(models.SystemOption)
        .order_by(models.SystemOption.category, models.SystemOption.option_value)
        .all()
    )
    return options


@router.get(
    "/{category}",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get System Options by Category",
)
def get_system_options(category: str, db: Session = Depends(get_db)):
    """
    Fetches a list of system options for a specific category (e.g., 'Studio', 'Genre Main').
    Used extensively by the frontend UI to populate dropdowns dynamically.
    """
    options = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.category == category)
        .order_by(models.SystemOption.option_value)
        .all()
    )
    return options


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", summary="Add System Option")
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
            models.SystemOption.option_value == payload.option_value,
        )
        .first()
    )

    if existing_option:
        raise HTTPException(status_code=400, detail="This option already exists.")

    new_option = models.SystemOption(
        category=payload.category, option_value=payload.option_value
    )
    db.add(new_option)
    db.commit()

    return {"message": f"Option '{payload.option_value}' added successfully."}


@router.put("/{option_id}", summary="Update System Option")
def update_system_option(
    option_id: int,
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
        .filter(models.SystemOption.id == option_id)
        .first()
    )

    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    # Prevent updating to a category+value combination that already exists
    duplicate_check = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.option_value == payload.option_value,
            models.SystemOption.id != option_id,
        )
        .first()
    )
    if duplicate_check:
        raise HTTPException(status_code=400, detail="This exact option already exists.")

    db_option.category = payload.category
    db_option.option_value = payload.option_value
    db.commit()

    return {"message": "System option updated successfully."}


@router.delete("/{option_id}", dependencies=[Depends(get_current_admin)])
def delete_option(option_id: int, db: Session = Depends(get_db)):
    """Deletes an option and logs it to the deleted_record table."""
    db_opt = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_opt:
        raise HTTPException(status_code=404, detail="Option not found")

    log_deleted_record(db, db_opt, "System Options")

    db.delete(db_opt)
    db.commit()
    return {"status": "success", "message": "System option deleted successfully"}
