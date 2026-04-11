"""
other_logics.py
Contains isolated business logic specific to Anime entries (e.g., episode math,
completion checks, hierarchy resolution).
These functions mutate or evaluate SQLAlchemy models directly and are meant to be
called by FastAPI routers or other higher-level orchestrators.
"""

import logging
import re
import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from services.jikan import fetch_jikan_anime_data
from database import get_taipei_now
from models import Anime, Franchise, Seasonal
from services.image_manager import download_cover_image
from utils.jikan_utils import map_jikan_to_anime_data
from utils.utils import (
    MONTH_MAP,
    calculate_season_from_month,
    extract_mal_id,
    extract_season_from_title,
)

from utils.utils import ANIME_FIELDS_TO_FILL

logger = logging.getLogger(__name__)

# ==========================================
# PRE-COMPILED REGEX PATTERNS
# ==========================================
# Compiling at the module level improves performance when sorting large collections of entries.
SEASON_PATTERN = re.compile(r"season\s*(\d+)", re.IGNORECASE)
PART_PATTERN = re.compile(r"part\s*(\d+)", re.IGNORECASE)


# ==========================================
# PARENT HIERARCHY & DATA FILL
# ==========================================


def resolve_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Dynamically resolves the V2 relational tree.
    1. If franchise is null: searches for an existing one by name, auto-creates if missing.
    2. Anime entries can have no series value. If series_id is null, it remains null.
    """
    final_franchise_id = franchise_id

    # 1. Resolve Franchise
    if not final_franchise_id:
        # Search for an existing franchise using the provided names
        search_conditions = []
        valid_names = set()

        for lang_key in ["en", "cn", "romanji", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        for name_str in valid_names:
            # Case-insensitive exact match
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_romanji.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing_franchise = None
        if search_conditions:
            existing_franchise = (
                db.query(Franchise).filter(or_(*search_conditions)).first()
            )

        if existing_franchise:
            final_franchise_id = existing_franchise.system_id
            logger.info(
                f"Auto-resolved existing Franchise via name match: {final_franchise_id}"
            )
        else:
            new_franchise = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Anime",  # Default type
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_romanji=names.get("romanji"),
                franchise_name_jp=names.get("jp"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_franchise)
            db.flush()  # Flush to get the ID without committing
            final_franchise_id = new_franchise.system_id
            logger.info(f"Auto-created missing Franchise: {final_franchise_id}")

    # 2. Resolve Series
    # We only attach a series if the frontend explicitly passes a valid series_id.
    # If the field for series is null, we leave it null.
    final_series_id = series_id

    return final_franchise_id, final_series_id


def auto_create_seasonal(db: Session) -> None:
    """
    Scans the Anime table for unique combinations of release_season and release_year.
    Creates a new entry in the Seasonal table (e.g., 'WIN 2026') if it does not already exist.
    """
    # Query distinct combinations where both fields are not null
    unique_combinations = (
        db.query(Anime.release_season, Anime.release_year)
        .filter(Anime.release_season.isnot(None), Anime.release_year.isnot(None))
        .distinct()
        .all()
    )

    new_seasonals_added = 0

    for season, year in unique_combinations:
        seasonal_string = f"{season} {year}"

        # Check if this seasonal string already exists in the seasonal table
        existing = (
            db.query(Seasonal).filter(Seasonal.seasonal == seasonal_string).first()
        )

        if not existing:
            new_seasonal = Seasonal(
                seasonal=seasonal_string
                # entry_completed, entry_watching, and entry_dropped default to 0 via the model
            )
            db.add(new_seasonal)
            new_seasonals_added += 1

    if new_seasonals_added > 0:
        db.commit()
        logger.info(f"Auto-created {new_seasonals_added} new seasonal entries.")
    else:
        logger.info("No new seasonal entries needed to be created.")


# ==========================================
# Checking Logics
# ==========================================


def has_missing_values(anime: Anime) -> bool:
    """
    Evaluates an anime entry against the ANIME_FIELDS_TO_FILL list.
    Returns True if any required fields are missing, False if fully populated.

    Business Rule: If 'Not Yet Aired', ignores missing mal_rating and mal_rank.
    """
    missing_fields = []

    # 1. Identify all missing fields
    for field in ANIME_FIELDS_TO_FILL:
        val = getattr(anime, field, None)
        # Check for None or empty strings
        if val is None or str(val).strip() == "":
            missing_fields.append(field)

    # 2. If nothing is missing, it's fully populated
    if not missing_fields:
        return False

    # 3. Apply Exception Rule: "Not Yet Aired" entries don't have ratings/ranks yet
    if anime.airing_status == "Not Yet Aired":
        # Filter out rating and rank from the missing list
        missing_fields = [
            f for f in missing_fields if f not in ("mal_rating", "mal_rank")
        ]

    # 4. If the only things missing were the exempted fields, return False.
    # Otherwise, return True (it still needs filling).
    return len(missing_fields) > 0


# ==========================================
# EPISODE MATH & PROGRESSION
# ==========================================


def autofill_ep_previous(db: Session, anime: Anime) -> None:
    """
    Automatically calculates and fills `ep_previous` based on the chronological
    predecessor in the same franchise or series based on season_part.
    Will NOT overwrite if `ep_previous` is already set (not null).
    """
    # 1. Execution Conditions
    if anime.ep_previous is not None:
        return

    if anime.airing_type not in ["TV", "ONA"]:
        return

    if not anime.season_part or str(anime.season_part).strip() == "":
        return

    if anime.ep_special is not None:
        return

    if not anime.franchise_id:
        return

    # 2. Query siblings based on whether series_id exists
    query = db.query(Anime).filter(
        Anime.franchise_id == anime.franchise_id,
        Anime.airing_type.in_(["TV", "ONA"]),
        Anime.ep_special.is_(None),
    )

    if anime.series_id:
        query = query.filter(Anime.series_id == anime.series_id)
    else:
        query = query.filter(Anime.series_id.is_(None))

    siblings = query.all()

    if not siblings:
        return

    # 3. Sort chronologically using season_part
    def extract_season_number(season_str: Optional[str]) -> float:
        """
        Extracts numbers from strings like "Season 1", "Season 2 part 2".
        Returns a float to handle parts (e.g., Season 2 part 2 -> 2.2).
        If no number is found, returns a high number to push it to the end.
        """
        if not season_str:
            return 999.0

        s_str = str(season_str)

        # Look for "season X"
        season_match = SEASON_PATTERN.search(s_str)
        season_num = float(season_match.group(1)) if season_match else 999.0

        # Look for "part Y"
        part_match = PART_PATTERN.search(s_str)
        part_num = float(part_match.group(1)) if part_match else 0.0

        # Combine: Season 2 Part 2 becomes 2.2 for sorting
        return season_num + (part_num * 0.1)

    def sort_key(a: Anime) -> Tuple[float, str]:
        """
        Sort primarily by the season/part number extracted from season_part.
        Fallback to constructed release date if season_part parsing is identical.
        """
        season_val = extract_season_number(a.season_part)

        # Secondary sort: release date string constructed from year and month
        year = str(a.release_year) if a.release_year else "9999"
        month_str = str(a.release_month).upper() if a.release_month else ""
        month = MONTH_MAP.get(month_str, "12")
        date_val = f"{year}-{month}-99"

        return (season_val, date_val)

    sorted_siblings = sorted(siblings, key=sort_key)

    # 4. Find current anime in the sorted list
    try:
        idx = next(
            i for i, a in enumerate(sorted_siblings) if a.system_id == anime.system_id
        )
    except StopIteration:
        return

    # 5. Math: If it's not the first season, grab the previous one
    if idx > 0:
        prev_anime = sorted_siblings[idx - 1]
        prev_ep_prev = prev_anime.ep_previous or 0
        prev_ep_tot = prev_anime.ep_total or 0

        anime.ep_previous = prev_ep_prev + prev_ep_tot
        logger.info(
            f"Autofilled ep_previous for {anime.anime_name_en} to {anime.ep_previous}"
        )


def calculate_cumulative_episode(anime: Anime) -> Dict[str, int]:
    """
    Calculates the total/watched cumulative episodes for TV/ONA main story entries.
    Returns a dictionary with 'cumulative_watched' and 'cumulative_total'.
    """
    base_fin = anime.ep_fin or 0
    base_total = anime.ep_total or 0

    # Check conditions
    is_valid_type = anime.airing_type in ["TV", "ONA"]
    is_main_story = anime.ep_special is None
    has_season = anime.season_part is not None
    is_not_first_season = anime.season_part not in ["Season 1", "Season 1 Part 1"]

    # If all conditions are met, add ep_previous
    if is_valid_type and is_main_story and has_season and is_not_first_season:
        prev = anime.ep_previous or 0
        return {
            "cumulative_watched": prev + base_fin,
            "cumulative_total": prev + base_total,
        }

    # Otherwise, return base numbers without ep_previous
    return {"cumulative_watched": base_fin, "cumulative_total": base_total}


def check_is_completed(anime: Anime) -> bool:
    """
    Evaluates business rules to determine if an entry should be considered completed.
    Returns True if completed, False otherwise.
    """
    if anime.watching_status == "Completed":
        return True

    if (
        anime.ep_total is not None
        and anime.ep_total > 0
        and anime.ep_fin == anime.ep_total
    ):
        return True

    return False


def mark_completed(anime: Anime) -> None:
    """
    Forcefully mutates an Anime entry's fields to represent a 100% finished state.
    """
    anime.watching_status = "Completed"
    anime.airing_status = "Finished Airing"

    if anime.ep_total is not None:
        anime.ep_fin = anime.ep_total


def autofill_anime_from_mal(anime: Anime, force_replace_ratings: bool = True) -> None:
    """
    Dedicated logic to fetch MAL data via Jikan and enrich a single Anime entry.
    Fills empty fields and overwrites ratings/rankings if instructed.
    """
    mal_id = anime.mal_id or extract_mal_id(anime.mal_link)
    if not mal_id:
        return

    anime.mal_id = mal_id

    try:
        raw_data = fetch_jikan_anime_data(mal_id)
        if not raw_data:
            return

        j_data = map_jikan_to_anime_data(raw_data)

        # Fill Missing Data
        if anime.airing_type is None:
            anime.airing_type = j_data.get("airing_type")
        if anime.airing_status is None:
            anime.airing_status = j_data.get("airing_status")
        if anime.release_month is None:
            anime.release_month = j_data.get("release_month")
        if anime.release_season is None:
            anime.release_season = j_data.get("release_season")
        if anime.release_year is None:
            anime.release_year = j_data.get("release_year")
        if anime.ep_total is None:
            anime.ep_total = j_data.get("ep_total")
        if not anime.official_link:
            anime.official_link = j_data.get("official_link")
        if not anime.twitter_link:
            anime.twitter_link = j_data.get("twitter_link")

        # Overwrite Ratings
        if force_replace_ratings or anime.mal_rating is None:
            anime.mal_rating = (
                j_data.get("mal_rating")
                if j_data.get("mal_rating")
                else anime.mal_rating
            )
        if force_replace_ratings or anime.mal_rank is None:
            anime.mal_rank = (
                str(j_data.get("mal_rank"))
                if j_data.get("mal_rank")
                else anime.mal_rank
            )

        # Conditionally Download Cover Image
        if not anime.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Anime ID {anime.system_id} (MAL {mal_id}): {e}"
        )


# ==========================================
# Replace for Single Entry
# ==========================================


def apply_single_replace_anime(db: Session, anime: Anime) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    Used by routers for manual updates and by data control pipelines.
    """
    # 1. Perform Extract MAL ID
    if not anime.mal_id and anime.mal_link:
        anime.mal_id = extract_mal_id(anime.mal_link)

    # 2. Perform MAL Autofill (force_replace_ratings=True for the 'Replace' action)
    autofill_anime_from_mal(anime, force_replace_ratings=True)

    # 3. Perform Extract Season From Title (if null)
    if not anime.season_part and anime.anime_name_en:
        extracted_season = extract_season_from_title(anime.anime_name_en)
        if extracted_season:
            anime.season_part = extracted_season

    # 4 & 5. Perform Check Completed and Mark Completed
    if check_is_completed(anime):
        mark_completed(anime)

    # 6. Perform Calculate Season From Month
    # Condition: release_season is null AND airing_type is TV
    if not anime.release_season and anime.airing_type == "TV" and anime.release_month:
        calculated_season = calculate_season_from_month(anime.release_month)
        if calculated_season:
            anime.release_season = calculated_season

    # 7. Perform Auto Create Seasonal
    # This ensures the 'WIN 2026' entry exists for this specific anime
    auto_create_seasonal(db)


