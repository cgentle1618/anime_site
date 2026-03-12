"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Optimized for V2 (PostgreSQL as Source of Truth).
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import services.sync as sync_engine
from services.sync_utils import extract_season_from_title, extract_season_from_cn_title
from database import cleanup_old_logs
from dependencies import get_db, get_current_admin

# Apply the security dependency globally to all endpoints in this router
router = APIRouter(
    prefix="/api/admin",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# DATA ENTRY & CRUD OPERATIONS
# ==========================================


@router.post("/add", summary="Add New Anime Entry")
def add_anime(payload: schemas.AnimeEntryCreate, db: Session = Depends(get_db)):
    """
    Appends a new anime entry strictly to the PostgreSQL database (Source of Truth).
    If the Series Hub doesn't exist (based on series_alt_name), it creates it.
    Finally, it triggers a bulk push to Google Sheets to update the backup.
    """
    display_title = (
        payload.series_season_cn
        or payload.series_season_en
        or payload.series_en
        or payload.system_id
    )
    print(f"\n▶️ [POST /add] Request to add: {display_title}")

    # 1. Check if Anime already exists
    existing = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == payload.system_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Anime with this system_id already exists."
        )

    # 2. Extract the temporary trigger field before DB insertion
    payload_data = payload.dict(exclude_unset=True)
    series_alt_name_trigger = payload_data.pop("series_alt_name", None)

    # 3. Create Anime Entry in DB
    new_anime = models.AnimeEntry(**payload_data)

    # Auto-fill series_season if left blank
    if not new_anime.series_season:
        derived_season = extract_season_from_title(
            new_anime.series_season_en
        ) or extract_season_from_title(new_anime.series_en)
        if not derived_season:
            derived_season = extract_season_from_cn_title(new_anime.series_season_cn)

        if derived_season:
            new_anime.series_season = derived_season

    if series_alt_name_trigger:
        new_anime.series_alt_name = series_alt_name_trigger

    db.add(new_anime)

    # 4. Auto-generate Series Hub if missing
    if series_alt_name_trigger:
        existing_series = (
            db.query(models.AnimeSeries)
            .filter(models.AnimeSeries.series_alt_name == series_alt_name_trigger)
            .first()
        )

        if not existing_series:
            print(
                f"ℹ️ [Auto-Gen] Creating new Series Hub for '{series_alt_name_trigger}'"
            )
            new_series = models.AnimeSeries(
                system_id=str(uuid.uuid4()),
                series_alt_name=series_alt_name_trigger,
                series_en=payload.series_en,
                series_cn=payload.series_season_cn,
            )
            db.add(new_series)

    # 5. Commit all DB changes (Source of Truth)
    db.commit()

    # 6. Bulk Backup to Google Sheets
    sync_engine.run_full_sync(db, direction="push")

    return {
        "message": f"Successfully added {display_title}",
        "system_id": payload.system_id,
    }


