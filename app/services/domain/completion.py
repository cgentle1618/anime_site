"""Completion checks and mark-completed mutations."""

import logging
from typing import Optional

from app.database import get_taipei_now
from app.utils.constants import (
    COMPLETED_WATCH_STATUSES,
)

logger = logging.getLogger(__name__)


def mark_tv_catalog(entry) -> None:
    """The catalogue half of finishing an anime, TV show or cartoon: the work
    has finished airing. Nothing here is one person's opinion."""
    entry.airing_status = "Finished Airing"


def mark_tv_list(row, entry) -> None:
    """The personal half: I finished it, and I saw every episode there is."""
    row.status = "Completed"
    if getattr(entry, "ep_total", None) is not None:
        row.ep_fin = entry.ep_total


def mark_movie_catalog(entry) -> None:
    entry.airing_status = "Finished Airing"


def mark_movie_list(row, entry) -> None:
    row.status = "Completed"


def mark_reading_catalog(entry) -> None:
    """Manga's catalogue half. A cancelled serialization stays cancelled -
    finishing what exists does not make 腰斬 into 完結."""
    if entry.serialization_status != "腰斬":
        entry.serialization_status = "完結"


def mark_reading_list(row, entry) -> None:
    row.status = "Completed"
    if entry.ch_total:
        row.ch_fin = entry.ch_total
    if entry.vol_total:
        row.vol_fin = entry.vol_total
    row.vol_fin_page = 0


def mark_comic_catalog(entry) -> None:
    entry.serialization_status = "完結"
    issue_vals = [v for v in [entry.issue_total] if v is not None]
    if issue_vals:
        entry.issue_total = max(issue_vals)


def mark_comic_list(row, entry) -> None:
    row.status = "Completed"
    issue_vals = [v for v in [entry.issue_total, row.issue_fin] if v is not None]
    if issue_vals:
        row.issue_fin = max(issue_vals)


def mark_game_catalog(entry) -> None:
    """A game has no catalogue-side notion of being finished. completion_level,
    the three all_* flags and the achievement pair are independent axes only
    the player knows, so nothing is set here - the function exists so the
    registry can name a catalogue half for every type."""
    return None


def mark_game_list(row, entry) -> None:
    row.status = "Completed"


def mark_novel_catalog(entry) -> None:
    """
    Novel's catalogue half: the serialization is finished, and the three
    volume totals agree on the largest figure any of them holds.

    vol_fin is NOT read here even though the original mark_novel_completed
    took the max across it as well - it is one reader's progress and cannot
    be allowed to set the work's published length.
    """
    entry.serialization_status = "完結"

    vol_vals = [
        v for v in [entry.vol_total_original, entry.vol_total_tw] if v is not None
    ]
    if vol_vals:
        vol_max = max(vol_vals)
        if entry.vol_total_original is not None:
            entry.vol_total_original = vol_max
        if entry.vol_total_tw is not None:
            entry.vol_total_tw = vol_max

    arcs = [u for u in (getattr(entry, "units", None) or []) if u.unit_kind == "arc"]
    if arcs:
        entry.arc_total = float(len(arcs))
        entry.ch_total = float(sum(float(u.ch_count or 0) for u in arcs))


def mark_novel_list(row, entry) -> None:
    """
    Novel's personal half: read to the end of whatever the catalogue says
    exists.

    Arc-structured novels close every recorded arc and take the derived
    chapter count; a flat novel takes the larger of its own ch_fin and the
    work's ch_total, which is what the original did.
    """
    row.status = "Completed"

    vol_vals = [
        v
        for v in [entry.vol_total_original, entry.vol_total_tw, row.vol_fin]
        if v is not None
    ]
    if vol_vals:
        row.vol_fin = max(vol_vals)

    arcs = [u for u in (getattr(entry, "units", None) or []) if u.unit_kind == "arc"]
    row.ch_fin_in_arc = 0
    if arcs:
        row.arc_fin = float(len(arcs))
        row.ch_fin = float(sum(float(u.ch_count or 0) for u in arcs))
        return

    arc_vals = [v for v in [entry.arc_total, row.arc_fin] if v is not None]
    if arc_vals:
        row.arc_fin = max(arc_vals)
    ch_vals = [v for v in [entry.ch_total, row.ch_fin] if v is not None]
    if ch_vals:
        row.ch_fin = max(ch_vals)


def apply_list_completion_timestamp(row, status_value: Optional[str]) -> None:
    """
    Sets the list row's completed_at the first time this user reaches a
    Completed status. The per-user twin of the retired
    apply_completion_timestamp: when
    two people finish the same anime on different days, two different dates
    are the correct answer and one shared column cannot hold them.
    """
    if status_value in COMPLETED_WATCH_STATUSES and row.completed_at is None:
        row.completed_at = get_taipei_now()
