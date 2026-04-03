"""
other_logics.py
Contains isolated business logic specific to Anime entries (e.g., episode math, completion checks).
These functions mutate or evaluate SQLAlchemy models directly and are meant to be
called by FastApi routers or other higher-level orchestrators.
"""

import logging
from typing import Dict
import re
from sqlalchemy.orm import Session
from models import Anime
from utils.utils import MONTH_MAP

logger = logging.getLogger(__name__)


def autofill_ep_previous(db: Session, anime: Anime) -> None:
    """
    Automatically calculates and fills `ep_previous` based on the chronological
    predecessor in the same franchise or series based on season_part.
    Will NOT overwrite if `ep_previous` is already set (not null).
    """
    # 1. Execution Conditions
    if anime.ep_previous is not None:
        return

    if anime.airing_type not in ["TV", "ONA"]:
        return

    if not anime.season_part or str(anime.season_part).strip() == "":
        return

    if anime.ep_special is not None:
        return

    if not anime.franchise_id:
        return

    # 2. Query siblings based on whether series_id exists
    query = db.query(Anime).filter(
        Anime.franchise_id == anime.franchise_id,
        Anime.airing_type.in_(["TV", "ONA"]),
        Anime.ep_special.is_(None),
    )

    if anime.series_id:
        query = query.filter(Anime.series_id == anime.series_id)
    else:
        query = query.filter(Anime.series_id.is_(None))

    siblings = query.all()

    if not siblings:
        return

    # 3. Sort chronologically using season_part
    def extract_season_number(season_str: str) -> float:
        """
        Extracts numbers from strings like "Season 1", "Season 2 part 2".
        Returns a float to handle parts (e.g., Season 2 part 2 -> 2.2).
        If no number is found, returns a high number to push it to the end.
        """
        if not season_str:
            return 999.0

        s_str = str(season_str).lower()

        # Look for "season X"
        season_match = re.search(r"season\s*(\d+)", s_str)
        season_num = float(season_match.group(1)) if season_match else 999.0

        # Look for "part Y"
        part_match = re.search(r"part\s*(\d+)", s_str)
        part_num = float(part_match.group(1)) if part_match else 0.0

        # Combine: Season 2 Part 2 becomes 2.2 for sorting
        return season_num + (part_num * 0.1)

    def sort_key(a: Anime) -> tuple:
        """
        Sort primarily by the season/part number extracted from season_part.
        Fallback to release date if season_part parsing is identical.
        """
        season_val = extract_season_number(a.season_part)

        # Secondary sort: release date string
        if a.release_date_jp:
            date_val = str(a.release_date_jp)
        else:
            year = str(a.release_year) if a.release_year else "9999"
            month_str = str(a.release_month).upper() if a.release_month else ""
            month = MONTH_MAP.get(month_str, "12")
            date_val = f"{year}-{month}-99"

        return (season_val, date_val)

    sorted_siblings = sorted(siblings, key=sort_key)

    # 4. Find current anime in the sorted list
    try:
        idx = next(
            i for i, a in enumerate(sorted_siblings) if a.system_id == anime.system_id
        )
    except StopIteration:
        return

    # 5. Math: If it's not the first season, grab the previous one
    if idx > 0:
        prev_anime = sorted_siblings[idx - 1]
        prev_ep_prev = prev_anime.ep_previous or 0
        prev_ep_tot = prev_anime.ep_total or 0

        anime.ep_previous = prev_ep_prev + prev_ep_tot
        logger.info(
            f"Autofilled ep_previous for {anime.anime_name_en} to {anime.ep_previous}"
        )


def calculate_cumulative_episode(anime: Anime) -> Dict[str, int]:
    """
    Calculates the total/watched cumulative episodes for TV/ONA main story entries.
    Returns a dictionary with 'cumulative_watched' and 'cumulative_total'.
    """
    base_fin = anime.ep_fin or 0
    base_total = anime.ep_total or 0

    # Check conditions
    is_valid_type = anime.airing_type in ["TV", "ONA"]
    is_main_story = anime.ep_special is None
    has_season = anime.season_part is not None
    is_not_first_season = anime.season_part not in ["Season 1", "Season 1 Part 1"]

    # If all conditions are met, add ep_previous
    if is_valid_type and is_main_story and has_season and is_not_first_season:
        prev = anime.ep_previous or 0
        return {
            "cumulative_watched": prev + base_fin,
            "cumulative_total": prev + base_total,
        }

    # Otherwise, return base numbers without ep_previous
    return {"cumulative_watched": base_fin, "cumulative_total": base_total}


def check_is_completed(anime: Anime) -> bool:
    """
    Evaluates business rules to determine if an entry should be considered completed.
    Returns True if completed, False otherwise.
    """
    if anime.watching_status == "Completed":
        return True

    if (
        anime.ep_total is not None
        and anime.ep_total > 0
        and anime.ep_fin == anime.ep_total
    ):
        return True

    return False


def mark_completed(anime: Anime) -> None:
    """
    Forcefully mutates an Anime entry's fields to represent a 100% finished state.
    """
    anime.watching_status = "Completed"
    anime.airing_status = "Finished Airing"

    if anime.ep_total is not None:
        anime.ep_fin = anime.ep_total
