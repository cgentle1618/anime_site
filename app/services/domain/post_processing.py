"""Per-entry post-processing, single-entry replace, and franchise-wide derive-related orchestration."""

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

from app.services.domain.checking import (
    apply_check_baha,
    apply_validate_ch_math,
    apply_validate_episode_math,
    apply_validate_vol_math,
)
from app.services.domain.completion import (
    check_is_movie_completed,
    check_is_reading_completed,
    check_is_tv_completed,
    mark_movie_completed,
    mark_reading_completed,
    mark_tv_completed,
)
from app.services.domain.derivation import (
    apply_calculate_seasonal_from_month,
    apply_extract_imdb_id,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_season_from_title,
    derive_ep_previous_anime,
    derive_season_1_anime,
    derive_season_1_cartoon,
    derive_season_1_tv_show,
    derive_watch_order_anime,
    derive_watch_order_cartoon,
    derive_watch_order_tv_show,
)
from app.services.domain.autofill import (
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_manga_from_mal,
    autofill_movie_from_imdb,
    autofill_novel_from_mal,
    autofill_tv_show_from_imdb,
)


def apply_single_replace_anime(
    db: Session, anime: Anime, bulk: bool = False, force_replace_ratings: bool = True
) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    When bulk=False (single-entry update), also derives related entries.
    When bulk=True (batch replace), caller handles derive_related after the loop.
    """
    apply_extract_mal_id_anime(anime)
    autofill_anime_from_mal(anime, force_replace_ratings=force_replace_ratings)
    anime_post_processing(anime, db)

    if not bulk:
        derive_related_anime(db)


def apply_single_replace_anime_movie(
    db: Session,
    anime_movie: AnimeMovies,
    force_replace_ratings: bool = True,
) -> None:
    """
    Core 'Replace' logic for a single AnimeMovies entry.
    Used by both single-entry and bulk replace paths.
    """
    apply_extract_mal_id_anime(anime_movie)
    autofill_anime_movie_from_mal(
        anime_movie, force_replace_ratings=force_replace_ratings
    )
    anime_movie_post_processing(anime_movie, db)


def apply_single_replace_movie(db: Session, movie: Movies, bulk: bool = False) -> None:
    """Core 'Replace' logic for a single Movies entry."""
    apply_extract_imdb_id(movie)
    autofill_movie_from_imdb(movie, db)


def apply_single_replace_tv_show(
    db: Session, tv_show: TVShows, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single TVShows entry.
    When bulk=False, also derives related entries for all TV show franchises.
    When bulk=True, caller handles derive_related after the loop.
    """
    apply_extract_imdb_id(tv_show)
    autofill_tv_show_from_imdb(tv_show, db)
    tv_show_post_processing(tv_show, db)

    if not bulk:
        derive_related_tv_show(db)


def apply_single_replace_cartoon(
    db: Session, cartoon: Cartoon, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single Cartoon entry.
    When bulk=False, also derives related entries for all cartoon franchises.
    When bulk=True, caller handles derive_related after the loop.
    """
    apply_extract_imdb_id(cartoon)
    autofill_cartoon_from_imdb(cartoon, db)
    cartoon_post_processing(cartoon, db)

    if not bulk:
        derive_related_cartoon(db)


def apply_single_replace_manga(db: Session, manga: Manga, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Manga entry.
    When bulk=False (single-entry update), also derives related entries.
    When bulk=True (batch replace), caller handles derive_related after the loop.
    """
    apply_extract_mal_id_manga_novel(manga)
    autofill_manga_from_mal(manga, force_replace_ratings=True)
    manga_post_processing(manga, db)



def apply_single_replace_novel(db: Session, novel: Novel, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Novel entry.
    No post_processing and no derive_related — novel has neither.
    """
    apply_extract_mal_id_manga_novel(novel)
    autofill_novel_from_mal(novel, force_replace_ratings=True)



def anime_post_processing(anime: Anime, db: Session) -> None:
    apply_validate_episode_math(anime)
    apply_check_baha(anime)

    if check_is_tv_completed(anime) and anime.watching_status != "Completed":
        mark_tv_completed(anime)

    if (
        anime.release_season is None
        and anime.release_month is not None
        and anime.airing_type == "TV"
    ):
        apply_calculate_seasonal_from_month(anime)

    if anime.season_part is None:
        apply_extract_season_from_title(anime)
        derive_season_1_anime(anime, db)


def anime_movie_post_processing(anime_movie: AnimeMovies, db: Session) -> None:
    apply_check_baha(anime_movie)
    if (
        check_is_movie_completed(anime_movie)
        and anime_movie.watching_status != "Completed"
    ):
        mark_movie_completed(anime_movie)


def tv_show_post_processing(tv_show: TVShows, db: Session) -> None:
    apply_validate_episode_math(tv_show)

    if check_is_tv_completed(tv_show) and tv_show.watching_status != "Completed":
        mark_tv_completed(tv_show)

    if tv_show.season_part is None:
        apply_extract_season_from_title(tv_show)
        derive_season_1_tv_show(tv_show, db)


def cartoon_post_processing(cartoon: Cartoon, db: Session) -> None:
    apply_validate_episode_math(cartoon)

    if check_is_tv_completed(cartoon) and cartoon.watching_status != "Completed":
        mark_tv_completed(cartoon)

    if cartoon.season_part is None:
        apply_extract_season_from_title(cartoon)
        derive_season_1_cartoon(cartoon, db)


def manga_post_processing(manga: Manga, db: Session) -> None:
    """Runs all single-entry checks and repairs for one manga entry."""
    apply_validate_vol_math(manga)
    apply_validate_ch_math(manga)

    if check_is_reading_completed(manga) and manga.reading_status != "Completed":
        mark_reading_completed(manga)


def derive_related_anime(db: Session) -> None:
    """Derives watch order and ep_previous for all acg franchises."""
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_anime(db, fid)
        derive_ep_previous_anime(db, fid)
    if franchise_ids:
        db.commit()


def derive_related_tv_show(db: Session) -> None:
    """Derives watch order for all TV show franchises."""
    rows = (
        db.query(TVShows.franchise_id)
        .filter(TVShows.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_tv_show(db, fid)
    if franchise_ids:
        db.commit()


def derive_related_cartoon(db: Session) -> None:
    """Derives watch order for all cartoon franchises."""
    rows = (
        db.query(Cartoon.franchise_id)
        .filter(Cartoon.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_cartoon(db, fid)
    if franchise_ids:
        db.commit()