@router.put("/anime/{system_id}", summary="Full Update of Anime Entry")
def update_anime_full(
    system_id: str, payload: schemas.AnimeEntryUpdate, db: Session = Depends(get_db)
):
    """
    Performs a full overwrite of an anime entry in the PostgreSQL database.
    Then performs a bulk push to Google Sheets to maintain the backup.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(anime, key, value)

    db.commit()

    # Force DB Backup to Google Sheets
    sync_engine.run_full_sync(db, direction="push")

    return {"message": "Anime updated successfully", "system_id": system_id}


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime(system_id: str, db: Session = Depends(get_db)):
    """
    Deletes an anime entry from the PostgreSQL database.
    The deletion will automatically reflect in Google Sheets on the next bulk sync push.
    """
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found.")

    # Log the deletion for the history dashboard before removing it
    title = anime.series_season_cn or anime.series_en or anime.system_id
    del_log = models.DeletedRecord(
        system_id=system_id,
        table_name="anime_entries",
        data_json=f'{{"title": "{title}"}}',
    )
    db.add(del_log)

    db.delete(anime)
    db.commit()

    sync_engine.run_full_sync(db, direction="push")

    return {"message": "Anime deleted successfully."}


@router.post("/series", summary="Add New Series Hub")
def add_series_hub(payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)):
    """
    Creates a new Franchise Hub (AnimeSeries) directly in the PostgreSQL database.
    Then triggers a bulk push to Google Sheets to update the backup.
    """
    display_title = (
        payload.series_en
        or payload.series_cn
        or payload.series_roman
        or "Unknown Series"
    )
    print(f"\n▶️ [POST /admin/series] Request to create Hub: {display_title}")

    sys_id = payload.system_id or str(uuid.uuid4())

    # 1. Check if it already exists
    existing = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == sys_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Series Hub with this system_id already exists."
        )

    # 2. Create the Hub in the DB
    new_series = models.AnimeSeries(
        system_id=sys_id,
        series_en=payload.series_en,
        series_roman=payload.series_roman,
        series_cn=payload.series_cn,
        rating_series=payload.rating_series,
        series_alt_name=payload.series_alt_name,
        series_expectation=payload.series_expectation,
        favorite_3x3_slot=payload.favorite_3x3_slot,
    )

    db.add(new_series)
    db.commit()

    # 3. Bulk Backup to Google Sheets
    sync_engine.run_full_sync(db, direction="push")

    return {
        "message": f"Successfully created Series Hub: {display_title}",
        "system_id": sys_id,
    }


# ==========================================
# SYSTEM OPTIONS (DYNAMIC DROPDOWNS)
# ==========================================


@router.get(
    "/options/{category}",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get Options by Category",
)
def get_system_options(category: str, db: Session = Depends(get_db)):
    """Retrieves all dropdown options for a specific category (e.g., 'studio', 'genre')."""
    return (
        db.query(models.SystemOption)
        .filter(models.SystemOption.category == category)
        .all()
    )


@router.post(
    "/options", response_model=schemas.SystemOptionResponse, summary="Add System Option"
)
def add_system_option(
    payload: schemas.SystemOptionCreate, db: Session = Depends(get_db)
):
    """Adds a new dynamic dropdown option to the database and syncs it to Sheets."""
    # Check for duplicates to prevent messy dropdowns
    existing = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.option_value == payload.option_value,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="This option already exists in the selected category.",
        )

    new_option = models.SystemOption(**payload.dict())
    db.add(new_option)
    db.commit()
    db.refresh(new_option)  # Reload to get the auto-generated ID

    # Trigger a DB-to-Sheets backup to maintain parity
    sync_engine.run_full_sync(db, direction="push")

    return new_option


@router.delete("/options/{option_id}", summary="Delete System Option")
def delete_system_option(option_id: int, db: Session = Depends(get_db)):
    """Removes a dropdown option from the database and syncs the removal to Sheets."""
    option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not option:
        raise HTTPException(status_code=404, detail="System option not found.")

    db.delete(option)
    db.commit()

    # Trigger a DB-to-Sheets backup to maintain parity
    sync_engine.run_full_sync(db, direction="push")

    return {"message": f"Option '{option.option_value}' deleted successfully."}


# ==========================================
# SYNCHRONIZATION ENDPOINTS
# ==========================================


@router.post("/sync/sheets", summary="Master Sync (Sheets <-> DB)")
def sync_with_sheets(direction: str = "both", db: Session = Depends(get_db)):
    """
    Triggers the V2 Master Sync.
    - Pulls new manual entries (no system_id) from Sheets -> DB.
    - Pushes the entire DB -> Sheets (Bulk Overwrite).
    """
    print(f"\n▶️ [POST /sync/sheets] Triggering Master Sync (direction: {direction})")
    result = sync_engine.run_full_sync(db, direction=direction)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


@router.post("/sync/strong", summary="Strong Sync (Jikan -> DB -> Sheets)")
def sync_strong_jikan(db: Session = Depends(get_db)):
    """
    Triggers the V2 Strong Sync.
    Scans all anime with a MAL ID, forcefully updates their rating/rank from Jikan,
    and pushes the updated data to Google Sheets.
    """
    print("\n▶️ [POST /sync/strong] Triggering Strong Sync...")
    result = sync_engine.run_strong_jikan_sync(db)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


# ==========================================
# SYSTEM MAINTENANCE (LOGS)
# ==========================================


@router.get("/logs", summary="Get Admin Sync Logs")
def get_admin_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Retrieves recent synchronization logs for the admin dashboard."""
    return (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/deletions", summary="Get Recent Deletions")
def get_recent_deletions(limit: int = 50, db: Session = Depends(get_db)):
    """Retrieves a history of recently deleted anime entries."""
    return (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .limit(limit)
        .all()
    )


@router.delete("/logs/cleanup", summary="Purge Old Logs")
def cleanup_logs(days: int = 30, db: Session = Depends(get_db)):
    """Deletes sync logs older than the specified days to save space."""
    try:
        purged = cleanup_old_logs(db, days_to_keep=days)
        return {"status": "success", "message": f"Deleted {purged} old sync logs."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
