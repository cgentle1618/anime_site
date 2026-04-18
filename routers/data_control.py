import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from dependencies import get_db, get_current_admin


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
from services.other_logics import find_all_duplicates
from services.calculation import (
    bulk_validate_episode_math,
    bulk_mark_tv_completed,
    bulk_extract_season_from_title,
    bulk_calculate_season_from_month,
    bulk_autofill_ep_previous,
    run_auto_create_seasonal,
    run_extract_system_options,
)

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
                db,
                request,
                action_specific="Replace Anime",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace anime: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/anime/{anime_id}")
async def trigger_replace_single_anime(anime_id: str, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline for a single anime entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_anime(
            db, anime_id, action_type="Manual", log_action=True
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single anime: {e}")
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


@router.post("/calculate/validate-episode")
def trigger_validate_episode(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_validate_episode_math(db))
    except Exception as e:
        logger.error(f"Error in validate episode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/mark-tv-completed")
def trigger_mark_tv_completed(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_mark_tv_completed(db))
    except Exception as e:
        logger.error(f"Error in mark TV completed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/extract-season-from-title")
def trigger_extract_season_from_title(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_extract_season_from_title(db))
    except Exception as e:
        logger.error(f"Error in extract season from title: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/season-from-month")
def trigger_season_from_month(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_calculate_season_from_month(db))
    except Exception as e:
        logger.error(f"Error in season from month: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/create-seasonal")
def trigger_create_seasonal(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=run_auto_create_seasonal(db))
    except Exception as e:
        logger.error(f"Error in create seasonal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/autofill-ep-previous")
def trigger_autofill_ep_previous(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_autofill_ep_previous(db))
    except Exception as e:
        logger.error(f"Error in autofill ep previous: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/extract-system-options")
def trigger_extract_system_options(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=run_extract_system_options(db))
    except Exception as e:
        logger.error(f"Error in extract system options: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check/duplicates")
def check_duplicates(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=find_all_duplicates(db))
    except Exception as e:
        logger.error(f"Error in check duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))
