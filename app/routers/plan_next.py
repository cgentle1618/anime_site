"""
routers/plan_next.py
Handles Plan Next - what is queued to watch or read, at entry, series or
franchise scope.

Reads are public (a plan is ordinary catalogue data); every write is
admin-only, matching media relations and watch orders.

Replaces the watch_next / read_next booleans and franchise.watch_next_group.
Nothing here derives plans automatically: they are curated on the admin forms
and the franchise page.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.plan_next import validate_plan_target
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import OWNER_TABLES
from app.utils.plan_next_kinds import (
    KINDS,
    SCOPES,
    SIZE_GROUPS,
    allowed_scopes_for,
    kind_valid,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plan-next", tags=["Plan Next"])


# ==========================================
# HELPERS
# ==========================================


def _resolve(db: Session, row: models.PlanNext) -> schemas.PlanNextRead:
    """Attach display data for the planned target, flagging a dangling row."""
    out = schemas.PlanNextRead.model_validate(row)
    key = row.media_type if row.scope == "entry" else row.scope
    ref = OWNER_TABLES.get(key)
    if ref is None:
        return out
    target = db.query(ref.model).filter(ref.model.system_id == row.target_id).first()
    if target is None:
        return out
    out.missing = False
    out.label = ref.label
    out.is_tier = ref.is_tier
    out.nav_path = ref.nav_path
    out.display_name = getattr(target, "display_name", None)
    out.cover_image_file = getattr(target, "cover_image_file", None)
    # Named per tier: franchise_expectation, series_expectation, or the entry's
    # own expectation column.
    for field in ("franchise_expectation", "series_expectation", "expectation"):
        value = getattr(target, field, None)
        if value:
            out.expectation = value
            break
    return out


# ==========================================
# KINDS
# ==========================================


@router.get("/kinds")
def list_kinds():
    """The vocabulary the admin dropdowns and the Plan page tabs read from."""
    return {
        "scopes": list(SCOPES),
        "kinds": list(KINDS),
        "allowed_scopes": {
            kind: {
                media_type: sorted(scopes, key=SCOPES.index)
                for media_type, scopes in allowed_scopes_for(kind).items()
            }
            for kind in KINDS
        },
        "size_groups": {
            media_type: [{"key": g.key, "label": g.label} for g in groups]
            for media_type, groups in SIZE_GROUPS.items()
        },
    }


# ==========================================
# READ
# ==========================================


@router.get("/", response_model=List[schemas.PlanNextRead])
def list_plan_next(
    db: Session = Depends(get_db),
    media_type: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
):
    query = db.query(models.PlanNext)
    if media_type:
        query = query.filter(models.PlanNext.media_type == media_type)
    if scope:
        query = query.filter(models.PlanNext.scope == scope)
    if kind:
        query = query.filter(models.PlanNext.kind == kind)
    return [_resolve(db, row) for row in query.all()]


# ==========================================
# WRITE
# ==========================================


@router.post("/", response_model=schemas.PlanNextRead, status_code=201)
def create_plan_next(
    payload: schemas.PlanNextCreate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    if not kind_valid(payload.kind):
        raise HTTPException(status_code=422, detail=f"Unknown kind: {payload.kind}")
    if payload.scope not in SCOPES:
        raise HTTPException(status_code=400, detail=f"Unknown scope: {payload.scope}")

    reason = validate_plan_target(
        db, payload.scope, payload.media_type, payload.target_id, payload.kind
    )
    if reason and reason.startswith("No "):
        raise HTTPException(status_code=404, detail=reason)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.scope == payload.scope,
            models.PlanNext.target_id == payload.target_id,
            models.PlanNext.media_type == payload.media_type,
            models.PlanNext.kind == payload.kind,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already planned.")

    row = models.PlanNext(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _resolve(db, row)


@router.delete("/target")
def delete_plan_next_by_target(
    scope: str = Query(...),
    media_type: str = Query(...),
    target_id: UUID = Query(...),
    kind: str = Query("next"),
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Un-plan without knowing the row id, so a toggle needs one call."""
    row = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.scope == scope,
            models.PlanNext.media_type == media_type,
            models.PlanNext.target_id == target_id,
            models.PlanNext.kind == kind,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not planned.")
    log_deleted_record(db, row, "Plan Next")
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.delete("/{system_id}")
def delete_plan_next(
    system_id: UUID,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    row = (
        db.query(models.PlanNext)
        .filter(models.PlanNext.system_id == system_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found.")
    log_deleted_record(db, row, "Plan Next")
    db.delete(row)
    db.commit()
    return {"status": "success"}
