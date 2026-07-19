"""
routers/cartoon.py
Handles all API endpoints related to Cartoon entries (western animated TV shows).
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.dependencies import get_db, get_current_admin
from app.database import get_taipei_now
from app import models
from app import schemas

from app.services.integrations.image_manager import delete_cover_image
from app.services.other_logics import apply_completion_timestamp, mark_tv_completed, resolve_cartoon_parent_hierarchy
from app.services.data_control import execute_replace_single_cartoon
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cartoon", tags=["Cartoon Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get(
    "/", response_model=List[schemas.CartoonResponse], summary="Get All Cartoons"
)
def get_all_cartoons(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    watching_status: Optional[str] = None,
    airing_status: Optional[str] = None,
    to_rewatch: Optional[bool] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(models.Cartoon)

    if franchise_id:
        query = query.filter(models.Cartoon.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Cartoon.series_id == series_id)
    if watching_status:
        query = query.filter(models.Cartoon.watching_status == watching_status)
    if airing_status:
        query = query.filter(models.Cartoon.airing_status == airing_status)
    if to_rewatch is not None:
        query = query.filter(models.Cartoon.to_rewatch == to_rewatch)
    if search_query:
        q = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Cartoon.cartoon_name_cn.ilike(q),
                models.Cartoon.cartoon_name_en.ilike(q),
                models.Cartoon.cartoon_name_alt.ilike(q),
            )
        )

    return query.order_by(models.Cartoon.created_at.desc()).limit(limit).offset(offset).all()


@router.get(
    "/{cartoon_id}",
    response_model=schemas.CartoonResponse,
    summary="Get Cartoon by ID",
)
def get_cartoon_by_id(cartoon_id: str, db: Session = Depends(get_db)):
    entry = (
        db.query(models.Cartoon).filter(models.Cartoon.system_id == cartoon_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.CartoonResponse,
    status_code=201,
    summary="Create Cartoon",
)
async def create_cartoon(
    data: schemas.CartoonCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.Cartoon(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_cartoon_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.cartoon_name_en,
            "cn": new_entry.cartoon_name_cn,
            "alt": new_entry.cartoon_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_cartoon(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{cartoon_id}",
    response_model=schemas.CartoonResponse,
    summary="Update Cartoon",
)
async def update_cartoon(
    cartoon_id: str,
    data: schemas.CartoonUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.Cartoon).filter(models.Cartoon.system_id == cartoon_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    apply_completion_timestamp(entry, data.watching_status)

    entry.franchise_id, entry.series_id = resolve_cartoon_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.cartoon_name_en,
            "cn": entry.cartoon_name_cn,
            "alt": entry.cartoon_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_cartoon(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{cartoon_id}",
    response_model=schemas.CartoonResponse,
    summary="Patch Cartoon",
)
async def patch_cartoon(
    cartoon_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.Cartoon).filter(models.Cartoon.system_id == cartoon_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    apply_completion_timestamp(entry, payload.get("watching_status"))

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.post(
    "/{system_id}/complete",
    response_model=schemas.CartoonResponse,
    summary="Mark Cartoon Entry as Completed",
)
def complete_cartoon_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a cartoon entry."""
    entry = (
        db.query(models.Cartoon)
        .filter(models.Cartoon.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")

    mark_tv_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{cartoon_id}", summary="Delete Cartoon")
def delete_cartoon(
    cartoon_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.Cartoon).filter(models.Cartoon.system_id == cartoon_id).first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")

    if entry.cover_image_file:
        delete_cover_image(cartoon_id)
    log_deleted_record(db, entry, "Cartoon")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Cartoon entry deleted successfully."}
