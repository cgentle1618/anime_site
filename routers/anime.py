"""
routers/anime.py
Handles all API endpoints related to individual anime entries.
Includes data retrieval and progress tracking updates.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
import services.sheets_client as sheets_client
from dependencies import get_db, get_current_admin

# Initialize the router with tags for grouping in documentation
router = APIRouter(prefix="/api/anime", tags=["Anime Management"])

# ==========================================
# READ OPERATIONS
# ==========================================


@router.get("/", response_model=List[schemas.AnimeResponse], summary="Get All Anime")
def get_all_anime(db: Session = Depends(get_db)):
    """
    Retrieves the complete list of all anime entries stored in the PostgreSQL database.
    Used to populate the main dashboard and library data grids.
    """
    return db.query(models.AnimeEntry).all()


@router.get(
    "/by-series/{series_name:path}",
    response_model=List[schemas.AnimeResponse],
    summary="Get Anime by Series Name",
)
def get_anime_by_series_name(series_name: str, db: Session = Depends(get_db)):
    """
    Performs a case-insensitive lookup for all anime belonging to a specific franchise.
    Used primarily for displaying the 'Individual Entries' list on the Series Hub page.
    """
    clean_name = str(series_name).strip().lower()

    # Filter in memory to handle potential whitespace or encoding variations from Google Sheets
    all_entries = db.query(models.AnimeEntry).all()
    result = [
        anime
        for anime in all_entries
        if anime.series_en and str(anime.series_en).strip().lower() == clean_name
    ]
    return result


@router.get(
    "/details/{system_id}",
    response_model=schemas.AnimeResponse,
    summary="Get Anime Details (Alias)",
)
def get_anime_details_alias(system_id: str, db: Session = Depends(get_db)):
    """
    An alias route for individual anime lookups to support legacy frontend link structures.
    Functions exactly the same as the base ID lookup.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")
    return anime


@router.get(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Get Anime by ID"
)
def get_anime_by_id(system_id: str, db: Session = Depends(get_db)):
    """Fetches full metadata for a specific anime record using its unique system UUID."""
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")
    return anime


# ==========================================
# UPDATE OPERATIONS
# ==========================================


@router.patch(
    "/{system_id}/progress",
    summary="Update Progress or Rating",
    dependencies=[Depends(get_current_admin)],
)
def update_anime_progress(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    """
    Dynamically updates allowed fields (ep_fin, my_progress, rating_mine, remark, op, ed, insert_ost).
    This endpoint mirrors the change to Google Sheets immediately to maintain parity.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")

    # Define fields that the frontend is permitted to update via PATCH
    allowed_fields = [
        "ep_fin",
        "my_progress",
        "rating_mine",
        "remark",
        "op",
        "ed",
        "insert_ost",
    ]
    updated_fields = {}

    for field in allowed_fields:
        if field in payload:
            val = payload[field]

            # Standardize JavaScript 'null' strings back to Python None types
            if val == "null":
                val = None

            setattr(anime, field, val)
            updated_fields[field] = val

    if not updated_fields:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    # Persist changes to PostgreSQL
    db.commit()

    # Synchronize the specific changed fields directly to Google Sheets
    try:
        for field, val in updated_fields.items():
            sheets_client.update_anime_field_in_sheet(system_id, field, val)
    except Exception as e:
        # We log the error but return success since the primary DB update worked
        print(f"⚠️ Google Sheets Sync failed for {system_id}: {e}")

    return {"status": "success", "updated_fields": updated_fields}
