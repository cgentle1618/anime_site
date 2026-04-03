"""
utils.py
Domain-agnostic utility functions.
Handles pure math, date logic, and regex string parsing.
Must NOT import from models or schemas to prevent circular imports.
"""

import re
from typing import Optional, Tuple


# ==========================================
# GOOGLE SHEETS HEADERS
# ==========================================

FRANCHISE_HEADERS = [
    "system_id",
    "franchise_type",
    "franchise_name_en",
    "franchise_name_cn",
    "franchise_name_romanji",
    "franchise_name_jp",
    "franchise_name_alt",
    "my_rating",
    "franchise_expectation",
    "favorite_3x3_slot",
    "remark",
    "created_at",
    "updated_at",
]

SERIES_HEADERS = [
    "system_id",
    "franchise_id",
    "series_name_en",
    "series_name_cn",
    "series_name_alt",
]

ANIME_HEADERS = [
    "system_id",
    "franchise_id",
    "series_id",
    "anime_name_en",
    "anime_name_cn",
    "anime_name_romanji",
    "anime_name_jp",
    "anime_name_alt",
    "airing_type",
    "watching_status",
    "airing_status",
    "ep_total",
    "ep_fin",
    "ep_previous",
    "ep_special",
    "season_part",
    "my_rating",
    "is_main",
    "release_month",
    "release_season",
    "release_year",
    "studio",
    "director",
    "producer",
    "music",
    "distributor_tw",
    "genre_main",
    "genre_sub",
    "prequel_id",
    "sequel_id",
    "alternative",
    "watch_order",
    "remark",
    "official_link",
    "twitter_link",
    "mal_id",
    "mal_link",
    "mal_rating",
    "mal_rank",
    "anilist_link",
    "anilist_rating",
    "op",
    "ed",
    "insert_ost",
    "seiyuu",
    "source_baha",
    "baha_link",
    "source_other",
    "source_other_link",
    "source_netflix",
    "cover_image_file",
    "created_at",
    "updated_at",
]

SYSTEM_OPTIONS_HEADERS = ["id", "category", "option_value"]


# ==========================================
# UTILITY FUNCTIONS
# ==========================================


def extract_mal_id(mal_link: str) -> Optional[int]:
    """
    Extracts the MyAnimeList (MAL) ID from a standard MAL URL.
    Example: 'https://myanimelist.net/anime/5114/...' -> 5114
    """
    if not mal_link:
        return None

    match = re.search(r"myanimelist\.net/anime/(\d+)", str(mal_link))
    if match:
        return int(match.group(1))

    return None


def validate_episode_math(
    ep_total: Optional[int], ep_fin: Optional[int]
) -> Tuple[Optional[int], Optional[int]]:
    """
    Strict validation for episode counts.
    - Neither can be less than 0.
    - ep_fin cannot exceed ep_total (if ep_total is known).
    Returns the corrected (ep_total, ep_fin) tuple.
    """
    # Ensure they aren't negative
    safe_total = max(0, ep_total) if ep_total is not None else None
    safe_fin = max(0, ep_fin) if ep_fin is not None else 0

    # Cap finished episodes at total episodes if total is known
    if safe_total is not None and safe_fin > safe_total:
        safe_fin = safe_total

    return safe_total, safe_fin


def calculate_season_from_month(month_str: str) -> Optional[str]:
    """
    Infers the standard anime broadcasting season based on the release month.
    Accepts string representations (e.g., "JAN", "01", "1").
    """
    if not month_str:
        return None

    val = str(month_str).upper()

    winter = {"JAN", "FEB", "MAR", "1", "01", "2", "02", "3", "03"}
    spring = {"APR", "MAY", "JUN", "4", "04", "5", "05", "6", "06"}
    summer = {"JUL", "AUG", "SEP", "7", "07", "8", "08", "9", "09"}
    fall = {"OCT", "NOV", "DEC", "10", "11", "12"}

    if val in winter:
        return "WIN"
    if val in spring:
        return "SPR"
    if val in summer:
        return "SUM"
    if val in fall:
        return "FAL"

    return None


def extract_season_from_title(title: str) -> Optional[str]:
    """
    Extracts season numbers from standard English titles.
    Example: 'Attack on Titan Season 2' -> 'Season 2'
    """
    if not title:
        return None

    match = re.search(r"(Season\s\d+|S\d+)", str(title), re.IGNORECASE)
    if match:
        # Standardize "S2" to "Season 2"
        val = match.group(1).upper()
        if val.startswith("S") and not val.startswith("SEASON"):
            return f"Season {val[1:]}"
        return match.group(1).title()

    return None
