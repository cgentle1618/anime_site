"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import services.sheets_client as sheets_client
import services.sheets_sync as sheets_sync
from database import get_taipei_now, cleanup_old_logs
from dependencies import get_db, get_current_admin

# Apply the security dependency globally to all endpoints in this router
router = APIRouter(
    prefix="/api/admin",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# DATA ENTRY OPERATIONS
# ==========================================


@router.post("/add", summary="Add New Anime Entry")
def manual_add_anime(payload: schemas.AnimeCreate, db: Session = Depends(get_db)):
    """
    Appends a new anime entry directly to the database and Google Sheets.
    If the Series Hub doesn't exist, it creates it automatically in a single atomic transaction.
    Returns the core title metadata upon success for frontend display.
    """
    display_title = (
        payload.series_season_cn
        or payload.series_season_en
        or payload.series_en
        or payload.system_id
    )
    print(f"\n▶️ [POST /add] Request received to append entry: '{display_title}'")

    # 1. Validation: Prevent duplicate primary keys
    existing = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == payload.system_id)
        .first()
    )
    if existing:
        print(f"⚠️ [Add] System ID {payload.system_id} already exists. Aborting.")
        raise HTTPException(
            status_code=400, detail="Entry with this System ID already exists."
        )

    try:
        # 2. Check & Create Series Hub if missing
        if payload.series_en:
            series_hub = (
                db.query(models.AnimeSeries)
                .filter(models.AnimeSeries.series_en == payload.series_en)
                .first()
            )

            if not series_hub:
                print(
                    f"🚀 [Add] Series Hub '{payload.series_en}' not found. Initializing hub creation..."
                )

                new_series_data = {
                    "system_id": str(uuid.uuid4()),
                    "series_en": payload.series_en,
                    "series_roman": payload.series_season_roman,
                    "series_cn": payload.series_season_cn,
                    "rating_series": None,
                    "alt_name": payload.series_alt_name,
                }

                # Append to Sheets first
                print(f"⏳ [Add] Appending Franchise Hub to Google Sheets...")
                sheets_client.append_new_series(new_series_data)

                # Add to DB session (uncommitted)
                print(f"⏳ [Add] Staging Franchise Hub for PostgreSQL...")
                new_series_db = models.AnimeSeries(**new_series_data)
                new_series_db.created_at = get_taipei_now()
                new_series_db.updated_at = get_taipei_now()
                db.add(new_series_db)

        # 3. Create Anime Entry
        # Use model_dump to exclude the temporary 'series_alt_name' helper field
        anime_data = payload.model_dump(exclude={"series_alt_name"})

        # Append to Sheets
        print(f"⏳ [Add] Appending Anime Entry '{display_title}' to Google Sheets...")
        sheets_client.append_new_anime(anime_data)

        # Add to DB session
        print(f"⏳ [Add] Staging Anime Entry for PostgreSQL...")
        new_entry = models.AnimeEntry(**anime_data)
        new_entry.created_at = get_taipei_now()
        new_entry.updated_at = get_taipei_now()
        db.add(new_entry)

        # 4. Atomic Commit (Both Series & Anime at once)
        print(f"⏳ [Add] Committing transaction to PostgreSQL...")
        db.commit()
        print(f"✅ [Add] Successfully appended and synced '{display_title}'!\n")

        # 5. Return metadata for Frontend UI
        return {
            "message": "Entry successfully appended.",
            "data": {
                "series_en": payload.series_en,
                "series_season_cn": payload.series_season_cn,
                "series_season_en": payload.series_season_en,
            },
        }

    except Exception as e:
        db.rollback()
        print(f"❌ [Add] Error occurred during append: {str(e)}\n")
        raise HTTPException(status_code=500, detail=f"Failed to append entry: {str(e)}")


