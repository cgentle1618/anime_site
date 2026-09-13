"""Seasonal record creation and count syncing."""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Anime,
    Media,
    Seasonal,
    User,
    UserMediaList,
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
    Ensure every user has a row for every season the catalogue mentions.

    The seasons are a CATALOGUE fact - they come from anime.release_season and
    the year prefix of anime.release_date - but a seasonal row is a PER-USER
    fact, so it is the cross product that has to exist. A user with nothing in
    that season gets a row of zeroes, which is what the Seasonal page shows.
    """
    year_expr = func.substr(Anime.release_date, 1, 4)
    unique_combinations = (
        db.query(Anime.release_season, year_expr)
        .filter(Anime.release_season.isnot(None), Anime.release_date.isnot(None))
        .distinct()
        .all()
    )
    seasons = {f"{season} {year}" for season, year in unique_combinations}
    if not seasons:
        logger.info("No new seasonal entries needed to be created.")
        return

    user_ids = [row[0] for row in db.query(User.id).all()]
    existing = {
        (row[0], row[1])
        for row in db.query(Seasonal.user_id, Seasonal.seasonal).all()
    }

    new_seasonals_added = 0
    for user_id in user_ids:
        for seasonal_string in seasons:
            if (user_id, seasonal_string) in existing:
                continue
            db.add(Seasonal(user_id=user_id, seasonal=seasonal_string))
            new_seasonals_added += 1

    if new_seasonals_added > 0:
        db.commit()
        logger.info(f"Auto-created {new_seasonals_added} new seasonal entries.")
    else:
        logger.info("No new seasonal entries needed to be created.")


def sync_seasonal_counts(db: Session) -> None:
    """
    Recompute entry_planned / entry_completed / entry_watching / entry_dropped
    for every seasonal row, from THAT ROW'S USER's list. Always overwrites.

    Only anime whose airing_type is TV, ONA, Movie or Special count.
    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused
    Dropped  = Temp Dropped | Dropped

    The status comes from user_media_list, not from anime: Step 1 moved the
    personal columns off the catalogue tables, and a per-user count cannot be
    read from a shared row.
    """
    seasonals = db.query(Seasonal).all()
    if not seasonals:
        return

    seasonal_map = {(s.user_id, s.seasonal): s for s in seasonals}

    for s in seasonals:
        s.entry_planned = 0
        s.entry_completed = 0
        s.entry_watching = 0
        s.entry_dropped = 0

    rows = (
        db.query(
            UserMediaList.user_id,
            UserMediaList.status,
            Anime.release_season,
            Anime.release_date,
        )
        .join(Media, Media.system_id == UserMediaList.media_id)
        .join(Anime, Anime.system_id == Media.system_id)
        .filter(
            Media.media_type == "anime",
            Anime.release_season.isnot(None),
            Anime.release_date.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for user_id, status, release_season, release_date in rows:
        s = seasonal_map.get((user_id, f"{release_season} {str(release_date)[:4]}"))
        if not s:
            continue
        if status in COMPLETED_WATCH_STATUSES:
            s.entry_completed += 1
        elif status in _PLANNED_STATUSES:
            s.entry_planned += 1
        elif status in _WATCHING_STATUSES:
            s.entry_watching += 1
        elif status in _DROPPED_STATUSES:
            s.entry_dropped += 1

    db.commit()
