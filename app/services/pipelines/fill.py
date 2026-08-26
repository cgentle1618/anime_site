"""Fill pipeline: populate missing metadata from external sources."""

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
    run_sync_comic,
    run_sync_tv_show,
)
from app.services.pipelines.backup import execute_backup

logger = logging.getLogger(__name__)


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


async def execute_fill_comic(
    db: Session,
    request: Request,
    action_specific: str = "Fill Comic",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """
    Async Generator (SSE) for 'Fill Comic'.

    Comics are manual-entry, so there is nothing to fetch. This extracts system
    options and returns — it exists so the admin Fill controls behave uniformly
    across types.
    """
    logger.info(f"Starting {action_specific} Pipeline...")

    try:
        total = db.query(Comic).count()

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': 0, 'total': total})}\n\n"
        run_sync_comic(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=total,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total, 'processed': total})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.warning(f"{action_specific} cancelled by client.")
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Failed",
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
