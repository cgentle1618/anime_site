"""
jikan_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
Jikan (MyAnimeList) API into the formats required by our Anime database model.
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

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

ALLOWED_AIRING_TYPES = {"TV", "Movie", "ONA", "OVA", "Special"}

SEASON_MAP = {
    "winter": "WIN",
    "spring": "SPR",
    "summer": "SUM",
    "fall": "FAL",
}


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_airing_type(jikan_type: Optional[str]) -> Optional[str]:
    """
    Converts Jikan 'type' to our internal Airing Type.
    Falls back to 'Other' if the type is unrecognized.
    """
    if not jikan_type:
        return None
    if jikan_type in ALLOWED_AIRING_TYPES:
        return jikan_type
    return "Other"


def _convert_airing_status(jikan_status: Optional[str]) -> Optional[str]:
    """
    Normalizes Jikan's specific phrasing into strict database terminology.
    """
    if not jikan_status:
        return None

    lower_status = jikan_status.lower()
    if "finished" in lower_status:
        return "Finished Airing"
    if "currently" in lower_status:
        return "Airing"
    if "not yet" in lower_status:
        return "Not Yet Aired"

    return None


def _convert_season(jikan_season: Optional[str]) -> Optional[str]:
    """
    Maps lowercase season strings to 3-letter uppercase abbreviations.
    """
    if not jikan_season:
        return None
    return SEASON_MAP.get(jikan_season.lower())


def _extract_date_parts(
    date_iso: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Parses Jikan's ISO 8601 date string.
    Returns discrete Year, Month, and full Date strings.
    """
    if not date_iso:
        return None, None, None

    try:
        # Standardize the 'Z' UTC suffix to +00:00 for Python's fromisoformat
        dt = datetime.fromisoformat(date_iso.replace("Z", "+00:00"))
        release_year = str(dt.year)
        release_month = MONTH_MAP.get(dt.month)
        release_date = dt.strftime("%Y-%m-%d")
        return release_year, release_month, release_date
    except (ValueError, TypeError):
        return None, None, None


def _extract_external_links(
    external_links: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Iterates through the API's external links array.
    Safely extracts the Official Site and the first Twitter/X URL found.
    """
    official_link = None
    twitter_link = None

    for link in external_links:
        url = link.get("url", "")
        name = link.get("name", "").lower()

        if "official" in name and not official_link:
            official_link = url

        if ("twitter.com" in url or "x.com" in url) and not twitter_link:
            twitter_link = url

    return official_link, twitter_link


# ==========================================
# MASTER ORCHESTRATOR
# ==========================================


def map_jikan_to_anime_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Master orchestration function to parse raw Jikan JSON data and flatten it
    into the standardized dictionary format expected by PostgreSQL.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))

    # aired.prop.from.month is unreliable: Jikan defaults it to 1 (January) when
    # MAL only knows the year. The aired.string field is honest — "2026 to ?" means
    # year-only, while "Jan 2026 to ?" means the month is actually known.
    aired = raw_data.get("aired") or {}
    aired_string = aired.get("string") or ""
    prop_from = (aired.get("prop") or {}).get("from") or {}
    prop_year = prop_from.get("year")
    prop_month = prop_from.get("month")
    release_year = str(prop_year) if prop_year else None
    month_is_known = prop_month and not re.match(r"^\d{4}", aired_string)
    release_month = MONTH_MAP.get(prop_month) if month_is_known else None
    release_season = _convert_season(raw_data.get("season"))

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    external_links = raw_data.get("external", [])
    official_link, twitter_link = _extract_external_links(external_links)

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "airing_type": airing_type,
        "airing_status": airing_status,
        "release_season": release_season,
        "release_year": release_year,
        "release_month": release_month,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "ep_total": raw_data.get("episodes"),
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }


def map_jikan_to_anime_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw Jikan JSON into the flat dict expected by AnimeMovies.
    Differs from map_jikan_to_anime_data: returns release_date_jp (YYYY-MM-DD),
    no season fields.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))

    aired_from = raw_data.get("aired", {}).get("from")
    _, _, release_date_jp = _extract_date_parts(aired_from)

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    external_links = raw_data.get("external", [])
    official_link, twitter_link = _extract_external_links(external_links)

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "airing_type": airing_type,
        "airing_status": airing_status,
        "release_date_jp": release_date_jp,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "ep_total": raw_data.get("episodes"),
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }


def map_jikan_to_manga_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Jikan manga data dict into a flat dict for the Manga model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    from_date = published.get("from")
    to_date = published.get("to")

    release_year = None
    end_year = None
    if from_date:
        try:
            release_year = str(from_date[:4])
        except Exception:
            pass
    if to_date:
        try:
            end_year = str(to_date[:4])
        except Exception:
            pass

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "serialization_status": serialization_status,
        "release_year": release_year,
        "end_year": end_year,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total": raw_data.get("volumes"),
        "ch_total": raw_data.get("chapters"),
        "cover_image_url": cover_image_url,
    }


def map_jikan_to_novel_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Jikan manga data dict into a flat dict for the Novel model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
        "Not yet published": "未出",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    from_date = published.get("from")
    to_date = published.get("to")

    release_year = None
    end_year = None
    if from_date:
        try:
            release_year = int(from_date[:4])
        except Exception:
            pass
    if to_date:
        try:
            end_year = int(to_date[:4])
        except Exception:
            pass

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    volumes_raw = raw_data.get("volumes")
    vol_total_original = float(volumes_raw) if volumes_raw is not None else None

    chapters_raw = raw_data.get("chapters")
    ch_total = float(chapters_raw) if chapters_raw is not None else None

    return {
        "serialization_status": serialization_status,
        "release_year": release_year,
        "end_year": end_year,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total_original": vol_total_original,
        "ch_total": ch_total,
        "cover_image_url": cover_image_url,
    }
