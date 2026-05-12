"""
data_control.py
The master orchestrator for main data control pipelines.
Handles the business logic loops for Backup, Fill, Replace, and Pull.
"""

import json
import logging
import asyncio
from fastapi import Request
from database import get_taipei_now
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from models import (
    Cartoon,
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

from utils.formatter import (
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
from utils.data_control_utils import log_data_control

from services.sheets import bulk_overwrite_sheet, get_all_raw_rows
from services.other_logics import (
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
    derive_related_manga,
    derive_related_tv_show,
    resolve_anime_movie_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
)
from services.calculation import (
    run_sync_anime,
    run_sync_anime_movie,
    run_sync_cartoon,
    run_sync_manga,
    run_sync_novel,
    run_sync_tv_show,
)

logger = logging.getLogger(__name__)

# ==========================================
# PIPELINE: BACKUP TO GOOGLE SHEETS
# ==========================================


def execute_backup(db: Session, action_type: str = "Manual") -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.
    """
    logger.info(f"Starting Google Sheets Backup Pipeline ({action_type})...")

    try:
        sysopts = db.query(SystemOption).all()
        sysopt_headers = [c.name for c in SystemOption.__table__.columns]
        sysopt_matrix = [sysopt_headers] + [format_model_for_sheet(o) for o in sysopts]
        bulk_overwrite_sheet("System Options", sysopt_matrix)

        seasonals = db.query(Seasonal).all()
        seasonal_headers = [c.name for c in Seasonal.__table__.columns]
        seasonal_matrix = [seasonal_headers] + [
            format_model_for_sheet(o) for o in seasonals
        ]
        bulk_overwrite_sheet("Seasonal", seasonal_matrix)

        franchises = db.query(Franchise).all()
        franchise_headers = [c.name for c in Franchise.__table__.columns]
        franchise_matrix = [franchise_headers] + [
            format_model_for_sheet(f) for f in franchises
        ]
        bulk_overwrite_sheet("Franchise", franchise_matrix)

        series_entries = db.query(Series).all()
        series_headers = [c.name for c in Series.__table__.columns]
        series_matrix = [series_headers] + [
            format_model_for_sheet(s) for s in series_entries
        ]
        bulk_overwrite_sheet("Series", series_matrix)

        animes = db.query(Anime).all()
        anime_headers = [c.name for c in Anime.__table__.columns]
        anime_matrix = [anime_headers] + [format_model_for_sheet(a) for a in animes]
        bulk_overwrite_sheet("Anime", anime_matrix)

        anime_movies = db.query(AnimeMovies).all()
        anime_movie_headers = [c.name for c in AnimeMovies.__table__.columns]
        anime_movie_matrix = [anime_movie_headers] + [
            format_model_for_sheet(m) for m in anime_movies
        ]
        bulk_overwrite_sheet("Anime Movies", anime_movie_matrix)

        movie_entries = db.query(Movies).all()
        movie_headers = [c.name for c in Movies.__table__.columns]
        movie_matrix = [movie_headers] + [
            format_model_for_sheet(m) for m in movie_entries
        ]
        bulk_overwrite_sheet("Movies", movie_matrix)

        tv_show_entries = db.query(TVShows).all()
        tv_show_headers = [c.name for c in TVShows.__table__.columns]
        tv_show_matrix = [tv_show_headers] + [
            format_model_for_sheet(t) for t in tv_show_entries
        ]
        bulk_overwrite_sheet("TV Shows", tv_show_matrix)

        cartoon_entries = db.query(Cartoon).all()
        cartoon_headers = [c.name for c in Cartoon.__table__.columns]
        cartoon_matrix = [cartoon_headers] + [
            format_model_for_sheet(c) for c in cartoon_entries
        ]
        bulk_overwrite_sheet("Cartoons", cartoon_matrix)

        manga_entries = db.query(Manga).all()
        manga_headers = [c.name for c in Manga.__table__.columns]
        manga_matrix = [manga_headers] + [
            format_model_for_sheet(m) for m in manga_entries
        ]
        bulk_overwrite_sheet("Manga", manga_matrix)

        novel_entries = db.query(Novel).all()
        novel_headers = [c.name for c in Novel.__table__.columns]
        novel_matrix = [novel_headers] + [
            format_model_for_sheet(n) for n in novel_entries
        ]
        bulk_overwrite_sheet("Novel", novel_matrix)

        logger.info("Backup Pipeline completed successfully.")
        log_data_control(db, "Backup", "Backup", action_type, "Success")
        return {"status": "success", "message": "All tabs backed up to Google Sheets"}
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        log_data_control(
            db, "Backup", "Backup", action_type, "Failed", error_message=str(e)
        )
        raise e


# ==========================================
# PIPELINE: FILL
# ==========================================


async def execute_fill_anime(
    db: Session,
    request: Request,
    action_specific: str = "Fill Anime",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Anime'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        # Extract MAL ID for all entries
        all_anime = db.query(Anime).all()
        for anime in all_anime:
            apply_extract_mal_id_anime(anime)
        db.commit()

        # Build fill queue (entries with missing values)
        queue_to_process = [
            anime
            for anime in all_anime
            if anime.mal_id is not None and has_missing_values_anime(anime)
        ]
        total_in_queue = len(queue_to_process)

        # MAL Autofill for each entry with missing values
        if total_in_queue > 0:
            for index, anime in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                anime_name = anime.display_name or "Unknown Anime"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': anime_name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_anime_from_mal(anime, force_replace_ratings=True)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"MAL Autofill failed for {anime_name}: {e}")

                await asyncio.sleep(1)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        # Anime Post Processing for all entries
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing for all entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for anime in all_anime:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                anime_post_processing(anime, db)
            except Exception as e:
                logger.warning(f"Post-processing failed for {anime.display_name}: {e}")

        db.commit()

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
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )
        logger.info(
            f"{action_specific} Pipeline completed. Processed {processed_count} entries."
        )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} process complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific} gracefully.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_anime_movie(
    db: Session,
    request: Request,
    action_specific: str = "Fill Anime Movie",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Anime Movie'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_movies = db.query(AnimeMovies).all()
        for movie in all_movies:
            apply_extract_mal_id_anime(movie)
        db.commit()

        queue_to_process = [
            m
            for m in all_movies
            if m.mal_id is not None and has_missing_values_anime_movie(m)
        ]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, movie in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = movie.display_name or "Unknown Anime Movie"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_anime_movie_from_mal(movie, force_replace_ratings=True)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"MAL Autofill failed for {name}: {e}")

                await asyncio.sleep(1)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for movie in all_movies:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                anime_movie_post_processing(movie, db)
            except Exception as e:
                logger.warning(f"Post-processing failed for {movie.display_name}: {e}")

        db.commit()

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_anime_movie(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_movie(
    db: Session,
    request: Request,
    action_specific: str = "Fill Movie",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Movie'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_movies = db.query(Movies).all()
        for movie in all_movies:
            apply_extract_imdb_id(movie)
        db.commit()

        queue_to_process = [m for m in all_movies if has_missing_values_movie(m)]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, movie in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = movie.display_name or "Unknown Movie"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_movie_from_imdb(movie, db)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"IMDb Autofill failed for {name}: {e}")

                await asyncio.sleep(0)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling.', 'processed': 0, 'total': 0})}\n\n"

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_tv_show(
    db: Session,
    request: Request,
    action_specific: str = "Fill TV Show",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill TV Show'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_shows = db.query(TVShows).all()
        for show in all_shows:
            apply_extract_imdb_id(show)
        db.commit()

        queue_to_process = [s for s in all_shows if has_missing_values_tv_show(s)]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, show in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = show.display_name or "Unknown TV Show"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_tv_show_from_imdb(show, db)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"IMDb Autofill failed for {name}: {e}")

                await asyncio.sleep(0)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for show in all_shows:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                tv_show_post_processing(show, db)
            except Exception as e:
                logger.warning(f"Post-processing failed for {show.display_name}: {e}")

        db.commit()

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_tv_show(db)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_tv_show(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_cartoon(
    db: Session,
    request: Request,
    action_specific: str = "Fill Cartoon",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Cartoon'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_cartoons = db.query(Cartoon).all()
        for cartoon in all_cartoons:
            apply_extract_imdb_id(cartoon)
        db.commit()

        queue_to_process = [
            c
            for c in all_cartoons
            if c.airing_type in {"Movie", "TV"} and has_missing_values_cartoon(c)
        ]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, cartoon in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = cartoon.display_name or "Unknown Cartoon"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_cartoon_from_imdb(cartoon, db)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"IMDb Autofill failed for {name}: {e}")

                await asyncio.sleep(0)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for cartoon in all_cartoons:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                cartoon_post_processing(cartoon, db)
            except Exception as e:
                logger.warning(
                    f"Post-processing failed for {cartoon.display_name}: {e}"
                )

        db.commit()

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_cartoon(db)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_cartoon(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_manga(
    db: Session,
    request: Request,
    action_specific: str = "Fill Manga",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Manga'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_manga = db.query(Manga).all()
        for manga in all_manga:
            apply_extract_mal_id_manga_novel(manga)
        db.commit()

        queue_to_process = [
            m for m in all_manga if m.mal_id is not None and has_missing_values_manga(m)
        ]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, manga in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = manga.display_name or "Unknown Manga"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_manga_from_mal(manga, force_replace_ratings=True)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"MAL Autofill failed for {name}: {e}")

                await asyncio.sleep(1)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for manga in all_manga:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                manga_post_processing(manga, db)
            except Exception as e:
                logger.warning(f"Post-processing failed for {manga.display_name}: {e}")

        db.commit()

        if await request.is_disconnected():
            raise asyncio.CancelledError()
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Deriving related entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        derive_related_manga(db)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_manga(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_novel(
    db: Session,
    request: Request,
    action_specific: str = "Fill Novel",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Novel'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_novels = db.query(Novel).all()
        for novel in all_novels:
            apply_extract_mal_id_manga_novel(novel)
        db.commit()

        # Gate: skip entries with no mal_link (no source to fill from)
        queue_to_process = [
            n
            for n in all_novels
            if n.mal_link is not None and has_missing_values_novel(n)
        ]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, novel in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = novel.display_name or "Unknown Novel"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_novel_from_mal(novel, force_replace_ratings=True)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"MAL Autofill failed for {name}: {e}")

                await asyncio.sleep(1)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_novel(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


async def execute_fill_all(db: Session, request: Request, action_type: str = "Manual"):
    """
    Master orchestrator for 'Fill All'.
    Suppress sub-logs and commits a single master summary.
    """
    action_specific = "Fill All"
    logger.info(f"Starting {action_specific} Pipeline...")
    total_processed = 0
    sub_errors = []

    try:
        # Fill Anime
        async for message in execute_fill_anime(
            db,
            request,
            action_specific="Fill Anime",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Anime failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Anime Movie
        async for message in execute_fill_anime_movie(
            db,
            request,
            action_specific="Fill Anime Movie",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Anime Movie failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Movie
        async for message in execute_fill_movie(
            db,
            request,
            action_specific="Fill Movie",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Movie failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill TV Show
        async for message in execute_fill_tv_show(
            db,
            request,
            action_specific="Fill TV Show",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill TV Show failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Cartoon
        async for message in execute_fill_cartoon(
            db,
            request,
            action_specific="Fill Cartoon",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Cartoon failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Manga
        async for message in execute_fill_manga(
            db,
            request,
            action_specific="Fill Manga",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Manga failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Novel
        async for message in execute_fill_novel(
            db,
            request,
            action_specific="Fill Novel",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Novel failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        if sub_errors:
            error_summary = "; ".join(sub_errors)
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Failed",
                rows_updated=total_processed,
                error_message=error_summary,
            )
            yield f"data: {json.dumps({'status': 'error', 'message': f'Fill All completed with errors: {error_summary}', 'total': 1, 'processed': total_processed})}\n\n"
            return

        # Backup
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Synchronizing to Google Sheets...', 'processed': 1, 'total': 1})}\n\n"
        execute_backup(db, action_type="Auto")

        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Success",
            rows_updated=total_processed,
        )
        yield f"data: {json.dumps({'status': 'success', 'message': 'Fill All and Backup completed.', 'total': 1, 'processed': 1})}\n\n"

    except asyncio.CancelledError:
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=total_processed,
        )
        return
    except Exception as e:
        logger.error(f"{action_specific} crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=total_processed,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"


# ==========================================
# PIPELINE: REPLACE
# ==========================================


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
        derive_related_manga(db)

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


# ==========================================
# PIPELINE: PULL FROM SHEETS
# ==========================================


def execute_pull_specific(
    db: Session, tab_name: str, action_type: str = "Manual", log_action: bool = True
) -> dict:
    """
    Pulls data from a specific Google Sheet tab and gracefully Upserts it into PostgreSQL.
    Tracks exact rows added vs updated for logging.
    """
    MODEL_MAP = {
        "Franchise": Franchise,
        "Series": Series,
        "Anime": Anime,
        "Anime Movies": AnimeMovies,
        "Cartoons": Cartoon,
        "Manga": Manga,
        "Novel": Novel,
        "Movies": Movies,
        "TV Shows": TVShows,
        "System Options": SystemOption,
        "Seasonal": Seasonal,
    }

    PARSER_MAP = {
        "Franchise": parse_franchise_from_sheet,
        "Series": parse_series_from_sheet,
        "Anime": parse_anime_from_sheet,
        "Anime Movies": parse_anime_movie_from_sheet,
        "Cartoons": parse_cartoon_from_sheet,
        "Manga": parse_manga_from_sheet,
        "Novel": parse_novel_from_sheet,
        "Movies": parse_movie_from_sheet,
        "TV Shows": parse_tv_show_from_sheet,
        "System Options": parse_system_option_from_sheet,
        "Seasonal": parse_seasonal_from_sheet,
    }

    if tab_name not in MODEL_MAP:
        return {"status": "error", "message": f"Unknown tab: {tab_name}"}

    logger.info(f"Starting Pull Pipeline for '{tab_name}'...")

    raw_matrix = get_all_raw_rows(tab_name)
    if not raw_matrix or len(raw_matrix) < 2:
        logger.info(f"No data found in '{tab_name}' to pull.")
        if log_action:
            log_data_control(db, "Pull", f"Pull {tab_name}", action_type, "Success")
        return {"status": "success", "processed": 0, "rows_added": 0, "rows_updated": 0}

    headers = raw_matrix[0]
    data_rows = raw_matrix[1:]

    Model = MODEL_MAP[tab_name]
    parser = PARSER_MAP[tab_name]

    processed = 0
    rows_added = 0
    rows_updated = 0

    for row in data_rows:
        if not row or not any(row):
            continue

        raw_header_dict = parse_row_to_dict(headers, row)
        clean_header_dict = parser(raw_header_dict)

        # Resolve String Foreign Keys -> Actual UUIDs
        # TV Show uses resolve_tv_show_parent_hierarchy (auto-creates franchise, looks up series)
        if tab_name == "TV Shows" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("tv_name_en"),
                "cn": clean_header_dict.get("tv_name_cn"),
                "alt": clean_header_dict.get("tv_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_tv_show_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Cartoon uses resolve_cartoon_parent_hierarchy (auto-creates franchise with type "Cartoon", looks up series)
        elif tab_name == "Cartoons" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("cartoon_name_en"),
                "cn": clean_header_dict.get("cartoon_name_cn"),
                "alt": clean_header_dict.get("cartoon_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_cartoon_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Manga uses resolve_manga_parent_hierarchy (auto-creates franchise with type "ACG", looks up series)
        elif tab_name == "Manga" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("manga_name_en"),
                "cn": clean_header_dict.get("manga_name_cn"),
                "roman": clean_header_dict.get("manga_name_roman"),
                "jp": clean_header_dict.get("manga_name_jp"),
                "alt": clean_header_dict.get("manga_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_manga_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Novel uses resolve_novel_parent_hierarchy (auto-creates franchise with type "Novel", looks up series)
        elif tab_name == "Novel" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("novel_name_en"),
                "cn": clean_header_dict.get("novel_name_cn"),
                "roman": clean_header_dict.get("novel_name_roman"),
                "jp": clean_header_dict.get("novel_name_jp"),
                "alt": clean_header_dict.get("novel_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_novel_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Movie uses resolve_movie_parent_hierarchy (auto-creates franchise, looks up series)
        elif tab_name == "Movies" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("movie_name_en"),
                "cn": clean_header_dict.get("movie_name_cn"),
                "alt": clean_header_dict.get("movie_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_movie_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Anime Movie uses resolve_anime_movie_parent_hierarchy (auto-creates franchise if missing)
        elif tab_name == "Anime Movie" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            if fid is None or isinstance(fid, str):
                name_fields = {
                    "en": clean_header_dict.get("anime_movie_name_en"),
                    "cn": clean_header_dict.get("anime_movie_name_cn"),
                    "roman": clean_header_dict.get("anime_movie_name_roman"),
                    "jp": clean_header_dict.get("anime_movie_name_jp"),
                    "alt": clean_header_dict.get("anime_movie_name_alt"),
                }
                clean_header_dict["franchise_id"] = (
                    resolve_anime_movie_parent_hierarchy(db, fid, name_fields)
                )
        elif "franchise_id" in clean_header_dict and isinstance(
            clean_header_dict["franchise_id"], str
        ):
            fname = clean_header_dict["franchise_id"]
            if fname.strip():
                fran = (
                    db.query(Franchise)
                    .filter(
                        or_(
                            Franchise.franchise_name_en == fname,
                            Franchise.franchise_name_cn == fname,
                            Franchise.franchise_name_jp == fname,
                            Franchise.franchise_name_alt == fname,
                        )
                    )
                    .first()
                )
                if fran:
                    clean_header_dict["franchise_id"] = fran.system_id
                else:
                    logger.warning(
                        f"Could not resolve franchise FK for: {fname}. Skipping row."
                    )
                    continue

        if "series_id" in clean_header_dict and isinstance(
            clean_header_dict["series_id"], str
        ):
            sname = clean_header_dict["series_id"]
            if sname.strip():
                series = (
                    db.query(Series)
                    .filter(
                        or_(
                            Series.series_name_en == sname,
                            Series.series_name_cn == sname,
                            Series.series_name_alt == sname,
                        )
                    )
                    .first()
                )
                if series:
                    clean_header_dict["series_id"] = series.system_id
                else:
                    logger.warning(
                        f"Could not resolve series FK for: {sname}. Skipping row."
                    )
                    continue

        # System Options uses 'id', Seasonal uses 'seasonal', others use 'system_id'
        if tab_name == "System Options":
            pk_field = "id"
        elif tab_name == "Seasonal":
            pk_field = "seasonal"
        else:
            pk_field = "system_id"
        pk_value = clean_header_dict.get(pk_field)

        # Smart Primary Key Logic (Upsert vs Insert)
        if not pk_value or (isinstance(pk_value, str) and not pk_value.strip()):
            existing_record = None
            if tab_name == "Franchise":
                name = clean_header_dict.get(
                    "franchise_name_en"
                ) or clean_header_dict.get("franchise_name_cn")
                if name:
                    existing_record = (
                        db.query(Franchise)
                        .filter(
                            or_(
                                Franchise.franchise_name_en == name,
                                Franchise.franchise_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Series":
                name = clean_header_dict.get("series_name_en") or clean_header_dict.get(
                    "series_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Series)
                        .filter(
                            or_(
                                Series.series_name_en == name,
                                Series.series_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime":
                name = clean_header_dict.get("anime_name_en") or clean_header_dict.get(
                    "anime_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Anime)
                        .filter(
                            or_(
                                Anime.anime_name_en == name, Anime.anime_name_cn == name
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime Movie":
                name = clean_header_dict.get(
                    "anime_movie_name_en"
                ) or clean_header_dict.get("anime_movie_name_cn")
                if name:
                    existing_record = (
                        db.query(AnimeMovies)
                        .filter(
                            or_(
                                AnimeMovies.anime_movie_name_en == name,
                                AnimeMovies.anime_movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Movies":
                name = clean_header_dict.get("movie_name_en") or clean_header_dict.get(
                    "movie_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Movies)
                        .filter(
                            or_(
                                Movies.movie_name_en == name,
                                Movies.movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "TV Shows":
                name = clean_header_dict.get("tv_name_en") or clean_header_dict.get(
                    "tv_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(TVShows)
                        .filter(
                            or_(
                                TVShows.tv_name_en == name,
                                TVShows.tv_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Cartoons":
                name = clean_header_dict.get(
                    "cartoon_name_en"
                ) or clean_header_dict.get("cartoon_name_cn")
                if name:
                    existing_record = (
                        db.query(Cartoon)
                        .filter(
                            or_(
                                Cartoon.cartoon_name_en == name,
                                Cartoon.cartoon_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Manga":
                name = clean_header_dict.get("manga_name_en") or clean_header_dict.get(
                    "manga_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Manga)
                        .filter(
                            or_(
                                Manga.manga_name_en == name,
                                Manga.manga_name_cn == name,
                            )
                        )
                        .first()
                    )

            if existing_record:
                pk_value = getattr(existing_record, pk_field)
                clean_header_dict[pk_field] = pk_value
            else:
                clean_header_dict.pop(pk_field, None)
                pk_value = None

        # Data Sanitization (Prevent Pydantic Schema 500 Validation Errors)
        if tab_name == "Anime":
            if clean_header_dict.get("watching_status") is None:
                clean_header_dict["watching_status"] = "Haven't Started"
            if clean_header_dict.get("airing_status") is None:
                clean_header_dict["airing_status"] = ""
            if clean_header_dict.get("airing_type") is None:
                clean_header_dict["airing_type"] = ""
        elif tab_name in ("Movies", "Anime Movies", "TV Shows", "Cartoons"):
            if clean_header_dict.get("watching_status") is None:
                clean_header_dict["watching_status"] = "Might Watch"
            if clean_header_dict.get("created_at") is None:
                clean_header_dict["created_at"] = get_taipei_now()
            if clean_header_dict.get("updated_at") is None:
                clean_header_dict["updated_at"] = get_taipei_now()
        elif tab_name == "Manga":
            if clean_header_dict.get("reading_status") is None:
                clean_header_dict["reading_status"] = "Might Read"
            if clean_header_dict.get("created_at") is None:
                clean_header_dict["created_at"] = get_taipei_now()
            if clean_header_dict.get("updated_at") is None:
                clean_header_dict["updated_at"] = get_taipei_now()

        # UPSERT LOGIC
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )

            if existing:
                # Update existing record
                for key, value in clean_header_dict.items():
                    setattr(existing, key, value)
                rows_updated += 1
            else:
                # Create new record (UUID provided but record missing locally)
                new_record = Model(**clean_header_dict)
                db.add(new_record)
                rows_added += 1
        else:
            # Create new record (UUID missing, let DB generate it)
            new_record = Model(**clean_header_dict)
            db.add(new_record)
            rows_added += 1

        processed += 1

        # Flush periodically so DB generates new UUIDs immediately for Foreign Key references
        if processed % 50 == 0:
            db.flush()

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing batch for {tab_name}: {e}")
        if log_action:
            log_data_control(
                db,
                "Pull",
                f"Pull {tab_name}",
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e)}

    if tab_name == "System Options":
        db.execute(
            text(
                "SELECT setval('system_options_id_seq', COALESCE((SELECT MAX(id) FROM system_options), 0))"
            )
        )
        db.commit()

    logger.info(
        f"Successfully pulled and upserted {processed} records from '{tab_name}'."
    )
    if log_action:
        log_data_control(
            db,
            "Pull",
            f"Pull {tab_name}",
            action_type,
            "Success",
            rows_added=rows_added,
            rows_updated=rows_updated,
        )

    return {
        "status": "success",
        "processed": processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
    }


def execute_pull_all(db: Session, action_type: str = "Manual") -> dict:
    """
    Pulls ALL tabs from Google Sheets into the database.
    WARNING: The execution order is STRICT to satisfy Foreign Key constraints.
    """
    logger.info("Starting Full Pull Pipeline (All Tabs)...")

    tabs_in_order = [
        "System Options",
        "Franchise",
        "Series",
        "Anime",
        "Anime Movies",
        "Movies",
        "TV Shows",
        "Cartoons",
        "Manga",
        "Novel",
        "Seasonal",
    ]

    results = {}
    total_added = 0
    total_updated = 0

    try:
        for tab in tabs_in_order:
            res = execute_pull_specific(db, tab, action_type="Manual", log_action=True)

            if res.get("status") == "error":
                raise Exception(f"Pull failed on tab {tab}: {res.get('message')}")

            total_added += res.get("rows_added", 0)
            total_updated += res.get("rows_updated", 0)
            results[tab] = res.get("processed", 0)

        logger.info("Full Pull Pipeline completed successfully.")
        log_data_control(
            db,
            "Pull",
            "Pull All",
            action_type,
            "Success",
            rows_added=total_added,
            rows_updated=total_updated,
            details_json=json.dumps(results),
        )
        return {"status": "success", "details": results}

    except Exception as e:
        logger.error(f"Full Pull Pipeline crashed: {e}")
        log_data_control(
            db, "Pull", "Pull All", action_type, "Failed", error_message=str(e)
        )
        raise e
