"""
routers/plan_next.py
Handles Plan Next - what is queued to watch or read, at entry, series or
franchise scope.

Every route needs an account. A plan queue belongs to one user from Step 3 on,
so a logged-out caller gets a 401 rather than somebody else's queue; the write
routes act on the caller's own rows, so no additional admin gate applies.

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
from app.dependencies import get_current_user_id, get_db
from app.services.domain.plan_next import target_visible, validate_plan_target
from app.services.rbac.enforcement import drop_hidden_rows
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import OWNER_TABLES
from app.utils.plan_next_kinds import (
    KINDS,
    OWNER_COLUMN,
    SCOPES,
    SIZE_GROUPS,
    allowed_scopes_for,
    kind_valid,
    owner_kwargs,
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
def list_kinds(_user_id: UUID = Depends(get_current_user_id)):
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
    viewer: Viewer = Depends(get_viewer),
    user_id: UUID = Depends(get_current_user_id),
):
    query = db.query(models.PlanNext).filter(models.PlanNext.user_id == user_id)
    if media_type:
        query = query.filter(models.PlanNext.media_type == media_type)
    if scope:
        column = OWNER_COLUMN.get(scope)
        if column is None:
            raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
        query = query.filter(getattr(models.PlanNext, column).isnot(None))
    if kind:
        query = query.filter(models.PlanNext.kind == kind)
    # scope names the tier for a group plan and "entry" for an entry plan;
    # only the latter points at something that can carry a label.
    rows = [row for row in query.all() if row.scope == "entry"]
    visible = drop_hidden_rows(db, viewer, rows, "media_type", "target_id")
    keep = {row.system_id for row in visible}
    return [
        _resolve(db, row)
        for row in query.all()
        if row.scope != "entry" or row.system_id in keep
    ]


# ==========================================
# WRITE
# ==========================================


@router.post("/", response_model=schemas.PlanNextRead, status_code=201)
def create_plan_next(
    payload: schemas.PlanNextCreate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
    user_id: UUID = Depends(get_current_user_id),
):
    if not kind_valid(payload.kind):
        raise HTTPException(status_code=422, detail=f"Unknown kind: {payload.kind}")
    if payload.scope not in SCOPES:
        raise HTTPException(status_code=400, detail=f"Unknown scope: {payload.scope}")

    # Object-level check: a target that exists but is hidden from this viewer
    # (a content label they lack) must read back the same as a missing one -
    # 404, never 403 - so the row can't be used as an existence oracle or a
    # metadata leak on hidden entries.
    reason = validate_plan_target(
        db, payload.scope, payload.media_type, payload.target_id, payload.kind, viewer=viewer
    )
    if reason and reason.startswith("No "):
        raise HTTPException(status_code=404, detail=reason)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    column = OWNER_COLUMN[payload.scope]
    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            getattr(models.PlanNext, column) == payload.target_id,
            models.PlanNext.media_type == payload.media_type,
            models.PlanNext.kind == payload.kind,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already planned.")

    row = models.PlanNext(
        user_id=user_id,
        kind=payload.kind,
        media_type=payload.media_type,
        remark=payload.remark,
        **owner_kwargs(payload.scope, payload.target_id),
    )
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
    viewer: Viewer = Depends(get_viewer),
    user_id: UUID = Depends(get_current_user_id),
):
    """Un-plan without knowing the row id, so a toggle needs one call."""
    column = OWNER_COLUMN.get(scope)
    if column is None:
        raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
    # Same object-level check as create: a target hidden from this viewer
    # answers 404 "Not planned", indistinguishable from one truly unplanned.
    if not target_visible(db, viewer, scope, media_type, target_id):
        raise HTTPException(status_code=404, detail="Not planned.")
    row = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            getattr(models.PlanNext, column) == target_id,
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
    viewer: Viewer = Depends(get_viewer),
    user_id: UUID = Depends(get_current_user_id),
):
    # One user may not delete another's row by id.
    row = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.system_id == system_id,
            models.PlanNext.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found.")
    # Same object-level check as create: if the target is (now) hidden from
    # this viewer, treat the row as not found rather than leak that it exists.
    if not target_visible(db, viewer, row.scope, row.media_type, row.target_id):
        raise HTTPException(status_code=404, detail="Plan not found.")
    log_deleted_record(db, row, "Plan Next")
    db.delete(row)
    db.commit()
    return {"status": "success"}
