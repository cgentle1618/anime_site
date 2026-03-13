"""
routers/anime.py
Handles all API endpoints related to individual anime entries.
Includes data retrieval, progress tracking updates, and MAL metadata auto-fill.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
import services.sheets_client as sheets_client
import services.jikan_client as jikan_client
from dependencies import get_db, get_current_admin

# Initialize the router with tags for grouping in documentation
router = APIRouter(prefix="/api/anime", tags=["Anime Management"])

# ==========================================
# READ OPERATIONS
# ==========================================


@router.get(
    "/", response_model=List[schemas.AnimeEntryResponse], summary="Get All Anime"
)
def get_all_anime(db: Session = Depends(get_db)):
    """
    Retrieves the complete list of all anime entries stored in the PostgreSQL database.
    Used to populate the main dashboard and library data grids.
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
    Used primarily for displaying the 'Individual Entries' list on the Series Hub page.
    """
    return (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.series_en.ilike(f"%{series_name}%"))
        .all()
    )


@router.get(
    "/{system_id}", response_model=schemas.AnimeEntryResponse, summary="Get Anime by ID"
)
def get_anime_by_id(system_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a single anime entry by its unique system ID.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")
    return anime


@router.get(
    "/alias/{alias_name}",
    response_model=schemas.AnimeEntryResponse,
    summary="Get Anime by Alias",
)
def get_anime_details_alias(alias_name: str, db: Session = Depends(get_db)):
    """
    Retrieves a single anime entry by its alias/alternative name.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.anime_alt_name == alias_name)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")
    return anime


# ==========================================
# UPDATE OPERATIONS
# ==========================================


@router.patch("/{system_id}", summary="Update Anime Progress")
def update_anime_progress(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    """
    Updates specific progress or tracking fields for an anime entry.
    Changes are saved to the database and synced to Google Sheets immediately to maintain parity.
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
        # We handle sheet sync failures silently here to ensure the DB still updates
        print(f"Sheet Sync Error on Patch: {e}")

    return anime


# ==========================================
# V2 METADATA AUTO-FILL
# ==========================================


@router.post("/{system_id}/fetch-mal", summary="Fetch and Auto-fill Metadata from MAL")
def fetch_and_fill_mal_data(
    system_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    """
    Fetches metadata from Jikan API using the anime's mal_id.
    Downloads the cover image and applies Basic Sync (only fills empty fields)
    for release dates and Netflix status.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")

    if not anime.mal_id:
        raise HTTPException(
            status_code=400, detail="No MAL ID associated with this anime."
        )

    try:
        mal_id_int = int(anime.mal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid MAL ID format.")

    # 1. Fetch data and download image
    mal_data = jikan_client.fetch_mal_data(mal_id_int, system_id)
    if not mal_data:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch data from Jikan API or rate limited.",
        )

    updated_fields = {}

    # 2. Update Cover Image File
    if mal_data.get("cover_image_file"):
        anime.cover_image_file = mal_data["cover_image_file"]
        updated_fields["cover_image_file"] = anime.cover_image_file

    # 3. Apply Basic Sync for Dates (Only fill if missing)
    if not anime.release_year and mal_data.get("release_year"):
        anime.release_year = mal_data["release_year"]
        updated_fields["release_year"] = anime.release_year

    if not anime.release_month and mal_data.get("release_month"):
        anime.release_month = mal_data["release_month"]
        updated_fields["release_month"] = anime.release_month

    if not anime.release_season and mal_data.get("release_season"):
        anime.release_season = mal_data["release_season"]
        updated_fields["release_season"] = anime.release_season

    # 4. Netflix Flag (Only auto-fill to True, never overwrite a manual True to False)
    if mal_data.get("source_netflix") and not anime.source_netflix:
        anime.source_netflix = True
        updated_fields["source_netflix"] = True

    if not updated_fields:
        return {"message": "No new data needed to be auto-filled.", "anime": anime}

    # 5. Commit to PostgreSQL Source of Truth
    db.commit()

    # 6. Push updates to the Google Sheet backup
    try:
        for field, val in updated_fields.items():
            sheets_client.update_anime_field_in_sheet(system_id, field, val)
    except Exception as e:
        print(f"Warning: Failed to sync MAL updates to sheets for {system_id}: {e}")

    return {
        "message": "Successfully auto-filled metadata from MAL.",
        "updated_fields": list(updated_fields.keys()),
        "anime": anime,
    }
