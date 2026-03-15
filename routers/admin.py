"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Optimized for V2 (PostgreSQL as Source of Truth).
"""

import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, requests
from sqlalchemy.orm import Session
from google.cloud import storage

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


@router.put("/series/{system_id}", summary="Update Series Hub")
def update_series_hub(
    system_id: str,
    payload: schemas.AnimeSeriesUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Updates an existing Anime Series Hub and queues a Google Sheets backup."""
    db_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not db_series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop(
        "system_id", None
    )  # Prevent accidental overwrites of the primary key

    for key, value in update_data.items():
        setattr(db_series, key, value)

    db.commit()
    db.refresh(db_series)

    print(f"▶️ Admin updated Series Hub {system_id}. Queuing background backup...")
    background_tasks.add_task(_push_series_backup_to_sheets, db)

    return {"message": "Series Hub updated successfully.", "system_id": system_id}


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


@router.put("/options/{option_id}", summary="Update System Option")
def update_system_option(
    option_id: int,
    payload: schemas.SystemOptionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Updates a dynamic system option and queues a Google Sheets backup."""
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    # Prevent accidental duplicates during edit
    if (
        db_option.category != payload.category
        or db_option.option_value != payload.option_value
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
            raise HTTPException(
                status_code=400, detail="This option already exists in this category."
            )

    db_option.category = payload.category
    db_option.option_value = payload.option_value

    db.commit()
    db.refresh(db_option)

    print(
        f"▶️ Admin updated Option {option_id} to '{payload.option_value}'. Queuing background backup..."
    )
    background_tasks.add_task(_push_options_backup_to_sheets, db)

    return {"message": "System option updated successfully.", "id": option_id}


@router.delete("/options/{option_id}", summary="Delete System Option")
def delete_system_option(
    option_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    """Deletes a dynamic system option and updates Google Sheets."""
    db_option = (
        db.query(models.SystemOption)
        .filter(models.SystemOption.id == option_id)
        .first()
    )
    if not db_option:
        raise HTTPException(status_code=404, detail="System option not found.")

    category = db_option.category
    option_value = db_option.option_value

    db.delete(db_option)
    db.commit()

    print(
        f"▶️ Admin deleted Option '{option_value}' from '{category}'. Queuing background backup..."
    )
    background_tasks.add_task(_push_options_backup_to_sheets, db)

    return {"message": "System option deleted successfully.", "id": option_id}


@router.put("/anime/{system_id}", summary="Update Anime Entry")
def update_anime_entry(
    system_id: str,
    payload: schemas.AnimeEntryUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Updates an existing Anime entry and queues a Google Sheets backup."""
    db_anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    # Convert payload to dictionary, ignoring fields that weren't included in the request
    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop(
        "system_id", None
    )  # Prevent accidental overwrites of the primary key

    for key, value in update_data.items():
        setattr(db_anime, key, value)

    db.commit()
    db.refresh(db_anime)

    print(f"▶️ Admin updated Anime Entry {system_id}. Queuing background backup...")
    background_tasks.add_task(_push_db_backup_to_sheets, db)

    return {"message": "Anime entry updated successfully.", "system_id": system_id}


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

    # Determine the best fallback display name for the deletion log
    anime_display_name = (
        db_anime.series_season_en or db_anime.series_en or db_anime.system_id
    )

    # Log the deletion so it appears in the Admin Dashboard logs
    deleted_record = models.DeletedRecord(
        system_id=db_anime.system_id,
        table_name="anime_entries",
        data_json=json.dumps({"title": anime_display_name}),
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

    # Determine the best fallback display name using the requested order
    series_display_name = (
        db_series.series_en
        or db_series.series_cn
        or db_series.series_roman
        or db_series.series_alt_name
        or db_series.system_id
    )

    # Log the deletion so it appears in the Admin Dashboard logs
    deleted_record = models.DeletedRecord(
        system_id=db_series.system_id,
        table_name="anime_series",
        data_json=json.dumps({"series_en": series_display_name}),
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


@router.post("/sync/backup", summary="Trigger Full Backup")
def trigger_backup(db: Session = Depends(get_db)):
    """Runs calculation formatting and backs up all 3 tables to Google Sheets."""
    print("🔔 Admin requested Backup.")
    result = action_backup(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/pull", summary="Trigger Sync from Sheets")
def trigger_sync_from_sheets(db: Session = Depends(get_db)):
    """Pulls manual rows from Google Sheets, runs calculations, and backs up."""
    print("🔔 Admin requested Sync from Sheets.")
    result = action_sync_from_sheets(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/fill", summary="Trigger Fill Missing API Data")
def trigger_fill(db: Session = Depends(get_db)):
    """Calculates missing fields, contacts Jikan API for missing covers/ranks, and backs up."""
    print("🔔 Admin requested Fill.")
    result = action_fill(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/sync/replace", summary="Trigger Replace API Data")
def trigger_replace(db: Session = Depends(get_db)):
    """Calculates missing fields, updates ALL ranks/scores via Jikan API, and backs up."""
    print("🔔 Admin requested Replace.")
    result = action_replace(db)
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


# ==========================================
# DIAGNOSTICS & TESTING
# ==========================================


@router.post("/test-bucket", summary="Test GCP Bucket Permissions")
def test_cloud_storage_bucket():
    """
    Diagnostic endpoint to forcefully test if Cloud Run has permission
    to write to the cg1618-anime-covers bucket.
    """
    try:
        # 1. Download a random test image (Frieren cover)
        test_url = "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg"
        img_response = requests.get(test_url, timeout=10)
        img_response.raise_for_status()
        image_bytes = img_response.content

        # 2. Instantiate Google Cloud Storage Client
        client = storage.Client()
        bucket_name = "cg1618-anime-covers"
        bucket = client.bucket(bucket_name)

        # 3. Create a test blob
        blob = bucket.blob("diagnostic_test_image.jpg")

        # 4. Attempt Upload
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
