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

from database import get_taipei_now
from models import Anime, Franchise, Seasonal, SystemOption

from services.jikan import fetch_jikan_anime_data
from services.image_manager import download_cover_image

from utils.utils import (
    MONTH_MAP,
    ANIME_FIELDS_TO_FILL,
    extract_mal_id,
    extract_season_from_title,
    calculate_season_from_month,
)
from utils.jikan_utils import map_jikan_to_anime_data


logger = logging.getLogger(__name__)

# ==========================================
# PRE-COMPILED REGEX PATTERNS
# ==========================================

SEASON_PATTERN = re.compile(r"season\s*(\d+)", re.IGNORECASE)
PART_PATTERN = re.compile(r"part\s*(\d+)", re.IGNORECASE)


# ==========================================
# CHECKING LOGICS
# ==========================================


def has_missing_values(anime: Anime) -> bool:
    """
    Evaluates an anime entry against the ANIME_FIELDS_TO_FILL list.
    Returns True if any required fields are missing, False if fully populated.

    Business Rules:
    1. If 'Not Yet Aired', ignores missing mal_rating and mal_rank.
    2. Detects missing 'ep_previous' ONLY if it meets specific Execution Conditions.
    """
    missing_fields = []

    for field in ANIME_FIELDS_TO_FILL:
        val = getattr(anime, field, None)
        if val is None or str(val).strip() == "":
            missing_fields.append(field)

    # Exception Rule: "Not Yet Aired" entries don't have ratings/ranks yet
    if anime.airing_status == "Not Yet Aired":
        missing_fields = [
            f for f in missing_fields if f not in ("mal_rating", "mal_rank")
        ]

    # Clean out ep_previous if it was caught by the general loop
    if "ep_previous" in missing_fields:
        missing_fields.remove("ep_previous")

    # Custom Execution Condition for ep_previous
    if anime.ep_previous is None:
        is_tv_or_ona = anime.airing_type in ["TV", "ONA"]
        no_ep_special = anime.ep_special is None
        has_season = bool(anime.season_part and str(anime.season_part).strip())

        if is_tv_or_ona and no_ep_special and has_season:
            missing_fields.append("ep_previous")

    return len(missing_fields) > 0


def check_is_tv_completed(entry: Anime) -> bool:
    """
    Determine if a TV type entry (Anime, TV Show, Cartoon) should be considered completed.
    Returns True if completed, False otherwise.
    """
    if entry.watching_status == "Completed":
        return True

    if (
        entry.ep_total is not None
        and entry.ep_total > 0
        and entry.ep_fin == entry.ep_total
    ):
        return True

    return False


# ==========================================
# AUTO ACTIONS
# ==========================================


def auto_create_seasonal(db: Session) -> None:
    """
    Scans the Anime table for unique combinations of release_season and release_year.
    Creates a new entry in the Seasonal table (e.g., 'WIN 2026') if it does not already exist.
    """
    unique_combinations = (
        db.query(Anime.release_season, Anime.release_year)
        .filter(Anime.release_season.isnot(None), Anime.release_year.isnot(None))
        .distinct()
        .all()
    )

    new_seasonals_added = 0

    for season, year in unique_combinations:
        seasonal_string = f"{season} {year}"

        existing = (
            db.query(Seasonal).filter(Seasonal.seasonal == seasonal_string).first()
        )

        if not existing:
            new_seasonal = Seasonal(seasonal=seasonal_string)
            db.add(new_seasonal)
            new_seasonals_added += 1

    if new_seasonals_added > 0:
        db.commit()
        logger.info(f"Auto-created {new_seasonals_added} new seasonal entries.")
    else:
        logger.info("No new seasonal entries needed to be created.")


# ==========================================
# FILL FROM OTHER SOURCES
# ==========================================


def autofill_anime_from_mal(anime: Anime, force_replace_ratings: bool = True) -> None:
    """
    Dedicated logic to fetch MAL data via Jikan and enrich a single Anime entry.
    Fills empty fields and overwrites ratings/rankings if instructed.
    """
    # Extract MAL ID
    mal_id = anime.mal_id or extract_mal_id(anime.mal_link)
    if not mal_id:
        return

    anime.mal_id = mal_id

    try:
        # MAL Fetch Anime and Anime Movies
        raw_data = fetch_jikan_anime_data(mal_id)
        if not raw_data:
            return

        # MAL Conversion for Anime
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
# EPISODE MATH & PROGRESSION
# ==========================================


