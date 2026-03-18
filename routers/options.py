"""
routers/options.py
Handles the CRUD lifecycle for System Options (Reference Data).
Used dynamically by the frontend to populate dropdowns like Studios, Genres, etc.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import models
import schemas
from services.sync import _push_options_backup_to_sheets
from dependencies import get_db, get_current_admin

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the router with a standard prefix
router = APIRouter(prefix="/api/options", tags=["System Options"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


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
    if not options:
        return []
    return options


# ==========================================
# SECURE WRITE OPERATIONS (Admin Only)
# ==========================================


@router.put("/{option_id}", summary="Update System Option")
def update_system_option(
    option_id: int,
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Modifies an existing dropdown option and syncs to Google Sheets."""
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    db_option.category = payload.category
    db_option.option_value = payload.option_value
    db.commit()

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": "System option updated successfully."}


@router.post("/", summary="Add System Option")
def add_system_option(
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Adds a new dropdown option to the database and syncs to Google Sheets."""
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

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": f"Option '{payload.option_value}' added successfully."}


@router.delete("/{option_id}", summary="Delete System Option")
def delete_system_option(
    option_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Deletes a dropdown option and syncs the removal to Google Sheets."""
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    db.delete(db_option)
    db.commit()

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": "System option deleted successfully."}
