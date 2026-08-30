"""
routers/data_control.py - the admin Data Control actions.

Fill / Replace / Pull routes are generated from the pipeline registry
(app/services/pipelines/specs.py), one literal route per media type, so a new
type gets its endpoints by being added there. Backup, Calculate and Check are
single actions and stay hand-written below.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_current_admin, get_db
from app.services.calculation import (
    bulk_check_cover_image,
    bulk_delete_orphaned_cover_images,
    bulk_download_missing_covers,
    bulk_set_cover_image_fields,
    run_calculate_all,
)
from app.services.domain import find_all_duplicates, find_all_remarks
from app.services.pipelines import fill, replace
from app.services.pipelines.backup import execute_backup
from app.services.pipelines.pull import execute_pull_all, execute_pull_specific
from app.services.pipelines.specs import PIPELINES
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB

logger = logging.getLogger(__name__)


class DownloadCoversBody(BaseModel):
    system_ids: Optional[list[str]] = None


router = APIRouter(
    prefix="/api/data-control",
    tags=["Data Control Pipelines"],
    dependencies=[Depends(get_current_admin)],
)


def _stream(generator) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream")


def _json(result: dict) -> JSONResponse:
    """A pipeline reports failure as a status dict; map it to the HTTP error
    it names (404 for a missing entry, 400 for a bad request) instead of 200."""
    if result.get("status") == "error":
        raise HTTPException(
            status_code=result.get("status_code", 400), detail=result.get("message")
        )
    return JSONResponse(content=result)


def _attr(module, prefix: str, key: str):
    return getattr(module, f"{prefix}{key.replace('-', '_')}")


# ---------------------------------------------------------------------------
# Fill / Replace / Pull per media type
# ---------------------------------------------------------------------------

# Literal routes come first so "/fill/all" and "/pull" can never be caught by
# a parameterised sibling declared below.


@router.post("/fill/all", summary="Fill every type, then Backup (SSE)")
async def trigger_fill_all(request: Request, db: Session = Depends(get_db)):
    return _stream(fill.execute_fill_all(db, request, action_type="Manual"))


@router.post("/replace/all", summary="Replace every type, then Backup (SSE)")
async def trigger_replace_all(request: Request, db: Session = Depends(get_db)):
    return _stream(replace.execute_replace_all(db, request, action_type="Manual"))


def _register_media_routes(spec) -> None:
    key, label = spec.key, spec.label
    run_fill = _attr(fill, "execute_fill_", key)
    run_single = _attr(replace, "execute_replace_single_", key)

    @router.post(f"/fill/{key}", summary=f"Fill {label} (SSE)", name=f"fill_{key}")
    async def trigger_fill(request: Request, db: Session = Depends(get_db)):
        return _stream(run_fill(db, request, action_type="Manual", log_action=True))

    if spec.replace_select is not None:
        run_bulk = _attr(replace, "execute_replace_", key)

        @router.post(f"/replace/{key}", summary=f"Replace {label} (SSE)", name=f"replace_{key}")
        async def trigger_replace(request: Request, db: Session = Depends(get_db)):
            return _stream(run_bulk(db, request, action_type="Manual", log_action=True))

    @router.post(
        f"/replace/{key}/{{entry_id}}",
        summary=f"Replace one {label} entry",
        name=f"replace_single_{key}",
    )
    async def trigger_replace_single(entry_id: str, db: Session = Depends(get_db)):
        return _json(await run_single(db, entry_id, action_type="Manual", log_action=False))


for _spec in PIPELINES.values():
    _register_media_routes(_spec)


# ---------------------------------------------------------------------------
# Backup / Pull
# ---------------------------------------------------------------------------


@router.post("/backup", summary="Back up every table to Google Sheets")
def trigger_backup_all(db: Session = Depends(get_db)):
    return JSONResponse(content=execute_backup(db, action_type="Manual"))


@router.post("/pull", summary="Restore every tab from Google Sheets")
def trigger_pull_all(db: Session = Depends(get_db)):
    return JSONResponse(content=execute_pull_all(db, action_type="Manual"))


def _register_pull_route(key: str, tab_name: str) -> None:
    @router.post(f"/pull/{key}", summary=f"Restore the {tab_name} tab", name=f"pull_{key}")
    def trigger_pull(db: Session = Depends(get_db)):
        return _json(execute_pull_specific(db, tab_name, action_type="Manual", log_action=True))


# Per-type shortcuts the admin page links to; every other tab goes through
# /pull/{tab_name}.
for _tab, _media in MEDIA_TYPE_FOR_TAB.items():
    if _media in ("manga", "novel", "comic", "cartoon"):
        _register_pull_route(_media, _tab)


@router.post("/pull/{tab_name}", summary="Restore one sheet tab by name")
def trigger_pull_specific(tab_name: str, db: Session = Depends(get_db)):
    return _json(execute_pull_specific(db, tab_name, action_type="Manual", log_action=True))


# ---------------------------------------------------------------------------
# Calculate / Check
# ---------------------------------------------------------------------------


@router.post("/calculate/all")
def trigger_calculate_all(db: Session = Depends(get_db)):
    return JSONResponse(content=run_calculate_all(db))


@router.get("/calculate/check-cover-image")
def trigger_check_cover_image(
    db: Session = Depends(get_db), entry_type: Optional[str] = Query(None)
):
    return JSONResponse(content=bulk_check_cover_image(db, entry_type=entry_type))


@router.delete("/calculate/delete-orphaned-covers")
def trigger_delete_orphaned_covers(db: Session = Depends(get_db)):
    return JSONResponse(content=bulk_delete_orphaned_cover_images(db))


@router.post("/calculate/set-cover-image-fields")
def trigger_set_cover_image_fields(db: Session = Depends(get_db)):
    return JSONResponse(content=bulk_set_cover_image_fields(db))


@router.post("/calculate/download-missing-covers")
def trigger_download_missing_covers(
    body: DownloadCoversBody = DownloadCoversBody(), db: Session = Depends(get_db)
):
    return JSONResponse(content=bulk_download_missing_covers(db, system_ids=body.system_ids))


@router.get("/check/duplicates")
def check_duplicates(db: Session = Depends(get_db)):
    return JSONResponse(content=find_all_duplicates(db))


@router.get("/check/remarks")
def check_remarks(db: Session = Depends(get_db)):
    return JSONResponse(content=find_all_remarks(db))
