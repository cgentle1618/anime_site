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

from models import Franchise, Series, Anime, SystemOption
from utils.utils import (
    extract_mal_id,
    extract_season_from_title,
    calculate_season_from_month,
    FRANCHISE_HEADERS,
    SERIES_HEADERS,
    ANIME_HEADERS,
    SYSTEM_OPTIONS_HEADERS,
)
from utils.data_control_utils import (
    format_franchise_for_sheet,
    format_series_for_sheet,
    format_anime_for_sheet,
    format_for_sheet,
    parse_row_to_dict,
    parse_franchise_from_sheet,
    parse_series_from_sheet,
    parse_anime_from_sheet,
    parse_system_option_from_sheet,
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
    Currently restricted to Anime entries.
    """
    logger.info("Starting Calculation Pipeline...")

    # 0. Auto Create Seasonal Hubs
    auto_create_seasonal(db)

    anime_entries = db.query(Anime).all()

    for anime in anime_entries:
        # 1. Extract MAL ID if missing
        if anime.mal_id is None and anime.mal_link:
            extracted_id = extract_mal_id(anime.mal_link)
            if extracted_id:
                anime.mal_id = extracted_id

        # 2. Extract Season from Title if missing
        if anime.season_part is None and anime.anime_name_en:
            extracted_season = extract_season_from_title(anime.anime_name_en)
            if extracted_season:
                anime.season_part = extracted_season

        # 3. Check & Mark Completed
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


async def execute_fill_anime(db: Session, request: Request):
    """
    Async Generator function. Fetches missing fields from Jikan API for entries that have a MAL ID.
    Yields Server-Sent Events (SSE) detailing the progress and gracefully aborts if the client disconnects.
    """
    execute_calculations(db)
    logger.info("Starting Fill Pipeline...")

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

    # Pre-calculate queue
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
        yield f"data: {json.dumps({'status': 'success', 'message': 'No entries needed filling', 'total': 0, 'processed': 0})}\n\n"
        return

    for anime in queue:
        # 1. Disconnect Guard
        if await request.is_disconnected():
            logger.info("Client disconnected. Aborting Fill Pipeline gracefully.")
            break

        anime_name = anime.anime_name_en or anime.anime_name_cn or "Unknown Anime"

        # Yield progress indicating we are about to process this entry
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

        # Commit per chunk so the DB is updated gradually
        db.commit()
        await asyncio.sleep(1)

    logger.info(f"Fill Pipeline completed. Processed {processed_count} entries.")

    execute_backup(db)

    # Yield final success status
    yield f"data: {json.dumps({'status': 'success', 'message': 'Fill process complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"


# ==========================================
# PIPELINE 3: REPLACE ANIME
# ==========================================


async def execute_replace_anime(db: Session, request: Request):
    """
    Async Generator function. Force-updates mal_rating and mal_rank from Jikan API for all entries with a MAL ID.
    Yields Server-Sent Events (SSE) detailing the progress and gracefully aborts if the client disconnects.
    """
    execute_calculations(db)
    logger.info("Starting Replace Pipeline...")

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
        yield f"data: {json.dumps({'status': 'success', 'message': 'No MAL entries found', 'total': 0, 'processed': 0})}\n\n"
        return

    for anime in all_mal_anime:
        # 1. Disconnect Guard
        if await request.is_disconnected():
            logger.info("Client disconnected. Aborting Replace Pipeline gracefully.")
            break

        anime_name = anime.anime_name_en or anime.anime_name_cn or "Unknown Anime"

        # Yield progress
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

        # Commit per chunk
        db.commit()
        await asyncio.sleep(1)

    logger.info(f"Replace Pipeline completed. Processed {processed_count} entries.")

    execute_backup(db)

    # Yield final success status
    yield f"data: {json.dumps({'status': 'success', 'message': 'Replace process complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"


# ==========================================
# PIPELINE 4: BACKUP TO GOOGLE SHEETS
# ==========================================


def execute_backup(db: Session) -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the four target tabs in Google Sheets.
    """
    logger.info("Starting Google Sheets Backup Pipeline...")

    franchises = db.query(Franchise).all()
    franchise_matrix = [FRANCHISE_HEADERS] + [
        format_franchise_for_sheet(f) for f in franchises
    ]
    bulk_overwrite_sheet("Franchise", franchise_matrix)

    series_entries = db.query(Series).all()
    series_matrix = [SERIES_HEADERS] + [
        format_series_for_sheet(s) for s in series_entries
    ]
    bulk_overwrite_sheet("Series", series_matrix)

    animes = db.query(Anime).all()
    anime_matrix = [ANIME_HEADERS] + [format_anime_for_sheet(a) for a in animes]
    bulk_overwrite_sheet("Anime", anime_matrix)

    sysopts = db.query(SystemOption).all()
    sysopt_matrix = [SYSTEM_OPTIONS_HEADERS] + [
        [
            format_for_sheet(o.id),
            format_for_sheet(o.category),
            format_for_sheet(o.option_value),
        ]
        for o in sysopts
    ]
    bulk_overwrite_sheet("System Options", sysopt_matrix)

    logger.info("Backup Pipeline completed successfully.")
    return {"status": "success", "message": "All tabs backed up to Google Sheets"}


# ==========================================
# PIPELINE 5: PULL FROM SHEETS
# ==========================================


def execute_pull_specific(db: Session, tab_name: str) -> dict:
    """
    Pulls data from a specific Google Sheet tab and gracefully Upserts it into PostgreSQL.
    (Updates existing rows by ID, Inserts missing rows).
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
        return {"status": "success", "processed": 0}

    headers = raw_matrix[0]
    data_rows = raw_matrix[1:]

    Model = MODEL_MAP[tab_name]
    parser = PARSER_MAP[tab_name]

    processed = 0
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

        # 3. UPSERT LOGIC
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )

            if existing:
                # Update existing record
                for key, value in clean_dict.items():
                    setattr(existing, key, value)
            else:
                # Create new record (UUID provided but record missing locally)
                new_record = Model(**clean_dict)
                db.add(new_record)
        else:
            # Create new record (UUID missing, let DB generate it)
            new_record = Model(**clean_dict)
            db.add(new_record)

        processed += 1

        # Flush periodically so DB generates new UUIDs immediately for Foreign Key references
        if processed % 50 == 0:
            db.flush()

    db.commit()
    logger.info(
        f"Successfully pulled and upserted {processed} records from '{tab_name}'."
    )
    return {"status": "success", "processed": processed}


def execute_pull_all(db: Session) -> dict:
    """
    Pulls ALL tabs from Google Sheets into the database.
    WARNING: The execution order is STRICT to satisfy Foreign Key constraints.
    """
    logger.info("Starting Full Pull Pipeline (All Tabs)...")

    # Hierarchy: Independent -> Top-level Parent -> Child -> Grandchild
    tabs_in_order = ["System Options", "Franchise", "Series", "Anime"]

    results = {}
    for tab in tabs_in_order:
        res = execute_pull_specific(db, tab)
        results[tab] = res.get("processed", 0)

    logger.info("Full Pull Pipeline completed successfully.")
    return {"status": "success", "details": results}
