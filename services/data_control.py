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
from sqlalchemy import or_

from models import Franchise, Series, Anime, SystemOption, DataControlLog
from utils.utils import (
    extract_mal_id,
    extract_season_from_title,
    calculate_season_from_month,
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
from utils.jikan_utils import extract_mal_anime_data
from services.jikan import fetch_raw_anime_data
from services.sheets import bulk_overwrite_sheet, get_all_raw_rows
from services.image_manager import download_cover_image
from services.other_logics import auto_create_seasonal

# Setup basic logging
logger = logging.getLogger(__name__)


# ==========================================
# PIPELINE 1: CALCULATIONS
# ==========================================


def execute_calculations(db: Session) -> None:
    """
    Scrub and calculate internal database fields before fetching external data.
    """
    logger.info("Starting Calculation Pipeline...")
    auto_create_seasonal(db)

    anime_entries = db.query(Anime).all()

    for anime in anime_entries:
        if anime.mal_id is None and anime.mal_link:
            extracted_id = extract_mal_id(anime.mal_link)
            if extracted_id:
                anime.mal_id = extracted_id

        if anime.season_part is None and anime.anime_name_en:
            extracted_season = extract_season_from_title(anime.anime_name_en)
            if extracted_season:
                anime.season_part = extracted_season

        is_explicitly_completed = anime.watching_status == "Completed"
        is_naturally_completed = (
            anime.ep_total is not None
            and anime.ep_total > 0
            and anime.ep_fin == anime.ep_total
        )

        if is_explicitly_completed or is_naturally_completed:
            anime.watching_status = "Completed"
            anime.airing_status = "Finished Airing"
            if anime.ep_total:
                anime.ep_fin = anime.ep_total

    db.commit()
    logger.info("Calculation Pipeline completed successfully.")


# ==========================================
# PIPELINE 2: FILL ANIME
# ==========================================


async def execute_fill_anime(
    db: Session,
    request: Request,
    action_specific: str = "Fill Anime",
    action_type: str = "Manual",
):
    """
    Async Generator function. Fetches missing fields from Jikan API for entries that have a MAL ID.
    """
    execute_calculations(db)
    logger.info(f"Starting {action_specific} Pipeline...")

    all_mal_anime = db.query(Anime).filter(Anime.mal_id.isnot(None)).all()

    stated_fields = [
        "airing_type",
        "airing_status",
        "release_month",
        "release_season",
        "release_year",
        "mal_rating",
        "mal_rank",
        "ep_total",
        "official_link",
        "twitter_link",
    ]

    queue = []
    for anime in all_mal_anime:
        needs_fill = False
        for field in stated_fields:
            val = getattr(anime, field)
            if val is None or str(val).strip() == "":
                needs_fill = True
                break
        if not anime.cover_image_file:
            needs_fill = True

        if needs_fill:
            queue.append(anime)

    total_in_queue = len(queue)
    processed_count = 0

    if total_in_queue == 0:
        log_data_control(
            db, "Fill", action_specific, action_type, "Success", rows_updated=0
        )
        yield f"data: {json.dumps({'status': 'success', 'message': 'No entries needed filling', 'total': 0, 'processed': 0})}\n\n"
        return

    try:
        for anime in queue:
            # 1. Disconnect Guard
            if await request.is_disconnected():
                logger.info("Client disconnected. Aborting Fill Pipeline gracefully.")
                log_data_control(
                    db,
                    "Fill",
                    action_specific,
                    action_type,
                    "Aborted",
                    rows_updated=processed_count,
                )
                return

            anime_name = anime.anime_name_en or anime.anime_name_cn or "Unknown Anime"

            progress_data = {
                "status": "processing",
                "current_entry": anime_name,
                "processed": processed_count,
                "total": total_in_queue,
            }
            yield f"data: {json.dumps(progress_data)}\n\n"

            raw_data = fetch_raw_anime_data(anime.mal_id)
            if not raw_data:
                await asyncio.sleep(1)
                continue

            parsed_data = extract_mal_anime_data(raw_data)
            processed_count += 1

            for field in stated_fields:
                current_val = getattr(anime, field)
                if current_val is None or str(current_val).strip() == "":
                    new_val = parsed_data.get(field)
                    if new_val is not None:
                        setattr(anime, field, new_val)

            current_season = getattr(anime, "release_season")
            if anime.airing_type == "TV" and (
                current_season is None or str(current_season).strip() == ""
            ):
                if anime.release_month:
                    calculated_season = calculate_season_from_month(anime.release_month)
                    if calculated_season:
                        anime.release_season = calculated_season

            if not anime.cover_image_file and parsed_data.get("cover_image_url"):
                filename = download_cover_image(
                    parsed_data["cover_image_url"], str(anime.system_id)
                )
                if filename:
                    anime.cover_image_file = filename

            db.commit()
            await asyncio.sleep(1)

        # Successful Completion
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Success",
            rows_updated=processed_count,
        )
        logger.info(f"Fill Pipeline completed. Processed {processed_count} entries.")

        # Trigger auto-backup silently
        execute_backup(db, action_type="Auto")

        yield f"data: {json.dumps({'status': 'success', 'message': 'Fill process complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except Exception as e:
        logger.error(f"Fill Pipeline crashed: {e}")
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