@router.post("/series", summary="Add New Series Hub")
def manual_add_series(
    payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """
    Manually establishes a new Franchise Hub in the 'Anime Series' sheet and database.
    """
    print(f"\n▶️ [POST /series] Request received to create hub: '{payload.series_en}'")
    try:
        sys_id = payload.system_id or str(uuid.uuid4())

        if payload.series_en:
            existing_series = (
                db.query(models.AnimeSeries)
                .filter(models.AnimeSeries.series_en == payload.series_en)
                .first()
            )
            if existing_series:
                print(f"⚠️ [Series] Hub already exists. Aborting.")
                return {"status": "success", "message": "Series hub already exists."}

        new_series_data = {
            "system_id": sys_id,
            "series_en": payload.series_en,
            "series_roman": payload.series_roman,
            "series_cn": payload.series_cn,
            "rating_series": payload.rating_series,
            "alt_name": payload.alt_name,
        }

        print(f"⏳ [Series] Appending Hub to Google Sheets...")
        sheets_client.append_new_series(new_series_data)

        print(f"⏳ [Series] Syncing new Hub to PostgreSQL...")
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        print(
            f"✅ [Series] Successfully established Franchise Hub '{payload.series_en}'!\n"
        )
        return {
            "status": "success",
            "message": "Franchise Hub established successfully.",
        }
    except Exception as e:
        print(f"❌ [Series] Error occurred during creation: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# MODIFICATION OPERATIONS
# ==========================================


@router.put("/anime/{system_id}", summary="Update Anime Entry")
def update_anime_entry(
    system_id: str, payload: schemas.AnimeUpdate, db: Session = Depends(get_db)
):
    """Updates an existing anime entry in both Sheets and PostgreSQL."""
    display_title = payload.series_season_cn or payload.series_en or system_id
    print(f"\n▶️ [PUT /anime] Request received to update entry: '{display_title}'")
    try:
        # Use model_dump to extract fields excluding unset ones for Pydantic V2
        update_data = payload.model_dump(exclude_unset=True)

        print(f"⏳ [Update] Pushing anime modifications to Google Sheets...")
        sheets_client.update_anime_row(system_id, update_data)

        print(f"⏳ [Update] Syncing modifications back to PostgreSQL...")
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        print(f"✅ [Update] Successfully modified entry '{display_title}'!\n")

        # Return the metadata needed for the frontend visual card
        return {
            "message": "Entry successfully updated.",
            "data": {
                "series_en": payload.series_en,
                "series_season_cn": payload.series_season_cn,
                "series_season_en": payload.series_season_en,
            },
        }
    except Exception as e:
        print(f"❌ [Update] Error occurred during modification: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/series/{system_id}", summary="Update Series Hub")
def update_series_entry(
    system_id: str, payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """Updates franchise-level metadata in both Sheets and PostgreSQL."""
    print(f"\n▶️ [PUT /series] Request received to update Hub: '{payload.series_en}'")
    try:
        update_data = payload.model_dump(exclude_unset=True)

        print(f"⏳ [Update] Pushing series modifications to Google Sheets...")
        sheets_client.update_series_row(system_id, update_data)

        print(f"⏳ [Update] Syncing series modifications to PostgreSQL...")
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        print(f"✅ [Update] Successfully modified Hub '{payload.series_en}'!\n")

        # Return the metadata needed for the frontend visual card
        return {
            "message": "Franchise Hub successfully updated.",
            "data": {
                "series_en": payload.series_en,
                "series_cn": payload.series_cn,
                "alt_name": payload.alt_name,
            },
        }
    except Exception as e:
        print(f"❌ [Update] Error occurred during Hub modification: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# DELETION OPERATIONS
# ==========================================


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime(system_id: str, db: Session = Depends(get_db)):
    """Permanently removes an anime entry and logs the deletion."""
    print(f"\n▶️ [DELETE /anime] Request received to delete system ID: {system_id}")
    try:
        anime = (
            db.query(models.AnimeEntry)
            .filter(models.AnimeEntry.system_id == system_id)
            .first()
        )
        title = anime.series_season_cn or anime.series_en if anime else "Unknown"

        print(f"⏳ [Delete] Removing '{title}' from Google Sheets...")
        sheets_client.delete_anime_row(system_id)

        # Log deletion
        print(f"⏳ [Delete] Logging deletion in PostgreSQL...")
        del_log = models.DeletedRecord(
            system_id=system_id, record_type="anime", title=title
        )
        db.add(del_log)
        db.commit()

        print(f"⏳ [Delete] Running parity sync...")
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        print(f"✅ [Delete] Successfully deleted '{title}'!\n")
        return {"status": "success"}
    except Exception as e:
        print(f"❌ [Delete] Error occurred during deletion: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/series/{system_id}", summary="Delete Series Hub")
def delete_series(system_id: str, db: Session = Depends(get_db)):
    """Permanently removes a series hub and logs the deletion."""
    print(f"\n▶️ [DELETE /series] Request received to delete Hub ID: {system_id}")
    try:
        series = (
            db.query(models.AnimeSeries)
            .filter(models.AnimeSeries.system_id == system_id)
            .first()
        )
        title = series.series_en if series else "Unknown"

        print(f"⏳ [Delete] Removing Hub '{title}' from Google Sheets...")
        sheets_client.delete_series_row(system_id)

        print(f"⏳ [Delete] Logging Hub deletion in PostgreSQL...")
        del_log = models.DeletedRecord(
            system_id=system_id, record_type="series", title=title
        )
        db.add(del_log)
        db.commit()

        print(f"⏳ [Delete] Running parity sync...")
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        print(f"✅ [Delete] Successfully deleted Hub '{title}'!\n")
        return {"status": "success"}
    except Exception as e:
        print(f"❌ [Delete] Error occurred during Hub deletion: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# SYNC & SYSTEM DIAGNOSTICS
# ==========================================


@router.post("/sync", summary="Trigger Manual Sync")
def trigger_sync(db: Session = Depends(get_db)):
    """
    Force an immediate synchronization between Google Sheets and PostgreSQL.
    Also triggers Jikan API enrichment for any missing metadata.
    """
    print("\n▶️ [POST /sync] Manual synchronization triggered by Admin.")
    try:
        result = sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return result
    except Exception as e:
        print(f"❌ [Sync] Critical synchronization error: {str(e)}\n")
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
    print("\n▶️ [GET /orphans] Running orphan detection scan...")
    return sheets_sync.detect_orphans(db)


@router.delete("/orphans/{system_id}", summary="Purge Orphaned Record")
def purge_orphan(system_id: str, db: Session = Depends(get_db)):
    """Deletes a record from PostgreSQL that was already removed from Sheets."""
    print(f"\n▶️ [DELETE /orphans] Purging orphaned system ID: {system_id}")
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
        print(f"✅ [Orphan] Successfully purged orphan '{title}'!\n")
        return {"status": "success"}

    print(f"⚠️ [Orphan] Orphan ID {system_id} not found.\n")
    raise HTTPException(status_code=404, detail="Orphan not found.")


@router.delete("/logs/cleanup", summary="Purge Old Logs")
def cleanup_logs(days: int = 30, db: Session = Depends(get_db)):
    """Deletes sync logs older than the specified days."""
    print(f"\n▶️ [DELETE /logs/cleanup] Purging sync logs older than {days} days...")
    count = cleanup_old_logs(db, days)
    print(f"✅ [Cleanup] Successfully removed {count} log entries!\n")
    return {
        "status": "success",
        "message": f"Deleted {count} logs older than {days} days.",
    }
