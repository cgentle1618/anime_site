"""External-source enrichment (MAL / IMDb / Comic Vine) for single entries."""

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
from app.services.integrations.tenrai import fetch_tenrai_anime_data, fetch_tenrai_manga_novel_data
from app.services.integrations.imdb import fetch_imdb_data
from app.services.integrations.tmdb import fetch_tmdb_tv_season_data
from app.services.integrations.comicvine import fetch_comicvine_volume
from app.services.integrations.image_manager import download_cover_image
from app.utils.comicvine_utils import map_comicvine_to_comic_data
from app.utils.tenrai_utils import (
    map_tenrai_to_anime_data,
    map_tenrai_to_anime_movie_data,
    map_tenrai_to_manga_data,
    map_tenrai_to_novel_data,
)
from app.utils.imdb_utils import (
    _parse_season_number,
    _derive_tv_season_airing_status,
    map_imdb_to_cartoon_data,
    map_imdb_to_movie_data,
    map_imdb_to_tv_show_data,
)

logger = logging.getLogger(__name__)


def autofill_anime_from_mal(anime: Anime, force_replace_ratings: bool = True) -> None:
    """
    Dedicated logic to fetch MAL data via Tenrai and enrich a single Anime entry.
    Fills empty fields and overwrites ratings/rankings if instructed.
    """
    mal_id = anime.mal_id
    if not mal_id:
        return

    anime.mal_id = mal_id

    try:
        # MAL Fetch Anime and Anime Movies
        raw_data = fetch_tenrai_anime_data(mal_id)
        if not raw_data:
            return

        # MAL Conversion for Anime
        j_data = map_tenrai_to_anime_data(raw_data)

        # Fill Missing Data
        if anime.airing_type is None:
            anime.airing_type = j_data.get("airing_type")
        if anime.airing_status is None:
            anime.airing_status = j_data.get("airing_status")
        if anime.release_month is None:
            anime.release_month = j_data.get("release_month")
        if anime.release_season is None:
            anime.release_season = j_data.get("release_season")
        if anime.release_year is None:
            anime.release_year = j_data.get("release_year")
        if anime.ep_total is None:
            anime.ep_total = j_data.get("ep_total")
        if not anime.official_link:
            anime.official_link = j_data.get("official_link")
        if not anime.twitter_link:
            anime.twitter_link = j_data.get("twitter_link")

        # Overwrite Ratings
        if force_replace_ratings or anime.mal_rating is None:
            anime.mal_rating = (
                j_data.get("mal_rating")
                if j_data.get("mal_rating")
                else anime.mal_rating
            )
        if force_replace_ratings or anime.mal_rank is None:
            anime.mal_rank = (
                str(j_data.get("mal_rank"))
                if j_data.get("mal_rank")
                else anime.mal_rank
            )

        # Conditionally Download Cover Image
        if not anime.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Anime ID {anime.system_id} (MAL {mal_id}): {e}"
        )