# ==========================================
#
# ==========================================


def process_anime_updates(db: Session, anime: Anime) -> None:
    """
    Facade wrapper for manual anime updates via the Router (PUT/POST).
    Delegates to independent domain helpers sequentially.
    Note: Does NOT call db.commit() to allow the router to manage the transaction.
    """
    # 1. Extract MAL ID
    if not anime.mal_id and anime.mal_link:
        extracted = extract_mal_id(anime.mal_link)
        if extracted:
            anime.mal_id = extracted

    # 2. MAL Autofill (Fill missing fields only - standard router behavior)
    if anime.mal_id:
        raw_data = fetch_jikan_anime_data(anime.mal_id)
        if raw_data:
            parsed_data = map_jikan_to_anime_data(raw_data)

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

            for field in stated_fields:
                current_val = getattr(anime, field)
                # Only fill if the field is currently empty
                if current_val is None or str(current_val).strip() == "":
                    new_val = parsed_data.get(field)
                    if new_val is not None:
                        setattr(anime, field, new_val)

            # Handle Cover Image Download
            if not anime.cover_image_file and parsed_data.get("cover_image_url"):
                filename = download_cover_image(
                    parsed_data["cover_image_url"], str(anime.system_id)
                )
                if filename:
                    anime.cover_image_file = filename

    # 3. Extract Season From Title
    if not anime.season_part and anime.anime_name_en:
        extracted_season = extract_season_from_title(anime.anime_name_en)
        if extracted_season:
            anime.season_part = extracted_season

    # 4. Check & Mark Completed
    if check_is_completed(anime):
        mark_completed(anime)

    # 5. Calculate Season From Month
    if not anime.release_season and anime.airing_type == "TV" and anime.release_month:
        calculated_season = calculate_season_from_month(anime.release_month)
        if calculated_season:
            anime.release_season = calculated_season

    # 6. Auto Create Seasonal
    auto_create_seasonal(db)