async def execute_fill_single_anime(
    db: Session, anime_id: str, action_type: str = "Manual"
) -> dict:
    """
    Fetches missing fields from Jikan API for a single anime entry.
    """
    logger.info(f"Starting Single Fill Pipeline for anime ID: {anime_id}")
    action_specific = "Fill for single anime entry"

    try:
        anime = db.query(Anime).filter(Anime.system_id == anime_id).first()
        if not anime:
            log_data_control(
                db,
                "Fill",
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

        if anime.mal_id is None and anime.mal_link:
            extracted_id = extract_mal_id(anime.mal_link)
            if extracted_id:
                anime.mal_id = extracted_id

        if anime.season_part is None and anime.anime_name_en:
            extracted_season = extract_season_from_title(anime.anime_name_en)
            if extracted_season:
                anime.season_part = extracted_season

        is_explicitly_completed = anime.watching_status == "Completed"
        is_naturally_completed = (
            anime.ep_total is not None
            and anime.ep_total > 0
            and anime.ep_fin == anime.ep_total
        )

        if is_explicitly_completed or is_naturally_completed:
            anime.watching_status = "Completed"
            anime.airing_status = "Finished Airing"
            if anime.ep_total:
                anime.ep_fin = anime.ep_total

        db.commit()

        if not anime.mal_id:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Failed",
                error_message="No MAL ID provided",
            )
            return {
                "status": "success",
                "message": "Local calculations finished, but no MAL ID found for external autofill.",
            }

        stated_fields = [
            "airing_type",
            "airing_status",
            "release_month",
            "release_season",
            "release_year",
            "mal_rating",
            "mal_rank",
            "ep_total",
            "official_link",
            "twitter_link",
        ]

        raw_data = fetch_raw_anime_data(anime.mal_id)
        if not raw_data:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Failed",
                error_message="Jikan API 502",
            )
            return {
                "status": "error",
                "message": "Failed to fetch data from MyAnimeList API.",
                "status_code": 502,
            }

        parsed_data = extract_mal_anime_data(raw_data)

        for field in stated_fields:
            current_val = getattr(anime, field)
            if current_val is None or str(current_val).strip() == "":
                new_val = parsed_data.get(field)
                if new_val is not None:
                    setattr(anime, field, new_val)

        current_season = getattr(anime, "release_season")
        if anime.airing_type == "TV" and (
            current_season is None or str(current_season).strip() == ""
        ):
            if anime.release_month:
                calculated_season = calculate_season_from_month(anime.release_month)
                if calculated_season:
                    anime.release_season = calculated_season

        if not anime.cover_image_file and parsed_data.get("cover_image_url"):
            filename = download_cover_image(
                parsed_data["cover_image_url"], str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

        db.commit()
        logger.info(f"Successfully autofilled single anime: {anime_id}")
        log_data_control(
            db, "Fill", action_specific, action_type, "Success", rows_updated=1
        )

        return {
            "status": "success",
            "message": f"Successfully autofilled details for {anime.anime_name_en or anime.anime_name_cn or 'entry'}.",
        }
    except Exception as e:
        logger.error(f"Single Fill Error: {e}")
        log_data_control(
            db, "Fill", action_specific, action_type, "Failed", error_message=str(e)
        )
        return {"status": "error", "message": str(e), "status_code": 500}


# ==========================================
# PIPELINE 3: REPLACE ANIME
# ==========================================


async def execute_replace_anime(
    db: Session,
    request: Request,
    action_specific: str = "Replace Anime",
    action_type: str = "Manual",
):
    """
    Async Generator function. Force-updates mal_rating and mal_rank from Jikan API for all entries with a MAL ID.
    """
    execute_calculations(db)
    logger.info(f"Starting {action_specific} Pipeline...")

    all_mal_anime = db.query(Anime).filter(Anime.mal_id.isnot(None)).all()

    stated_fields = [
        "airing_type",
        "airing_status",
        "release_month",
        "release_season",
        "release_year",
        "ep_total",
        "official_link",
        "twitter_link",
    ]

    total_in_queue = len(all_mal_anime)
    processed_count = 0

    if total_in_queue == 0:
        log_data_control(
            db, "Replace", action_specific, action_type, "Success", rows_updated=0
        )
        yield f"data: {json.dumps({'status': 'success', 'message': 'No MAL entries found', 'total': 0, 'processed': 0})}\n\n"
        return

    try:
        for anime in all_mal_anime:
            if await request.is_disconnected():
                logger.info(
                    "Client disconnected. Aborting Replace Pipeline gracefully."
                )
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Aborted",
                    rows_updated=processed_count,
                )
                return

            anime_name = anime.anime_name_en or anime.anime_name_cn or "Unknown Anime"

            progress_data = {
                "status": "processing",
                "current_entry": anime_name,
                "processed": processed_count,
                "total": total_in_queue,
            }
            yield f"data: {json.dumps(progress_data)}\n\n"

            raw_data = fetch_raw_anime_data(anime.mal_id)
            if not raw_data:
                await asyncio.sleep(1)
                continue

            parsed_data = extract_mal_anime_data(raw_data)
            processed_count += 1

            jikan_status = parsed_data.get("airing_status")
            if jikan_status != "Not Yet Aired":
                if parsed_data.get("mal_rating") is not None:
                    anime.mal_rating = parsed_data.get("mal_rating")

                if anime.mal_rank != "N/A" and parsed_data.get("mal_rank") is not None:
                    anime.mal_rank = parsed_data.get("mal_rank")

            for field in stated_fields:
                current_val = getattr(anime, field)
                if current_val is None or str(current_val).strip() == "":
                    new_val = parsed_data.get(field)
                    if new_val is not None:
                        setattr(anime, field, new_val)

            current_season = getattr(anime, "release_season")
            if anime.airing_type == "TV" and (
                current_season is None or str(current_season).strip() == ""
            ):
                if anime.release_month:
                    calculated_season = calculate_season_from_month(anime.release_month)
                    if calculated_season:
                        anime.release_season = calculated_season

            if not anime.cover_image_file and parsed_data.get("cover_image_url"):
                filename = download_cover_image(
                    parsed_data["cover_image_url"], str(anime.system_id)
                )
                if filename:
                    anime.cover_image_file = filename

            db.commit()
            await asyncio.sleep(1)

        log_data_control(
            db,
            "Replace",
            action_specific,
            action_type,
            "Success",
            rows_updated=processed_count,
        )
        logger.info(f"Replace Pipeline completed. Processed {processed_count} entries.")

        execute_backup(db, action_type="Auto")

        yield f"data: {json.dumps({'status': 'success', 'message': 'Replace process complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except Exception as e:
        logger.error(f"Replace Pipeline crashed: {e}")
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