def autofill_anime_movie_from_mal(
    anime_movie: AnimeMovies, force_replace_ratings: bool = True
) -> None:
    """
    Fetches Tenrai data for a single AnimeMovies entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    mal_id = anime_movie.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_tenrai_anime_data(mal_id)
        if not raw_data:
            return

        j_data = map_tenrai_to_anime_movie_data(raw_data)

        if anime_movie.airing_status is None:
            anime_movie.airing_status = j_data.get("airing_status")
        if anime_movie.release_date_jp is None:
            anime_movie.release_date_jp = j_data.get("release_date_jp")
        if not anime_movie.official_link:
            anime_movie.official_link = j_data.get("official_link")
        if not anime_movie.twitter_link:
            anime_movie.twitter_link = j_data.get("twitter_link")

        if force_replace_ratings or anime_movie.mal_rating is None:
            anime_movie.mal_rating = j_data.get("mal_rating") or anime_movie.mal_rating
        if force_replace_ratings or anime_movie.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            anime_movie.mal_rank = str(raw_rank) if raw_rank else anime_movie.mal_rank

        if not anime_movie.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(anime_movie.system_id)
            )
            if filename:
                anime_movie.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for AnimeMovie ID {anime_movie.system_id} (MAL {mal_id}): {e}"
        )


def autofill_manga_from_mal(manga: Manga, force_replace_ratings: bool = True) -> None:
    """
    Enriches a single Manga entry with Tenrai API data. Does not commit — caller is responsible.
    Fill-only: serialization_status, release_year, end_year.
    vol_total and ch_total are filled only when serialization_status == "完結".
    Ratings always replaced when force_replace_ratings=True.
    """
    mal_id = manga.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_tenrai_manga_novel_data(mal_id)
        if not raw_data:
            return

        j_data = map_tenrai_to_manga_data(raw_data)

        if manga.serialization_status is None:
            manga.serialization_status = j_data.get("serialization_status")
        if manga.release_year is None:
            manga.release_year = j_data.get("release_year")
        if manga.end_year is None:
            manga.end_year = j_data.get("end_year")

        if manga.serialization_status == "完結":
            if manga.vol_total is None:
                manga.vol_total = j_data.get("vol_total")
            if manga.ch_total is None:
                manga.ch_total = j_data.get("ch_total")

        if force_replace_ratings or manga.mal_rating is None:
            manga.mal_rating = j_data.get("mal_rating") or manga.mal_rating
        if force_replace_ratings or manga.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            manga.mal_rank = str(raw_rank) if raw_rank else manga.mal_rank

        if not manga.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(manga.system_id)
            )
            if filename:
                manga.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Manga ID {manga.system_id} (MAL {mal_id}): {e}"
        )


def autofill_novel_from_mal(novel: Novel, force_replace_ratings: bool = True) -> None:
    """
    Enriches a single Novel entry with Tenrai API data. Does not commit — caller is responsible.
    Fill-only: serialization_status, release_year, end_year.
    vol_total_original and ch_total are filled only when serialization_status == "完結".
    Ratings always replaced when force_replace_ratings=True.
    """
    mal_id = novel.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_tenrai_manga_novel_data(mal_id)
        if not raw_data:
            return

        j_data = map_tenrai_to_novel_data(raw_data)

        if novel.serialization_status is None:
            novel.serialization_status = j_data.get("serialization_status")
        if novel.release_year is None:
            novel.release_year = j_data.get("release_year")
        if novel.end_year is None:
            novel.end_year = j_data.get("end_year")

        if novel.serialization_status == "完結":
            if novel.vol_total_original is None:
                novel.vol_total_original = j_data.get("vol_total_original")
            if novel.ch_total is None:
                novel.ch_total = j_data.get("ch_total")

        if force_replace_ratings or novel.mal_rating is None:
            novel.mal_rating = j_data.get("mal_rating") or novel.mal_rating
        if force_replace_ratings or novel.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            novel.mal_rank = str(raw_rank) if raw_rank else novel.mal_rank

        if not novel.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(novel.system_id)
            )
            if filename:
                novel.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Novel ID {novel.system_id} (MAL {mal_id}): {e}"
        )


def autofill_movie_from_imdb(movie: Movies, db: Session) -> None:
    """
    Fetches TMDB + OMDb data for a single Movies entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    if movie.imdb_id is None:
        return

    try:

        result = fetch_imdb_data(movie.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        mapped = map_imdb_to_movie_data(tmdb_raw, omdb_raw)

        # Fill-only fields
        if movie.length_min is None:
            movie.length_min = mapped.get("length_min")
        if movie.director is None:
            movie.director = mapped.get("director")
        if movie.release_date_usa is None:
            movie.release_date_usa = mapped.get("release_date_usa")

        # Always overwrite imdb_rating if fetched
        fetched_rating = mapped.get("imdb_rating")
        if fetched_rating is not None:
            movie.imdb_rating = fetched_rating

        # Derive airing_status from raw release_date (fill-only)
        if movie.airing_status is None and tmdb_raw is not None:
            raw_date = tmdb_raw.get("release_date")
            if raw_date:
                try:
                    release_date = date.fromisoformat(raw_date)
                    movie.airing_status = (
                        "Finished Airing"
                        if release_date <= date.today()
                        else "Not Yet Aired"
                    )
                except (ValueError, TypeError):
                    pass

        # Download cover image if missing
        if movie.cover_image_file is None and mapped.get("cover_image_url"):
            filename = download_cover_image(
                mapped["cover_image_url"], str(movie.system_id)
            )
            if filename:
                movie.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for Movie ID {movie.system_id} (IMDb {movie.imdb_id}): {e}"
        )


