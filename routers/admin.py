"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Optimized for V2 (PostgreSQL as Source of Truth).
"""

import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import models
import schemas
from services.sync import (
    basic_sync,
    strong_sync,
    _push_db_backup_to_sheets,
    _push_series_backup_to_sheets,
    _push_options_backup_to_sheets,
)
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
def add_anime(
    payload: schemas.AnimeEntryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Appends a new anime entry strictly to the PostgreSQL database (Source of Truth).
    If the Series Hub doesn't exist (based on series_en), it creates a basic one.
    Finally, it triggers a background task to bulk push to Google Sheets to update the backup.
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
            series_roman=payload.series_season_roman,  # Fallback
            series_cn=payload.series_season_cn,  # Fallback
            series_alt_name=payload.series_alt_name,
        )
        db.add(new_series)
        db.flush()  # Flush to get the series into the session before adding the entry
        is_new_series = True

    # 2. Auto-calculate season if missing
    calculated_season = payload.series_season
    if not calculated_season:
        if payload.series_season_en:
            calculated_season = extract_season_from_title(payload.series_season_en)
        elif payload.series_season_cn:
            calculated_season = extract_season_from_cn_title(payload.series_season_cn)

    # 3. Create the Database Entry dynamically (DRY Principle)
    entry_data = payload.model_dump()

    # Remove 'series_alt_name' as it belongs to AnimeSeries, not AnimeEntry
    entry_data.pop("series_alt_name", None)

    entry_data["system_id"] = str(uuid.uuid4())
    entry_data["series_season"] = calculated_season

    new_entry = models.AnimeEntry(**entry_data)

    db.add(new_entry)
    db.commit()

    # 4. Push Backup to Google Sheets (IN THE BACKGROUND)
    print(
        f"▶️ Admin added entry for {new_entry.series_en}. Queuing background Sheet backup..."
    )
    background_tasks.add_task(_push_db_backup_to_sheets, db)

    # NEW: If a new series was created, we must also trigger the Series sheet backup!
    if is_new_series:
        print(
            f"▶️ Admin created new series {new_series.series_en}. Queuing background Series backup..."
        )
        background_tasks.add_task(_push_series_backup_to_sheets, db)

    return {
        "message": "Entry added successfully and is backing up to Sheets.",
        "system_id": new_entry.system_id,
    }


@router.post("/series", summary="Add New Series Hub")
def add_series(
    payload: schemas.AnimeSeriesCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Explicitly adds a new Anime Series Hub to the PostgreSQL database.
    Triggers a background task to bulk push the updated Series table to Google Sheets.
    """
    # 1. Check for duplicates
    existing_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.series_en == payload.series_en)
        .first()
    )
    if existing_series:
        raise HTTPException(status_code=400, detail="Series Hub already exists.")

    # 2. Insert into PostgreSQL
    series_data = payload.model_dump(exclude_none=True)
    series_data["system_id"] = str(uuid.uuid4())

    new_series = models.AnimeSeries(**series_data)
    db.add(new_series)
    db.commit()

    # 3. Push Backup to Google Sheets
    print(
        f"▶️ Admin explicitly added Series '{new_series.series_en}'. Queuing background backup..."
    )
    background_tasks.add_task(_push_series_backup_to_sheets, db)

    return {
        "message": "Series Hub added successfully and is backing up to Sheets.",
        "system_id": new_series.system_id,
    }


@router.get(
    "/options/{category}",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get System Options by Category",
)
def get_system_options(category: str, db: Session = Depends(get_db)):
    """
    Retrieves dynamic dropdown options for a specific category (e.g., 'Studio', 'Genre Main').
    Used by the frontend Add/Modify forms to populate selection lists.
    """
    options = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.category == category)
        .all()
    )

    if not options:
        # We don't raise a 404 here, returning an empty list allows the frontend
        # to gracefully fall back to a text input or empty dropdown if no options exist yet.
        return []

    return options


@router.post("/options", summary="Add System Option")
def add_system_option(
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Adds a new dynamic dropdown option to the database (e.g., a new Studio or Genre).
    Prevents duplicates from being added to the same category.
    """
    # Check if this exact option already exists in this category
    existing_option = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.option_value == payload.option_value,
        )
        .first()
    )

    if existing_option:
        raise HTTPException(
            status_code=400, detail="This option already exists in this category."
        )

    new_option = models.SystemOption(
        category=payload.category, option_value=payload.option_value
    )

    db.add(new_option)
    db.commit()

    # Trigger background backup to Google Sheets 'Options' tab
    print(
        f"▶️ Admin explicitly added Option '{new_option.option_value}' to '{new_option.category}'. Queuing background backup..."
    )
    background_tasks.add_task(_push_options_backup_to_sheets, db)

    return {
        "message": f"Option '{payload.option_value}' added successfully to '{payload.category}'."
    }


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(
    system_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    """Deletes an Anime entry, logs it, and updates Google Sheets."""
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    # Log the deletion so it appears in the Admin Dashboard logs
    deleted_record = models.DeletedRecord(
        system_id=db_anime.system_id,
        table_name="anime_entries",
        data_json=json.dumps(
            {"title": db_anime.series_season_en or db_anime.series_en}
        ),
    )
    db.add(deleted_record)

    db.delete(db_anime)
    db.commit()

    print(f"▶️ Admin deleted Anime Entry {system_id}. Queuing background backup...")
    background_tasks.add_task(_push_db_backup_to_sheets, db)

    return {"message": "Anime entry deleted successfully.", "system_id": system_id}


@router.delete("/series/{system_id}", summary="Delete Series Hub")
def delete_series_hub(
    system_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    """Deletes an Anime Series Hub, logs it, and updates Google Sheets."""
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    # Log the deletion so it appears in the Admin Dashboard logs
    deleted_record = models.DeletedRecord(
        system_id=db_series.system_id,
        table_name="anime_series",
        data_json=json.dumps({"series_en": db_series.series_en}),
    )
    db.add(deleted_record)

    db.delete(db_series)
    db.commit()

    print(f"▶️ Admin deleted Series Hub {system_id}. Queuing background backup...")
    background_tasks.add_task(_push_series_backup_to_sheets, db)

    return {"message": "Series Hub deleted successfully.", "system_id": system_id}


# ==========================================
# SYNCHRONIZATION TRIGGERS
# ==========================================


@router.post("/sync/basic", summary="Trigger Basic Sync")
def trigger_basic_sync(db: Session = Depends(get_db)):
    """
    Manually triggers the basic sync workflow.
    Pulls manual additions from Google Sheets, autofills DB, and pushes backup.
    """
    print("🔔 Admin requested Basic Sync.")
    result = basic_sync(db)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


@router.post("/sync/strong", summary="Trigger Strong Sync")
def trigger_strong_sync(db: Session = Depends(get_db)):
    """
    Manually triggers the strong sync workflow.
    Calls Jikan API for all relevant entries to update scores and status.
    """
    print("🔔 Admin requested Strong Sync.")
    result = strong_sync(db)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


# ==========================================
# SYSTEM MAINTENANCE (LOGS)
# ==========================================


@router.get(
    "/logs", response_model=List[schemas.SyncLogResponse], summary="Get Admin Sync Logs"
)
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
    """Purges sync logs older than the specified number of days."""
    try:
        deleted_count = cleanup_old_logs(db, days_to_keep=days)
        return {"message": f"Successfully deleted {deleted_count} old logs."}
    except Exception as e:
        print(f"❌ Failed to cleanup logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup logs.")
