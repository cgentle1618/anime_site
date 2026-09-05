"""Per-entry post-processing, single-entry replace, and franchise-wide derive-related orchestration."""

import logging

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Manga,
    Movies,
    Novel,
    TVShows,
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
    apply_extract_novel_ids,
    apply_extract_season_from_title,
    derive_ep_previous_anime,
    derive_season_1_anime,
    derive_season_1_cartoon,
    derive_season_1_tv_show,
)
from app.utils.constants import (
    COMPLETED_READ_STATUSES,
    COMPLETED_WATCH_STATUSES,
)

logger = logging.getLogger(__name__)


def apply_single_replace_anime(
    db: Session, anime: Anime, bulk: bool = False, force_replace_ratings: bool = True
) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    When bulk=False (single-entry update), also derives ep_previous across every
    acg franchise. When bulk=True (batch replace), the caller does that once
    after the loop instead of per entry.
    """
    apply_extract_mal_id_anime(anime)
    autofill_anime_from_mal(
        anime, force_replace_ratings=force_replace_ratings, db=db
    )
    anime_post_processing(anime, db)

    if not bulk:
        derive_ep_previous_all_anime(db)


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
        anime_movie, force_replace_ratings=force_replace_ratings, db=db
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
    Nothing is derived franchise-wide any more - watch order was the only such
    field and it moved to watch_order_list - so `bulk` no longer changes what
    this does. It is kept for signature parity with the other media types.
    """
    apply_extract_imdb_id(tv_show)
    autofill_tv_show_from_imdb(tv_show, db)
    tv_show_post_processing(tv_show, db)


def apply_single_replace_cartoon(
    db: Session, cartoon: Cartoon, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single Cartoon entry.
    Nothing is derived franchise-wide any more - watch order was the only such
    field and it moved to watch_order_list - so `bulk` no longer changes what
    this does. It is kept for signature parity with the other media types.
    """
    apply_extract_imdb_id(cartoon)
    autofill_cartoon_from_imdb(cartoon, db)
    cartoon_post_processing(cartoon, db)


def apply_single_replace_manga(db: Session, manga: Manga, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Manga entry.
    Nothing is derived franchise-wide for manga; `bulk` is accepted for
    signature parity with the other media types.
    """
    apply_extract_mal_id_manga_novel(manga)
    autofill_manga_from_mal(manga, force_replace_ratings=True)
    manga_post_processing(manga, db)



def apply_single_replace_novel(db: Session, novel: Novel, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Novel entry.
    No post_processing and nothing derived franchise-wide — novel has neither.

    Both ids are derived, but only MAL is re-fetched: Replace is deliberately
    not wired to Open Library. Deriving openlibrary_id here anyway keeps the id
    in step with its link, so the next Fill has something to key off.
    """
    apply_extract_novel_ids(novel)
    autofill_novel_from_mal(novel, force_replace_ratings=True)



def anime_post_processing(anime: Anime, db: Session) -> None:
    apply_validate_episode_math(anime)
    apply_check_baha(db, anime, "anime")

    if (
        check_is_tv_completed(anime)
        and anime.watching_status not in COMPLETED_WATCH_STATUSES
    ):
        mark_tv_completed(anime)

    if (
        anime.release_season is None
        and anime.release_date is not None
        and anime.airing_type == "TV"
    ):
        apply_calculate_seasonal_from_month(anime)

    if anime.season_part is None:
        apply_extract_season_from_title(anime)
        derive_season_1_anime(anime, db)


def anime_movie_post_processing(anime_movie: AnimeMovies, db: Session) -> None:
    apply_check_baha(db, anime_movie, "anime-movie")
    if (
        check_is_movie_completed(anime_movie)
        and anime_movie.watching_status not in COMPLETED_WATCH_STATUSES
    ):
        mark_movie_completed(anime_movie)


def tv_show_post_processing(tv_show: TVShows, db: Session) -> None:
    apply_validate_episode_math(tv_show)

    if (
        check_is_tv_completed(tv_show)
        and tv_show.watching_status not in COMPLETED_WATCH_STATUSES
    ):
        mark_tv_completed(tv_show)

    if tv_show.season_part is None:
        apply_extract_season_from_title(tv_show)
        derive_season_1_tv_show(tv_show, db)


def cartoon_post_processing(cartoon: Cartoon, db: Session) -> None:
    apply_validate_episode_math(cartoon)

    if (
        check_is_tv_completed(cartoon)
        and cartoon.watching_status not in COMPLETED_WATCH_STATUSES
    ):
        mark_tv_completed(cartoon)

    if cartoon.season_part is None:
        apply_extract_season_from_title(cartoon)
        derive_season_1_cartoon(cartoon, db)


def manga_post_processing(manga: Manga, db: Session) -> None:
    """Runs all single-entry checks and repairs for one manga entry."""
    apply_validate_vol_math(manga)
    apply_validate_ch_math(manga)

    if (
        check_is_reading_completed(manga)
        and manga.reading_status not in COMPLETED_READ_STATUSES
    ):
        mark_reading_completed(manga)


def derive_ep_previous_all_anime(db: Session) -> None:
    """Derives ep_previous for every acg franchise.

    Was derive_related_anime, which also assigned watch_order. Ordering moved
    to watch_order_list / watch_order_item, where it is curated rather than
    guessed, so ep_previous is all that is still derived franchise-wide.
    """
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_ep_previous_anime(db, fid)
    if franchise_ids:
        db.commit()


