"""
utils.py
Domain-agnostic utility functions.
Handles pure math, date logic, and regex string parsing.
Must NOT import from models or schemas to prevent circular imports.
"""

import re
from typing import Any, Optional, Tuple

# ==========================================
# PRE-COMPILED REGEX PATTERNS
# ==========================================
# Compiling at the module level improves performance during bulk pipeline operations.
MAL_ID_PATTERN = re.compile(r"myanimelist\.net/anime/(\d+)")
SEASON_PART_PATTERN = re.compile(r"(?i)(season\s*\d+|part\s*\d+|cour\s*\d+)")


# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

MONTH_MAP = {
    "JAN": "01",
    "FEB": "02",
    "MAR": "03",
    "APR": "04",
    "MAY": "05",
    "JUN": "06",
    "JUL": "07",
    "AUG": "08",
    "SEP": "09",
    "OCT": "10",
    "NOV": "11",
    "DEC": "12",
}

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
    "season_part",
    "airing_type",
    "airing_status",
    "watching_status",
    "is_main",
    "ep_previous",
    "ep_total",
    "ep_fin",
    "ep_special",
    "my_rating",
    "mal_rating",
    "mal_rank",
    "anilist_rating",
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
    "mal_id",
    "mal_link",
    "anilist_link",
    "official_link",
    "twitter_link",
    "op",
    "ed",
    "insert_ost",
    "source_baha",
    "baha_link",
    "source_netflix",
    "source_other",
    "source_other_link",
    "remark",
    "cover_image_file",
    "created_at",
    "updated_at",
]

SYSTEM_OPTIONS_HEADERS = ["id", "category", "option_value"]


# ==========================================
# MATH & DATA VALIDATION
# ==========================================


def validate_episode_math(ep_total: Any, ep_fin: Any) -> Tuple[Optional[int], int]:
    """
    Sanitizes episode inputs and enforces logical bounds.
    Ensures finished episodes do not fall below zero or exceed total episodes.
    """
    try:
        safe_total = int(float(ep_total)) if ep_total not in (None, "", "?") else None
    except (ValueError, TypeError):
        safe_total = None

    try:
        safe_fin = int(float(ep_fin)) if ep_fin not in (None, "") else 0
    except (ValueError, TypeError):
        safe_fin = 0

    if safe_total is not None and safe_total < 0:
        safe_total = 0
    if safe_fin < 0:
        safe_fin = 0

    if safe_total is not None and safe_fin > safe_total:
        safe_fin = safe_total

    return safe_total, safe_fin


# ==========================================
# DATE & STRING PARSING
# ==========================================


def calculate_season_from_month(month_str: str) -> Optional[str]:
    """
    Infers the standard anime broadcasting season based on the release month.
    Accepts string abbreviations or numeric strings.
    """
    if not month_str:
        return None

    val = str(month_str).upper()

    if val in {"JAN", "FEB", "MAR", "1", "01", "2", "02", "3", "03"}:
        return "WIN"
    if val in {"APR", "MAY", "JUN", "4", "04", "5", "05", "6", "06"}:
        return "SPR"
    if val in {"JUL", "AUG", "SEP", "7", "07", "8", "08", "9", "09"}:
        return "SUM"
    if val in {"OCT", "NOV", "DEC", "10", "11", "12"}:
        return "FAL"

    return None


def extract_season_from_title(title: str) -> Optional[str]:
    """
    Parses terms like 'Season 2' or 'Part 2' directly from the anime title.
    Returns a normalized, title-cased string.
    """
    if not title:
        return None

    matches = SEASON_PART_PATTERN.findall(title)
    if matches:
        parts = [m.strip().title() for m in matches]
        return " ".join(parts)

    return None


def extract_mal_id(url: str) -> Optional[int]:
    """
    Extracts the numeric ID from a standard MyAnimeList URL.
    Returns None if the URL is invalid or the ID cannot be found.
    """
    if not url:
        return None

    match = MAL_ID_PATTERN.search(url)
    if match:
        return int(match.group(1))

    return None
