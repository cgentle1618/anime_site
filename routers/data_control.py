"""
routers/data_control.py
Handles administrative pipelines for data synchronization.
Strictly protected by Admin Role-Based Access Control.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from services.data_control import (
    execute_backup,
    execute_pull_all,
    execute_pull_specific,
    execute_fill_anime,
    execute_replace_anime,
)
from dependencies import get_db, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/data-control",
    tags=["Data Control Pipelines"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# PULL PIPELINES
# ==========================================


@router.post("/pull", summary="Execute Full Pull from Sheets")
def trigger_pull(db: Session = Depends(get_db)):
    result = execute_pull_all(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/pull/{tab_name}", summary="Execute Pull for Specific Tab")
def trigger_pull_specific_tab(tab_name: str, db: Session = Depends(get_db)):
    result = execute_pull_specific(db, tab_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ==========================================
# FILL PIPELINES
# ==========================================


@router.post("/fill", summary="Execute Fill Anime (Nulls only)")
def trigger_fill_anime(db: Session = Depends(get_db)):
    result = execute_fill_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/fill/all", summary="Execute Fill All")
def trigger_fill_all(db: Session = Depends(get_db)):
    # Currently maps to anime, future proofed to also wrap Manga/Novel logic when added
    result = execute_fill_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


# ==========================================
# REPLACE PIPELINES
# ==========================================


@router.post("/replace", summary="Execute Replace Anime (Force updates)")
def trigger_replace_anime(db: Session = Depends(get_db)):
    result = execute_replace_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/replace/all", summary="Execute Replace All")
def trigger_replace_all(db: Session = Depends(get_db)):
    # Currently maps to anime, future proofed to wrap Manga/Novel logic
    result = execute_replace_anime(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


# ==========================================
# BACKUP PIPELINE
# ==========================================


@router.post("/backup", summary="Execute Full Backup to Sheets")
def trigger_backup(db: Session = Depends(get_db)):
    result = execute_backup(db)
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result
