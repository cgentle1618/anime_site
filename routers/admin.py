import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
import services.sheets_client as sheets_client
import services.sheets_sync as sheets_sync
from database import get_taipei_now
from dependencies import get_db, get_current_admin

# Apply the security dependency globally to all endpoints in this router
router = APIRouter(
    prefix="/api/admin",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)


@router.post("/sync", summary="Trigger Manual Sync")
def trigger_sync(db: Session = Depends(get_db)):
    """
    Force an immediate synchronization between Google Sheets and PostgreSQL.
    Also triggers Jikan API enrichment for any missing metadata.
    """
    try:
        result = sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add", summary="Add New Anime Entry")
def manual_add_anime(payload: schemas.AnimeCreate, db: Session = Depends(get_db)):
    """
    Appends a new anime record to the Google Sheet and syncs it to the database.
    If the series name is recognized as new, a Franchise Hub is automatically generated.
    """
    try:
        # Check if the series exists in the hub list
        existing_series = (
            db.query(models.AnimeSeries)
            .filter(models.AnimeSeries.series_en == payload.series_en)
            .first()
        )

        # If it doesn't exist, create a new series hub first
        if not existing_series:
            new_series_id = str(uuid.uuid4())
            new_series_data = {
                "system_id": new_series_id,
                "series_en": payload.series_en,
                "series_roman": payload.series_season_roman,
                "series_cn": payload.series_alt_name or payload.series_season_cn,
            }
            sheets_client.append_new_series(new_series_data)

        # Append the anime entry
        anime_dict = payload.dict()
        anime_dict.pop("series_alt_name", None)
        sheets_client.append_new_anime(anime_dict)

        # Mirror to DB immediately
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {"status": "success", "message": "Entry appended and synchronized."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/series", summary="Add New Series Hub")
def manual_add_series(
    payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """
    Manually establishes a new Franchise Hub in the 'Anime Series' sheet and database.
    This endpoint is used to create a parent series independently or during an anime
    edit if the user chooses to register a new franchise name.
    """
    try:
        # Ensure ID exists
        sys_id = payload.system_id or str(uuid.uuid4())

        if payload.series_en:
            existing_series = (
                db.query(models.AnimeSeries)
                .filter(models.AnimeSeries.series_en == payload.series_en)
                .first()
            )
            if existing_series:
                return {"status": "success", "message": "Series hub already exists."}

        new_series_data = {
            "system_id": sys_id,
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
            "message": "Franchise Hub established successfully.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/anime/{system_id}", summary="Update Anime Entry")
def update_anime_entry(
    system_id: str, payload: schemas.AnimeUpdate, db: Session = Depends(get_db)
):
    """Updates an existing anime entry in both Sheets and PostgreSQL."""
    try:
        update_data = payload.dict(exclude_unset=True)
        sheets_client.update_anime_row(system_id, update_data)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/series/{system_id}", summary="Update Series Hub")
def update_series_entry(
    system_id: str, payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """Updates franchise-level metadata in both Sheets and PostgreSQL."""
    try:
        update_data = payload.dict(exclude_unset=True)
        sheets_client.update_series_row(system_id, update_data)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime(system_id: str, db: Session = Depends(get_db)):
    """Permanently removes an anime entry and logs the deletion."""
    try:
        anime = (
            db.query(models.AnimeEntry)
            .filter(models.AnimeEntry.system_id == system_id)
            .first()
        )
        title = anime.series_season_cn or anime.series_en if anime else "Unknown"

        sheets_client.delete_anime_row(system_id)

        # Log deletion
        del_log = models.DeletedRecord(
            system_id=system_id, record_type="anime", title=title
        )
        db.add(del_log)
        db.commit()

        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/series/{system_id}", summary="Delete Series Hub")
def delete_series(system_id: str, db: Session = Depends(get_db)):
    """Permanently removes a series hub and logs the deletion."""
    try:
        series = (
            db.query(models.AnimeSeries)
            .filter(models.AnimeSeries.system_id == system_id)
            .first()
        )
        title = series.series_en if series else "Unknown"

        sheets_client.delete_series_row(system_id)

        del_log = models.DeletedRecord(
            system_id=system_id, record_type="series", title=title
        )
        db.add(del_log)
        db.commit()

        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs", response_model=schemas.PaginatedSyncLogResponse)
def get_admin_logs(limit: int = 15, db: Session = Depends(get_db)):
    """Retrieves recent sync logs for the audit trail dashboard."""
    total = db.query(models.SyncLog).count()
    logs = (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return {"total": total, "logs": logs}


@router.get("/recent-deleted", response_model=List[schemas.DeletedRecordResponse])
def get_recent_deletions(limit: int = 15, db: Session = Depends(get_db)):
    """Retrieves a history of deleted records."""
    return (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/orphans", summary="Scan for Orphaned Records")
def scan_orphans(db: Session = Depends(get_db)):
    """Returns DB records that no longer exist in Google Sheets."""
    return sheets_sync.detect_orphans(db)


@router.delete("/orphans/{system_id}", summary="Purge Orphaned Record")
def purge_orphan(system_id: str, db: Session = Depends(get_db)):
    """Deletes a record from PostgreSQL that was already removed from Sheets."""
    entry = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if entry:
        title = entry.series_season_cn or entry.series_en
        del_log = models.DeletedRecord(
            system_id=system_id, record_type="anime_orphan", title=title
        )
        db.add(del_log)
        db.delete(entry)
        db.commit()
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Orphan not found.")


@router.delete("/logs/cleanup", summary="Purge Old Logs")
def cleanup_logs(days: int = 30, db: Session = Depends(get_db)):
    """Deletes sync logs older than the specified days."""
    count = sheets_sync.cleanup_old_logs(db, days)
    return {
        "status": "success",
        "message": f"Deleted {count} logs older than {days} days.",
    }
