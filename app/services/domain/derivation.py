"""Field derivation: watch order, ep_previous, prequel/sequel, season, id/season extraction."""

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


_AIRING_TYPE_ORDER = {
    AnimeAiringType.TV: 0,
    AnimeAiringType.ONA: 1,
    AnimeAiringType.SPECIAL: 2,
    AnimeAiringType.OVA: 3,
    AnimeAiringType.OAD: 4,
}



def apply_extract_mal_id_anime(anime: Anime) -> bool:
    mal_id = extract_mal_id_anime(anime.mal_link)
    if mal_id:
        anime.mal_id = mal_id
        return True
    return False


def apply_extract_mal_id_manga_novel(entry: Union[Manga, Novel]) -> bool:
    """Extracts MAL manga ID from mal_link and writes it to mal_id. Returns True if set."""
    mal_id = extract_mal_id_manga_novel(entry.mal_link)
    if mal_id:
        entry.mal_id = mal_id
        return True
    return False


def apply_extract_imdb_id(entry: Union[Movies, TVShows, Cartoon]) -> bool:
    """Extracts IMDb ID from imdb_link and writes it to imdb_id. Returns True if set."""
    imdb_id = extract_imdb_id(entry.imdb_link)
    if imdb_id:
        entry.imdb_id = imdb_id
        return True
    return False


