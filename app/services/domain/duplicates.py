"""
Duplicate-entry detection across all tables.

Every finder is the same rule with different parameters: rows that agree
exactly on a grouping key (same franchise, same season...) and share at least
one name (case-insensitive, via `get_all_names`) are duplicates, transitively.
`app.utils.clustering.cluster` does the grouping; each finder below only says
which rows, which key, and which columns to report.
"""

import logging
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Franchise,
    Manga,
    Movies,
    Novel,
    Series,
    SystemOption,
    TVShows,
)
from app.services.domain.checking import find_duplicate_entities
from app.utils.clustering import cluster

logger = logging.getLogger(__name__)


def _ref(value) -> Optional[str]:
    return str(value) if value else None


def _season(value) -> Optional[str]:
    return (value or "").strip().lower() or None


def _share_a_name(a, b) -> bool:
    return bool(a.get_all_names() & b.get_all_names())


def _report(clusters: list[list], fields: tuple[str, ...]) -> list[list[dict]]:
    """Serialize clusters: system_id/franchise_id/series_id as str-or-None,
    every other column as stored."""
    def row(entry) -> dict:
        out = {"system_id": str(entry.system_id)}
        for name in fields:
            value = getattr(entry, name)
            out[name] = _ref(value) if name in ("franchise_id", "series_id") else value
        return out

    return [[row(entry) for entry in members] for members in clusters]


def _find(
    rows: list,
    key: Callable,
    fields: tuple[str, ...],
    match: Callable = _share_a_name,
) -> list[list[dict]]:
    return _report(cluster(rows, match=match, key=key), fields)


def _with_franchise(db: Session, model):
    return db.query(model).filter(model.franchise_id.isnot(None)).all()


def find_duplicate_franchises(db: Session) -> list[list[dict]]:
    """Same franchise_type + a shared name. A comma-separated type list buckets
    the franchise under each of its types."""
    rows = []
    for f in db.query(Franchise).all():
        raw = (f.franchise_type or "").strip()
        tokens = [t.strip() for t in raw.split(",") if t.strip()] or ([raw] if raw else [])
        rows.extend((token, f) for token in tokens)

    clusters = cluster(rows, key=lambda r: r[0], match=lambda a, b: _share_a_name(a[1], b[1]))
    # A franchise listed under two types can appear in two clusters; collapse
    # back to distinct franchises per cluster.
    unique = []
    for members in clusters:
        seen, entries = set(), []
        for _, f in members:
            if f.system_id not in seen:
                seen.add(f.system_id)
                entries.append(f)
        if len(entries) > 1:
            unique.append(entries)
    return _report(unique, (
        "franchise_type", "franchise_name_en", "franchise_name_cn",
        "franchise_name_roman", "franchise_name_jp", "franchise_name_alt",
    ))


def find_duplicate_series(db: Session) -> list[list[dict]]:
    """Same franchise + a shared name."""
    return _find(
        _with_franchise(db, Series),
        key=lambda s: str(s.franchise_id),
        fields=("franchise_id", "series_name_en", "series_name_cn", "series_name_alt"),
    )


def _anime_duplicate_key(a: Anime) -> tuple:
    return (_ref(a.franchise_id), _ref(a.series_id), a.airing_type,
            _season(a.season_part), a.is_main, a.ep_special)


def find_duplicate_anime(db: Session) -> list[list[dict]]:
    """Same franchise, series, airing type, season, main flag, special flag + a shared name."""
    return _find(
        db.query(Anime).all(),
        key=_anime_duplicate_key,
        fields=("franchise_id", "series_id", "airing_type", "season_part", "is_main", "ep_special",
                "anime_name_en", "anime_name_cn", "anime_name_roman", "anime_name_jp", "anime_name_alt"),
    )


def find_duplicate_anime_movie(db: Session) -> list[list[dict]]:
    """Same franchise + a shared name."""
    return _find(
        _with_franchise(db, AnimeMovies),
        key=lambda m: str(m.franchise_id),
        fields=("franchise_id", "anime_movie_name_en", "anime_movie_name_cn",
                "anime_movie_name_roman", "anime_movie_name_jp", "anime_movie_name_alt"),
    )


