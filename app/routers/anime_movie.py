"""
routers/anime_movie.py
Handles all API endpoints related to Anime Movie entries.
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.dependencies import get_db, get_current_admin
from app.database import get_taipei_now
from app import models
from app import schemas

from app.services.domain.credits import attach_link_fields
from app.services.integrations.image_manager import delete_cover_image
from app.services.domain import (
    apply_completion_timestamp,
    mark_movie_completed,
    pop_remark,
    resolve_anime_movie_parent_hierarchy,
    upsert_remark,
)
from app.services.domain.plan_next import (
    attach_plan_flag,
    delete_plans_for,
    planned_entry_ids,
    pop_plan_flag,
    set_entry_flag,
    PLAN_FLAG_FIELDS,
)
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/anime-movie", tags=["Anime Movie Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get(
    "/", response_model=List[schemas.AnimeMovieResponse], summary="Get All Anime Movies"
)
def get_all_anime_movies(
    franchise_id: Optional[str] = None,
    watching_status: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(models.AnimeMovies)

    if franchise_id:
        query = query.filter(models.AnimeMovies.franchise_id == franchise_id)
    if watching_status:
        query = query.filter(models.AnimeMovies.watching_status == watching_status)
    if search_query:
        term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.AnimeMovies.anime_movie_name_en.ilike(term),
                models.AnimeMovies.anime_movie_name_cn.ilike(term),
                models.AnimeMovies.anime_movie_name_roman.ilike(term),
                models.AnimeMovies.anime_movie_name_jp.ilike(term),
                models.AnimeMovies.anime_movie_name_alt.ilike(term),
            )
        )

    entries = query.order_by(models.AnimeMovies.created_at.desc()).limit(limit).offset(offset).all()
    for field, kind in PLAN_FLAG_FIELDS.get("anime-movie", ()):
        planned = planned_entry_ids(db, "anime-movie", kind)
        for entry in entries:
            setattr(entry, field, entry.system_id in planned)
    attach_link_fields(db, "anime-movie", entries)
    return entries


@router.get(
    "/{system_id}",
    response_model=schemas.AnimeMovieResponse,
    summary="Get Anime Movie by ID",
)
def get_anime_movie_by_id(system_id: str, db: Session = Depends(get_db)):
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime Movie entry not found.")
    attach_plan_flag(db, "anime-movie", entry)
    attach_link_fields(db, "anime-movie", entry)
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.AnimeMovieResponse,
    status_code=201,
    summary="Create Anime Movie",
)
def create_anime_movie(
    data: schemas.AnimeMovieCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    payload, remark, has_remark = pop_remark(data.model_dump())
    payload, plan_flags = pop_plan_flag("anime-movie", payload)
    new_entry = models.AnimeMovies(**payload)
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id = resolve_anime_movie_parent_hierarchy(
        db, new_entry.franchise_id, new_entry.names_dict
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    if plan_flags:
        for kind, planned in plan_flags:
            set_entry_flag(db, "anime-movie", new_entry.system_id, bool(planned), kind=kind)
        db.commit()

    if has_remark:
        upsert_remark(db, "anime-movie", new_entry.system_id, remark)
        db.commit()
        db.refresh(new_entry)
    attach_plan_flag(db, "anime-movie", new_entry)
    attach_link_fields(db, "anime-movie", new_entry)
    return new_entry


@router.put(
    "/{system_id}",
    response_model=schemas.AnimeMovieResponse,
    summary="Update Anime Movie",
)
def update_anime_movie(
    system_id: str,
    data: schemas.AnimeMovieUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime Movie entry not found.")

    update_data, remark, has_remark = pop_remark(data.model_dump(exclude_unset=True))
    update_data, plan_flags = pop_plan_flag("anime-movie", update_data)
    for key, value in update_data.items():
        setattr(entry, key, value)
    for kind, planned in plan_flags:
        set_entry_flag(db, "anime-movie", entry.system_id, bool(planned), kind=kind)
    if has_remark:
        upsert_remark(db, "anime-movie", entry.system_id, remark)

    apply_completion_timestamp(entry, data.watching_status)

    entry.franchise_id = resolve_anime_movie_parent_hierarchy(
        db, entry.franchise_id, entry.names_dict
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    attach_plan_flag(db, "anime-movie", entry)
    attach_link_fields(db, "anime-movie", entry)
    return entry


@router.patch(
    "/{system_id}",
    response_model=schemas.AnimeMovieResponse,
    summary="Patch Anime Movie",
)
def patch_anime_movie(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime Movie entry not found.")

    payload, remark, has_remark = pop_remark(payload)
    payload, plan_flags = pop_plan_flag("anime-movie", payload)
    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)
    for kind, planned in plan_flags:
        set_entry_flag(db, "anime-movie", entry.system_id, bool(planned), kind=kind)
    if has_remark:
        upsert_remark(db, "anime-movie", entry.system_id, remark)

    apply_completion_timestamp(entry, payload.get("watching_status"))

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    attach_plan_flag(db, "anime-movie", entry)
    attach_link_fields(db, "anime-movie", entry)
    return entry


@router.post(
    "/{system_id}/complete",
    response_model=schemas.AnimeMovieResponse,
    summary="Mark Anime Movie Entry as Completed",
)
def complete_anime_movie_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for an anime movie entry."""
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime movie entry not found.")

    mark_movie_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    attach_plan_flag(db, "anime-movie", entry)
    attach_link_fields(db, "anime-movie", entry)
    return entry


@router.delete("/{system_id}", summary="Delete Anime Movie")
def delete_anime_movie(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime Movie entry not found.")

    delete_cover_image(system_id)
    log_deleted_record(db, entry, "Anime Movie")
    delete_plans_for(db, "entry", entry.system_id)
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Anime Movie entry deleted successfully."}
