"""Completion checks and mark-completed mutations."""

import logging
from typing import Optional, Union

from app.database import get_taipei_now
from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Manga,
    Movies,
    Novel,
    TVShows,
)
from app.utils.constants import (
    COMPLETED_WATCH_STATUSES,
)

logger = logging.getLogger(__name__)


def check_is_tv_completed(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    """
    Determine if a Watching-type entry (Anime, Anime Movie, Movie, TV Show, Cartoon)
    should be considered completed.
    Returns True if watching_status is a completed one or ep_fin equals ep_total.
    """
    if entry.watching_status in COMPLETED_WATCH_STATUSES:
        return True

    ep_total = getattr(entry, "ep_total", None)
    ep_fin = getattr(entry, "ep_fin", None)
    if ep_total is not None and ep_total > 0 and ep_fin == ep_total:
        return True

    return False


def check_is_movie_completed(entry: Union[AnimeMovies, Movies]) -> bool:
    """
    Determine if a Watching-type entry (Anime, Anime Movie, Movie, TV Show, Cartoon)
    should be considered completed.
    Returns True if watching_status is a completed one or ep_fin equals ep_total.
    """
    if entry.watching_status in COMPLETED_WATCH_STATUSES:
        return True

    return False


def check_is_reading_completed(entry: Manga) -> bool:
    """
    Returns True if a manga entry should be considered completed.
    Conditions (any one is sufficient):
    - serialization_status is "完結" or "腰斬"
    - ch_fin == ch_total and ch_total is not None and not 0
    - vol_fin == vol_total and vol_total is not None and not 0
    """
    if entry.serialization_status not in ("完結", "腰斬"):
        return False
    ch_total = getattr(entry, "ch_total", None)
    ch_fin = getattr(entry, "ch_fin", None)
    if ch_total is not None and ch_total > 0 and ch_fin == ch_total:
        return True
    vol_total = getattr(entry, "vol_total", None)
    vol_fin = getattr(entry, "vol_fin", None)
    if vol_total is not None and vol_total > 0 and vol_fin == vol_total:
        return True
    return False



def mark_tv_completed(entry: Union[Anime, Cartoon, TVShows]) -> None:
    """
    Forcefully mutates an TV type (Anime, TV Show, Cartoon) entry's fields to represent a 100% finished state.
    """
    entry.watching_status = "Completed"
    entry.airing_status = "Finished Airing"

    if entry.ep_total is not None:
        entry.ep_fin = entry.ep_total


def mark_movie_completed(entry: Union[AnimeMovies, Movies]) -> None:
    """Mutates an AnimeMovies or Movie entry to represent a fully finished state."""
    entry.watching_status = "Completed"
    entry.airing_status = "Finished Airing"


def mark_reading_completed(entry: Manga) -> None:
    """Sets a manga entry to represent a fully finished reading state."""
    if entry.serialization_status != "腰斬":
        entry.serialization_status = "完結"
    entry.reading_status = "Completed"
    if entry.ch_total:
        entry.ch_fin = entry.ch_total
    if entry.vol_total:
        entry.vol_fin = entry.vol_total
    entry.vol_fin_page = 0


def mark_novel_completed(entry: Novel) -> None:
    """Sets a novel entry to a fully finished reading state."""
    entry.serialization_status = "完結"
    entry.reading_status = "Completed"

    # vol: set all three to the max of the three
    vol_vals = [
        v
        for v in [entry.vol_total_original, entry.vol_total_tw, entry.vol_fin]
        if v is not None
    ]
    if vol_vals:
        vol_max = max(vol_vals)
        entry.vol_fin = vol_max
        if entry.vol_total_original is not None:
            entry.vol_total_original = vol_max
        if entry.vol_total_tw is not None:
            entry.vol_total_tw = vol_max

    # arc: set both to max of the two
    arc_vals = [v for v in [entry.arc_total, entry.arc_fin] if v is not None]
    if arc_vals:
        arc_max = max(arc_vals)
        entry.arc_fin = arc_max
        if entry.arc_total is not None:
            entry.arc_total = arc_max

    # ch: set both to max of the two
    ch_vals = [v for v in [entry.ch_total, entry.ch_fin] if v is not None]
    if ch_vals:
        ch_max = max(ch_vals)
        entry.ch_fin = ch_max
        if entry.ch_total is not None:
            entry.ch_total = ch_max


def mark_comic_completed(entry: Comic) -> None:
    """Sets a comic entry to a fully finished reading state."""
    entry.serialization_status = "完結"
    entry.reading_status = "Completed"

    issue_vals = [v for v in [entry.issue_total, entry.issue_fin] if v is not None]
    if issue_vals:
        issue_max = max(issue_vals)
        entry.issue_fin = issue_max
        if entry.issue_total is not None:
            entry.issue_total = issue_max


def apply_completion_timestamp(entry, status_value: Optional[str]) -> None:
    """Sets completed_at the first time an entry reaches Completed status."""
    if status_value in COMPLETED_WATCH_STATUSES and entry.completed_at is None:
        entry.completed_at = get_taipei_now()