# ==========================================
# PIPELINE 4: BACKUP TO GOOGLE SHEETS
# ==========================================


def execute_backup(db: Session, action_type: str = "Manual") -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.
    """
    logger.info(f"Starting Google Sheets Backup Pipeline ({action_type})...")

    try:
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

        sysopts = db.query(SystemOption).all()
        sysopt_headers = [c.name for c in SystemOption.__table__.columns]
        sysopt_matrix = [sysopt_headers] + [format_model_for_sheet(o) for o in sysopts]
        bulk_overwrite_sheet("System Options", sysopt_matrix)

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
# PIPELINE 5: PULL FROM SHEETS
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

        raw_dict = parse_row_to_dict(headers, row)
        clean_dict = parser(raw_dict)

        # 1. Resolve String Foreign Keys -> Actual UUIDs (For Series and Anime)
        if "franchise_id" in clean_dict and isinstance(clean_dict["franchise_id"], str):
            fname = clean_dict["franchise_id"]
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
                    clean_dict["franchise_id"] = fran.system_id
                else:
                    logger.warning(
                        f"Could not resolve franchise FK for: {fname}. Skipping row."
                    )
                    continue

        if "series_id" in clean_dict and isinstance(clean_dict["series_id"], str):
            sname = clean_dict["series_id"]
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
                    clean_dict["series_id"] = series.system_id
                else:
                    logger.warning(
                        f"Could not resolve series FK for: {sname}. Skipping row."
                    )
                    continue

        # System Options uses 'id', others use 'system_id'
        pk_field = "id" if tab_name == "System Options" else "system_id"
        pk_value = clean_dict.get(pk_field)

        # 2. Smart Primary Key Logic (Upsert vs Insert)
        if not pk_value or (isinstance(pk_value, str) and not pk_value.strip()):
            existing_record = None
            if tab_name == "Franchise":
                name = clean_dict.get("franchise_name_en") or clean_dict.get(
                    "franchise_name_cn"
                )
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
                name = clean_dict.get("series_name_en") or clean_dict.get(
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
                name = clean_dict.get("anime_name_en") or clean_dict.get(
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
                clean_dict[pk_field] = pk_value
            else:
                clean_dict.pop(pk_field, None)
                pk_value = None

        # 3. Data Sanitization (Prevent Pydantic Schema 500 Validation Errors)
        if tab_name == "Anime":
            if clean_dict.get("watching_status") is None:
                clean_dict["watching_status"] = "Haven't Started"
            if clean_dict.get("airing_status") is None:
                clean_dict["airing_status"] = ""
            if clean_dict.get("airing_type") is None:
                clean_dict["airing_type"] = ""

        # 4. UPSERT LOGIC
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )

            if existing:
                # Update existing record
                for key, value in clean_dict.items():
                    setattr(existing, key, value)
                rows_updated += 1
            else:
                # Create new record (UUID provided but record missing locally)
                new_record = Model(**clean_dict)
                db.add(new_record)
                rows_added += 1
        else:
            # Create new record (UUID missing, let DB generate it)
            new_record = Model(**clean_dict)
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

    # Hierarchy: Independent -> Top-level Parent -> Child -> Grandchild
    tabs_in_order = ["System Options", "Franchise", "Series", "Anime"]

    results = {}
    total_added = 0
    total_updated = 0

    try:
        for tab in tabs_in_order:
            # We log individual tabs as "Auto" since they are triggered by the "Pull All" action
            res = execute_pull_specific(db, tab, action_type="Auto", log_action=True)

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
