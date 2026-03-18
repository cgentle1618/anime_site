"""
routers/anime.py
Handles all API endpoints related to individual anime entries.
Includes data retrieval, UI progress tracking updates (PATCH),
the surgical MAL metadata Force-Replace function, and the full CRUD lifecycle.
"""

import uuid
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
import services.sheets_client as sheets_client
import services.jikan_client as jikan_client
from services.image_manager import download_cover_image, delete_cover_image
from services.sync_utils import (
    format_for_sheet,
    extract_season_from_title,
    extract_season_from_cn_title,
    extract_mal_id,
)
from services.sync import _push_db_backup_to_sheets, _push_series_backup_to_sheets
from database import get_taipei_now
from dependencies import get_db, get_current_admin

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the router with tags for grouping in Swagger documentation
router = APIRouter(prefix="/api/anime", tags=["Anime Management"])

# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.AnimeEntryResponse], summary="Get All Anime"
)
def get_all_anime(db: Session = Depends(get_db)):
    """
    Retrieves the complete list of all anime entries.
    Used to populate the public dashboard and library data grids.
    """
    return db.query(models.AnimeEntry).all()


@router.get(
    "/by-series/{series_name:path}",
    response_model=List[schemas.AnimeEntryResponse],
    summary="Get Anime by Series Name",
)
def get_anime_by_series_name(series_name: str, db: Session = Depends(get_db)):
    """
    Performs a case-insensitive lookup for all anime belonging to a specific franchise.
    """
    return (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.series_en.ilike(f"%{series_name}%"))
        .order_by(models.AnimeEntry.release_year, models.AnimeEntry.release_month)
        .all()
    )


@router.get(
    "/{system_id}",
    response_model=schemas.AnimeEntryResponse,
    summary="Get Anime Details",
)
def get_anime_details(system_id: str, db: Session = Depends(get_db)):
    """
    Retrieves the details of a single anime entry.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")
    return anime


# ==========================================
# SECURE WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", summary="Add New Anime Entry")
def add_anime(
    payload: schemas.AnimeEntryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a new anime entry in the PostgreSQL database.
    Auto-calculates missing seasons/parts, and creates a parent Series Hub if one doesn't exist.
    """
    # 1. Check if the parent Series Hub exists. If not, create a basic shell.
    existing_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.series_en == payload.series_en)
        .first()
    )

    is_new_series = False

    if not existing_series:
        new_series = models.AnimeSeries(
            system_id=str(uuid.uuid4()),
            series_en=payload.series_en,
            series_roman=payload.series_season_roman,
            series_cn=payload.series_season_cn,
            series_alt_name=payload.series_alt_name,
        )
        db.add(new_series)
        db.flush()
        is_new_series = True

    # 2. Auto-calculate season if missing
    calculated_season = payload.series_season
    if not calculated_season:
        if payload.series_season_en:
            calculated_season = extract_season_from_title(payload.series_season_en)
        elif payload.series_season_cn:
            calculated_season = extract_season_from_cn_title(payload.series_season_cn)

    # 3. Create the Database Entry
    entry_data = payload.model_dump()
    entry_data.pop("series_alt_name", None)
    entry_data["system_id"] = str(uuid.uuid4())
    entry_data["series_season"] = calculated_season

    new_entry = models.AnimeEntry(**entry_data)
    db.add(new_entry)
    db.commit()

    # 4. Push Backup to Google Sheets asynchronously
    background_tasks.add_task(_push_db_backup_to_sheets)
    if is_new_series:
        background_tasks.add_task(_push_series_backup_to_sheets)

    return {
        "message": "Entry added successfully and is backing up to Sheets.",
        "system_id": new_entry.system_id,
    }


