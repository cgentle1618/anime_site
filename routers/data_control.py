import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from services.data_control import (
    execute_backup,
    execute_pull_all,
    execute_pull_specific,
    execute_fill_anime,
    execute_fill_all,
    execute_replace_anime,
    execute_replace_all,
    execute_replace_single_anime,
)
from dependencies import get_db, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/data-control",
    tags=["Data Control Pipelines"],
    dependencies=[Depends(get_current_admin)],
)


@router.post("/fill/anime")
async def trigger_fill_anime(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for Anime entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_anime(
                db,
                request,
                action_specific="Fill Anime",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/anime/{anime_id}")
async def trigger_replace_single_anime(anime_id: str, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline for a single anime entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_anime(db, anime_id, action_type="Manual")
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/all")
async def trigger_fill_all(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the master Fill Pipeline for ALL data types and automatically triggers a backup.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_all(db, request, action_type="Manual"),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/anime")
async def trigger_replace_anime(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for Anime entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_anime(
                db, request, action_specific="Replace Anime", action_type="Manual"
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/all")
async def trigger_replace_all(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the master Replace Pipeline for ALL data types and automatically triggers a backup.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_all(db, request, action_type="Manual"),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup")
def trigger_backup_all(db: Session = Depends(get_db)):
    """
    Triggers full database backup to Google Sheets.
    Runs synchronously to ensure the frontend receives accurate success/failure feedback.
    """
    try:
        result = execute_backup(db, action_type="Manual")
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error in backup all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pull")
def trigger_pull_all(db: Session = Depends(get_db)):
    """Triggers full pull from Google Sheets to overwrite the database."""
    try:
        result = execute_pull_all(db, action_type="Manual")
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error in pull all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pull/{tab_name}")
def trigger_pull_specific(tab_name: str, db: Session = Depends(get_db)):
    """Triggers a pull from a specific Google Sheets tab."""
    try:
        result = execute_pull_specific(
            db, tab_name, action_type="Manual", log_action=True
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error in pull {tab_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