def find_duplicate_movie(db: Session) -> list[list[dict]]:
    """Same franchise and series + a shared name."""
    return _find(
        _with_franchise(db, Movies),
        key=lambda m: (str(m.franchise_id), _ref(m.series_id)),
        fields=("franchise_id", "series_id", "movie_name_en", "movie_name_cn", "movie_name_alt"),
    )


def find_duplicate_tv_show(db: Session) -> list[list[dict]]:
    """Same franchise, series, season, main flag + a shared name."""
    return _find(
        _with_franchise(db, TVShows),
        key=lambda t: (str(t.franchise_id), _ref(t.series_id), _season(t.season_part), t.is_main),
        fields=("franchise_id", "series_id", "season_part", "is_main",
                "tv_name_en", "tv_name_cn", "tv_name_alt"),
    )


def find_duplicate_cartoon(db: Session) -> list[list[dict]]:
    """Same franchise, series, season, main flag + a shared name."""
    return _find(
        _with_franchise(db, Cartoon),
        key=lambda c: (str(c.franchise_id), _ref(c.series_id), _season(c.season_part), c.is_main),
        fields=("franchise_id", "series_id", "season_part", "is_main",
                "cartoon_name_en", "cartoon_name_cn", "cartoon_name_alt"),
    )


def find_duplicate_manga(db: Session) -> list[list[dict]]:
    """Same franchise, series, main flag + a shared name."""
    return _find(
        _with_franchise(db, Manga),
        key=lambda m: (str(m.franchise_id), _ref(m.series_id), m.is_main),
        fields=("franchise_id", "series_id", "is_main", "manga_name_cn", "manga_name_en",
                "manga_name_roman", "manga_name_jp", "manga_name_alt"),
    )


def find_duplicate_novel(db: Session) -> list[list[dict]]:
    """Same franchise, series, main flag + a shared name."""
    return _find(
        _with_franchise(db, Novel),
        key=lambda n: (str(n.franchise_id), _ref(n.series_id), n.is_main),
        fields=("franchise_id", "series_id", "is_main", "novel_name_cn", "novel_name_en",
                "novel_name_roman", "novel_name_jp", "novel_name_alt"),
    )


def _same_run(a: Comic, b: Comic) -> bool:
    # A shared Comic Vine volume is conclusive whatever the titles say: Marvel
    # volume titles collide constantly ("Avengers" names dozens of runs), so a
    # shared name is weak evidence while a shared comicvine_id is not. Two
    # unfilled rows share a NULL id, and that is absence of evidence.
    same_volume = a.comicvine_id is not None and a.comicvine_id == b.comicvine_id
    return same_volume or _share_a_name(a, b)


def find_duplicate_comic(db: Session) -> list[list[dict]]:
    """Same franchise, series, main-entry flag + (a shared name OR the same Comic Vine volume)."""
    return _find(
        _with_franchise(db, Comic),
        key=lambda c: (str(c.franchise_id), _ref(c.series_id), c.is_main_entry),
        fields=("franchise_id", "series_id", "is_main_entry", "comicvine_id",
                "comic_name_en", "comic_name_cn", "comic_name_alt"),
        match=_same_run,
    )


def find_duplicate_system_options(db: Session) -> list[list[dict]]:
    """Same category and value, case-insensitively - what the exact-match
    UNIQUE(category, value) constraint cannot catch ("Netflix" vs "netflix")."""
    groups = cluster(
        db.query(SystemOption).all(),
        key=lambda o: ((o.category or "").strip().lower(), (o.value or "").strip().lower()),
        match=lambda a, b: True,
    )
    return [
        [{"id": str(o.system_id), "category": o.category, "option_value": o.value} for o in members]
        for members in groups
    ]


def find_all_duplicates(db: Session) -> dict:
    """Runs all duplicate checks and returns a combined report."""
    return {
        "franchise": find_duplicate_franchises(db),
        "series": find_duplicate_series(db),
        "anime": find_duplicate_anime(db),
        "anime_movie": find_duplicate_anime_movie(db),
        "cartoon": find_duplicate_cartoon(db),
        "movie": find_duplicate_movie(db),
        "tv_show": find_duplicate_tv_show(db),
        "manga": find_duplicate_manga(db),
        "novel": find_duplicate_novel(db),
        "comic": find_duplicate_comic(db),
        "system_options": find_duplicate_system_options(db),
        "entities": find_duplicate_entities(db),
    }
