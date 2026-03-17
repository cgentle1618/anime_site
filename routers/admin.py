"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Refactored for thread-safe background tasks, storage cleanup, and chunked syncing.
"""

import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from google.cloud import storage
import urllib.request

import models
import schemas
from services.sync import (
    action_backup,
    action_sync_from_sheets,
    action_fill,
    action_replace,
    _push_db_backup_to_sheets,
    _push_series_backup_to_sheets,
    _push_options_backup_to_sheets,
)
from services.image_manager import delete_cover_image
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
    Appends a new anime entry strictly to the PostgreSQL database.
    Auto-calculates missing seasons/parts using updated sync utilities.
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

    # 2. Auto-calculate season if missing (Now natively supports "Season X Part Y")
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

    # 4. Push Backup to Google Sheets
    background_tasks.add_task(_push_db_backup_to_sheets)
    if is_new_series:
        background_tasks.add_task(_push_series_backup_to_sheets)

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
    existing_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.series_en == payload.series_en)
        .first()
    )
    if existing_series:
        raise HTTPException(status_code=400, detail="Series Hub already exists.")

    series_data = payload.model_dump(exclude_none=True)
    series_data["system_id"] = str(uuid.uuid4())
    new_series = models.AnimeSeries(**series_data)
    db.add(new_series)
    db.commit()

    background_tasks.add_task(_push_series_backup_to_sheets)
    return {
        "message": "Series Hub added successfully.",
        "system_id": new_series.system_id,
    }


@router.put("/series/{system_id}", summary="Update Series Hub")
def update_series_hub(
    system_id: str,
    payload: schemas.AnimeSeriesUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("system_id", None)

    for key, value in update_data.items():
        setattr(db_series, key, value)

    db.commit()
    background_tasks.add_task(_push_series_backup_to_sheets)
    return {"message": "Series Hub updated successfully.", "system_id": system_id}


@router.get(
    "/options/{category}",
    response_model=List[schemas.SystemOptionResponse],
    summary="Get System Options by Category",
)
def get_system_options(category: str, db: Session = Depends(get_db)):
    options = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.category == category)
        .all()
    )
    if not options:
        return []
    return options


@router.post("/options", summary="Add System Option")
def add_system_option(
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    existing_option = (
        db.query(models.SystemOption)
        .filter(
            models.SystemOption.category == payload.category,
            models.SystemOption.option_value == payload.option_value,
        )
        .first()
    )

    if existing_option:
        raise HTTPException(status_code=400, detail="This option already exists.")

    new_option = models.SystemOption(
        category=payload.category, option_value=payload.option_value
    )
    db.add(new_option)
    db.commit()

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": f"Option '{payload.option_value}' added successfully."}


@router.put("/options/{option_id}", summary="Update System Option")
def update_system_option(
    option_id: int,
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    db_option.category = payload.category
    db_option.option_value = payload.option_value
    db.commit()

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": "System option updated successfully."}


@router.delete("/options/{option_id}", summary="Delete System Option")
def delete_system_option(
    option_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    db.delete(db_option)
    db.commit()

    background_tasks.add_task(_push_options_backup_to_sheets)
    return {"message": "System option deleted successfully."}


@router.put("/anime/{system_id}", summary="Update Anime Entry")
def update_anime_entry(
    system_id: str,
    payload: schemas.AnimeEntryUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
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


@router.delete("/anime/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(
    system_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
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


@router.delete("/series/{system_id}", summary="Delete Series Hub")
def delete_series_hub(
    system_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    connected_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.series_en == db_series.series_en)
        .all()
    )
    for anime in connected_anime:
        delete_cover_image(anime.system_id)

    series_display_name = db_series.series_en or db_series.system_id
    deleted_record = models.DeletedRecord(
        system_id=db_series.system_id,
        table_name="anime_series",
        data_json=json.dumps({"series_en": series_display_name}),
    )
    db.add(deleted_record)

    db.delete(db_series)
    db.commit()

    background_tasks.add_task(_push_series_backup_to_sheets)
    return {"message": "Series Hub deleted successfully.", "system_id": system_id}


# ==========================================
# SYNCHRONIZATION TRIGGERS
# ==========================================


@router.post("/sync/backup", summary="Trigger Full Backup")
def trigger_backup(db: Session = Depends(get_db)):
    result = action_backup(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/pull", summary="Trigger Sync from Sheets")
def trigger_sync_from_sheets(db: Session = Depends(get_db)):
    result = action_sync_from_sheets(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/fill", summary="Trigger Fill Missing API Data")
def trigger_fill(limit: int = 5, db: Session = Depends(get_db)):
    result = action_fill(db, limit=limit)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/replace", summary="Trigger Replace API Data")
def trigger_replace(limit: int = 5, offset: int = 0, db: Session = Depends(get_db)):
    result = action_replace(db, limit=limit, offset=offset)
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
    return (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/deletions", summary="Get Recent Deletions")
def get_recent_deletions(limit: int = 50, db: Session = Depends(get_db)):
    return (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .limit(limit)
        .all()
    )


@router.delete("/logs/cleanup", summary="Purge Old Logs")
def cleanup_logs(days: int = 30, db: Session = Depends(get_db)):
    try:
        deleted_count = cleanup_old_logs(db, days_to_keep=days)
        return {"message": f"Successfully deleted {deleted_count} old logs."}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to cleanup logs.")


# ==========================================
# DIAGNOSTICS & TESTING
# ==========================================


@router.post("/test-bucket", summary="Test GCP Bucket Permissions")
def test_cloud_storage_bucket():
    try:
        test_url = "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg"
        req = urllib.request.Request(
            test_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            image_bytes = response.read()

        client = storage.Client()
        bucket_name = "cg1618-anime-covers"
        bucket = client.bucket(bucket_name)
        blob = bucket.blob("diagnostic_test_image.jpg")
        blob.upload_from_string(image_bytes, content_type="image/jpeg")

        return {
            "status": "success",
            "message": f"Successfully uploaded diagnostic_test_image.jpg to {bucket_name}!",
            "public_url": blob.public_url,
        }
    except Exception as e:
        return {
            "status": "failed",
            "error_type": str(type(e)),
            "error_message": str(e),
            "troubleshooting": "If you see a 403 Forbidden, your Cloud Run Service Account lacks 'Storage Object Admin' permissions.",
        }
