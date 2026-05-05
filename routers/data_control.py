import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from dependencies import get_db, get_current_admin
from models import Anime


from services.data_control import (
    execute_backup,
    execute_pull_all,
    execute_pull_specific,
    execute_fill_anime,
    execute_fill_anime_movie,
    execute_fill_cartoon,
    execute_fill_manga,
    execute_fill_movie,
    execute_fill_tv_show,
    execute_fill_all,
    execute_replace_anime,
    execute_replace_anime_movie,
    execute_replace_cartoon,
    execute_replace_manga,
    execute_replace_movie,
    execute_replace_tv_show,
    execute_replace_all,
    execute_replace_single_anime,
    execute_replace_single_anime_movie,
    execute_replace_single_cartoon,
    execute_replace_single_manga,
    execute_replace_single_movie,
    execute_replace_single_tv_show,
)
from services.other_logics import find_all_duplicates
from services.calculation import (
    bulk_check_cover_image,
    bulk_delete_orphaned_cover_images,
    bulk_download_missing_covers,
    bulk_set_cover_image_fields,
    run_calculate_all,
)

logger = logging.getLogger(__name__)


class DownloadCoversBody(BaseModel):
    system_ids: Optional[list[str]] = None


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


@router.post("/fill/anime-movie")
async def trigger_fill_anime_movie(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for Anime Movie entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_anime_movie(
                db,
                request,
                action_specific="Fill Anime Movie",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill anime movie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/movie")
async def trigger_fill_movie(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for Movie entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_movie(
                db,
                request,
                action_specific="Fill Movie",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill movie: {e}")
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
            db, anime_id, action_type="Manual", log_action=False
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


@router.post("/replace/anime-movie")
async def trigger_replace_anime_movie(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for Anime Movie entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_anime_movie(
                db,
                request,
                action_specific="Replace Anime Movie",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace anime movie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/anime-movie/{anime_movie_id}")
async def trigger_replace_single_anime_movie(
    anime_movie_id: str, db: Session = Depends(get_db)
):
    """
    Triggers the Replace Pipeline for a single anime movie entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_anime_movie(
            db, anime_movie_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single anime movie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/movie")
async def trigger_replace_movie(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for Movie entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_movie(
                db,
                request,
                action_specific="Replace Movie",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace movie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/movie/{movie_id}")
async def trigger_replace_single_movie(movie_id: str, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline for a single movie entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_movie(
            db, movie_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single movie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/tv-show")
async def trigger_fill_tv_show(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for TV Show entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_tv_show(
                db,
                request,
                action_specific="Fill TV Show",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill tv show: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/tv-show")
async def trigger_replace_tv_show(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for TV Show entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_tv_show(
                db,
                request,
                action_specific="Replace TV Show",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace tv show: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/tv-show/{tv_show_id}")
async def trigger_replace_single_tv_show(
    tv_show_id: str, db: Session = Depends(get_db)
):
    """
    Triggers the Replace Pipeline for a single TV show entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_tv_show(
            db, tv_show_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single tv show: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/cartoon")
async def trigger_fill_cartoon(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for Cartoon entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_cartoon(
                db,
                request,
                action_specific="Fill Cartoon",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill cartoon: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/cartoon")
async def trigger_replace_cartoon(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for Cartoon entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_cartoon(
                db,
                request,
                action_specific="Replace Cartoon",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace cartoon: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/cartoon/{cartoon_id}")
async def trigger_replace_single_cartoon(
    cartoon_id: str, db: Session = Depends(get_db)
):
    """
    Triggers the Replace Pipeline for a single cartoon entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_cartoon(
            db, cartoon_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single cartoon: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill/manga")
async def trigger_fill_manga(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Fill Pipeline specifically for Manga entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_fill_manga(
                db,
                request,
                action_specific="Fill Manga",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill manga: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/manga")
async def trigger_replace_manga(request: Request, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline specifically for Manga entries.
    Streams progress back to the client using Server-Sent Events (SSE).
    """
    try:
        return StreamingResponse(
            execute_replace_manga(
                db,
                request,
                action_specific="Replace Manga",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in replace manga: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/manga/{manga_id}")
async def trigger_replace_single_manga(manga_id: str, db: Session = Depends(get_db)):
    """
    Triggers the Replace Pipeline for a single manga entry (Autofill & Update).
    Returns standard JSON response.
    """
    try:
        result = await execute_replace_single_manga(
            db, manga_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            status_code = result.get("status_code", 400)
            raise HTTPException(status_code=status_code, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single manga: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pull/manga")
def trigger_pull_manga(db: Session = Depends(get_db)):
    """Triggers a pull from the Manga Google Sheets tab."""
    try:
        result = execute_pull_specific(
            db, "Manga", action_type="Manual", log_action=True
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pull manga: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pull/cartoon")
def trigger_pull_cartoon(db: Session = Depends(get_db)):
    """Triggers a pull from the Cartoon Google Sheets tab."""
    try:
        result = execute_pull_specific(
            db, "Cartoon", action_type="Manual", log_action=True
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pull cartoon: {e}")
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


@router.post("/calculate/all")
def trigger_calculate_all(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=run_calculate_all(db))
    except Exception as e:
        logger.error(f"Error in calculate all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calculate/check-cover-image")
def trigger_check_cover_image(
    db: Session = Depends(get_db),
    entry_type: Optional[str] = Query(None),
):
    try:
        return JSONResponse(content=bulk_check_cover_image(db, entry_type=entry_type))
    except Exception as e:
        logger.error(f"Error in check cover image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/calculate/delete-orphaned-covers")
def trigger_delete_orphaned_covers(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_delete_orphaned_cover_images(db))
    except Exception as e:
        logger.error(f"Error in delete orphaned covers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/set-cover-image-fields")
def trigger_set_cover_image_fields(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=bulk_set_cover_image_fields(db))
    except Exception as e:
        logger.error(f"Error in set cover image fields: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/download-missing-covers")
def trigger_download_missing_covers(
    body: DownloadCoversBody = DownloadCoversBody(),
    db: Session = Depends(get_db),
):
    try:
        return JSONResponse(
            content=bulk_download_missing_covers(db, system_ids=body.system_ids)
        )
    except Exception as e:
        logger.error(f"Error in download missing covers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check/duplicates")
def check_duplicates(db: Session = Depends(get_db)):
    try:
        return JSONResponse(content=find_all_duplicates(db))
    except Exception as e:
        logger.error(f"Error in check duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check/remarks")
def check_remarks(db: Session = Depends(get_db)):
    try:
        entries = (
            db.query(Anime)
            .filter(Anime.remark.isnot(None), Anime.remark != "")
            .order_by(Anime.updated_at.desc())
            .all()
        )
        return JSONResponse(
            content=[
                {
                    "system_id": str(e.system_id),
                    "anime_name_cn": e.anime_name_cn,
                    "anime_name_en": e.anime_name_en,
                    "airing_type": e.airing_type,
                    "watching_status": e.watching_status,
                    "remark": e.remark,
                }
                for e in entries
            ]
        )
    except Exception as e:
        logger.error(f"Error in check remarks: {e}")
        raise HTTPException(status_code=500, detail=str(e))
