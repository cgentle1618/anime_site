"""
routers/data_control.py
Handles massive administrative pipelines for data synchronization.
Triggers functions that push/pull from Google Sheets or run batch updates via Jikan.
Strictly protected by Admin Role-Based Access Control.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from services.data_control import (
    execute_backup,
    execute_pull_all,
    execute_fill_anime,
    execute_replace_anime,
)
from dependencies import get_db, get_current_admin

# Setup basic logging
logger = logging.getLogger(__name__)

# Initialize the router. ENTIRE ROUTER IS PROTECTED BY ADMIN JWT.
router = APIRouter(
    prefix="/api/data-control",
    tags=["Data Control Pipelines"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# SYNCHRONIZATION PIPELINES
# ==========================================


@router.post("/backup", summary="Execute Full Backup to Sheets")
def trigger_backup(db: Session = Depends(get_db)):
    """Pushes all PostgreSQL tables to their corresponding Google Sheets."""
    result = execute_backup(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/pull", summary="Execute Full Pull from Sheets")
def trigger_pull(db: Session = Depends(get_db)):
    """Pulls data from Google Sheets and strictly overwrites the PostgreSQL database."""
    result = execute_pull_all(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/fill", summary="Execute Fill Anime (Nulls only)")
def trigger_fill(db: Session = Depends(get_db)):
    """Iterates through all Anime entries and fetches missing data from Jikan API."""
    result = execute_fill_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/replace", summary="Execute Replace Anime (Force updates)")
def trigger_replace(db: Session = Depends(get_db)):
    """Iterates through all Anime entries and forces metadata updates from Jikan API."""
    result = execute_replace_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result