@router.put("/{system_id}", summary="Full Update Anime Entry")
def full_update_anime_entry(
    system_id: str,
    payload: schemas.AnimeEntryUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Performs a full overwrite of an anime entry's metadata.
    """
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("system_id", None)

    for key, value in update_data.items():
        setattr(db_anime, key, value)

    db.commit()
    background_tasks.add_task(_push_db_backup_to_sheets)
    return {"message": "Anime entry updated successfully.", "system_id": system_id}


@router.patch(
    "/{system_id}",
    response_model=schemas.AnimeEntryResponse,
    summary="Quick Update Anime Progress",
)
def update_anime_entry(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Surgically patches specific fields in an anime entry (e.g., Episode +1, Rating change).
    Instantly syncs the specific changes directly to Google Sheets without a full backup load.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    for key, value in payload.items():
        if hasattr(anime, key):
            setattr(anime, key, value)
            # Sync directly to Google Sheets for instant backup
            try:
                sheets_client.update_anime_field_in_sheet(system_id, key, value)
            except Exception as e:
                logger.warning(f"Surgical Sheets sync failed for field '{key}': {e}")

    # Update timestamp
    anime.updated_at = get_taipei_now()
    try:
        updated_at_str = format_for_sheet(anime.updated_at, type(anime.updated_at))
        sheets_client.update_anime_field_in_sheet(
            system_id, "updated_at", updated_at_str
        )
    except Exception:
        pass

    db.commit()
    db.refresh(anime)
    return anime


@router.post("/{system_id}/fetch-mal", summary="Force Replace MAL Data")
def fetch_mal_data(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Force-Replaces metadata and cover image for a specific anime using the Jikan API.
    Overwrites dates, streaming availability, scores, and ranks regardless of current state.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    if not anime.mal_id:
        if anime.mal_link:
            extracted_id = extract_mal_id(anime.mal_link)
            if extracted_id:
                anime.mal_id = extracted_id
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot replace data: Failed to extract a valid MAL ID from the provided link.",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Cannot replace data: No valid MAL ID or MAL Link is assigned to this entry.",
            )

    # 1. Fetch fresh data using our refactored Jikan Client
    jikan_data = jikan_client.fetch_anime_details(anime.mal_id)
    if not jikan_data:
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve data from the Jikan API. Rate limit may be exceeded.",
        )

    updated_fields = {}

    # 2. Force Replace Text Metadata
    fields_to_update = {
        "release_year": jikan_data.get("release_year"),
        "release_month": jikan_data.get("release_month"),
        "release_season": jikan_data.get("release_season"),
        "source_netflix": jikan_data.get("source_netflix"),
        "mal_rating": jikan_data.get("score"),
        "mal_rank": jikan_data.get("rank"),
    }

    for field, new_val in fields_to_update.items():
        if new_val is not None and getattr(anime, field) != new_val:
            setattr(anime, field, new_val)
            updated_fields[field] = new_val

    # 3. Force Replace / Download Cover Image
    images = jikan_data.get("images", {}).get("jpg", {})
    image_url = images.get("large_image_url") or images.get("image_url")

    if image_url:
        path = download_cover_image(image_url, system_id)
        if path and anime.cover_image_file != path:
            anime.cover_image_file = path
            updated_fields["cover_image_file"] = path

    # If absolutely nothing changed, exit early to save DB/Sheet writes
    if not updated_fields:
        return {
            "message": "Data is already up to date.",
            "anime": schemas.AnimeEntryResponse.model_validate(anime),
        }

    # 4. Update Database
    anime.updated_at = get_taipei_now()
    updated_fields["updated_at"] = format_for_sheet(
        anime.updated_at, type(anime.updated_at)
    )
    db.commit()

    # 5. Push exact changed fields to Google Sheets dynamically
    try:
        for field, val in updated_fields.items():
            sheets_client.update_anime_field_in_sheet(system_id, field, val)
    except Exception as e:
        logger.error(f"Failed to sync replaced Jikan data to Google Sheets: {e}")

    db.refresh(anime)

    return {
        "message": f"Successfully forced-replaced {len(updated_fields) - 1} metadata fields.",
        "anime": schemas.AnimeEntryResponse.model_validate(anime),
    }


@router.delete("/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(
    system_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Deletes an anime entry, cleans up its local cover image, logs the deletion,
    and resyncs the state to Google Sheets.
    """
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    delete_cover_image(system_id)

    anime_display_name = (
        db_anime.series_season_en or db_anime.series_en or db_anime.system_id
    )
    deleted_record = models.DeletedRecord(
        system_id=db_anime.system_id,
        table_name="anime_entries",
        data_json=json.dumps({"title": anime_display_name}),
    )
    db.add(deleted_record)

    db.delete(db_anime)
    db.commit()

    background_tasks.add_task(_push_db_backup_to_sheets)
    return {"message": "Anime entry deleted successfully.", "system_id": system_id}
