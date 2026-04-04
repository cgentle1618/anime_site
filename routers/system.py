"""
routers/system.py
Handles system-level read operations for audit trails (logs, deletions)
and infrastructure diagnostics (e.g., Google Cloud Storage testing).
Strictly protected by Admin Role-Based Access Control.
"""

import urllib.request
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from google.cloud import storage

import models
import schemas
from dependencies import get_db, get_current_admin

# Setup basic logging
logger = logging.getLogger(__name__)

# Initialize the router. ENTIRE ROUTER IS PROTECTED BY ADMIN JWT.
router = APIRouter(
    prefix="/api/system",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)


@router.post(
    "/current-season",
    summary="Set Current Active Season",
)
def set_current_season(
    payload: schemas.CurrentSeasonUpdate, db: Session = Depends(get_db)
):
    """
    Updates or inserts the 'current_season' key in the system_configs table.
    Format example: 'WIN 2026'
    """
    season_str = f"{payload.release_season} {payload.release_year}"

    # Check if the configuration key already exists
    config = (
        db.query(models.SystemConfig)
        .filter(models.SystemConfig.config_key == "current_season")
        .first()
    )

    if config:
        config.config_value = season_str
    else:
        # Insert new if it doesn't exist
        config = models.SystemConfig(
            config_key="current_season", config_value=season_str
        )
        db.add(config)

    db.commit()

    return {
        "status": "success",
        "message": f"Current season successfully set to {season_str}",
        "current_season": season_str,
    }


# ==========================================
# AUDIT LOGS & TRAILS
# ==========================================


@router.get(
    "/logs",
    response_model=List[schemas.SyncLogResponse],
    summary="Get Data Control Logs",
)
def get_sync_logs(db: Session = Depends(get_db)):
    """Fetches the history of data control pipeline executions."""
    logs = db.query(models.SyncLog).order_by(models.SyncLog.timestamp.desc()).all()
    return logs


@router.get(
    "/deletions",
    response_model=List[schemas.DeletedRecordResponse],
    summary="Get Deleted Records Audit Trail",
)
def get_deleted_records(db: Session = Depends(get_db)):
    """Fetches the audit trail of deleted entities across the system."""
    records = (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .all()
    )
    return records


# ==========================================
# DIAGNOSTICS & TESTING
# ==========================================


@router.post("/test-bucket", summary="Test GCP Bucket Permissions")
def test_cloud_storage_bucket():
    """
    Diagnostic tool to verify the backend container can successfully write
    to the Google Cloud Storage bucket (used for cover images).
    """
    try:
        # Fetch a test image from MAL
        test_url = "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg"
        req = urllib.request.Request(
            test_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            image_bytes = response.read()

        # Upload to GCP Storage
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
        logger.error(f"Bucket test failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Bucket diagnostic failed: {str(e)}"
        )
