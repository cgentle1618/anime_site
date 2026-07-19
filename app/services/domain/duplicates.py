"""Duplicate-entry detection across all tables."""

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


def find_duplicate_franchises(db: Session) -> list[list[dict]]:
    """
    Finds Franchise entries that share the same franchise_type and at least one
    identical name field (case-insensitive). Uses union-find so transitive matches
    (A=B, B=C) collapse into the same group.
    Returns a list of duplicate clusters; each cluster is a list of franchise dicts.
    """
    franchises = db.query(Franchise).all()

    by_type: dict[str, list] = {}
    for f in franchises:
        ft_raw = (f.franchise_type or "").strip()
        tokens = [t.strip() for t in ft_raw.split(",") if t.strip()]
        for token in tokens if tokens else ([ft_raw] if ft_raw else []):
            by_type.setdefault(token, []).append(f)

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

    franchise_map = {str(f.system_id): f for f in franchises}

    for group in by_type.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for fid in franchise_map:
        clusters.setdefault(find(fid), []).append(fid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": fid,
                        "franchise_type": franchise_map[fid].franchise_type,
                        "franchise_name_en": franchise_map[fid].franchise_name_en,
                        "franchise_name_cn": franchise_map[fid].franchise_name_cn,
                        "franchise_name_roman": franchise_map[fid].franchise_name_roman,
                        "franchise_name_jp": franchise_map[fid].franchise_name_jp,
                        "franchise_name_alt": franchise_map[fid].franchise_name_alt,
                    }
                    for fid in members
                ]
            )

    return result


def find_duplicate_series(db: Session) -> list[list[dict]]:
    """
    Finds Series entries that share the same franchise_id and at least one
    identical name field (case-insensitive). Uses union-find so transitive matches
    collapse into the same group.
    Returns a list of duplicate clusters; each cluster is a list of series dicts.
    """
    series_list = db.query(Series).filter(Series.franchise_id.isnot(None)).all()

    by_franchise: dict[str, list] = {}
    for s in series_list:
        by_franchise.setdefault(str(s.franchise_id), []).append(s)

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

    series_map = {str(s.system_id): s for s in series_list}

    for group in by_franchise.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for sid in series_map:
        clusters.setdefault(find(sid), []).append(sid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": sid,
                        "franchise_id": str(series_map[sid].franchise_id),
                        "series_name_en": series_map[sid].series_name_en,
                        "series_name_cn": series_map[sid].series_name_cn,
                        "series_name_alt": series_map[sid].series_name_alt,
                    }
                    for sid in members
                ]
            )

    return result


def _anime_duplicate_key(a: Anime) -> tuple:
    season = (a.season_part or "").strip().lower() or None
    return (
        str(a.franchise_id) if a.franchise_id else None,
        str(a.series_id) if a.series_id else None,
        a.airing_type,
        season,
        a.is_main,
        a.ep_special,
    )


