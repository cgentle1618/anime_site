"""Missing-value checks and episode/volume/chapter math validation."""

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
    Comic,
    Manga,
    Novel,
    Movies,
    TVShows,
    Franchise,
    Person,
    Series,
    Seasonal,
    Studio,
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
    COMIC_FIELDS_TO_FILL,
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


def apply_validate_episode_math(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    ep_total = getattr(entry, "ep_total", None)
    ep_fin = getattr(entry, "ep_fin", None)
    if ep_total is None and ep_fin is None:
        return False
    safe_total, safe_fin = validate_episode_math(ep_total, ep_fin)
    if ep_total != safe_total or ep_fin != safe_fin:
        entry.ep_total = safe_total
        entry.ep_fin = safe_fin
        return True
    return False


def apply_validate_vol_math(manga: Manga) -> bool:
    """Clamps vol_fin <= vol_total. Returns True if any value changed."""
    safe_total, safe_fin = validate_vol_math(manga.vol_total, manga.vol_fin)
    changed = manga.vol_total != safe_total or manga.vol_fin != safe_fin
    if changed:
        manga.vol_total = safe_total
        manga.vol_fin = safe_fin
    return changed


def apply_validate_ch_math(manga: Manga) -> bool:
    """Clamps ch_fin <= ch_total. Returns True if any value changed."""
    safe_total, safe_fin = validate_ch_math(manga.ch_total, manga.ch_fin)
    changed = manga.ch_total != safe_total or manga.ch_fin != safe_fin
    if changed:
        manga.ch_total = safe_total
        manga.ch_fin = safe_fin
    return changed


def has_missing_values_anime(anime: Anime) -> bool:
    """
    Evaluates an anime entry against the ANIME_FIELDS_TO_FILL list.
    Returns True if any required fields are missing, False if fully populated.

    Business Rules:
    1. If 'Not Yet Aired', ignores missing mal_rating and mal_rank.
    2. Detects missing 'ep_previous' ONLY if it meets specific Execution Conditions.
    """
    missing_fields = []

    for field in ANIME_FIELDS_TO_FILL:
        val = getattr(anime, field, None)
        if val is None or str(val).strip() == "":
            missing_fields.append(field)

    # Exception Rule: "Not Yet Aired" entries don't have ratings/ranks yet
    if anime.airing_status == "Not Yet Aired":
        missing_fields = [
            f for f in missing_fields if f not in ("mal_rating", "mal_rank")
        ]

    # Clean out ep_previous if it was caught by the general loop
    if "ep_previous" in missing_fields:
        missing_fields.remove("ep_previous")

    # Custom Execution Condition for ep_previous
    if anime.ep_previous is None:
        is_tv_or_ona = anime.airing_type in ["TV", "ONA"]
        no_ep_special = anime.ep_special is None
        has_season = bool(anime.season_part and str(anime.season_part).strip())

        if is_tv_or_ona and no_ep_special and has_season:
            missing_fields.append("ep_previous")

    return len(missing_fields) > 0


def has_missing_values_anime_movie(anime_movie: AnimeMovies) -> bool:
    """
    Returns True if any required field is blank.
    Skips mal_rating and mal_rank for 'Not Yet Aired' entries.
    """
    missing = []
    for field in ANIME_MOVIE_FIELDS_TO_FILL:
        val = getattr(anime_movie, field, None)
        if val is None or str(val).strip() == "":
            missing.append(field)

    if anime_movie.airing_status == "Not Yet Aired":
        missing = [f for f in missing if f not in ("mal_rating", "mal_rank")]

    return len(missing) > 0


def has_missing_values_movie(movie) -> bool:
    """Returns True if any required Movies field is missing."""
    for field in MOVIE_FIELDS_TO_FILL:
        val = getattr(movie, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_tv_show(tv_show: TVShows) -> bool:
    """Returns True if any required TVShows field is missing."""
    for field in TV_SHOW_FIELDS_TO_FILL:
        val = getattr(tv_show, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_cartoon(cartoon: Cartoon) -> bool:
    """Returns True if any required Cartoon field is missing."""
    fields = (
        CARTOON_MOVIE_FIELDS_TO_FILL
        if cartoon.airing_type == "Movie"
        else CARTOON_TV_FIELDS_TO_FILL
    )
    for field in fields:
        val = getattr(cartoon, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_manga(manga: Manga) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total and ch_total are only required when serialization_status == "完結".
    """
    for field in MANGA_FIELDS_TO_FILL:
        val = getattr(manga, field, None)
        if val is None or str(val).strip() == "":
            return True

    if manga.serialization_status == "完結":
        if manga.vol_total is None and manga.ch_total is None:
            return True

    return False


def has_missing_values_novel(novel: Novel) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total_original and ch_total are only required when serialization_status == "完結".
    Gate: if mal_link is null, returns False (skip entirely — no MAL data source available).
    """
    if novel.mal_link is None:
        return False

    for field in NOVEL_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    if novel.serialization_status == "完結":
        if novel.vol_total_original is None and novel.ch_total is None:
            return True

    return False


def has_missing_values_comic(comic: Comic) -> bool:
    """
    Returns True if any Comic Vine-fillable field is blank.
    Only COMIC_FIELDS_TO_FILL are considered — imprint, continuity, era, events,
    end_date and publisher_tw are manual classifications Comic Vine does not model.
    """
    for field in COMIC_FIELDS_TO_FILL:
        val = getattr(comic, field, None)
        if val is None or str(val).strip() == "":
            return True

    return False



def apply_check_baha(entry: Union[Anime, AnimeMovies]) -> None:
    """Sets source_baha=True if baha_link is present (and source_baha not already set)."""
    if entry.baha_link and entry.source_baha is None:
        entry.source_baha = True


def find_duplicate_entities(db: Session) -> list[dict]:
    """
    Entities whose names collapse to one normalization key.

    The backfill created these deliberately rather than guessing that two
    spellings meant one person. Deleting one would cascade its credits away, so
    the fix is POST /api/person/{id}/merge - this check is what makes the pairs
    findable in the first place.

    Groups on BOTH name_native and name_en, not name_native alone:
    resolve_person/resolve_studio (app/services/domain/credits.py:_find_by_name)
    look a new credit up by whichever of the two fields matches, so two rows
    that only collide on name_en are just as ambiguous to future credit
    resolution as two that collide on name_native. Union-find gives the
    transitive closure across both fields (A's name_en == B's name_native,
    B's name_native == C's name_en, etc. all collapse into one cluster).
    A person and a studio sharing a name are never grouped together - each
    table is scanned independently.

    Each result's "key" is a representative label (the first member's
    normalized name_native), not a normalization key every member is
    guaranteed to share - a cluster formed through name_en transitivity can
    have no single key common to all of its rows.
    """
    from app.utils.name_normalize import normalize_name

    found: list[dict] = []
    for kind, model in (("person", Person), ("studio", Studio)):
        rows = db.query(model).all()
        row_map = {str(r.system_id): r for r in rows}

        parent: dict[str, str] = {}

        def find(x: str) -> str:
            root = x
            while parent.get(root, root) != root:
                root = parent[root]
            while parent.get(x, x) != root:
                nxt = parent.get(x, x)
                parent[x] = root
                x = nxt
            return root

        def union(x: str, y: str) -> None:
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        buckets: dict[str, list[str]] = {}
        for row in rows:
            keys = {normalize_name(row.name_native)}
            if row.name_en:
                keys.add(normalize_name(row.name_en))
            for key in keys:
                buckets.setdefault(key, []).append(str(row.system_id))

        for ids in buckets.values():
            for i in range(1, len(ids)):
                union(ids[0], ids[i])

        clusters: dict[str, list[str]] = {}
        for rid in row_map:
            clusters.setdefault(find(rid), []).append(rid)

        for members in clusters.values():
            if len(members) > 1:
                found.append(
                    {
                        "kind": kind,
                        "key": normalize_name(row_map[members[0]].name_native),
                        "ids": members,
                        "names": [row_map[m].name_native for m in members],
                    }
                )

    return found