def apply_extract_season_from_title(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    if isinstance(entry, Cartoon):
        title = entry.cartoon_name_en or ""
    elif isinstance(entry, TVShows):
        title = entry.tv_name_en or ""
    else:
        title = entry.anime_name_en or entry.anime_name_roman or ""
    extracted = extract_season_from_title(title)
    if extracted:
        entry.season_part = extracted
        return True
    return False


def apply_calculate_seasonal_from_month(anime: Anime) -> bool:
    if (
        anime.release_season is None
        and anime.release_month is not None
        and anime.airing_type in ("TV", "ONA")
    ):
        season = calculate_seasonal_from_month(anime.release_month)
        if season:
            anime.release_season = season
            return True
    return False


def derive_watch_order_anime(db: Session, franchise_id: Any) -> None:
    """
    Assigns watch_order to eligible entries within an acg franchise.
    Eligible: airing_type not null/Other, season_part set.
    Entries grouped by series (sorted by series name), no-series entries last.
    Within each group, sorted by season/part then airing_type (TV, ONA, Special, OVA, OAD).
    Only fills entries where watch_order is None. Order is consecutive across all groups.
    """
    if not franchise_id:
        return

    eligible = (
        db.query(Anime)
        .filter(
            Anime.franchise_id == franchise_id,
            Anime.season_part.isnot(None),
            Anime.airing_type.isnot(None),
            Anime.airing_type.not_in(["Other"]),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(a: Anime):
        s_part = str(a.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        type_order = _AIRING_TYPE_ORDER.get(a.airing_type or "", 99)
        return (s_num, p_num, type_order)

    # Separate into series groups and no-series group
    series_groups: dict = {}
    no_series: list = []

    for anime in eligible:
        if anime.series_id:
            series_groups.setdefault(anime.series_id, []).append(anime)
        else:
            no_series.append(anime)

    # Sort entries within each group
    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    # Order series groups by series display_name for deterministic ordering
    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    # Build final order: series groups first, no-series last
    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_watch_order_tv_show(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    eligible = (
        db.query(TVShows)
        .filter(
            TVShows.franchise_id == franchise_id,
            TVShows.season_part.isnot(None),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(t: TVShows):
        s_part = str(t.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    series_groups: dict = {}
    no_series: list = []

    for show in eligible:
        if show.series_id:
            series_groups.setdefault(show.series_id, []).append(show)
        else:
            no_series.append(show)

    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_watch_order_cartoon(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    eligible = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == franchise_id,
            Cartoon.airing_type == "TV",
            Cartoon.season_part.isnot(None),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(c: Cartoon):
        s_part = str(c.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    series_groups: dict = {}
    no_series: list = []

    for cartoon in eligible:
        if cartoon.series_id:
            series_groups.setdefault(cartoon.series_id, []).append(cartoon)
        else:
            no_series.append(cartoon)

    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_prequel_sequel_anime(db: Session, franchise_id: Any) -> None:
    """
    Derives prequel_id and sequel_id for eligible entries within an acg franchise.
    Eligible: watch_order is not null.
    Entries are ordered by watch_order; only fills fields that are currently None.
    """
    if not franchise_id:
        return

    entries = (
        db.query(Anime)
        .filter(
            Anime.franchise_id == franchise_id,
            Anime.watch_order.isnot(None),
            Anime.derive_related.isnot(False),
        )
        .order_by(Anime.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_TV_SPECIAL_FRANCHISE_NAMES = {
    "獨立電影 / 影集",
    "Marvel",
    "Disney",
    "Christopher Nolan",
    "周星馳",
}


def derive_prequel_sequel_tv_show(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _TV_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(TVShows)
        .filter(
            TVShows.franchise_id == franchise_id,
            TVShows.watch_order.isnot(None),
            TVShows.derive_related.isnot(False),
        )
        .order_by(TVShows.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_CARTOON_SPECIAL_FRANCHISE_NAMES: set[str] = set()


def derive_prequel_sequel_cartoon(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _CARTOON_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == franchise_id,
            Cartoon.watch_order.isnot(None),
            Cartoon.derive_related.isnot(False),
        )
        .order_by(Cartoon.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_MANGA_SPECIAL_FRANCHISE_NAMES: set[str] = set()


def derive_prequel_sequel_manga(db: Session, franchise_id: Any) -> None:
    """Sets prequel_id and sequel_id for eligible manga entries in a franchise, fill-only."""
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _MANGA_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(Manga)
        .filter(
            Manga.franchise_id == franchise_id,
            Manga.watch_order.isnot(None),
            Manga.derive_related.isnot(False),
        )
        .order_by(Manga.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_SERIES_UNSET = object()


def derive_ep_previous_anime(
    db: Session, franchise_id: Any, series_id: Any = _SERIES_UNSET
) -> None:
    """
    Derives ep_previous for eligible anime entries within an acg franchise.
    Eligible: same franchise+series, airing_type TV/ONA, ep_special null, season_part set.
    Each series forms its own sibling group; no-series entries form their own group.
    When series_id is provided (including None for no-series), only that group is processed.
    When series_id is omitted, all groups in the franchise are processed.
    Only fills entries where ep_previous is currently None.
    """
    if not franchise_id:
        return

    def get_sort_key(a: Anime):
        s_part = str(a.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    def process_group(siblings: list) -> None:
        if not siblings:
            return
        sorted_siblings = sorted(siblings, key=get_sort_key)
        for i, entry in enumerate(sorted_siblings):
            if entry.ep_previous is not None:
                continue
            s_part_clean = str(entry.season_part).strip().lower()
            if s_part_clean in ("season 1", "season 1 part 1"):
                entry.ep_previous = 0
                continue
            if i == 0:
                break
            prev = sorted_siblings[i - 1]
            if not prev.ep_total:
                break
            if prev.ep_previous is None:
                break
            entry.ep_previous = prev.ep_previous + prev.ep_total

    base_query = db.query(Anime).filter(
        Anime.franchise_id == franchise_id,
        Anime.airing_type.in_(["TV", "ONA"]),
        Anime.ep_special.is_(None),
        Anime.season_part.isnot(None),
    )

    if series_id is not _SERIES_UNSET:
        # Specific group: series UUID or None (no-series)
        if series_id is None:
            base_query = base_query.filter(Anime.series_id.is_(None))
        else:
            base_query = base_query.filter(Anime.series_id == series_id)
        process_group(base_query.all())
    else:
        # All groups: partition by series_id and process each independently
        all_eligible = base_query.all()
        groups: dict = {}
        for anime in all_eligible:
            groups.setdefault(anime.series_id, []).append(anime)
        for group in groups.values():
            process_group(group)


def derive_season_1_anime(anime: Anime, db: Session) -> None:
    if anime.season_part is not None:
        return
    if not anime.franchise_id or anime.airing_type != "TV":
        return
    tv_count = (
        db.query(Anime)
        .filter(Anime.franchise_id == anime.franchise_id, Anime.airing_type == "TV")
        .count()
    )
    if tv_count == 1:
        anime.season_part = "Season 1"


def derive_season_1_tv_show(tv_show: TVShows, db: Session) -> None:
    if tv_show.season_part is not None:
        return
    if not tv_show.franchise_id:
        return
    count = (
        db.query(TVShows).filter(TVShows.franchise_id == tv_show.franchise_id).count()
    )
    if count == 1:
        tv_show.season_part = "Season 1"


def derive_season_1_cartoon(cartoon: Cartoon, db: Session) -> None:
    if cartoon.season_part is not None:
        return
    if not cartoon.franchise_id:
        return
    if cartoon.airing_type != "TV":
        return
    count = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == cartoon.franchise_id,
            Cartoon.airing_type == "TV",
        )
        .count()
    )
    if count == 1:
        cartoon.season_part = "Season 1"
