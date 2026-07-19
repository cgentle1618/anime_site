"""
routers/system.py
Handles system-level read operations for audit trails (logs)
and infrastructure diagnostics. Also manages System Configurations (e.g. Current Season).
Strictly protected by Admin Role-Based Access Control.
"""

import urllib.request
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from google.cloud import storage

from app import models
from app import schemas
from app.dependencies import get_db, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/system",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# SYSTEM CONFIGURATIONS
# ==========================================


@router.get("/config/current_season", summary="Get Current Season")
def get_current_season(db: Session = Depends(get_db)):
    """Fetches the globally set current season from system_configs."""
    query = text(
        "SELECT config_value FROM system_configs WHERE config_key = 'current_season'"
    )
    result = db.execute(query).fetchone()
    return {"current_season": result[0] if result else "Not Set"}


@router.post("/config/current_season", summary="Set Current Season")
def set_current_season(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Upserts the current season into the system_configs table."""
    val = payload.get("current_season")
    if not val:
        raise HTTPException(
            status_code=400, detail="Missing current_season in payload."
        )

    query = text(
        """
        INSERT INTO system_configs (config_key, config_value) 
        VALUES ('current_season', :val) 
        ON CONFLICT (config_key) 
        DO UPDATE SET config_value = EXCLUDED.config_value
    """
    )

    db.execute(query, {"val": val})
    db.commit()
    return {"message": "Current season updated successfully", "current_season": val}


# ==========================================
# AUDIT LOGS & TRAILS
# ==========================================


@router.get(
    "/logs",
    response_model=List[schemas.DataControlLogResponse],
    summary="Get Data Control Logs",
)
def get_system_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Fetches the most recent data control logs."""
    logs = (
        db.query(models.DataControlLog)
        .order_by(models.DataControlLog.timestamp.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return logs


@router.delete("/logs", summary="Clear Old Data Control Logs")
def clear_system_logs(db: Session = Depends(get_db)):
    """Deletes all log entries except the 10 most recent."""
    keep_ids = (
        db.query(models.DataControlLog.id)
        .order_by(models.DataControlLog.timestamp.desc())
        .limit(10)
        .subquery()
    )
    count = (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.id.notin_(keep_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": count}


@router.delete("/logs/{log_id}", summary="Delete a Data Control Log Entry")
def delete_system_log(log_id: int, db: Session = Depends(get_db)):
    """Deletes a single data control log entry by ID."""
    log = db.query(models.DataControlLog).filter(models.DataControlLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(log)
    db.commit()
    return {"deleted": log_id}


@router.get(
    "/deleted",
    response_model=List[schemas.DeletedRecordResponse],
    summary="Get Deleted Records",
)
def get_deleted_records(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Fetches the most recent deleted records log."""
    records = (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.timestamp.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return records


@router.delete("/deleted", summary="Clear Old Deleted Records")
def clear_deleted_records(db: Session = Depends(get_db)):
    """Deletes all deleted record entries except the 5 most recent."""
    keep_ids = (
        db.query(models.DeletedRecord.id)
        .order_by(models.DeletedRecord.timestamp.desc())
        .limit(5)
        .subquery()
    )
    count = (
        db.query(models.DeletedRecord)
        .filter(models.DeletedRecord.id.notin_(keep_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": count}


@router.delete("/deleted/{record_id}", summary="Delete a Deleted Record Entry")
def delete_deleted_record(record_id: int, db: Session = Depends(get_db)):
    """Deletes a single deleted record entry by ID."""
    record = db.query(models.DeletedRecord).filter(models.DeletedRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"deleted": record_id}


# ==========================================
# DIAGNOSTICS & TESTING
# ==========================================


@router.post("/test-bucket", summary="Test GCP Bucket Permissions")
def test_cloud_storage_bucket():
    """Diagnostic tool to verify GCS write permissions."""
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
        logger.error(f"Bucket test failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Bucket diagnostic failed: {str(e)}"
        )
