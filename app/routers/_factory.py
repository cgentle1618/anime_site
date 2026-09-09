"""
routers/_factory.py
Builds a complete CRUD router for a media type from its MediaTypeSpec.
Every media type - the six regular ones, anime and anime movie - is served by
this one router shape; what differs per type is declared in app/registry.py
(hooks, filters, whether the type has a series).
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import Boolean, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_taipei_now
from app.dependencies import get_current_admin, get_db
from app.models.media import Media
from app.models.user_media_list import UserMediaList
from app.routers._patching import apply_column_patch
from app.services.domain import (
    apply_completion_timestamp,
    apply_list_completion_timestamp,
    pop_remark,
    upsert_remark,
)
from app.services.domain.credits import attach_link_fields
from app.services.domain.plan_next import (
    PLAN_FLAG_FIELDS,
    attach_plan_flag,
    delete_plans_for,
    planned_entry_ids,
    pop_plan_flag,
    set_entry_flag,
)
from app.services.domain.sources import attach_sources
from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELDS,
    STATUS_FIELD,
    acting_user_id,
    apply_list_payload,
    attach_list_fields,
    ensure_list_row,
    join_list,
    split_list_payload,
)
from app.services.integrations.image_manager import delete_cover_image
from app.services.rbac.enforcement import apply_entry_visibility, entry_visible
from app.services.rbac.field_gate import gate
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.data_control_utils import log_deleted_record
from app.utils.entity_ref import media_entity_ref_filter

logger = logging.getLogger(__name__)

# Filter fields that live on `media`, not on the entry's own table.
MEDIA_OWNED_FIELDS = frozenset({"franchise_id", "series_id"})


def make_media_router(spec) -> APIRouter:
    router = APIRouter(prefix=f"/api/{spec.route}", tags=spec.tags)
    not_found = f"{spec.label} entry not found."

    def _get_or_404(db: Session, entry_id: str, viewer=None):
        # The SPA addresses entries by public_id (/anime/47/...); internal
        # callers still hold UUIDs. One parser decides which this is, and a
        # reference that is neither is a 404, never a 500 - a hand-mangled URL
        # must not reach the database layer.
        try:
            ref = media_entity_ref_filter(spec.model, str(entry_id))
        except ValueError:
            raise HTTPException(status_code=404, detail=not_found)
        entry = db.query(spec.model).filter(ref).first()
        if not entry:
            raise HTTPException(status_code=404, detail=not_found)
        # Same message either way: a hidden entry must be indistinguishable
        # from one that was never there.
        if not entry_visible(db, viewer, spec.owner_type, entry.system_id):
            raise HTTPException(status_code=404, detail=not_found)
        return entry

    def _names(entry) -> dict:
        return {k: getattr(entry, col) for k, col in spec.hierarchy_names.items()}

    def _resolve_parents(db: Session, entry) -> None:
        series_id = getattr(entry, "series_id", None) if spec.has_series else None
        franchise_id, series_id = spec.resolve_hierarchy(
            db, entry.franchise_id, series_id, _names(entry)
        )
        entry.franchise_id = franchise_id
        if spec.has_series:
            entry.series_id = series_id

    async def _run_write_hook(db: Session, entry) -> None:
        """Enrich after commit; the row is already saved, so a hook failure is
        logged, never surfaced as a 500 (which made the SPA retry and create
        duplicates)."""
        if spec.write_hook is None:
            return
        try:
            await spec.write_hook(db, str(entry.system_id), action_type="Auto", log_action=False)
        except Exception:
            db.rollback()
            logger.exception("%s write hook failed for %s", spec.label, entry.system_id)

    def _write_list(db: Session, entry, personal: dict, viewer) -> None:
        """Apply the personal half of a payload to the acting user's row.

        Called for every write on a list_backed type, including one with an
        empty personal half: a brand-new entry needs its default-status row to
        exist so the detail page has something to read and to edit.
        """
        user_id = acting_user_id(db, viewer)
        if user_id is None:
            return
        row = ensure_list_row(db, user_id, entry.system_id, spec.owner_type)
        apply_list_payload(row, personal, spec.owner_type)
        apply_list_completion_timestamp(
            row, personal.get(STATUS_FIELD[spec.owner_type])
        )

    def _finish(db: Session, entry, viewer=None):
        if spec.list_backed:
            attach_list_fields(
                db, spec.owner_type, entry, acting_user_id(db, viewer)
            )
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        attach_sources(db, spec.owner_type, entry, viewer)
        return entry

    def _pop_nested(payload: dict) -> dict:
        """Lift nested collections out of the payload; they are not columns."""
        if not spec.nested_collections:
            return {}
        return {
            key: payload.pop(key)
            for key in list(spec.nested_collections)
            if key in payload
        }

    def _write_nested(db: Session, entry, nested: dict, viewer=None) -> None:
        # The viewer travels with the write: a whole-set replace must not
        # delete rows the writer's own permissions hid from the form they
        # filled in. See services.domain.sources.replace_sources.
        for key, value in nested.items():
            spec.nested_collections[key](db, entry, value, viewer)

    def _derive(db: Session, entry) -> None:
        if spec.progress_hook:
            spec.progress_hook(db, entry)

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
        viewer: Viewer = Depends(get_viewer),
    ):
        query = apply_entry_visibility(
            db.query(spec.model), spec.model, spec.owner_type, db, viewer
        )
        # Only preload keys that are real ORM relationships (e.g. novel's
        # "units"). "sources" has no relationship - media_source rows carry no
        # FK to the entry - and is populated separately by attach_sources().
        for name in (spec.nested_collections or {}):
            if name in spec.model.__mapper__.relationships:
                query = query.options(selectinload(getattr(spec.model, name)))
        # The viewer's personal columns live on user_media_list once this type
        # is list_backed, so a filter naming one has to go through an OUTER
        # join rather than resolving against the model.
        user_id = acting_user_id(db, viewer) if spec.list_backed else None
        personal = set(LIST_FIELDS[spec.owner_type]) if spec.list_backed else set()
        if spec.list_backed:
            query = join_list(query, spec.model, user_id)
        columns = spec.model.__table__.columns
        joined_media = False
        for field in spec.list_filters:
            raw = request.query_params.get(field)
            if raw is None:
                continue
            if field in personal:
                if field == STATUS_FIELD[spec.owner_type]:
                    # An entry with no list row reads as the type's default, so
                    # filtering ON that default must also return the rows that
                    # have no row at all - the OUTER join's NULL side.
                    condition = UserMediaList.status == raw
                    if raw == DEFAULT_STATUS[spec.owner_type]:
                        condition = or_(condition, UserMediaList.status.is_(None))
                    query = query.filter(condition)
                else:
                    query = query.filter(getattr(UserMediaList, field) == raw)
                continue
            if field in MEDIA_OWNED_FIELDS:
                # These live on `media` now, and an association proxy cannot
                # be used as a column expression - the filter has to go
                # through the joined row.
                if not joined_media:
                    query = query.join(spec.model.media_row)
                    joined_media = True
                query = query.filter(getattr(Media, field) == raw)
                continue
            value = raw.lower() in ("true", "1", "yes") if isinstance(columns[field].type, Boolean) else raw
            query = query.filter(getattr(spec.model, field) == value)
        if spec.extra_filters:
            query = spec.extra_filters(query, request.query_params)
        if search_query and spec.search_fields:
            q = f"%{search_query}%"
            query = query.filter(or_(*[getattr(spec.model, f).ilike(q) for f in spec.search_fields]))
        entries = query.order_by(spec.model.created_at.desc()).limit(limit).offset(offset).all()
        for field, kind in PLAN_FLAG_FIELDS.get(spec.owner_type, ()):
            planned = planned_entry_ids(db, spec.owner_type, kind)
            for entry in entries:
                setattr(entry, field, entry.system_id in planned)
        attach_link_fields(db, spec.owner_type, entries)
        attach_sources(db, spec.owner_type, entries, viewer)
        # One IN query for the whole page, not one per entry.
        if spec.list_backed:
            attach_list_fields(db, spec.owner_type, entries, user_id)
        return gate(viewer, spec.owner_type, entries, spec.response_schema)

    @router.get("/{entry_id}", response_model=spec.response_schema, summary=f"Get {spec.label} by ID")
    def get_one(
        entry_id: str,
        db: Session = Depends(get_db),
        viewer: Viewer = Depends(get_viewer),
    ):
        entry = _get_or_404(db, entry_id, viewer)
        return gate(viewer, spec.owner_type, _finish(db, entry, viewer), spec.response_schema)

    # ------------------------------------------------------------------
    # Protected write (admin only)
    # ------------------------------------------------------------------
    @router.post("/", response_model=spec.response_schema, status_code=201, summary=f"Create {spec.label}")
    async def create(
        data: spec.create_schema,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
        viewer: Viewer = Depends(get_viewer),
    ):
        payload, remark, has_remark = pop_remark(data.model_dump())
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        entry = spec.model(**payload)
        entry.system_id = uuid.uuid4()
        _resolve_parents(db, entry)
        db.add(entry)
        if nested or spec.progress_hook:
            db.flush()
        _write_nested(db, entry, nested, viewer)
        _derive(db, entry)
        if spec.pre_commit_hook:
            spec.pre_commit_hook(db, entry)
        # After the pre-commit hook: the list row's FK points at `media`, and
        # that row is written by Step 0's write path as part of the flush.
        if spec.list_backed:
            db.flush()
            _write_list(db, entry, personal, viewer)
        db.commit()
        db.refresh(entry)

        if plan_flags:
            for kind, planned in plan_flags:
                set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
            db.commit()

        await _run_write_hook(db, entry)
        db.refresh(entry)

        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)
            db.commit()
            db.refresh(entry)
        return _finish(db, entry, viewer)

    @router.put("/{entry_id}", response_model=spec.response_schema, summary=f"Update {spec.label}")
    async def update(
        entry_id: str,
        data: spec.update_schema,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
        viewer: Viewer = Depends(get_viewer),
    ):
        entry = _get_or_404(db, entry_id)
        payload, remark, has_remark = pop_remark(data.model_dump(exclude_unset=True))
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        for key, value in payload.items():
            setattr(entry, key, value)
        _write_nested(db, entry, nested, viewer)
        _derive(db, entry)
        for kind, planned in plan_flags:
            set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)

        if spec.list_backed:
            _write_list(db, entry, personal, viewer)
        else:
            apply_completion_timestamp(entry, payload.get(spec.status_field))
        _resolve_parents(db, entry)
        if spec.pre_commit_hook:
            spec.pre_commit_hook(db, entry)
        entry.updated_at = get_taipei_now()
        db.commit()
        db.refresh(entry)

        await _run_write_hook(db, entry)
        db.refresh(entry)
        return _finish(db, entry, viewer)

    @router.patch("/{entry_id}", response_model=spec.response_schema, summary=f"Patch {spec.label}")
    async def patch(
        entry_id: str,
        payload: dict = Body(...),
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
        viewer: Viewer = Depends(get_viewer),
    ):
        entry = _get_or_404(db, entry_id)
        payload, remark, has_remark = pop_remark(payload)
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        apply_column_patch(entry, payload)
        _write_nested(db, entry, nested, viewer)
        _derive(db, entry)
        for kind, planned in plan_flags:
            set_entry_flag(db, spec.owner_type, entry.system_id, bool(planned), kind=kind)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)

        if spec.list_backed:
            _write_list(db, entry, personal, viewer)
        else:
            apply_completion_timestamp(entry, payload.get(spec.status_field))
        entry.updated_at = get_taipei_now()
        db.commit()
        db.refresh(entry)
        return _finish(db, entry, viewer)

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
        return _finish(db, entry, None)

    @router.delete("/{entry_id}", summary=f"Delete {spec.label}")
    def delete(
        entry_id: str,
        db: Session = Depends(get_db),
        admin: dict = Depends(get_current_admin),
    ):
        entry = _get_or_404(db, entry_id)
        if entry.cover_image_file:
            # The resolved row's own UUID, never entry_id: that is the raw URL
            # segment and may be a public_id, which would build a storage key
            # no blob matches and orphan the cover silently.
            delete_cover_image(spec.owner_type, str(entry.system_id))
        log_deleted_record(db, entry, spec.label)
        delete_plans_for(db, "entry", entry.system_id)
        # media_credit, media_tag and media_source need no cleanup call:
        # each has a media_id FK that cascades from the media row, which the
        # entry's own AFTER DELETE trigger removes.
        db.delete(entry)
        db.commit()
        return {"status": "success", "message": f"{spec.label} entry deleted successfully."}

    return router
