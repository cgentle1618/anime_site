from datetime import date
import logging
import re
from typing import Any, Dict, Optional

from utils.omdb_utils import map_omdb_to_movie_data, map_omdb_to_tv_show_data
from utils.tmdb_utils import (
    map_tmdb_to_movie_data,
    map_tmdb_to_tv_show_data,
    _build_poster_url,
)

logger = logging.getLogger(__name__)


def _parse_season_number(season_part: Optional[str]) -> int:
    """Extracts season number from 'Season N' string. Defaults to 1."""
    if not season_part:
        return 1
    match = re.search(r"Season\s+(\d+)", season_part, re.IGNORECASE)
    return int(match.group(1)) if match else 1


def _derive_tv_season_airing_status(
    season_air_date: str | None, episodes: list | None
) -> str | None:
    """
    Derives airing_status from TMDB season air date and episode list.
    Returns None if air date is missing or unparseable.
    """
    if not season_air_date:
        return None
    try:
        air_date = date.fromisoformat(season_air_date)
    except (ValueError, TypeError):
        return None

    today = date.today()
    if air_date > today:
        return "Not Yet Aired"

    if not episodes:
        return "Airing"

    for ep in episodes:
        ep_air_date_str = ep.get("air_date")
        if not ep_air_date_str:
            return "Airing"
        try:
            ep_date = date.fromisoformat(ep_air_date_str)
        except (ValueError, TypeError):
            return "Airing"
        if ep_date > today:
            return "Airing"

    return "Finished Airing"


def map_imdb_to_movie_data(
    tmdb_raw: Optional[Dict[str, Any]], omdb_raw: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Merges TMDB and OMDb mapped data for a Movies entry.
    OMDb overwrites on key conflict (only imdb_rating overlaps).
    """
    merged: Dict[str, Any] = {}

    if tmdb_raw is not None:
        merged.update(map_tmdb_to_movie_data(tmdb_raw))

    if omdb_raw is not None:
        merged.update(map_omdb_to_movie_data(omdb_raw))

    return merged


def map_imdb_to_tv_show_data(
    tmdb_raw: Optional[Dict[str, Any]],
    tmdb_season_raw: Optional[Dict[str, Any]],
    omdb_raw: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Merges show-level TMDB, season-level TMDB, and OMDb data for a TVShows entry.
    Season data takes precedence for cover/release/ep_total; show-level poster is fallback.
    """
    merged: Dict[str, Any] = {}

    if tmdb_season_raw is not None:
        merged.update(map_tmdb_to_tv_show_data(tmdb_season_raw))

    if merged.get("cover_image_url") is None and tmdb_raw is not None:
        fallback_url = _build_poster_url(tmdb_raw.get("poster_path"))
        if fallback_url:
            merged["cover_image_url"] = fallback_url

    if omdb_raw is not None:
        merged.update(map_omdb_to_tv_show_data(omdb_raw))

    return merged
