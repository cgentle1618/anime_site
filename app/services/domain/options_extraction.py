"""Extract system-option values from stored entries."""

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


_SYSTEM_OPTION_FIELD_MAP = {
    "Genre Main": "genre_main",
    "Genre Sub": "genre_sub",
    "Studio": "studio",
    "Distributor TW": "distributor_tw",
    "Director": "director",
    "Producer": "producer",
    "Music / Composer": "music",
}



def extract_system_options_from_anime(db: Session) -> dict:
    """
    Scans all Anime entries for values in system-option-backed fields.
    Any value not already present in the SystemOption table is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    animes = db.query(Anime).all()
    new_options = []

    for category, field in _SYSTEM_OPTION_FIELD_MAP.items():
        for anime in animes:
            raw = getattr(anime, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_anime: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(animes)} entries, created {len(new_options)} missing system options.",
    }


def extract_system_options_from_anime_movie(db: Session) -> dict:
    """
    Scans all AnimeMovies entries for studio and director values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    movies = db.query(AnimeMovies).all()
    new_options = []

    for category, field in _SYSTEM_OPTION_FIELD_MAP.items():
        for movie in movies:
            raw = getattr(movie, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_anime_movie: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(movies)} entries, created {len(new_options)} missing system options.",
    }


_TV_SHOW_OPTION_FIELD_MAP = {
    "TV Official Source": "source_official",
}


def extract_system_options_from_tv_show(db: Session) -> dict:
    """
    Scans all TVShows entries for source_official values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    shows = db.query(TVShows).all()
    new_options = []

    for category, field in _TV_SHOW_OPTION_FIELD_MAP.items():
        for show in shows:
            raw = getattr(show, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_tv_show: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(shows)} entries, created {len(new_options)} missing system options.",
    }


_CARTOON_OPTION_FIELD_MAP = {
    "Cartoon Official Source": "source_official",
}


def extract_system_options_from_cartoon(db: Session) -> dict:
    """
    Scans all Cartoon entries for source_official values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    cartoons = db.query(Cartoon).all()
    new_options = []

    for category, field in _CARTOON_OPTION_FIELD_MAP.items():
        for cartoon in cartoons:
            raw = getattr(cartoon, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_cartoon: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(cartoons)} entries, created {len(new_options)} missing system options.",
    }


_MANGA_OPTION_FIELD_MAP = {
    "Manga Author": "author_plot",
    "Manga Publisher TW": "publisher_tw",
    "Studio": "anime_studio",
}


def extract_system_options_from_manga(db: Session) -> dict:
    """
    Scans all Manga entries for values in author_plot, author_draw, publisher_tw, anime_studio.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    mangas = db.query(Manga).all()
    new_options = []

    for category, field in _MANGA_OPTION_FIELD_MAP.items():
        for manga in mangas:
            raw = getattr(manga, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    # author_draw uses the same "Manga Author" category
    for manga in mangas:
        raw = getattr(manga, "author_draw", None)
        if not raw:
            continue
        for val in (v.strip() for v in str(raw).split(",") if v.strip()):
            if val not in existing.get("Manga Author", set()):
                new_options.append(
                    SystemOption(category="Manga Author", value=val)
                )
                existing.setdefault("Manga Author", set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_manga: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(mangas)} entries, created {len(new_options)} missing system options.",
    }


_NOVEL_OPTION_FIELD_MAP = {
    "Novel Author": "author",
    "Novel Illustrator": "illustrator",
    "Novel Publisher TW": "publisher_tw",
}


def extract_system_options_from_novel(db: Session) -> dict:
    """
    Scans all Novel entries for values in author, illustrator, publisher_tw.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    novels = db.query(Novel).all()
    new_options = []

    for category, field in _NOVEL_OPTION_FIELD_MAP.items():
        for novel in novels:
            raw = getattr(novel, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_novel: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(novels)} entries, created {len(new_options)} missing system options.",
    }


_COMIC_OPTION_FIELD_MAP = {
    "Comic Publisher": "publisher",
    "Comic Imprint": "imprint",
    "Comic Continuity": "continuity",
    "Comic Era": "era",
    "Comic Event": "events",
    "Comic Writer": "writer",
    "Comic Artist": "artist",
    "Distributor TW": "publisher_tw",
}


def extract_system_options_from_comic(db: Session) -> dict:
    """
    Scans all Comic entries for values in publisher, imprint, continuity, era,
    events, writer, artist and publisher_tw. Any value not already in
    SystemOption is created. Comma-joined fields (events) are split per value.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.value.strip())

    comics = db.query(Comic).all()
    new_options = []

    for category, field in _COMIC_OPTION_FIELD_MAP.items():
        for comic in comics:
            raw = getattr(comic, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_comic: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(comics)} entries, created {len(new_options)} missing system options.",
    }
