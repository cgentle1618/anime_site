"""
routers/series.py
Handles all operations for Anime Series Hubs (Parent franchises).
Includes public lookups and secure administrative CRUD lifecycle.
"""

import uuid
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from services.image_manager import delete_cover_image
from services.sync import _push_series_backup_to_sheets
from dependencies import get_db, get_current_admin

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the router with a standard prefix
router = APIRouter(prefix="/api/series", tags=["Series Management"])

# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.AnimeSeriesResponse], summary="Get All Series Hubs"
)
def get_all_series(db: Session = Depends(get_db)):
    """Retrieves all high-level Series Hubs (Franchises) from the database."""
    return db.query(models.AnimeSeries).all()


@router.get(
    "/details/{system_id:path}",
    response_model=schemas.AnimeSeriesResponse,
    summary="Smart Series Lookup",
)
def get_series_details_by_id(system_id: str, db: Session = Depends(get_db)):
    """
    A smart lookup endpoint that resolves series info using three fallback levels:
    1. Exact System ID match.
    2. Case-insensitive Series English Name match.
    3. Auto-resolving the parent series using an Anime Entry's System ID.
    """
    # Level 1: Standard ID lookup (Direct match)
    series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if series:
        return series

    # Level 2: Name-based lookup (Fallback for direct URL typing or semantic links)
    clean_query = str(system_id).strip().lower()
    all_series = db.query(models.AnimeSeries).all()
    for s in all_series:
        if s.series_en and str(s.series_en).strip().lower() == clean_query:
            return s

    # Level 3: Cross-reference lookup (User passed an Anime ID instead of a Series ID)
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if anime and anime.series_en:
        parent_name = str(anime.series_en).strip().lower()
        for s in all_series:
            if s.series_en and str(s.series_en).strip().lower() == parent_name:
                return s

    # If all fallbacks fail, the series doesn't exist
    raise HTTPException(status_code=404, detail="Franchise Hub not found.")


# ==========================================
# SECURE WRITE OPERATIONS (Admin Only)
# ==========================================


@router.put("/{system_id}", summary="Update Series Hub")
def update_series_hub(
    system_id: str,
    payload: schemas.AnimeSeriesUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Updates metadata (like Ratings or Expected levels) for an existing Franchise Hub."""
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("system_id", None)

    for key, value in update_data.items():
        setattr(db_series, key, value)

    db.commit()
    background_tasks.add_task(_push_series_backup_to_sheets)
    return {"message": "Series Hub updated successfully.", "system_id": system_id}


@router.patch("/{system_id}", summary="Update Series Overall Rating")
def update_series_state(
    system_id: str,
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Updates series-level metadata. Currently primarily used for
    updating the 'Overall Franchise Rating' from the frontend UI.
    """
    series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    # Process and sanitize the incoming payload dynamically
    for key, val in payload.items():
        if hasattr(series, key):
            # Convert JS 'null' strings to true Python None
            new_val = None if val == "null" else val
            setattr(series, key, new_val)

    db.commit()

    # Safely push updates to Sheets in the background (V2 Standard)
    background_tasks.add_task(_push_series_backup_to_sheets)

    return {"status": "success"}


@router.post("/", summary="Add New Series Hub")
def add_series(
    payload: schemas.AnimeSeriesCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Manually creates a new Franchise Hub.
    (Note: Hubs are also automatically created as a side-effect when adding a new anime).
    """
    existing_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.series_en == payload.series_en)
        .first()
    )
    if existing_series:
        raise HTTPException(status_code=400, detail="Series Hub already exists.")

    series_data = payload.model_dump(exclude_none=True)
    series_data["system_id"] = str(uuid.uuid4())

    new_series = models.AnimeSeries(**series_data)
    db.add(new_series)
    db.commit()

    background_tasks.add_task(_push_series_backup_to_sheets)
    return {
        "message": "Series Hub added successfully.",
        "system_id": new_series.system_id,
    }


@router.delete("/{system_id}", summary="Delete Series Hub (And Cascade)")
def delete_series_hub(
    system_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a Series Hub.
    Also cleans up associated anime cover images to prevent GCP bucket bloat,
    and logs the deletion in the audit trail.
    """
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    # Note: SQLAlchemy cascades will drop the DB rows for AnimeEntries,
    # but we must manually trigger image deletion for every connected anime first.
    connected_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.series_en == db_series.series_en)
        .all()
    )
    for anime in connected_anime:
        delete_cover_image(anime.system_id)

    # Log the deletion for audit trails
    series_display_name = db_series.series_en or db_series.system_id
    deleted_record = models.DeletedRecord(
        system_id=db_series.system_id,
        table_name="anime_series",
        data_json=json.dumps({"series_en": series_display_name}),
    )
    db.add(deleted_record)

    db.delete(db_series)
    db.commit()

    background_tasks.add_task(_push_series_backup_to_sheets)
    return {"message": "Series Hub deleted successfully.", "system_id": system_id}
