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
MAL_ID_PATTERN = re.compile(r"myanimelist\.net/anime/(\d+)")
MAL_MANGA_ID_PATTERN = re.compile(r"myanimelist\.net/manga/(\d+)")
# A studio lives under /anime/producer/<id>/<slug>, so MAL_ID_PATTERN above
# cannot match it ("producer" is not digits) and this one cannot match a
# plain anime link. The two never poach each other.
MAL_PRODUCER_ID_PATTERN = re.compile(r"myanimelist\.net/anime/producer/(\d+)")
IMDB_ID_PATTERN = re.compile(r"imdb\.com/title/tt(\d+)")
SEASON_PART_PATTERN = re.compile(r"(?i)(season\s*\d+|part\s*\d+|cour\s*\d+)")
SEASON_PATTERN = re.compile(r"season\s*(\d+)", re.IGNORECASE)
PART_PATTERN = re.compile(r"part\s*(\d+)", re.IGNORECASE)

# ==========================================
# CONSTANTS & MAPPINGS & CONFIGURATIONS
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

# Column fields only. official_link and twitter_link used to be listed here;
# Fill writes them as media_source reference rows now and the columns are
# being dropped, so naming them would make getattr() return None forever and
# mark every anime "needs Fill" on every run - the same trap the comment
# below MOVIE_FIELDS_TO_FILL describes.
ANIME_FIELDS_TO_FILL = [
    "airing_type",
    "airing_status",
    "release_date",
    "release_season",
    "mal_rating",
    "mal_rank",
    "ep_total",
    "cover_image_file",
]

# What the Tenrai producers endpoint can supply for a studio. my_rating,
# country and defunct_date are absent on purpose: MAL reports none of them.
STUDIO_FIELDS_TO_FILL = [
    "mal_link",
    "founded_date",
    "name_jp",
    "website_url",
    "logo_file",
]

ANIME_MOVIE_FIELDS_TO_FILL = [
    "airing_status",
    "release_date_jp",
    "mal_rating",
    "mal_rank",
    "cover_image_file",
]

# Column fields only. Credit/tag links (director) are checked separately via
# MOVIE_LINK_FIELDS_TO_FILL - naming a dropped column here made every movie
# "missing" on every Fill run.
MOVIE_FIELDS_TO_FILL = [
    "length_min",
    "airing_status",
    "release_date_usa",
    "imdb_rating",
    "cover_image_file",
]

TV_SHOW_FIELDS_TO_FILL = [
    "airing_status",
    "release_date",
    "imdb_rating",
    "ep_total",
    "cover_image_file",
]

CARTOON_TV_FIELDS_TO_FILL = [
    "airing_status",
    "release_date",
    "imdb_rating",
    "ep_total",
    "cover_image_file",
]

CARTOON_MOVIE_FIELDS_TO_FILL = [
    "airing_status",
    "release_date",
    "imdb_rating",
    "cover_image_file",
]

MANGA_FIELDS_TO_FILL = [
    "serialization_status",
    "release_date",
    "end_date",
    "mal_rating",
    "mal_rank",
    "cover_image_file",
]

NOVEL_FIELDS_TO_FILL = [
    "serialization_status",
    "release_date",
    "end_date",
    "mal_rating",
    "mal_rank",
    "cover_image_file",
]

# Only what Open Library actually returns for a work. serialization_status,
# end_date, mal_rating and mal_rank are in NOVEL_FIELDS_TO_FILL but have no
# Open Library equivalent, so listing them here would leave every entry
# permanently "needs filling" and re-request it on every run.
NOVEL_OPENLIBRARY_FIELDS_TO_FILL = [
    "release_date",
    "cover_image_file",
]

NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL = [("credit", "author")]

# Only the fields Comic Vine actually returns for a volume. imprint, continuity,
# era, events, end_date and publisher_tw are deliberately excluded: Comic Vine
# models none of them, so listing them here would leave every entry permanently
# "needs filling" and re-request it on every run.
# (kind, key) pairs resolved through media_credit / media_tag.
MOVIE_LINK_FIELDS_TO_FILL = [("credit", "director")]
COMIC_LINK_FIELDS_TO_FILL = [
    ("credit", "author"),
    ("credit", "illustrator"),
    ("tag", "comic_publisher"),
]

COMIC_FIELDS_TO_FILL = [
    "release_date",
    "issue_total",
    "cover_image_file",
]

# ==========================================
# VALIDATION
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


def validate_vol_math(vol_total: Any, vol_fin: Any) -> Tuple[Optional[int], int]:
    """Sanitizes volume inputs and clamps vol_fin <= vol_total."""
    try:
        safe_total = int(float(vol_total)) if vol_total not in (None, "") else None
    except (ValueError, TypeError):
        safe_total = None

    try:
        safe_fin = int(float(vol_fin)) if vol_fin not in (None, "") else 0
    except (ValueError, TypeError):
        safe_fin = 0

    if safe_total is not None and safe_total < 0:
        safe_total = 0
    if safe_fin < 0:
        safe_fin = 0

    if safe_total is not None and safe_fin > safe_total:
        safe_fin = safe_total

    return safe_total, safe_fin


def validate_ch_math(ch_total: Any, ch_fin: Any) -> Tuple[Optional[int], int]:
    """Sanitizes chapter inputs and clamps ch_fin <= ch_total."""
    try:
        safe_total = int(float(ch_total)) if ch_total not in (None, "") else None
    except (ValueError, TypeError):
        safe_total = None

    try:
        safe_fin = int(float(ch_fin)) if ch_fin not in (None, "") else 0
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
# Data Extraction & Transformation
# ==========================================


def extract_imdb_id(url: str) -> Optional[str]:
    """
    Extracts the IMDb ID (e.g. 'tt1234567') from a standard IMDb URL.
    Returns None if the URL is invalid or the ID cannot be found.
    """
    if not url:
        return None
    match = IMDB_ID_PATTERN.search(url)
    if match:
        return f"tt{match.group(1)}"
    return None


def extract_mal_id_manga_novel(url: str) -> Optional[int]:
    """
    Extracts the numeric ID from a standard MyAnimeList manga URL.
    Returns None if the URL is invalid or the ID cannot be found.
    """
    if not url:
        return None
    match = MAL_MANGA_ID_PATTERN.search(url)
    if match:
        return int(match.group(1))
    return None


def extract_mal_id_producer(url: str) -> Optional[int]:
    """
    Extracts the numeric ID from a MyAnimeList producer (studio) URL, e.g.
    https://myanimelist.net/anime/producer/56/A-1_Pictures -> 56.
    Returns None if the URL is invalid or the ID cannot be found.
    """
    if not url:
        return None

    match = MAL_PRODUCER_ID_PATTERN.search(url)
    if match:
        return int(match.group(1))

    return None


def extract_mal_id_anime(url: str) -> Optional[int]:
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


def calculate_seasonal_from_month(month_str: str) -> Optional[str]:
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
