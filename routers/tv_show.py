"""
routers/tv_show.py
Handles all API endpoints related to TV Show entries (live-action and scripted TV).
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import resolve_tv_show_parent_hierarchy
from services.data_control import execute_replace_single_tv_show
from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tv-shows", tags=["TV Show Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get(
    "/", response_model=List[schemas.TVShowResponse], summary="Get All TV Shows"
)
def get_all_tv_shows(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    watching_status: Optional[str] = None,
    airing_status: Optional[str] = None,
    region: Optional[str] = None,
    search_query: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.TVShows)

    if franchise_id:
        query = query.filter(models.TVShows.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.TVShows.series_id == series_id)
    if watching_status:
        query = query.filter(models.TVShows.watching_status == watching_status)
    if airing_status:
        query = query.filter(models.TVShows.airing_status == airing_status)
    if region:
        query = query.filter(models.TVShows.region == region)
    if search_query:
        q = f"%{search_query}%"
        query = query.filter(
            or_(
                models.TVShows.tv_name_cn.ilike(q),
                models.TVShows.tv_name_en.ilike(q),
                models.TVShows.tv_name_alt.ilike(q),
            )
        )

    return query.order_by(models.TVShows.created_at.desc()).all()


@router.get(
    "/{tv_show_id}",
    response_model=schemas.TVShowResponse,
    summary="Get TV Show by ID",
)
def get_tv_show_by_id(tv_show_id: str, db: Session = Depends(get_db)):
    entry = (
        db.query(models.TVShows).filter(models.TVShows.system_id == tv_show_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="TV show entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.TVShowResponse,
    status_code=201,
    summary="Create TV Show",
)
async def create_tv_show(
    data: schemas.TVShowCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.TVShows(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_tv_show_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.tv_name_en,
            "cn": new_entry.tv_name_cn,
            "alt": new_entry.tv_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_tv_show(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{tv_show_id}",
    response_model=schemas.TVShowResponse,
    summary="Update TV Show",
)
async def update_tv_show(
    tv_show_id: str,
    data: schemas.TVShowUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.TVShows).filter(models.TVShows.system_id == tv_show_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="TV show entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    if data.watching_status == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.franchise_id, entry.series_id = resolve_tv_show_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.tv_name_en,
            "cn": entry.tv_name_cn,
            "alt": entry.tv_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_tv_show(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{tv_show_id}",
    response_model=schemas.TVShowResponse,
    summary="Patch TV Show",
)
async def patch_tv_show(
    tv_show_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.TVShows).filter(models.TVShows.system_id == tv_show_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="TV show entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    if payload.get("watching_status") == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{tv_show_id}", summary="Delete TV Show")
def delete_tv_show(
    tv_show_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.TVShows).filter(models.TVShows.system_id == tv_show_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="TV show entry not found.")

    if entry.cover_image_file:
        delete_cover_image(tv_show_id)
    log_deleted_record(db, entry, "TV Show")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "TV show entry deleted successfully."}


@router.post("/{tv_show_id}/autofill", summary="Autofill TV Show")
async def autofill_tv_show(
    tv_show_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    result = await execute_replace_single_tv_show(
        db, tv_show_id, action_type="Manual", log_action=True
    )
    if result.get("status") == "error":
        status_code = result.get("status_code", 400)
        raise HTTPException(status_code=status_code, detail=result.get("message"))
    return JSONResponse(content=result)
