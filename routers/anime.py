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
    try:
        # Attempt the normal fetch
        return db.query(models.AnimeEntry).all()
    except Exception as e:
        error_str = str(e)
        print(f"CRITICAL DB ERROR ON FETCH: {error_str}")
        db.rollback()  # Reset the broken transaction state

        # THE DIAGNOSTIC METAL DETECTOR
        # If the main query fails, we test every single column one by one
        failed_columns = []
        for column in models.AnimeEntry.__table__.columns:
            try:
                # Attempt to fetch just this ONE column from the database
                db.query(getattr(models.AnimeEntry, column.name)).first()
            except Exception as col_e:
                db.rollback()  # Must rollback after a failure to continue testing
                failed_columns.append(
                    {
                        "column_name": column.name,
                        "expected_python_type": str(column.type),
                        "specific_error": str(col_e),
                    }
                )

        # Return the exact culprit to the browser network tab
        if failed_columns:
            raise HTTPException(
                status_code=500,
                detail={
                    "error_type": "Schema Type Mismatch",
                    "original_error": error_str,
                    "failed_columns": failed_columns,
                    "message": "The database handed a VARCHAR to a Python field expecting a Number/Boolean.",
                },
            )

        # Fallback if the loop didn't catch a specific column
        raise HTTPException(
            status_code=500,
            detail=f"Database fetch failed, but not on a specific column. Error: {error_str}",
        )


@router.get(
    "/by-series/{series_name:path}",
    response_model=List[schemas.AnimeEntryResponse],
    summary="Get Anime by Series Name",
)
def get_anime_by_series_name(series_name: str, db: Session = Depends(get_db)):
    """
    Performs a case-insensitive lookup to find all anime entries belonging to a specific series.
    """
    animes = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.series_en.ilike(f"%{series_name}%"))
        .all()
    )
    return animes


@router.get("/{system_id}", response_model=schemas.AnimeEntryResponse)
def read_anime(system_id: str, db: Session = Depends(get_db)):
    """Fetch a specific anime entry by its system_id."""
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if anime is None:
        raise HTTPException(status_code=404, detail="Anime entry not found")
    return anime


# ==========================================
# WRITE OPERATIONS
# ==========================================


@router.post("/", response_model=schemas.AnimeEntryResponse)
def create_anime(anime: schemas.AnimeEntryCreate, db: Session = Depends(get_db)):
    """Create a new anime entry."""
    db_anime = models.AnimeEntry(**anime.model_dump(exclude_none=True))
    db.add(db_anime)
    db.commit()
    db.refresh(db_anime)
    return db_anime


@router.put("/{system_id}", response_model=schemas.AnimeEntryResponse)
def update_anime(
    system_id: str, anime: schemas.AnimeEntryUpdate, db: Session = Depends(get_db)
):
    """Update an existing anime entry."""
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if db_anime is None:
        raise HTTPException(status_code=404, detail="Anime entry not found")

    update_data = anime.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_anime, key, value)

    db.commit()
    db.refresh(db_anime)
    return db_anime


@router.delete("/{system_id}")
def delete_anime(system_id: str, db: Session = Depends(get_db)):
    """Delete an anime entry."""
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if db_anime is None:
        raise HTTPException(status_code=404, detail="Anime entry not found")

    db.delete(db_anime)
    db.commit()
    return {"message": "Anime entry deleted successfully"}


# ==========================================
# AUTO-FILL & METADATA
# ==========================================


@router.post("/{system_id}/autofill", summary="Auto-fill Missing MAL Data")
def autofill_anime_data(system_id: str, db: Session = Depends(get_db)):
    """
    Fetches data from MAL/Jikan API and fills in missing fields in the database.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime entry not found")

    if not anime.mal_id:
        raise HTTPException(
            status_code=400, detail="Cannot auto-fill without a MAL ID."
        )

    mal_data = jikan_client.fetch_anime_details(anime.mal_id)
    if not mal_data:
        raise HTTPException(
            status_code=500, detail="Failed to fetch data from Jikan API"
        )

    updated_fields = {}

    # Fill missing fields
    # Dates (Only fill if missing)
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
        print(
            f"Warning: Failed to sync {updated_fields} to Sheets for {system_id}: {e}"
        )

    return {
        "message": "Successfully auto-filled missing data",
        "updated_fields": updated_fields,
        "anime": anime,
    }
