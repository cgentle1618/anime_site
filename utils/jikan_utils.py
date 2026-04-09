"""
jikan_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
Jikan (MyAnimeList) API into the formats required by our Anime database model.
"""

import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

# Mapping for V2 strict month format (can be adjusted if you prefer "01", "02", etc.)
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


def _convert_airing_type(jikan_type: Optional[str]) -> Optional[str]:
    """
    Converts Jikan "type" to our internal Airing Type.
    Rules: "TV", "Movie", "ONA", "OVA", "Special" remain. Others -> "Other". Null -> Null.
    """
    if not jikan_type:
        return None

    allowed_types = {"TV", "Movie", "ONA", "OVA", "Special"}
    if jikan_type in allowed_types:
        return jikan_type
    return "Other"


def _convert_airing_status(jikan_status: Optional[str]) -> Optional[str]:
    """
    Converts Jikan "status" to our internal Airing Status.
    """
    if not jikan_status:
        return None

    if jikan_status == "Not yet aired":
        return "Not Yet Aired"
    elif jikan_status == "currently airing":
        return "Airing"
    elif jikan_status == "Finished Airing":
        return "Finished Airing"

    return jikan_status


def _convert_season(jikan_season: Optional[str]) -> Optional[str]:
    """
    Converts Jikan "season" to our internal Release Season.
    """
    if not jikan_season:
        return None

    season_map = {"winter": "WIN", "spring": "SPR", "summer": "SUM", "fall": "FAL"}
    return season_map.get(jikan_season.lower(), None)


def _extract_date_parts(
    aired_from: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extracts year, month, and full JP date from Jikan's ISO 8601 date string.
    Returns: (release_year, release_month, release_date_jp)
    """
    if not aired_from:
        return None, None, None

    try:
        # Jikan returns ISO 8601 strings: "2009-04-05T00:00:00+00:00"
        dt = datetime.fromisoformat(aired_from.replace("Z", "+00:00"))

        release_year = str(dt.year)
        release_month = MONTH_MAP.get(dt.month)
        release_date_jp = dt.strftime("%Y-%m-%d")  # Format as YYYY-MM-DD

        return release_year, release_month, release_date_jp
    except (ValueError, TypeError):
        logger.warning(f"Malformed date string from Jikan: {aired_from}")
        return None, None, None


def _extract_external_links(external_list: list) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts Official Link and Twitter Link from Jikan's external links array.
    Returns: (official_link, twitter_link)
    """
    official_link = None
    twitter_link = None

    for link_obj in external_list:
        name = link_obj.get("name", "").lower()
        url = link_obj.get("url")

        if "official site" in name and not official_link:
            official_link = url
        elif "twitter" in name or "x.com" in url:
            twitter_link = url

    return official_link, twitter_link


def extract_mal_anime_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Master function to map raw Jikan JSON data directly to our Anime model columns.
    """
    if not raw_data:
        return {}

    # 1. Base Stats
    ep_total = raw_data.get("episodes")
    mal_rating = raw_data.get("score")

    # mal_rank must be a string. Handle cases where rank is an int, or None.
    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    # 2. Conversions
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))
    release_season = _convert_season(raw_data.get("season"))

    # 3. Dates
    aired_from = raw_data.get("aired", {}).get("from")
    release_year, release_month, release_date_jp = _extract_date_parts(aired_from)

    # 4. Links
    external_links = raw_data.get("external", [])
    official_link, twitter_link = _extract_external_links(external_links)

    # 5. Cover Image
    images = raw_data.get("images", {})
    # Prefer webp large, fallback to jpg large, fallback to default
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    return {
        "airing_type": airing_type,
        "airing_status": airing_status,
        "release_month": release_month,
        "release_season": release_season,
        "release_year": release_year,
        "release_date_jp": release_date_jp,
        "mal_rating": mal_rating,
        "mal_rank": mal_rank,
        "ep_total": ep_total,
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }
