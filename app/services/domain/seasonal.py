"""Seasonal record creation and count syncing."""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Anime,
    Seasonal,
    UserMediaList,
)

# Imported by module path, not from the package: app.services.domain.__init__
# imports this module, so `from app.services.domain import ...` would cycle.
from app.services.domain.user_list import acting_user_id
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
    Seasonal from the admin's user_media_list rows. Always overwrites existing counts.
    Only considers airing_type in TV, ONA, Movie, Special.
    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused.
    Dropped  = Temp Dropped | Dropped.

    The status comes from user_media_list, not from anime.watching_status: the
    personal columns are moving off the detail tables, and that column is about
    to be dropped. Scoped to the admin because step 1 has exactly one user and
    these counts are that person's, not the catalogue's - an entry nobody has
    touched has no list row and belongs in no bucket. Step 3 widens this across
    users and moves the primary key to (user_id, seasonal).
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

    user_id = acting_user_id(db, None)
    if user_id is None:
        # No admin, so no list rows to count: leave every counter at zero.
        db.commit()
        return

    # An INNER join: an entry with no list row is in none of the four sets,
    # which is the same answer the old code gave for "Might Watch".
    rows = (
        db.query(
            Anime.release_season,
            Anime.release_date,
            UserMediaList.status,
        )
        .join(UserMediaList, UserMediaList.media_id == Anime.system_id)
        .filter(
            UserMediaList.user_id == user_id,
            Anime.release_season.isnot(None),
            Anime.release_date.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for release_season, release_date, status in rows:
        key = f"{release_season} {str(release_date)[:4]}"
        s = seasonal_map.get(key)
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