def find_duplicate_anime(db: Session) -> list[list[dict]]:
    """
    Finds Anime entries that share the same franchise_id, series_id, airing_type,
    season_part, is_main, and ep_special, AND at least one identical name field
    (case-insensitive). Uses union-find so transitive matches collapse into one group.
    Returns a list of duplicate clusters; each cluster is a list of anime dicts.
    """
    animes = db.query(Anime).all()

    by_key: dict[tuple, list] = {}
    for a in animes:
        by_key.setdefault(_anime_duplicate_key(a), []).append(a)

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

    anime_map = {str(a.system_id): a for a in animes}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for aid in anime_map:
        clusters.setdefault(find(aid), []).append(aid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            a = anime_map[members[0]]
            result.append(
                [
                    {
                        "system_id": aid,
                        "franchise_id": (
                            str(anime_map[aid].franchise_id)
                            if anime_map[aid].franchise_id
                            else None
                        ),
                        "series_id": (
                            str(anime_map[aid].series_id)
                            if anime_map[aid].series_id
                            else None
                        ),
                        "airing_type": anime_map[aid].airing_type,
                        "season_part": anime_map[aid].season_part,
                        "is_main": anime_map[aid].is_main,
                        "ep_special": anime_map[aid].ep_special,
                        "anime_name_en": anime_map[aid].anime_name_en,
                        "anime_name_cn": anime_map[aid].anime_name_cn,
                        "anime_name_roman": anime_map[aid].anime_name_roman,
                        "anime_name_jp": anime_map[aid].anime_name_jp,
                        "anime_name_alt": anime_map[aid].anime_name_alt,
                    }
                    for aid in members
                ]
            )

    return result


def find_duplicate_system_options(db: Session) -> list[list[dict]]:
    """
    Finds SystemOption entries that share the same category and option_value
    (case-insensitive). Returns a list of duplicate clusters; each cluster is
    a list of system option dicts.
    """
    options = db.query(SystemOption).all()

    groups: dict[tuple, list] = {}
    for opt in options:
        key = (
            (opt.category or "").strip().lower(),
            (opt.option_value or "").strip().lower(),
        )
        groups.setdefault(key, []).append(opt)

    return [
        [
            {"id": opt.id, "category": opt.category, "option_value": opt.option_value}
            for opt in members
        ]
        for members in groups.values()
        if len(members) > 1
    ]


def find_duplicate_anime_movie(db: Session) -> list[list[dict]]:
    """
    Finds AnimeMovies entries that share the same franchise_id and at least one
    identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    movies = db.query(AnimeMovies).filter(AnimeMovies.franchise_id.isnot(None)).all()

    by_franchise: dict[str, list] = {}
    for m in movies:
        by_franchise.setdefault(str(m.franchise_id), []).append(m)

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

    movie_map = {str(m.system_id): m for m in movies}

    for group in by_franchise.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in movie_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(movie_map[mid].franchise_id),
                        "anime_movie_name_en": movie_map[mid].anime_movie_name_en,
                        "anime_movie_name_cn": movie_map[mid].anime_movie_name_cn,
                        "anime_movie_name_roman": movie_map[mid].anime_movie_name_roman,
                        "anime_movie_name_jp": movie_map[mid].anime_movie_name_jp,
                        "anime_movie_name_alt": movie_map[mid].anime_movie_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_duplicate_movie(db: Session) -> list[list[dict]]:
    """
    Finds Movies entries that share the same (franchise_id, series_id) and at least one
    identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    movies = db.query(Movies).filter(Movies.franchise_id.isnot(None)).all()

    by_key: dict[tuple, list] = {}
    for m in movies:
        key = (
            str(m.franchise_id),
            str(m.series_id) if m.series_id else None,
        )
        by_key.setdefault(key, []).append(m)

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

    movie_map = {str(m.system_id): m for m in movies}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in movie_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(movie_map[mid].franchise_id),
                        "series_id": (
                            str(movie_map[mid].series_id)
                            if movie_map[mid].series_id
                            else None
                        ),
                        "movie_name_en": movie_map[mid].movie_name_en,
                        "movie_name_cn": movie_map[mid].movie_name_cn,
                        "movie_name_alt": movie_map[mid].movie_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_duplicate_tv_show(db: Session) -> list[list[dict]]:
    """
    Finds TVShows entries that share the same (franchise_id, series_id, season_part, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    shows = db.query(TVShows).filter(TVShows.franchise_id.isnot(None)).all()

    def _key(t: TVShows) -> tuple:
        season = (t.season_part or "").strip().lower() or None
        return (
            str(t.franchise_id),
            str(t.series_id) if t.series_id else None,
            season,
            t.is_main,
        )

    by_key: dict[tuple, list] = {}
    for t in shows:
        by_key.setdefault(_key(t), []).append(t)

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

    show_map = {str(t.system_id): t for t in shows}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for tid in show_map:
        clusters.setdefault(find(tid), []).append(tid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": tid,
                        "franchise_id": str(show_map[tid].franchise_id),
                        "series_id": (
                            str(show_map[tid].series_id)
                            if show_map[tid].series_id
                            else None
                        ),
                        "season_part": show_map[tid].season_part,
                        "is_main": show_map[tid].is_main,
                        "tv_name_en": show_map[tid].tv_name_en,
                        "tv_name_cn": show_map[tid].tv_name_cn,
                        "tv_name_alt": show_map[tid].tv_name_alt,
                    }
                    for tid in members
                ]
            )

    return result


def find_duplicate_cartoon(db: Session) -> list[list[dict]]:
    """
    Finds Cartoon entries that share the same (franchise_id, series_id, season_part, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    cartoons = db.query(Cartoon).filter(Cartoon.franchise_id.isnot(None)).all()

    def _key(c: Cartoon) -> tuple:
        season = (c.season_part or "").strip().lower() or None
        return (
            str(c.franchise_id),
            str(c.series_id) if c.series_id else None,
            season,
            c.is_main,
        )

    by_key: dict[tuple, list] = {}
    for c in cartoons:
        by_key.setdefault(_key(c), []).append(c)

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

    cartoon_map = {str(c.system_id): c for c in cartoons}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for cid in cartoon_map:
        clusters.setdefault(find(cid), []).append(cid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": cid,
                        "franchise_id": str(cartoon_map[cid].franchise_id),
                        "series_id": (
                            str(cartoon_map[cid].series_id)
                            if cartoon_map[cid].series_id
                            else None
                        ),
                        "season_part": cartoon_map[cid].season_part,
                        "is_main": cartoon_map[cid].is_main,
                        "cartoon_name_en": cartoon_map[cid].cartoon_name_en,
                        "cartoon_name_cn": cartoon_map[cid].cartoon_name_cn,
                        "cartoon_name_alt": cartoon_map[cid].cartoon_name_alt,
                    }
                    for cid in members
                ]
            )

    return result


