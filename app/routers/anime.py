"""
routers/anime.py
Handles all API endpoints related to individual anime entries.
Strictly acts as a Controller layer: handles routing, schema validation, and HTTP responses.
All heavy business logic is delegated to services.domain.
"""

import uuid
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.dependencies import get_db, get_current_admin
from app.database import get_taipei_now
from app import models
from app import schemas

from app.services.integrations.image_manager import delete_cover_image
from app.services.domain import (
    apply_completion_timestamp,
    apply_single_replace_anime,
    create_missing_seasonal,
    derive_ep_previous_anime,
    mark_tv_completed,
    pop_remark,
    resolve_anime_parent_hierarchy,
    upsert_remark,
)
from app.services.domain.plan_next import (
    attach_plan_flag,
    delete_plans_for,
    planned_entry_ids,
    pop_plan_flag,
    set_entry_flag,
)

from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/anime", tags=["Anime Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.AnimeResponse], summary="Get All Anime")
def get_all_anime(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    search_query: Optional[str] = None,
    airing_season: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Retrieves Anime entries, supporting foreign key filters and search.
    airing_season accepts the combined seasonal string (e.g. 'WIN 2026').
    """
    query = db.query(models.Anime)

    if franchise_id:
        query = query.filter(models.Anime.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Anime.series_id == series_id)

    if airing_season:
        parts = airing_season.strip().split(" ", 1)
        if len(parts) == 2:
            query = query.filter(
                models.Anime.release_season == parts[0],
                func.substr(models.Anime.release_date, 1, 4) == parts[1],
            )

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Anime.anime_name_en.ilike(search_term),
                models.Anime.anime_name_cn.ilike(search_term),
                models.Anime.anime_name_roman.ilike(search_term),
                models.Anime.anime_name_jp.ilike(search_term),
                models.Anime.anime_name_alt.ilike(search_term),
            )
        )

    entries = query.order_by(models.Anime.created_at.desc()).limit(limit).offset(offset).all()
    planned = planned_entry_ids(db, "anime")
    for entry in entries:
        entry.watch_next = entry.system_id in planned
    return entries


@router.get(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Get Anime by ID"
)
def get_anime_by_id(system_id: str, db: Session = Depends(get_db)):
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")
    attach_plan_flag(db, "anime", db_anime)
    return db_anime


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.AnimeResponse,
    status_code=201,
    summary="Create Anime Entry",
)
def create_anime_entry(
    anime_in: schemas.AnimeCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a new anime entry.
    Applies unified domain rules and correctly cascades episode calculations.
    """
    payload, remark, has_remark = pop_remark(anime_in.model_dump())
    payload, planned, has_plan = pop_plan_flag("anime", payload)
    new_anime = models.Anime(**payload)
    new_anime.system_id = uuid.uuid4()

    final_franchise_id, final_series_id = resolve_anime_parent_hierarchy(
        db, new_anime.franchise_id, new_anime.series_id, new_anime.names_dict
    )
    new_anime.franchise_id = final_franchise_id
    new_anime.series_id = final_series_id

    db.add(new_anime)

    apply_single_replace_anime(db, new_anime, force_replace_ratings=False)

    db.flush()

    derive_ep_previous_anime(db, new_anime.franchise_id, new_anime.series_id)

    db.flush()

    try:
        create_missing_seasonal(db)
    except Exception as e:
        logger.warning(f"Auto create seasonal failed: {e}")

    db.commit()
    db.refresh(new_anime)

    if has_plan:
        set_entry_flag(db, "anime", new_anime.system_id, bool(planned))
        db.commit()

    if has_remark:
        upsert_remark(db, "anime", new_anime.system_id, remark)
        db.commit()
        db.refresh(new_anime)
    attach_plan_flag(db, "anime", new_anime)
    return new_anime


@router.put(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Update Anime Entry"
)
def update_anime_entry(
    system_id: str,
    anime_in: schemas.AnimeUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Updates an anime entry.
    Applies unified domain rules and correctly cascades episode calculations.
    """
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    update_data, remark, has_remark = pop_remark(anime_in.model_dump(exclude_unset=True))
    update_data, planned, has_plan = pop_plan_flag("anime", update_data)
    for key, value in update_data.items():
        setattr(db_anime, key, value)
    if has_plan:
        set_entry_flag(db, "anime", db_anime.system_id, bool(planned))
    if has_remark:
        upsert_remark(db, "anime", db_anime.system_id, remark)

    apply_completion_timestamp(db_anime, update_data.get("watching_status"))

    final_franchise_id, final_series_id = resolve_anime_parent_hierarchy(
        db, db_anime.franchise_id, db_anime.series_id, db_anime.names_dict
    )
    db_anime.franchise_id = final_franchise_id
    db_anime.series_id = final_series_id

    apply_single_replace_anime(db, db_anime, force_replace_ratings=False)

    db.flush()

    derive_ep_previous_anime(db, db_anime.franchise_id, db_anime.series_id)

    db.flush()

    try:
        create_missing_seasonal(db)
    except Exception as e:
        logger.warning(f"Auto create seasonal failed: {e}")

    db_anime.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_anime)

    attach_plan_flag(db, "anime", db_anime)
    return db_anime


@router.patch(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Patch Anime Entry"
)
def patch_anime_entry(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates an entry (e.g., '+1 Episode'). Auto-completes if maxed."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    payload, remark, has_remark = pop_remark(payload)
    payload, planned, has_plan = pop_plan_flag("anime", payload)
    for key, value in payload.items():
        if hasattr(db_anime, key):
            setattr(db_anime, key, value)
    if has_plan:
        set_entry_flag(db, "anime", db_anime.system_id, bool(planned))
    if has_remark:
        upsert_remark(db, "anime", db_anime.system_id, remark)

    apply_completion_timestamp(db_anime, payload.get("watching_status"))

    db_anime.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_anime)

    attach_plan_flag(db, "anime", db_anime)
    return db_anime


@router.post(
    "/{system_id}/complete",
    response_model=schemas.AnimeResponse,
    summary="Mark Anime Entry as Completed",
)
def complete_anime_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for an anime entry using the standard mark_tv_completed logic."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    mark_tv_completed(db_anime)

    if db_anime.completed_at is None:
        db_anime.completed_at = get_taipei_now()
    db_anime.updated_at = get_taipei_now()

    db.commit()
    db.refresh(db_anime)
    attach_plan_flag(db, "anime", db_anime)
    return db_anime


@router.delete("/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(
    system_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Deletes an entry, cleans up local image, and logs to audit trail."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    delete_cover_image(system_id)

    log_deleted_record(db, db_anime, "Anime")

    delete_plans_for(db, "entry", db_anime.system_id)

    db.delete(db_anime)
    db.commit()

    return {"status": "success", "message": "Anime entry deleted successfully."}
