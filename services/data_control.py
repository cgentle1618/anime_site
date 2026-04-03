"""
data_control.py
The master orchestrator for Version 2 data pipelines.
Strictly handles the business logic loops for Calculation, Fill, Replace, and Backup
by delegating tasks to isolated domain utilities and API clients.
"""

import time
import logging
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
)
from utils.jikan_utils import extract_mal_anime_data
from services.jikan import fetch_raw_anime_data
from services.sheets import bulk_overwrite_sheet
from services.image_manager import download_cover_image

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


def execute_fill_anime(db: Session) -> dict:
    """
    Fetches missing fields from Jikan API for entries that have a MAL ID.
    Only updates fields that are currently null or empty.
    """
    # Pre-requisite: Run calculations
    execute_calculations(db)

    logger.info("Starting Fill Pipeline...")

    # Query Anime where mal_id exists AND at least one target field is empty
    # We load them all to evaluate python-side for simplicity and accurate empty-string checking
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

    processed_count = 0

    for anime in all_mal_anime:
        # Check if it actually needs filling
        needs_fill = False
        for field in stated_fields:
            val = getattr(anime, field)
            if val is None or str(val).strip() == "":
                needs_fill = True
                break
        if not anime.cover_image_file:
            needs_fill = True

        if not needs_fill:
            continue

        # Fetch Data
        raw_data = fetch_raw_anime_data(anime.mal_id)
        if not raw_data:
            time.sleep(1)  # Soft rate limit protection
            continue

        parsed_data = extract_mal_anime_data(raw_data)
        processed_count += 1

        # Merge Logic (Fill only if null/empty)
        for field in stated_fields:
            current_val = getattr(anime, field)
            if current_val is None or str(current_val).strip() == "":
                new_val = parsed_data.get(field)
                if new_val is not None:
                    setattr(anime, field, new_val)

        # Calculate Season From Month (Only if TV and Season is still missing)
        current_season = getattr(anime, "release_season")
        if anime.airing_type == "TV" and (
            current_season is None or str(current_season).strip() == ""
        ):
            if anime.release_month:
                calculated_season = calculate_season_from_month(anime.release_month)
                if calculated_season:
                    anime.release_season = calculated_season

        # Cover Image Fill
        if not anime.cover_image_file and parsed_data.get("cover_image_url"):
            filename = download_cover_image(
                parsed_data["cover_image_url"], str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

        time.sleep(1)  # Respect Jikan API limits

    db.commit()
    logger.info(f"Fill Pipeline completed. Processed {processed_count} entries.")

    # Post-requisite: Backup
    execute_backup(db)

    return {"status": "success", "processed": processed_count}


# ==========================================
# PIPELINE 3: REPLACE ANIME
# ==========================================


def execute_replace_anime(db: Session) -> dict:
    """
    Force-updates mal_rating and mal_rank from Jikan API for all entries with a MAL ID.
    Behaves exactly like Fill for all other fields.
    """
    # Pre-requisite: Run calculations
    execute_calculations(db)

    logger.info("Starting Replace Pipeline...")

    # Query ALL Anime where mal_id exists
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

    processed_count = 0

    for anime in all_mal_anime:
        raw_data = fetch_raw_anime_data(anime.mal_id)
        if not raw_data:
            time.sleep(1)
            continue

        parsed_data = extract_mal_anime_data(raw_data)
        processed_count += 1

        # 1. Overwrite Logic (Ratings & Ranks)
        jikan_status = parsed_data.get("airing_status")
        if jikan_status != "Not Yet Aired":
            if parsed_data.get("mal_rating") is not None:
                anime.mal_rating = parsed_data.get("mal_rating")

            if anime.mal_rank != "N/A" and parsed_data.get("mal_rank") is not None:
                anime.mal_rank = parsed_data.get("mal_rank")

        # 2. Merge Logic (Others - Fill only)
        for field in stated_fields:
            current_val = getattr(anime, field)
            if current_val is None or str(current_val).strip() == "":
                new_val = parsed_data.get(field)
                if new_val is not None:
                    setattr(anime, field, new_val)

        # 3. Calculate Season From Month
        current_season = getattr(anime, "release_season")
        if anime.airing_type == "TV" and (
            current_season is None or str(current_season).strip() == ""
        ):
            if anime.release_month:
                calculated_season = calculate_season_from_month(anime.release_month)
                if calculated_season:
                    anime.release_season = calculated_season

        # 4. Cover Image (Fill behavior based on logic docs)
        if not anime.cover_image_file and parsed_data.get("cover_image_url"):
            filename = download_cover_image(
                parsed_data["cover_image_url"], str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

        time.sleep(1)

    db.commit()
    logger.info(f"Replace Pipeline completed. Processed {processed_count} entries.")

    # Post-requisite: Backup
    execute_backup(db)

    return {"status": "success", "processed": processed_count}


# ==========================================
# PIPELINE 4: BACKUP TO GOOGLE SHEETS
# ==========================================


def execute_backup(db: Session) -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the four target tabs in Google Sheets.
    """
    logger.info("Starting Google Sheets Backup Pipeline...")

    # 1. Backup Franchise
    franchises = db.query(Franchise).all()
    franchise_matrix = [FRANCHISE_HEADERS] + [
        format_franchise_for_sheet(f) for f in franchises
    ]
    bulk_overwrite_sheet("Franchise", franchise_matrix)

    # 2. Backup Series
    series_entries = db.query(Series).all()
    series_matrix = [SERIES_HEADERS] + [
        format_series_for_sheet(s) for s in series_entries
    ]
    bulk_overwrite_sheet("Series", series_matrix)

    # 3. Backup Anime
    animes = db.query(Anime).all()
    anime_matrix = [ANIME_HEADERS] + [format_anime_for_sheet(a) for a in animes]
    bulk_overwrite_sheet("Anime", anime_matrix)

    # 4. Backup System Options
    sysopts = db.query(SystemOption).all()
    sysopt_matrix = [SYSTEM_OPTIONS_HEADERS] + [
        [
            format_for_sheet(o.id),
            format_for_sheet(o.category),
            format_for_sheet(o.option_value),
        ]
        for o in sysopts
    ]
    bulk_overwrite_sheet("SystemOptions", sysopt_matrix)

    logger.info("Backup Pipeline completed successfully.")
    return {"status": "success", "message": "All tabs backed up to Google Sheets"}
