"""
tmdb_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
TMDB (The Movie Database) API into the formats required by our database models.
"""

import logging
import re
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"

MONTH_MAP = {
    1: "JAN",
    2: "FEB",
    3: "MAR",
    4: "APR",
    5: "MAY",
    6: "JUN",
    7: "JUL",
    8: "AUG",
    9: "SEP",
    10: "OCT",
    11: "NOV",
    12: "DEC",
}


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_tmdb_date(date_str: Optional[str]) -> Optional[str]:
    """
    Converts TMDB's ISO date string to our "MON YYYY" format.
    e.g. "2008-07-18" -> "JUL 2008", "2008" -> "2008"
    """
    if not date_str:
        return None
    try:
        parts = date_str.split("-")
        year = parts[0]
        if len(parts) >= 2:
            month = MONTH_MAP.get(int(parts[1]))
            if month:
                return f"{month} {year}"
        return year or None
    except (ValueError, IndexError):
        return None


def _build_poster_url(poster_path: Optional[str]) -> Optional[str]:
    if not poster_path:
        return None
    return f"{TMDB_IMAGE_BASE_URL}{poster_path}"


def _extract_director(crew: List[Dict[str, Any]]) -> Optional[str]:
    """Returns the name of the first crew member with job 'Director'."""
    for member in crew:
        if member.get("job") == "Director":
            return member.get("name")
    return None


# ==========================================
# MASTER ORCHESTRATORS
# ==========================================


def map_tmdb_to_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw TMDB movie JSON (with credits appended) into the flat dict
    expected by the Movies model.
    """
    crew = raw_data.get("credits", {}).get("crew", [])

    return {
        "length_min": raw_data.get("runtime"),
        "release_date_usa": _convert_tmdb_date(raw_data.get("release_date")),
        "director": _extract_director(crew),
        "cover_image_url": _build_poster_url(raw_data.get("poster_path")),
    }


def map_tmdb_to_tv_show_data(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Maps TMDB season details response to a flat dict.
    Private keys (_season_air_date, _episodes) are used only for airing status derivation.
    """
    episodes = raw.get("episodes") or []
    return {
        "release_date": _convert_tmdb_date(raw.get("air_date")),
        "ep_total": len(episodes),
        "cover_image_url": _build_poster_url(raw.get("poster_path")),
        "_season_air_date": raw.get("air_date"),
        "_episodes": episodes,
    }


def map_tmdb_to_cartoon_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw TMDB TV JSON into the flat dict expected by the Cartoons model.
    """
    return {
        "release_date": _convert_tmdb_date(raw_data.get("first_air_date")),
        "cover_image_url": _build_poster_url(raw_data.get("poster_path")),
    }
