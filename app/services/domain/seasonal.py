"""Seasonal record creation and count syncing."""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Anime,
    Seasonal,
)
from app.utils.constants import (
    COMPLETED_WATCH_STATUSES,
    AnimeAiringType,
    WatchStatus,
)

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
    Scans the Anime table for unique combinations of release_season and the year
    prefix of release_date.
    Creates a new entry in the Seasonal table (e.g., 'WIN 2026') if it does not already exist.
    """
    year_expr = func.substr(Anime.release_date, 1, 4)
    unique_combinations = (
        db.query(Anime.release_season, year_expr)
        .filter(Anime.release_season.isnot(None), Anime.release_date.isnot(None))
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
            Anime.release_date.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for anime in animes:
        key = f"{anime.release_season} {str(anime.release_date)[:4]}"
        s = seasonal_map.get(key)
        if not s:
            continue
        if anime.watching_status in COMPLETED_WATCH_STATUSES:
            s.entry_completed += 1
        elif anime.watching_status in _PLANNED_STATUSES:
            s.entry_planned += 1
        elif anime.watching_status in _WATCHING_STATUSES:
            s.entry_watching += 1
        elif anime.watching_status in _DROPPED_STATUSES:
            s.entry_dropped += 1

    db.commit()