def autofill_ep_previous(
    db: Session, franchise_id: Any, series_id: Optional[Any] = None
) -> None:
    """
    Calculates and cascades ep_previous for an entire Franchise or Series group.
    Sorts valid siblings chronologically by Season and Part.
    """
    if not franchise_id:
        return

    # Fetch and filter valid Siblings
    query = db.query(Anime).filter(Anime.franchise_id == franchise_id)
    if series_id:
        query = query.filter(Anime.series_id == series_id)

    siblings = query.all()

    valid_siblings = []
    for s in siblings:
        if s.airing_type in ["TV", "ONA"] and s.ep_special is None and s.season_part:
            valid_siblings.append(s)

    if not valid_siblings:
        return

    # Sort Chronologically by Season and Part
    def get_sort_key(a: Anime):
        s_part = str(a.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)

        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    sorted_siblings = sorted(valid_siblings, key=get_sort_key)

    # Cascade Accumulation Loop
    running_ep_previous = 0

    for s in sorted_siblings:
        s_part_clean = str(s.season_part).strip().lower()

        if s_part_clean in ["season 1", "season 1 part 1"]:
            running_ep_previous = 0

        # Fill if missing
        if s.ep_previous is None:
            s.ep_previous = running_ep_previous

        current_prev = s.ep_previous or 0
        current_total = s.ep_total or 0
        running_ep_previous = current_prev + current_total


def mark_tv_completed(entry: Anime) -> None:
    """
    Forcefully mutates an TV type (Anime, TV Show, Cartoon) entry's fields to represent a 100% finished state.
    """
    entry.watching_status = "Completed"
    entry.airing_status = "Finished Airing"

    if entry.ep_total is not None:
        entry.ep_fin = entry.ep_total


# ==========================================
# REPLACE for Single Entry
# ==========================================


def apply_single_replace_anime(
    db: Session, anime: Anime, force_replace_ratings: bool = True
) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    Used by anime router for manual updates from anime detail frontend page.
    """
    # Extract MAL ID
    if not anime.mal_id and anime.mal_link:
        anime.mal_id = extract_mal_id(anime.mal_link)

    # MAL Autofill Anime
    autofill_anime_from_mal(anime, force_replace_ratings=True)

    # Extract Season From Title if missing
    if not anime.season_part and anime.anime_name_en:
        extracted_season = extract_season_from_title(anime.anime_name_en)
        if extracted_season:
            anime.season_part = extracted_season

    # Check Completed and Mark Completed
    if check_is_tv_completed(anime):
        mark_tv_completed(anime)

    # Calculate Season From Month with condition
    if not anime.release_season and anime.airing_type == "TV" and anime.release_month:
        calculated_season = calculate_season_from_month(anime.release_month)
        if calculated_season:
            anime.release_season = calculated_season


# ==========================================
# HELPERS
# ==========================================


def resolve_series_parent_hierarchy(
    db: Session, franchise_id: Any, names: Dict[str, Any]
) -> Any:
    """
    Dynamically resolves the parent Franchise for a Series entry.
    If franchise_id is null: searches for an existing Franchise by name, auto-creates if missing.
    """
    final_franchise_id = franchise_id

    if not final_franchise_id:
        # Consolidate non-empty names
        valid_names = {str(v).strip() for v in names.values() if v and str(v).strip()}

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_romanji.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Series: {final_franchise_id}"
            )
        else:
            # Auto-create the missing Franchise
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Anime",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()  # Flush to assign the ID immediately
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Series: {final_franchise_id}"
            )

    return final_franchise_id


def resolve_anime_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensure grabbing the correct UUID for the parent entities or create new ones if missing.
    e.g. resolve typing franchise name in franchise_id field.
    1. If franchise is null: searches for an existing one by name, auto-creates if missing.
    2. If series_id is null, it remains null.
    """
    final_franchise_id = franchise_id

    # Resolve Franchise
    if not final_franchise_id:
        search_conditions = []
        valid_names = set()

        for lang_key in ["en", "cn", "romanji", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        for name_str in valid_names:
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


# ==========================================
# SYSTEM OPTION SYNC
# ==========================================

_SYSTEM_OPTION_FIELD_MAP = {
    "Genre Main": "genre_main",
    "Genre Sub": "genre_sub",
    "Studio": "studio",
    "Distributor TW": "distributor_tw",
    "Director": "director",
    "Producer": "producer",
    "Music / Composer": "music",
}


def extract_system_options_from_anime(db: Session) -> dict:
    """
    Scans all Anime entries for values in system-option-backed fields.
    Any value not already present in the SystemOption table is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    animes = db.query(Anime).all()
    new_options = []

    for category, field in _SYSTEM_OPTION_FIELD_MAP.items():
        for anime in animes:
            raw = getattr(anime, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_anime: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(animes)} entries, created {len(new_options)} missing system options.",
    }
