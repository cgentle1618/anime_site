"""
routers/_factory.py
Builds a complete CRUD router for a "regular" media type from its MediaTypeSpec.
Replaces the five near-identical hand-written routers (movie, tv_show, cartoon,
manga, novel). See app/registry.py for the per-type specs.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import Boolean, or_
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_admin
from app.database import get_taipei_now
from app.services.domain import apply_completion_timestamp, pop_remark, upsert_remark
from app.services.domain.plan_next import (
    attach_plan_flag,
    delete_plans_for,
    planned_entry_ids,
    pop_plan_flag,
    set_entry_flag,
    PLAN_FLAG_FIELDS,
)
from app.services.domain.credits import attach_link_fields, delete_links_for
from app.services.integrations.image_manager import delete_cover_image
from app.utils.data_control_utils import log_deleted_record


def make_media_router(spec) -> APIRouter:
    router = APIRouter(prefix=f"/api/{spec.route}", tags=spec.tags)
    not_found = f"{spec.label} entry not found."

    def _get_or_404(db: Session, entry_id: str):
        entry = db.query(spec.model).filter(spec.model.system_id == entry_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail=not_found)
        return entry

    def _names(entry) -> dict:
        return {k: getattr(entry, col) for k, col in spec.hierarchy_names.items()}

    # ------------------------------------------------------------------
    # Public read
    # ------------------------------------------------------------------
    @router.get("/", response_model=List[spec.response_schema], summary=f"Get All {spec.label}")
    def list_entries(
        request: Request,
        search_query: Optional[str] = None,
        limit: int = Query(default=500, ge=1, le=2000),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
    ):
        query = db.query(spec.model)
        columns = spec.model.__table__.columns
        for field in spec.list_filters:
            raw = request.query_params.get(field)
            if raw is None:
                continue
            value = raw.lower() in ("true", "1", "yes") if isinstance(columns[field].type, Boolean) else raw
            query = query.filter(getattr(spec.model, field) == value)
        if search_query and spec.search_fields:
            q = f"%{search_query}%"
            query = query.filter(or_(*[getattr(spec.model, f).ilike(q) for f in spec.search_fields]))
        entries = query.order_by(spec.model.created_at.desc()).limit(limit).offset(offset).all()
        for field, kind in PLAN_FLAG_FIELDS.get(spec.owner_type, ()):
            planned = planned_entry_ids(db, spec.owner_type, kind)
            for entry in entries:
                setattr(entry, field, entry.system_id in planned)
        attach_link_fields(db, spec.owner_type, entries)
        return entries

    @router.get("/{entry_id}", response_model=spec.response_schema, summary=f"Get {spec.label} by ID")
    def get_one(entry_id: str, db: Session = Depends(get_db)):
        entry = _get_or_404(db, entry_id)
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        return entry

    # ------------------------------------------------------------------
    # Protected write (admin only)
    # ------------------------------------------------------------------
    @router.post("/", response_model=spec.response_schema, status_code=201, summary=f"Create {spec.label}")
    async def create(
        data: spec.create_schema,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        payload, remark, has_remark = pop_remark(data.model_dump())
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        entry = spec.model(**payload)
        entry.system_id = uuid.uuid4()
        entry.franchise_id, entry.series_id = spec.resolve_hierarchy(
            db, entry.franchise_id, entry.series_id, _names(entry)
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

        if plan_flags:
            for kind, planned in plan_flags:
                set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
            db.commit()

        await spec.write_hook(db, str(entry.system_id), action_type="Auto", log_action=False)
        db.refresh(entry)

        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)
            db.commit()
            db.refresh(entry)
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        return entry

    @router.put("/{entry_id}", response_model=spec.response_schema, summary=f"Update {spec.label}")
    async def update(
        entry_id: str,
        data: spec.update_schema,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        entry = _get_or_404(db, entry_id)
        payload, remark, has_remark = pop_remark(data.model_dump(exclude_unset=True))
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        for key, value in payload.items():
            setattr(entry, key, value)
        for kind, planned in plan_flags:
            set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)

        apply_completion_timestamp(entry, getattr(data, spec.status_field, None))
        entry.franchise_id, entry.series_id = spec.resolve_hierarchy(
            db, entry.franchise_id, entry.series_id, _names(entry)
        )
        entry.updated_at = get_taipei_now()
        db.commit()
        db.refresh(entry)

        await spec.write_hook(db, str(entry.system_id), action_type="Auto", log_action=False)
        db.refresh(entry)
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        return entry

    @router.patch("/{entry_id}", response_model=spec.response_schema, summary=f"Patch {spec.label}")
    async def patch(
        entry_id: str,
        payload: dict = Body(...),
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        entry = _get_or_404(db, entry_id)
        payload, remark, has_remark = pop_remark(payload)
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        for key, value in payload.items():
            if hasattr(entry, key):
                setattr(entry, key, value)
        for kind, planned in plan_flags:
            set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)

        apply_completion_timestamp(entry, payload.get(spec.status_field))
        entry.updated_at = get_taipei_now()
        db.commit()
        db.refresh(entry)
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        return entry

    @router.post("/{entry_id}/complete", response_model=spec.response_schema,
                 summary=f"Mark {spec.label} Entry as Completed")
    def complete(
        entry_id: str,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        entry = _get_or_404(db, entry_id)
        spec.mark_completed(entry)
        if entry.completed_at is None:
            entry.completed_at = get_taipei_now()
        entry.updated_at = get_taipei_now()
        db.commit()
        db.refresh(entry)
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        return entry

    @router.delete("/{entry_id}", summary=f"Delete {spec.label}")
    def delete(
        entry_id: str,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        entry = _get_or_404(db, entry_id)
        if entry.cover_image_file:
            delete_cover_image(entry_id)
        log_deleted_record(db, entry, spec.label)
        delete_plans_for(db, "entry", entry.system_id)
        delete_links_for(db, spec.owner_type, entry.system_id)
        db.delete(entry)
        db.commit()
        return {"status": "success", "message": f"{spec.label} entry deleted successfully."}

    return router
