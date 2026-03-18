"""
routers/system.py
Handles heavy administrative commands, synchronization triggers, audit logs,
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
from services.sync import (
    action_backup,
    action_sync_from_sheets,
    action_fill,
    action_replace,
    cleanup_old_logs,
)
from dependencies import get_db, get_current_admin

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the router. ENTIRE ROUTER IS PROTECTED BY ADMIN JWT.
router = APIRouter(
    prefix="/api/system",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)

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
# SYSTEM MAINTENANCE (AUDIT TRAILS)
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


@router.get(
    "/deletions",
    response_model=List[schemas.DeletedRecordResponse],
    summary="Get Recent Deletions",
)
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