def autofill_tv_show_from_imdb(tv_show: TVShows, db: Session) -> None:
    """
    Fetches TMDB + OMDb season data for a single TVShows entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    if tv_show.imdb_id is None:
        return

    try:
        result = fetch_imdb_data(tv_show.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        tmdb_season_raw = None
        if tmdb_raw is not None:
            tmdb_id = tmdb_raw.get("id")
            if tmdb_id:
                season_number = _parse_season_number(tv_show.season_part)
                tmdb_season_raw = fetch_tmdb_tv_season_data(tmdb_id, season_number)

        mapped = map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)

        # Fill-only fields
        if tv_show.release_date is None:
            tv_show.release_date = mapped.get("release_date")
        if tv_show.ep_total is None:
            fetched_ep_total = mapped.get("ep_total")
            if fetched_ep_total:
                tv_show.ep_total = fetched_ep_total

        # Always overwrite imdb_rating if fetched
        fetched_rating = mapped.get("imdb_rating")
        if fetched_rating is not None:
            tv_show.imdb_rating = fetched_rating

        # Derive airing_status (fill-only)
        if tv_show.airing_status is None:
            derived_status = _derive_tv_season_airing_status(
                mapped.get("_season_air_date"), mapped.get("_episodes")
            )
            if derived_status is not None:
                tv_show.airing_status = derived_status

        # Download cover image if missing
        if tv_show.cover_image_file is None and mapped.get("cover_image_url"):
            filename = download_cover_image(
                mapped["cover_image_url"], str(tv_show.system_id)
            )
            if filename:
                tv_show.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for TV Show ID {tv_show.system_id} (IMDb {tv_show.imdb_id}): {e}"
        )


def autofill_cartoon_from_imdb(cartoon: Cartoon, db: Session) -> None:
    """
    Fetches TMDB + OMDb data for a single Cartoon entry and fills/overwrites fields.
    Routes to movie path (airing_type == "Movie") or TV path (airing_type == "TV").
    All other airing_type values skip autofill entirely.
    Does not commit — caller is responsible.
    """
    if cartoon.imdb_id is None:
        return
    if cartoon.airing_type not in {"Movie", "TV"}:
        return

    try:
        result = fetch_imdb_data(cartoon.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        if cartoon.airing_type == "Movie":
            mapped = map_imdb_to_movie_data(tmdb_raw, omdb_raw)

            if cartoon.release_date is None:
                cartoon.release_date = mapped.get("release_date_usa")

            fetched_rating = mapped.get("imdb_rating")
            if fetched_rating is not None:
                cartoon.imdb_rating = fetched_rating

            if cartoon.airing_status is None and tmdb_raw is not None:
                raw_date = tmdb_raw.get("release_date")
                if raw_date:
                    try:
                        release_date = date.fromisoformat(raw_date)
                        cartoon.airing_status = (
                            "Finished Airing"
                            if release_date <= date.today()
                            else "Not Yet Aired"
                        )
                    except (ValueError, TypeError):
                        pass

            if cartoon.cover_image_file is None and mapped.get("cover_image_url"):
                filename = download_cover_image(
                    mapped["cover_image_url"], str(cartoon.system_id)
                )
                if filename:
                    cartoon.cover_image_file = filename

        else:  # airing_type == "TV"
            tmdb_season_raw = None
            if tmdb_raw is not None:
                tmdb_id = tmdb_raw.get("id")
                if tmdb_id:
                    season_number = _parse_season_number(cartoon.season_part)
                    tmdb_season_raw = fetch_tmdb_tv_season_data(tmdb_id, season_number)

            mapped = map_imdb_to_cartoon_data(tmdb_raw, tmdb_season_raw, omdb_raw)

            if cartoon.release_date is None:
                cartoon.release_date = mapped.get("release_date")
            if cartoon.ep_total is None:
                fetched_ep_total = mapped.get("ep_total")
                if fetched_ep_total:
                    cartoon.ep_total = fetched_ep_total

            fetched_rating = mapped.get("imdb_rating")
            if fetched_rating is not None:
                cartoon.imdb_rating = fetched_rating

            if cartoon.airing_status is None:
                derived_status = _derive_tv_season_airing_status(
                    mapped.get("_season_air_date"), mapped.get("_episodes")
                )
                if derived_status is not None:
                    cartoon.airing_status = derived_status

            if cartoon.cover_image_file is None and mapped.get("cover_image_url"):
                filename = download_cover_image(
                    mapped["cover_image_url"], str(cartoon.system_id)
                )
                if filename:
                    cartoon.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for Cartoon ID {cartoon.system_id} (IMDb {cartoon.imdb_id}): {e}"
        )


def autofill_comic_from_comicvine(comic: Comic) -> None:
    """
    Enriches a single Comic entry with Comic Vine volume data. Does not commit —
    caller is responsible.

    Fill-only throughout: nothing already set by the admin is replaced. That
    includes comic_name_en, which is the entry's identity and often a deliberate
    shorthand, so it is never touched at all.
    """
    comicvine_id = comic.comicvine_id
    if not comicvine_id:
        return

    try:
        raw_data = fetch_comicvine_volume(comicvine_id)
        if not raw_data:
            return

        cv_data = map_comicvine_to_comic_data(raw_data)

        for field in ("publisher", "writer", "artist", "release_year", "issue_total", "volume_label"):
            if getattr(comic, field, None) is None:
                setattr(comic, field, cv_data.get(field))

        if not comic.cover_image_file and cv_data.get("cover_image_url"):
            filename = download_cover_image(
                cv_data.get("cover_image_url"), str(comic.system_id)
            )
            if filename:
                comic.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"Comic Vine Autofill failed for Comic ID {comic.system_id} "
            f"(Volume {comicvine_id}): {e}"
        )
