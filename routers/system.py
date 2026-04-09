"""
routers/system.py
Handles system-level read operations for audit trails (logs)
and infrastructure diagnostics. Also manages System Configurations (e.g. Current Season).
Strictly protected by Admin Role-Based Access Control.
"""

import urllib.request
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from google.cloud import storage

import models
import schemas
from dependencies import get_db, get_current_admin

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
def get_system_logs(db: Session = Depends(get_db)):
    """Fetches the most recent data control logs."""
    logs = (
        db.query(models.DataControlLog)
        .order_by(models.DataControlLog.timestamp.desc())
        .limit(50)
        .all()
    )
    return logs


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