def find_duplicate_manga(db: Session) -> list[list[dict]]:
    """
    Finds Manga entries that share the same (franchise_id, series_id, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    mangas = db.query(Manga).filter(Manga.franchise_id.isnot(None)).all()

    def _key(m: Manga) -> tuple:
        return (
            str(m.franchise_id),
            str(m.series_id) if m.series_id else None,
            m.is_main,
        )

    by_key: dict[tuple, list] = {}
    for m in mangas:
        by_key.setdefault(_key(m), []).append(m)

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

    manga_map = {str(m.system_id): m for m in mangas}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in manga_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(manga_map[mid].franchise_id),
                        "series_id": (
                            str(manga_map[mid].series_id)
                            if manga_map[mid].series_id
                            else None
                        ),
                        "is_main": manga_map[mid].is_main,
                        "manga_name_cn": manga_map[mid].manga_name_cn,
                        "manga_name_en": manga_map[mid].manga_name_en,
                        "manga_name_roman": manga_map[mid].manga_name_roman,
                        "manga_name_jp": manga_map[mid].manga_name_jp,
                        "manga_name_alt": manga_map[mid].manga_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_duplicate_novel(db: Session) -> list[list[dict]]:
    """
    Finds Novel entries that share the same (franchise_id, series_id, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    novels = db.query(Novel).filter(Novel.franchise_id.isnot(None)).all()

    def _key(n: Novel) -> tuple:
        return (
            str(n.franchise_id),
            str(n.series_id) if n.series_id else None,
            n.is_main,
        )

    by_key: dict[tuple, list] = {}
    for n in novels:
        by_key.setdefault(_key(n), []).append(n)

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

    novel_map = {str(n.system_id): n for n in novels}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for nid in novel_map:
        clusters.setdefault(find(nid), []).append(nid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": nid,
                        "franchise_id": str(novel_map[nid].franchise_id),
                        "series_id": (
                            str(novel_map[nid].series_id)
                            if novel_map[nid].series_id
                            else None
                        ),
                        "is_main": novel_map[nid].is_main,
                        "novel_name_cn": novel_map[nid].novel_name_cn,
                        "novel_name_en": novel_map[nid].novel_name_en,
                        "novel_name_roman": novel_map[nid].novel_name_roman,
                        "novel_name_jp": novel_map[nid].novel_name_jp,
                        "novel_name_alt": novel_map[nid].novel_name_alt,
                    }
                    for nid in members
                ]
            )

    return result


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
        "system_options": find_duplicate_system_options(db),
    }
