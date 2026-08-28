"""
tenrai_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
Tenrai (MyAnimeList) API into the formats required by our Anime database model.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

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


def _convert_airing_type(tenrai_type: Optional[str]) -> Optional[str]:
    """
    Converts Tenrai 'type' to our internal Airing Type.
    Falls back to 'Other' if the type is unrecognized.
    """
    if not tenrai_type:
        return None
    if tenrai_type in ALLOWED_AIRING_TYPES:
        return tenrai_type
    return "Other"


def _convert_airing_status(tenrai_status: Optional[str]) -> Optional[str]:
    """
    Normalizes Tenrai's specific phrasing into strict database terminology.
    """
    if not tenrai_status:
        return None

    lower_status = tenrai_status.lower()
    if "finished" in lower_status:
        return "Finished Airing"
    if "currently" in lower_status:
        return "Airing"
    if "not yet" in lower_status:
        return "Not Yet Aired"

    return None


def _convert_season(tenrai_season: Optional[str]) -> Optional[str]:
    """
    Maps lowercase season strings to 3-letter uppercase abbreviations.
    """
    if not tenrai_season:
        return None
    return SEASON_MAP.get(tenrai_season.lower())


def _iso_from_prop(prop_part: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    A canonical release date from Tenrai's split `published.prop.from` / `.to`
    block, at whatever precision MAL actually knows.

    The sibling ISO timestamp (`published.from`) always carries a day, even when
    MAL only knows the year, so reading `prop` is what keeps us from inventing
    precision. Missing month or day simply stops the string early.
    """
    if not prop_part:
        return None

    year = prop_part.get("year")
    if not year:
        return None

    month = prop_part.get("month")
    if not month:
        return f"{int(year):04d}"

    day = prop_part.get("day")
    if not day:
        return f"{int(year):04d}-{int(month):02d}"

    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


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


def _aired_release_date(aired: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    A canonical release date from Tenrai's `aired` block, at the precision MAL
    actually knows.

    `aired.from` and `aired.prop.from` are both padded: an anime MAL knows only
    the year for still arrives as "2026-01-01T00:00:00+00:00" with
    `prop.from = {day: 1, month: 1, year: 2026}`. Reading either alone would
    record a false 1 January every time. `aired.string` is the honest signal,
    because MAL renders exactly what it knows:

        "Jul 6, 2026 to Sep 28, 2026"  -> day known
        "Jul 2026 to ?"                -> month known, day not
        "2026 to ?"                    -> year only

    So the string decides the precision and `prop` supplies the numbers.
    """
    aired = aired or {}
    prop_from = (aired.get("prop") or {}).get("from") or {}
    year = prop_from.get("year")
    if not year:
        return None

    text = (aired.get("string") or "").strip()
    month = prop_from.get("month")
    day = prop_from.get("day")

    # "Jul 6, 2026 ..." — a month name followed by a day number.
    if month and day and re.match(r"^[A-Za-z]{3,} \d{1,2},", text):
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    # "Jul 2026 ..." — a month name with no day.
    if month and re.match(r"^[A-Za-z]{3,} \d{4}", text):
        return f"{int(year):04d}-{int(month):02d}"

    return f"{int(year):04d}"


# ==========================================
# MASTER ORCHESTRATOR
# ==========================================


def map_tenrai_to_anime_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Master orchestration function to parse raw Tenrai JSON data and flatten it
    into the standardized dictionary format expected by PostgreSQL.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))

    release_date = _aired_release_date(raw_data.get("aired"))
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
        "release_date": release_date,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "ep_total": raw_data.get("episodes"),
        "official_link": official_link,
        "twitter_link": twitter_link,
        "cover_image_url": cover_image_url,
    }


def map_tenrai_to_anime_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw Tenrai JSON into the flat dict expected by AnimeMovies.
    Differs from map_tenrai_to_anime_data: returns release_date_jp instead of
    release_date, and no season fields.
    """
    airing_type = _convert_airing_type(raw_data.get("type"))
    airing_status = _convert_airing_status(raw_data.get("status"))

    release_date_jp = _aired_release_date(raw_data.get("aired"))

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


def map_tenrai_to_manga_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Tenrai manga data dict into a flat dict for the Manga model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    prop = published.get("prop") or {}
    release_date = _iso_from_prop(prop.get("from"))
    end_date = _iso_from_prop(prop.get("to"))

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
        "release_date": release_date,
        "end_date": end_date,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total": raw_data.get("volumes"),
        "ch_total": raw_data.get("chapters"),
        "cover_image_url": cover_image_url,
    }


def map_tenrai_to_novel_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Tenrai manga data dict into a flat dict for the Novel model."""
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
    prop = published.get("prop") or {}
    release_date = _iso_from_prop(prop.get("from"))
    end_date = _iso_from_prop(prop.get("to"))

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
        "release_date": release_date,
        "end_date": end_date,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total_original": vol_total_original,
        "ch_total": ch_total,
        "cover_image_url": cover_image_url,
    }
