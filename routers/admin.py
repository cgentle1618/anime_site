"""
routers/admin.py
Handles all administrative API endpoints.
This includes manual Google Sheets synchronization, viewing sync logs,
handling orphaned database records, and performing full CRUD operations
on Anime and Series entries from the Admin Dashboard.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

import database
import models
import schemas
import services.sheets_sync as sheets_sync
import services.sheets_client as sheets_client
from dependencies import get_db

# Initialize the router with a standard prefix and tag
router = APIRouter(prefix="/api/admin", tags=["System Administration"])


# ==========================================
# SYNCHRONIZATION ENDPOINTS
# ==========================================


@router.post("/sync", summary="Trigger Manual Sync")
def trigger_manual_sync(db: Session = Depends(get_db)):
    """
    Manually triggers a full two-way synchronization between Google Sheets
    and the PostgreSQL database. Returns a summary of added, updated, and deleted rows.
    """
    try:
        result = sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


# ==========================================
# SYSTEM LOGS & AUDIT TRAIL
# ==========================================


@router.get(
    "/logs", response_model=schemas.PaginatedSyncLogResponse, summary="Get Sync Logs"
)
def get_sync_logs(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    """Fetches the most recent background and manual sync logs with pagination."""
    total_logs = db.query(models.SyncLog).count()
    logs = (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"total": total_logs, "logs": logs}


@router.delete("/logs/cleanup", summary="Cleanup Old Logs")
def trigger_log_cleanup(days: int = 30, db: Session = Depends(get_db)):
    """Manually triggers the database utility to purge sync logs older than the specified days."""
    try:
        deleted_count = database.cleanup_old_logs(db, days_to_keep=days)
        return {
            "status": "success",
            "message": f"Successfully deleted {deleted_count} logs older than {days} days.",
            "deleted_count": deleted_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/recent-deleted",
    response_model=List[schemas.DeletedRecordResponse],
    summary="Get Recently Deleted",
)
def get_recent_deleted_records(limit: int = 15, db: Session = Depends(get_db)):
    """Fetches the audit trail of the most recently deleted anime and series entries."""
    records = (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .limit(limit)
        .all()
    )
    return records


# ==========================================
# ADMIN CRUD: ANIME ENTRIES
# ==========================================


@router.post("/add", summary="Add New Anime Entry")
def manual_add_anime(payload: schemas.AnimeCreate, db: Session = Depends(get_db)):
    """
    Appends a new anime entry.
    Sequence:
    1. Checks if a parent Series Hub exists. If not, creates one in Google Sheets.
    2. Appends the new Anime Entry to Google Sheets.
    3. Immediately triggers a DB sync to pull the new data into PostgreSQL.
    """
    try:
        # 1. Handle automatic Series Hub creation if it's a completely new franchise
        if payload.series_en:
            existing_series = (
                db.query(models.AnimeSeries)
                .filter(models.AnimeSeries.series_en == payload.series_en)
                .first()
            )

            if not existing_series:
                print(
                    f"New series detected: {payload.series_en}. Creating series entry in Google Sheets..."
                )
                new_series_data = {
                    "system_id": str(uuid.uuid4()),
                    "series_en": payload.series_en,
                    "series_roman": payload.series_season_roman,
                    "series_cn": payload.series_season_cn,
                    "rating_series": "",
                    "alt_name": payload.series_alt_name,
                }
                sheets_client.append_new_series(new_series_data)

        # 2. Append Anime to Google Sheets (Exclude transient 'series_alt_name' field)
        anime_dict = payload.model_dump(exclude={"series_alt_name"})
        sheets_client.append_new_anime(anime_dict)

        # 3. Synchronize Database
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": "Successfully appended to Google Sheets and synced to database.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/series", summary="Add New Series Hub")
def manual_add_series(
    payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """
    Creates a standalone series hub from the frontend manual prompt.
    """
    try:
        if payload.series_en:
            existing_series = (
                db.query(models.AnimeSeries)
                .filter(models.AnimeSeries.series_en == payload.series_en)
                .first()
            )
            if existing_series:
                return {"status": "success", "message": "Series already exists."}

        new_series_data = {
            "system_id": str(uuid.uuid4()),
            "series_en": payload.series_en,
            "series_roman": payload.series_roman,
            "series_cn": payload.series_cn,
            "rating_series": payload.rating_series,
            "alt_name": payload.alt_name,
        }

        sheets_client.append_new_series(new_series_data)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": "Successfully created new Series Hub.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/anime/{system_id}", summary="Update Anime Entry")
def update_anime_entry(
    system_id: str, payload: schemas.AnimeUpdate, db: Session = Depends(get_db)
):
    """Overwrites an entire anime row in Google Sheets and triggers a DB sync."""
    try:
        anime_dict = payload.model_dump()
        anime_dict["system_id"] = (
            system_id  # Inject path ID securely into the dictionary
        )

        sheets_client.update_anime_row(system_id, anime_dict)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully updated anime {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes an anime row from Google Sheets, logs the deletion, and triggers a DB sync."""
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    title = (
        anime.series_season_cn
        or anime.series_season_en
        or anime.series_en
        or "Unknown Title"
    )

    try:
        sheets_client.delete_anime_row(system_id)

        # Record the deletion in the audit trail
        deleted_record = models.DeletedRecord(
            system_id=anime.system_id, record_type="anime", title=title
        )
        db.add(deleted_record)
        db.commit()

        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully deleted anime {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# ADMIN CRUD: SERIES HUBS
# ==========================================


@router.put("/series/{system_id}", summary="Update Series Hub")
def update_series_entry(
    system_id: str, payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """Overwrites an entire series row in Google Sheets and triggers a DB sync."""
    try:
        series_dict = payload.model_dump()
        series_dict["system_id"] = system_id

        sheets_client.update_series_row(system_id, series_dict)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully updated series {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/series/{system_id}", summary="Delete Series Hub")
def delete_series_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes a series row from Google Sheets, logs the deletion, and triggers a DB sync."""
    series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series Hub not found")

    try:
        sheets_client.delete_series_row(system_id)

        # Record the deletion in the audit trail
        deleted_record = models.DeletedRecord(
            system_id=series.system_id, record_type="series", title=series.series_en
        )
        db.add(deleted_record)
        db.commit()

        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully deleted series {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# ORPHAN MANAGEMENT
# ==========================================


@router.get("/orphans", summary="Detect Orphaned Records")
def get_orphaned_entries(db: Session = Depends(get_db)):
    """
    Detects entries in the PostgreSQL database that no longer exist in Google Sheets.
    Usually happens if a row is hard-deleted directly from the Sheet UI.
    """
    try:
        return sheets_sync.detect_orphans(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/orphans/{system_id}", summary="Delete Orphaned Record")
def delete_orphan_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes an orphaned entry directly from PostgreSQL to restore parity with Sheets."""
    try:
        db_entry = (
            db.query(models.AnimeEntry)
            .filter(models.AnimeEntry.system_id == system_id)
            .first()
        )
        if not db_entry:
            raise HTTPException(status_code=404, detail="Orphan not found in database.")

        title = (
            db_entry.series_season_cn
            or db_entry.series_season_en
            or db_entry.series_en
            or "Unknown Title"
        )

        # Record the deletion in the audit trail
        deleted_record = models.DeletedRecord(
            system_id=db_entry.system_id, record_type="anime_orphan", title=title
        )
        db.add(deleted_record)

        # Purge from database
        db.delete(db_entry)
        db.commit()

        return {
            "status": "success",
            "message": "Orphan successfully cleared from database.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
