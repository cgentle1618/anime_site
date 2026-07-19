"""Seasonal record creation and count syncing."""

import logging
import uuid
from datetime import date
from typing import Any, Dict, Optional, Tuple, Union

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Manga,
    Novel,
    Movies,
    TVShows,
    Franchise,
    Series,
    Seasonal,
    SystemOption,
)

from app.utils.utils import (
    SEASON_PATTERN,
    PART_PATTERN,
    ANIME_FIELDS_TO_FILL,
    ANIME_MOVIE_FIELDS_TO_FILL,
    CARTOON_TV_FIELDS_TO_FILL,
    CARTOON_MOVIE_FIELDS_TO_FILL,
    MANGA_FIELDS_TO_FILL,
    NOVEL_FIELDS_TO_FILL,
    MOVIE_FIELDS_TO_FILL,
    TV_SHOW_FIELDS_TO_FILL,
    extract_mal_id_anime,
    extract_mal_id_manga_novel,
    extract_imdb_id,
    extract_season_from_title,
    calculate_seasonal_from_month,
    validate_episode_math,
    validate_vol_math,
    validate_ch_math,
)
from app.utils.constants import AnimeAiringType, FranchiseType, WatchStatus

logger = logging.getLogger(__name__)


_PLANNED_STATUSES = {WatchStatus.PLAN_TO_WATCH, WatchStatus.WATCH_WHEN_AIRS}
_WATCHING_STATUSES = {
    WatchStatus.ACTIVE_WATCHING,
    WatchStatus.PASSIVE_WATCHING,
    WatchStatus.PAUSED,
}
_DROPPED_STATUSES = {WatchStatus.TEMP_DROPPED, WatchStatus.DROPPED}
_SEASONAL_AIRING_TYPES = {
    AnimeAiringType.TV,
    AnimeAiringType.ONA,
    AnimeAiringType.MOVIE,
    AnimeAiringType.SPECIAL,
}



def create_missing_seasonal(db: Session) -> None:
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


def sync_seasonal_counts(db: Session) -> None:
    """
    Recomputes entry_planned, entry_completed, entry_watching, and entry_dropped for every
    Seasonal by scanning linked Anime entries. Always overwrites existing counts.
    Only considers airing_type in TV, ONA, Movie, Special.
    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused.
    Dropped  = Temp Dropped | Dropped.
    """
    seasonals = db.query(Seasonal).all()
    if not seasonals:
        return

    seasonal_map = {s.seasonal: s for s in seasonals}

    for s in seasonals:
        s.entry_planned = 0
        s.entry_completed = 0
        s.entry_watching = 0
        s.entry_dropped = 0

    animes = (
        db.query(Anime)
        .filter(
            Anime.release_season.isnot(None),
            Anime.release_year.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for anime in animes:
        key = f"{anime.release_season} {anime.release_year}"
        s = seasonal_map.get(key)
        if not s:
            continue
        if anime.watching_status == "Completed":
            s.entry_completed += 1
        elif anime.watching_status in _PLANNED_STATUSES:
            s.entry_planned += 1
        elif anime.watching_status in _WATCHING_STATUSES:
            s.entry_watching += 1
        elif anime.watching_status in _DROPPED_STATUSES:
            s.entry_dropped += 1

    db.commit()
