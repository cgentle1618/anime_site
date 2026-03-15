"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Optimized for V2 (PostgreSQL as Source of Truth).
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import models
import schemas
from services.sync import basic_sync, strong_sync, _push_db_backup_to_sheets
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

    # 2. Auto-calculate season if missing
    calculated_season = payload.series_season
    if not calculated_season:
        if payload.series_season_en:
            calculated_season = extract_season_from_title(payload.series_season_en)
        elif payload.series_season_cn:
            calculated_season = extract_season_from_cn_title(payload.series_season_cn)

    # 3. Create the Database Entry dynamically (DRY Principle)
    entry_data = payload.model_dump()

    # FIXED: Remove 'series_alt_name' as it belongs to AnimeSeries, not AnimeEntry
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

    return {
        "message": "Entry added successfully and is backing up to Sheets.",
        "system_id": new_entry.system_id,
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
