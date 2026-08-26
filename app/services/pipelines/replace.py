"""Replace pipeline: overwrite metadata for single entries and in bulk."""

import json
import logging
import asyncio
from fastapi import Request
from app.database import get_taipei_now
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from app.models import (
    Cartoon,
    Comic,
    Franchise,
    Manga,
    Novel,
    Series,
    Anime,
    AnimeMovies,
    Movies,
    TVShows,
    SystemOption,
    Seasonal,
)

from app.utils.formatter import (
    format_model_for_sheet,
    parse_row_to_dict,
    parse_franchise_from_sheet,
    parse_series_from_sheet,
    parse_anime_from_sheet,
    parse_anime_movie_from_sheet,
    parse_cartoon_from_sheet,
    parse_manga_from_sheet,
    parse_novel_from_sheet,
    parse_movie_from_sheet,
    parse_tv_show_from_sheet,
    parse_system_option_from_sheet,
    parse_seasonal_from_sheet,
)
from app.utils.data_control_utils import log_data_control

from app.services.integrations.sheets import bulk_overwrite_sheet, get_all_raw_rows
from app.services.domain import (
    has_missing_values_anime,
    has_missing_values_anime_movie,
    has_missing_values_cartoon,
    has_missing_values_manga,
    has_missing_values_novel,
    has_missing_values_movie,
    has_missing_values_tv_show,
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_manga_from_mal,
    autofill_novel_from_mal,
    autofill_movie_from_imdb,
    autofill_tv_show_from_imdb,
    apply_single_replace_anime,
    apply_single_replace_anime_movie,
    apply_single_replace_cartoon,
    apply_single_replace_manga,
    apply_single_replace_novel,
    apply_single_replace_movie,
    apply_single_replace_tv_show,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_imdb_id,
    anime_post_processing,
    anime_movie_post_processing,
    cartoon_post_processing,
    manga_post_processing,
    tv_show_post_processing,
    derive_related_anime,
    derive_related_cartoon,
    derive_related_tv_show,
    resolve_anime_movie_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
)
from app.services.calculation import (
    run_sync_anime,
    run_sync_anime_movie,
    run_sync_cartoon,
    run_sync_manga,
    run_sync_novel,
    run_sync_tv_show,
)
from app.services.pipelines.backup import execute_backup

logger = logging.getLogger(__name__)


