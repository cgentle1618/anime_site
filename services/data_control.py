"""
data_control.py
The master orchestrator for Version 2 data pipelines.
Strictly handles the business logic loops for Calculation, Fill, Replace, Backup,
and Pulls by delegating tasks to isolated domain utilities and API clients.
"""

import time
import json
import logging
import asyncio
from fastapi import Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from models import Franchise, Series, Anime, SystemOption, DataControlLog

from utils.utils import (
    extract_mal_id,
    extract_season_from_title,
    calculate_seasonal_from_month,
)
from utils.data_control_utils import (
    format_model_for_sheet,
    parse_row_to_dict,
    parse_franchise_from_sheet,
    parse_series_from_sheet,
    parse_anime_from_sheet,
    parse_system_option_from_sheet,
    log_data_control,
)

from services.sheets import bulk_overwrite_sheet, get_all_raw_rows
from services.other_logics import (
    has_missing_values,
    check_is_tv_completed,
    auto_create_seasonal,
    autofill_anime_from_mal,
    mark_tv_completed,
    apply_single_replace_anime,
    derive_ep_previous,
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
    """
    Async Generator function (SSE) for 'Fill Anime'.
    Uses asyncio.CancelledError to perfectly track graceful frontend aborts.
    """
    logger.info(f"Starting {action_specific} Pipeline...")

    # Initialize counters outside the try block so they are accessible in the except blocks
    processed_count = 0
    total_in_queue = 0

    try:
        # Extract MAL ID for all entries
        all_anime = db.query(Anime).all()
        extracted_id_count = 0

        for anime in all_anime:
            if not anime.mal_id and anime.mal_link:
                extracted = extract_mal_id(anime.mal_link)
                if extracted:
                    anime.mal_id = extracted
                    extracted_id_count += 1

        if extracted_id_count > 0:
            db.commit()

        # Check Missing Values
        queue_to_process = [
            anime
            for anime in all_anime
            if anime.mal_id is not None and has_missing_values(anime)
        ]

        total_in_queue = len(queue_to_process)

        # Initialize Set to track unique Franchise/Series groups for cascade recalculation
        groups_to_recalculate = set()

        # For each entry with missing values
        if total_in_queue > 0:
            for index, anime in enumerate(queue_to_process, start=1):
                # Trigger the Abort explicitly if disconnected
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                anime_name = (
                    anime.anime_name_cn
                    or anime.anime_name_en
                    or anime.anime_name_alt
                    or anime.anime_name_romanji
                    or anime.anime_name_jp
                    or "Unknown Anime"
                )

                # Stream progress status to frontend
                progress_data = {
                    "status": "processing",
                    "current_entry": anime_name,
                    "processed": index,
                    "total": total_in_queue,
                }
                yield f"data: {json.dumps(progress_data)}\n\n"

                try:
                    # MAL Autofill Anime
                    if anime.mal_id:
                        autofill_anime_from_mal(anime, force_replace_ratings=True)

                    # Extract Season From Title if missing
                    if not anime.season_part and anime.anime_name_en:
                        extracted_season = extract_season_from_title(
                            anime.anime_name_en
                        )
                        if extracted_season:
                            anime.season_part = extracted_season

                    # Track the group for bulk recalculation
                    if anime.franchise_id:
                        groups_to_recalculate.add((anime.franchise_id, anime.series_id))

                    db.commit()
                    processed_count += 1

                except Exception as e:
                    db.rollback()
                    logger.error(f"Critical Fill failure for {anime_name}: {e}")

                # If connection closes during sleep, asyncio.CancelledError is raised automatically
                await asyncio.sleep(1)

            # --- POST-PROCESSING: Cascade Recalculation for filled entries ---
            if groups_to_recalculate:
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Recalculating episode cascades...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

                for f_id, s_id in groups_to_recalculate:
                    if await request.is_disconnected():
                        raise asyncio.CancelledError()

                    try:
                        derive_ep_previous(db, f_id, s_id)
                    except Exception as e:
                        logger.error(
                            f"Failed to recalculate episodes for group ({f_id}, {s_id}): {e}"
                        )

                db.commit()

        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No filling needed. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        # ==========================================
        # POST-PROCESSING: Apply to ALL entries
        # ==========================================
        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing to all entries...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for anime in all_anime:
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            anime_name = (
                anime.anime_name_cn
                or anime.anime_name_en
                or anime.anime_name_alt
                or anime.anime_name_romanji
                or anime.anime_name_jp
                or "Unknown Anime"
            )

            try:
                # Check Completed & Mark Completed
                if check_is_tv_completed(anime):
                    mark_tv_completed(anime)
            except Exception as e:
                logger.warning(f"Completion check step failed for {anime_name}: {e}")

            try:
                # Calculate Season From Month with condition
                if (
                    not anime.release_season
                    and anime.airing_type == "TV"
                    and anime.release_month
                ):
                    calculated_season = calculate_seasonal_from_month(
                        anime.release_month
                    )
                    if calculated_season:
                        anime.release_season = calculated_season
            except Exception as e:
                logger.warning(f"Season calculation step failed for {anime_name}: {e}")

        # Auto Create Seasonal
        try:
            auto_create_seasonal(db)
        except Exception as e:
            logger.warning(f"Auto create seasonal failed: {e}")

        db.commit()

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
        # PERFECTLY CATCHES FRONTEND "FORCE STOP" ABORTS
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
        # No yield here because the client connection is already closed
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
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

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
    """
    Fetches fields from Jikan API for a single anime entry, forcefully overwriting ratings and ranks.
    Perform post-processing logic after the replace (e.g. check if completed, calculate season) and commit.
    """
    logger.info(f"Starting Single Replace Pipeline for anime ID: {anime_id}")
    action_specific = "Replace for single anime entry"

    try:
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

        apply_single_replace_anime(db, anime, force_replace_ratings=True)

        db.commit()
        logger.info(f"Successfully replaced single anime: {anime_id}")

        # Auto Create Seasonal
        try:
            auto_create_seasonal(db)
            logger.info("Auto create seasonal completed.")
        except Exception as e:
            logger.warning(f"Auto create seasonal failed: {e}")
        db.commit()

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated details for {anime.anime_name_en or anime.anime_name_cn or 'entry'}.",
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


async def execute_replace_anime(
    db: Session,
    request: Request,
    action_specific: str = "Replace Anime",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """
    Async Generator (SSE). Execute Replace action for all anime entries.
    Yields progress using the queue index and supports graceful abort using asyncio.CancelledError.
    Uses Set-Based Post-Processing to calculate cascading episodes efficiently.
    """
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_anime_to_process = (
            db.query(Anime)
            .filter(or_(Anime.mal_id.isnot(None), Anime.mal_link.isnot(None)))
            .all()
        )

        total_in_queue = len(all_anime_to_process)

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
            yield f"data: {json.dumps({'status': 'info', 'message': 'No Anime entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        # Initialize our Set to track unique Franchise/Series groups for bulk recalculation
        groups_to_recalculate = set()

        for index, anime in enumerate(all_anime_to_process, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            anime_name = (
                anime.anime_name_en
                or anime.anime_name_cn
                or anime.anime_name_jp
                or "Unknown Anime"
            )

            progress_data = {
                "status": "processing",
                "current_entry": anime_name,
                "processed": index,
                "total": total_in_queue,
            }
            yield f"data: {json.dumps(progress_data)}\n\n"

            try:
                apply_single_replace_anime(db, anime, force_replace_ratings=True)

                # Track the group (Tuple of UUIDs is hashable and guarantees uniqueness)
                if anime.franchise_id:
                    groups_to_recalculate.add((anime.franchise_id, anime.series_id))

                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {anime_name}: {e}")

            await asyncio.sleep(1)

        # --- POST-PROCESSING: Cascade Recalculation ---
        if groups_to_recalculate:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Recalculating episode cascades...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

            for f_id, s_id in groups_to_recalculate:
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                try:
                    derive_ep_previous(db, f_id, s_id)
                except Exception as e:
                    logger.error(
                        f"Failed to recalculate episodes for group ({f_id}, {s_id}): {e}"
                    )

            db.commit()

        # Auto Create Seasonal
        try:
            auto_create_seasonal(db)
        except Exception as e:
            logger.warning(f"Auto create seasonal failed: {e}")

        db.commit()

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

        execute_backup(db, action_type="Auto")

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

            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # ==========================================
        # OTHER ACTIONS (TBD)
        # ==========================================
        # async for message in execute_replace_movies(db, request, ...):
        #     yield message

        # async for message in execute_replace_manga(db, request, ...):
        #     yield message

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
        "System Options": SystemOption,
    }

    PARSER_MAP = {
        "Franchise": parse_franchise_from_sheet,
        "Series": parse_series_from_sheet,
        "Anime": parse_anime_from_sheet,
        "System Options": parse_system_option_from_sheet,
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

        # Resolve String Foreign Keys -> Actual UUIDs (For Series and Anime)
        if "franchise_id" in clean_header_dict and isinstance(
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

        # System Options uses 'id', others use 'system_id'
        pk_field = "id" if tab_name == "System Options" else "system_id"
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

    tabs_in_order = ["System Options", "Franchise", "Series", "Anime"]

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