async def execute_replace_single_anime(
    db: Session, anime_id: str, action_type: str = "Manual", log_action: bool = True
) -> dict:
    """Fetches Jikan data for a single entry, runs post-processing, derives related, and syncs."""
    logger.info(f"Starting Single Replace Pipeline for anime ID: {anime_id}")
    action_specific = "Replace for single anime entry"

    try:
        # apply_single_replace_anime for every anime entries with bulk=False
        anime = db.query(Anime).filter(Anime.system_id == anime_id).first()
        if not anime:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Anime not found 404",
                )
            return {
                "status": "error",
                "message": "Anime entry not found",
                "status_code": 404,
            }

        apply_single_replace_anime(db, anime, bulk=False)
        db.commit()

        # Sync
        run_sync_anime(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated details for {anime.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_anime_movie(
    db: Session,
    anime_movie_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches Jikan data for a single AnimeMovies entry, runs post-processing, and syncs."""
    logger.info(
        f"Starting Single Replace Pipeline for anime movie ID: {anime_movie_id}"
    )
    action_specific = "Replace for single anime movie entry"

    try:
        movie = (
            db.query(AnimeMovies)
            .filter(AnimeMovies.system_id == anime_movie_id)
            .first()
        )
        if not movie:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Anime Movie not found 404",
                )
            return {
                "status": "error",
                "message": "Anime Movie entry not found",
                "status_code": 404,
            }

        apply_single_replace_anime_movie(db, movie)
        db.commit()

        run_sync_anime_movie(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {movie.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Anime Movie Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_movie(
    db: Session,
    movie_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches IMDb data for a single Movies entry, runs autofill, and syncs."""
    logger.info(f"Starting Single Replace Pipeline for movie ID: {movie_id}")
    action_specific = "Replace for single movie entry"

    try:
        movie = db.query(Movies).filter(Movies.system_id == movie_id).first()
        if not movie:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Movie not found 404",
                )
            return {
                "status": "error",
                "message": "Movie entry not found",
                "status_code": 404,
            }

        apply_single_replace_movie(db, movie, bulk=False)
        db.commit()

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {movie.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Movie Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_tv_show(
    db: Session,
    tv_show_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches IMDb/TMDB data for a single TVShows entry, runs autofill and post-processing."""
    logger.info(f"Starting Single Replace Pipeline for TV show ID: {tv_show_id}")
    action_specific = "Replace for single TV show entry"

    try:
        tv_show = db.query(TVShows).filter(TVShows.system_id == tv_show_id).first()
        if not tv_show:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="TV Show not found 404",
                )
            return {
                "status": "error",
                "message": "TV show entry not found",
                "status_code": 404,
            }

        apply_single_replace_tv_show(db, tv_show, bulk=False)
        db.commit()

        run_sync_tv_show(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {tv_show.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace TV Show Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_cartoon(
    db: Session,
    cartoon_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches IMDb/TMDB data for a single Cartoon entry, runs autofill and post-processing."""
    logger.info(f"Starting Single Replace Pipeline for Cartoon ID: {cartoon_id}")
    action_specific = "Replace for single Cartoon entry"

    try:
        cartoon = db.query(Cartoon).filter(Cartoon.system_id == cartoon_id).first()
        if not cartoon:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Cartoon not found 404",
                )
            return {
                "status": "error",
                "message": "Cartoon entry not found",
                "status_code": 404,
            }

        apply_single_replace_cartoon(db, cartoon, bulk=False)
        db.commit()

        run_sync_cartoon(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {cartoon.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Cartoon Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_manga(
    db: Session,
    manga_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches Jikan data for a single Manga entry, runs post-processing, derives related, and syncs."""
    logger.info(f"Starting Single Replace Pipeline for Manga ID: {manga_id}")
    action_specific = "Replace for single manga entry"

    try:
        manga = db.query(Manga).filter(Manga.system_id == manga_id).first()
        if not manga:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Manga not found 404",
                )
            return {
                "status": "error",
                "message": "Manga entry not found",
                "status_code": 404,
            }

        apply_single_replace_manga(db, manga, bulk=False)
        db.commit()

        run_sync_manga(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {manga.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Manga Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_novel(
    db: Session,
    novel_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches Jikan data for a single Novel entry and syncs."""
    logger.info(f"Starting Single Replace Pipeline for Novel ID: {novel_id}")
    action_specific = "Replace for single novel entry"

    try:
        novel = db.query(Novel).filter(Novel.system_id == novel_id).first()
        if not novel:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Novel not found 404",
                )
            return {
                "status": "error",
                "message": "Novel entry not found",
                "status_code": 404,
            }

        apply_single_replace_novel(db, novel, bulk=False)
        db.commit()

        run_sync_novel(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {novel.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Novel Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_single_comic(
    db: Session,
    comic_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """
    Write hook for a single Comic entry.

    Unlike the other single-replace hooks this fetches nothing: comics are
    manual-entry, so there is no external record to reconcile against. It
    exists so the registry has a uniform write_hook, and so the write is
    logged like every other type's.
    """
    logger.info(f"Starting Single Replace Pipeline for Comic ID: {comic_id}")
    action_specific = "Replace for single comic entry"

    try:
        comic = db.query(Comic).filter(Comic.system_id == comic_id).first()
        if not comic:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Comic not found 404",
                )
            return {
                "status": "error",
                "message": "Comic entry not found",
                "status_code": 404,
            }

        db.commit()

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {comic.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Comic Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}


async def execute_replace_anime(
    db: Session,
    request: Request,
    action_specific: str = "Replace Anime",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all anime entries, then derive related and sync."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    # Replace for single anime entry
    try:
        all_anime = (
            db.query(Anime)
            .filter(or_(Anime.mal_id.isnot(None), Anime.mal_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_anime)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No anime entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, anime in enumerate(all_anime, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            anime_name = anime.display_name or "Unknown Anime"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': anime_name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_anime(db, anime, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {anime_name}: {e}")

            await asyncio.sleep(1)

        # Derive Related
        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_anime(db)

        # Sync
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing seasonal data...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_anime(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )
        logger.info(
            f"{action_specific} completed. Processed {processed_count} entries."
        )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific} gracefully.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_anime_movie(
    db: Session,
    request: Request,
    action_specific: str = "Replace Anime Movie",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all anime movie entries, then sync."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_movies = (
            db.query(AnimeMovies)
            .filter(
                or_(AnimeMovies.mal_id.isnot(None), AnimeMovies.mal_link.isnot(None))
            )
            .all()
        )
        total_in_queue = len(all_movies)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No anime movie entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, movie in enumerate(all_movies, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = movie.display_name or "Unknown Anime Movie"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_anime_movie(db, movie)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(1)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_anime_movie(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_movie(
    db: Session,
    request: Request,
    action_specific: str = "Replace Movie",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all movie entries with IMDb data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_movies = (
            db.query(Movies)
            .filter(or_(Movies.imdb_id.isnot(None), Movies.imdb_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_movies)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No movie entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, movie in enumerate(all_movies, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = movie.display_name or "Unknown Movie"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_movie(db, movie, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(0)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_tv_show(
    db: Session,
    request: Request,
    action_specific: str = "Replace TV Show",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all TV show entries with IMDb/TMDB data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_shows = (
            db.query(TVShows)
            .filter(or_(TVShows.imdb_id.isnot(None), TVShows.imdb_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_shows)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No TV show entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, show in enumerate(all_shows, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = show.display_name or "Unknown TV Show"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_tv_show(db, show, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(0)

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_tv_show(db)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_tv_show(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_cartoon(
    db: Session,
    request: Request,
    action_specific: str = "Replace Cartoon",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all cartoon entries with IMDb/TMDB data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_cartoons = (
            db.query(Cartoon)
            .filter(
                Cartoon.airing_type.in_(["Movie", "TV"]),
                or_(Cartoon.imdb_id.isnot(None), Cartoon.imdb_link.isnot(None)),
            )
            .all()
        )
        total_in_queue = len(all_cartoons)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No cartoon entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, cartoon in enumerate(all_cartoons, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = cartoon.display_name or "Unknown Cartoon"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_cartoon(db, cartoon, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(0)

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_cartoon(db)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_cartoon(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_manga(
    db: Session,
    request: Request,
    action_specific: str = "Replace Manga",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all manga entries with Jikan data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_manga = (
            db.query(Manga)
            .filter(or_(Manga.mal_id.isnot(None), Manga.mal_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_manga)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No manga entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, manga in enumerate(all_manga, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = manga.display_name or "Unknown Manga"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_manga(db, manga, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(1)

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_manga(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_novel(
    db: Session,
    request: Request,
    action_specific: str = "Replace Novel",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all novel entries with Jikan data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_novels = (
            db.query(Novel)
            .filter(or_(Novel.mal_id.isnot(None), Novel.mal_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_novels)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No novel entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, novel in enumerate(all_novels, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = novel.display_name or "Unknown Novel"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_novel(db, novel, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(1)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_novel(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_replace_all(
    db: Session,
    request: Request,
    action_type: str = "Manual",
):
    """
    Master Async Generator (SSE) for 'Replace All'.
    Orchestrates Replace Anime, placeholder for future types, and performs Backup.
    Parses yielded SSE messages to calculate a grand total, then logs exactly ONCE.
    """
    action_specific = "Replace All"
    logger.info(f"Starting {action_specific} Pipeline...")
    total_processed_across_all = 0
    sub_errors = []

    try:
        # 1. Replace Anime (Pass log_action=False to suppress individual logs)
        async for message in execute_replace_anime(
            db,
            request,
            action_specific="Replace Anime",
            action_type=action_type,
            log_action=False,
        ):
            # Intercept the success message to grab the processed count
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Anime failed"))

            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Anime Movie
        async for message in execute_replace_anime_movie(
            db,
            request,
            action_specific="Replace Anime Movie",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Anime Movie failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Movie
        async for message in execute_replace_movie(
            db,
            request,
            action_specific="Replace Movie",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Movie failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace TV Show
        async for message in execute_replace_tv_show(
            db,
            request,
            action_specific="Replace TV Show",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace TV Show failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Cartoon
        async for message in execute_replace_cartoon(
            db,
            request,
            action_specific="Replace Cartoon",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Cartoon failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Manga
        async for message in execute_replace_manga(
            db,
            request,
            action_specific="Replace Manga",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Manga failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Novel
        async for message in execute_replace_novel(
            db,
            request,
            action_specific="Replace Novel",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Novel failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        if sub_errors:
            error_summary = "; ".join(sub_errors)
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=total_processed_across_all,
                error_message=error_summary,
            )
            yield f"data: {json.dumps({'status': 'error', 'message': f'Replace All completed with errors: {error_summary}', 'total': 1, 'processed': total_processed_across_all})}\n\n"
            return

        # Backup
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Synchronizing to Google Sheets (Backup)...', 'processed': 1, 'total': 1})}\n\n"

        execute_backup(db, action_type="Auto")

        # Final Master Log
        log_data_control(
            db,
            "Replace",
            action_specific,
            action_type,
            "Success",
            rows_updated=total_processed_across_all,
        )

        # Final Pipeline Success Message
        yield f"data: {json.dumps({'status': 'success', 'message': 'Replace All pipeline and Backup completed successfully.', 'total': 1, 'processed': 1})}\n\n"

    except asyncio.CancelledError:
        logger.info(f"Client disconnected. Aborting {action_specific} gracefully.")
        log_data_control(
            db,
            "Replace",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=total_processed_across_all,
        )
        return

    except Exception as e:
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Replace",
            action_specific,
            action_type,
            "Failed",
            rows_updated=total_processed_across_all,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
