"""
registry.py
Central binding table for every media type. Each MediaTypeSpec holds the
per-type facts (model, schemas, name fields, filters, and the domain/pipeline
callables) that the router factory (`app/routers/_factory.py`) turns into a
full CRUD router.

Anime and anime movie differ from the six regular types only in the hooks they
declare: anime runs a synchronous autofill + ep_previous derivation before
commit (`pre_commit_hook`) instead of a post-commit `write_hook`, and anime
movie has no series and no hook at all.
"""

from dataclasses import dataclass
from typing import Callable, Optional

from sqlalchemy import exists, func

from app import models, schemas
from app.services.domain import (
    derive_novel_catalog,
    derive_novel_list,
    mark_comic_catalog,
    mark_comic_list,
    mark_game_catalog,
    mark_game_list,
    mark_movie_catalog,
    mark_movie_list,
    mark_novel_catalog,
    mark_novel_list,
    mark_reading_catalog,
    mark_reading_list,
    mark_tv_catalog,
    mark_tv_list,
    resolve_anime_movie_parent_hierarchy,
    resolve_anime_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_comic_parent_hierarchy,
    resolve_game_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
    write_game_copies,
    write_novel_units,
)
from app.services.domain.anime_write import prepare_anime_write
from app.services.domain.sources import media_sources_writer
from app.services.pipelines import (
    execute_replace_single_cartoon,
    execute_replace_single_comic,
    execute_replace_single_game,
    execute_replace_single_manga,
    execute_replace_single_movie,
    execute_replace_single_novel,
    execute_replace_single_tv_show,
)


@dataclass(frozen=True)
class MediaTypeSpec:
    """Per-type configuration consumed by make_media_router()."""

    key: str                       # internal key, e.g. "cartoon"
    # The hyphenated OWNER_TABLES key, which differs from `key` for tv_show.
    # Notes and remarks are addressed by this, never by `key`.
    owner_type: str
    label: str                     # human label used in messages/tags, e.g. "Cartoon"
    route: str                     # URL segment, e.g. "cartoon" -> /api/cartoon
    model: type
    create_schema: type
    update_schema: type
    response_schema: type
    status_field: str              # "watching_status" or "reading_status"
    # Equality-filter query params applied to the list endpoint (column names).
    list_filters: tuple[str, ...]
    # Semantic-key -> column name, passed to the hierarchy resolver.
    hierarchy_names: dict
    # Columns searched by `search_query` (empty tuple = no search on this type).
    search_fields: tuple[str, ...]
    resolve_hierarchy: Callable    # (db, franchise_id, series_id, names) -> (fid, sid)
    mark_completed: Callable       # (entry) -> None
    # (row, entry) -> None. The personal half of mark_completed, used by the
    # /complete endpoint. Kept beside its
    # catalogue twin so a type can never declare one without the other.
    mark_completed_list: Optional[Callable] = None
    write_hook: Optional[Callable] = None   # async (db, id_str, action_type, log_action), after commit
    pre_commit_hook: Optional[Callable] = None  # (db, entry) inside the create/update transaction
    # Payload key -> writer(db, entry, value), popped before the model is
    # built because the value is not a column. Only novel uses this.
    nested_collections: Optional[dict] = None
    # (db, entry) -> None, called in create, update AND patch, after columns
    # and nested collections are applied. Distinct from pre_commit_hook,
    # which patch deliberately does not call. Only novel uses this.
    progress_hook: Optional[Callable] = None
    # (row, entry) -> None, run after a list payload is applied. Only novel
    # uses it; it is the per-user twin of progress_hook, and it has to run
    # after the payload so it sees the reader's NEW cursor.
    progress_hook_list: Optional[Callable] = None
    has_series: bool = True                     # anime_movies carries no series_id column
    # (query, query_params) -> query, for filters that are not plain equality.
    extra_filters: Optional[Callable] = None

    @property
    def tags(self) -> list[str]:
        return [f"{self.label} Management"]


def _anime_airing_season(query, params, user_id=None):
    """?airing_season=SPR 2024 -> release_season + year prefix of release_date."""
    raw = params.get("airing_season")
    if not raw:
        return query
    parts = raw.strip().split(" ", 1)
    if len(parts) != 2:
        return query
    return query.filter(
        models.Anime.release_season == parts[0],
        func.substr(models.Anime.release_date, 1, 4) == parts[1],
    )


def _game_ownership(query, params, user_id=None):
    """?ownership=Owned -> games the acting user owns a copy row for.

    Ownership is derived from the copy rows rather than stored, so the filter
    is an EXISTS over game_copy instead of a column comparison. Scoped to
    user_id since Task 19: one person's purchases must not filter another's
    list.
    """
    wanted = params.get("ownership")
    if not wanted:
        return query
    return query.filter(
        exists().where(
            models.GameCopy.game_id == models.Game.system_id,
            models.GameCopy.ownership == wanted,
            models.GameCopy.user_id == user_id,
        )
    )


MEDIA_REGISTRY: dict[str, MediaTypeSpec] = {
    "anime": MediaTypeSpec(
        key="anime",
        owner_type="anime",
        label="Anime",
        route="anime",
        model=models.Anime,
        create_schema=schemas.AnimeCreate,
        update_schema=schemas.AnimeUpdate,
        response_schema=schemas.AnimeResponse,
        status_field="watching_status",
        # watching_status joins the filters here: it was never declared, so the
        # parameter was silently ignored, and now that it resolves through the
        # joined list row it should be declared rather than half-supported.
        list_filters=("franchise_id", "series_id", "watching_status"),
        hierarchy_names={"en": "anime_name_en", "cn": "anime_name_cn", "roman": "anime_name_roman",
                         "jp": "anime_name_jp", "alt": "anime_name_alt"},
        search_fields=("anime_name_en", "anime_name_cn", "anime_name_roman", "anime_name_jp", "anime_name_alt"),
        resolve_hierarchy=resolve_anime_parent_hierarchy,
        # The catalogue half only: from here the personal half of finishing an
        # anime lives on the list row, and mark_tv_completed would try to set a
        # column that no longer exists. tv_show and cartoon still point at the
        # combined helper until Tasks 12 and 13.
        mark_completed=mark_tv_catalog,
        mark_completed_list=mark_tv_list,
        pre_commit_hook=prepare_anime_write,
        extra_filters=_anime_airing_season,
        nested_collections={"sources": media_sources_writer("anime")},
    ),
    "anime_movie": MediaTypeSpec(
        key="anime_movie",
        owner_type="anime-movie",
        label="Anime Movie",
        route="anime-movie",
        model=models.AnimeMovies,
        create_schema=schemas.AnimeMovieCreate,
        update_schema=schemas.AnimeMovieUpdate,
        response_schema=schemas.AnimeMovieResponse,
        status_field="watching_status",
        list_filters=("franchise_id", "watching_status"),
        hierarchy_names={"en": "anime_movie_name_en", "cn": "anime_movie_name_cn", "roman": "anime_movie_name_roman",
                         "jp": "anime_movie_name_jp", "alt": "anime_movie_name_alt"},
        search_fields=("anime_movie_name_en", "anime_movie_name_cn", "anime_movie_name_roman",
                       "anime_movie_name_jp", "anime_movie_name_alt"),
        resolve_hierarchy=lambda db, fid, sid, names: (resolve_anime_movie_parent_hierarchy(db, fid, names), None),
        mark_completed=mark_movie_catalog,
        mark_completed_list=mark_movie_list,
        has_series=False,
        nested_collections={"sources": media_sources_writer("anime-movie")},
    ),
    "movie": MediaTypeSpec(
        key="movie",
        owner_type="movie",
        label="Movie",
        route="movies",
        model=models.Movies,
        create_schema=schemas.MovieCreate,
        update_schema=schemas.MovieUpdate,
        response_schema=schemas.MovieResponse,
        status_field="watching_status",
        list_filters=("franchise_id", "series_id", "watching_status", "airing_status", "movie_type"),
        hierarchy_names={"en": "movie_name_en", "cn": "movie_name_cn", "alt": "movie_name_alt"},
        search_fields=("movie_name_cn", "movie_name_en", "movie_name_alt"),
        resolve_hierarchy=resolve_movie_parent_hierarchy,
        mark_completed=mark_movie_catalog,
        mark_completed_list=mark_movie_list,
        write_hook=execute_replace_single_movie,
        nested_collections={"sources": media_sources_writer("movie")},
    ),
    "tv_show": MediaTypeSpec(
        key="tv_show",
        owner_type="tv-show",
        label="TV Show",
        route="tv-shows",
        model=models.TVShows,
        create_schema=schemas.TVShowCreate,
        update_schema=schemas.TVShowUpdate,
        response_schema=schemas.TVShowResponse,
        status_field="watching_status",
        list_filters=("franchise_id", "series_id", "watching_status", "airing_status", "region"),
        hierarchy_names={"en": "tv_name_en", "cn": "tv_name_cn", "alt": "tv_name_alt"},
        search_fields=("tv_name_cn", "tv_name_en", "tv_name_alt"),
        resolve_hierarchy=resolve_tv_show_parent_hierarchy,
        mark_completed=mark_tv_catalog,
        mark_completed_list=mark_tv_list,
        write_hook=execute_replace_single_tv_show,
        nested_collections={"sources": media_sources_writer("tv-show")},
    ),
    "cartoon": MediaTypeSpec(
        key="cartoon",
        owner_type="cartoon",
        label="Cartoon",
        route="cartoon",
        model=models.Cartoon,
        create_schema=schemas.CartoonCreate,
        update_schema=schemas.CartoonUpdate,
        response_schema=schemas.CartoonResponse,
        status_field="watching_status",
        list_filters=("franchise_id", "series_id", "watching_status", "airing_status"),
        hierarchy_names={"en": "cartoon_name_en", "cn": "cartoon_name_cn", "alt": "cartoon_name_alt"},
        search_fields=("cartoon_name_cn", "cartoon_name_en", "cartoon_name_alt"),
        resolve_hierarchy=resolve_cartoon_parent_hierarchy,
        mark_completed=mark_tv_catalog,
        mark_completed_list=mark_tv_list,
        write_hook=execute_replace_single_cartoon,
        nested_collections={"sources": media_sources_writer("cartoon")},
    ),
    "manga": MediaTypeSpec(
        key="manga",
        owner_type="manga",
        label="Manga",
        route="manga",
        model=models.Manga,
        create_schema=schemas.MangaCreate,
        update_schema=schemas.MangaUpdate,
        response_schema=schemas.MangaResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status"),
        hierarchy_names={"en": "manga_name_en", "cn": "manga_name_cn", "roman": "manga_name_roman",
                         "jp": "manga_name_jp", "alt": "manga_name_alt"},
        search_fields=("manga_name_cn", "manga_name_en", "manga_name_roman", "manga_name_jp", "manga_name_alt"),
        resolve_hierarchy=resolve_manga_parent_hierarchy,
        mark_completed=mark_reading_catalog,
        mark_completed_list=mark_reading_list,
        write_hook=execute_replace_single_manga,
        nested_collections={"sources": media_sources_writer("manga")},
    ),
    "novel": MediaTypeSpec(
        key="novel",
        owner_type="novel",
        label="Novel",
        route="novel",
        model=models.Novel,
        create_schema=schemas.NovelCreate,
        update_schema=schemas.NovelUpdate,
        response_schema=schemas.NovelResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status"),
        hierarchy_names={"en": "novel_name_en", "cn": "novel_name_cn", "roman": "novel_name_roman",
                         "jp": "novel_name_jp", "alt": "novel_name_alt"},
        search_fields=("novel_name_cn", "novel_name_en", "novel_name_roman", "novel_name_jp", "novel_name_alt"),
        resolve_hierarchy=resolve_novel_parent_hierarchy,
        mark_completed=mark_novel_catalog,
        mark_completed_list=mark_novel_list,
        write_hook=execute_replace_single_novel,
        nested_collections={
            "units": write_novel_units,
            "sources": media_sources_writer("novel"),
        },
        progress_hook=lambda db, entry: derive_novel_catalog(entry),
        progress_hook_list=lambda row, entry: derive_novel_list(row, entry),
    ),
    "comic": MediaTypeSpec(
        key="comic",
        owner_type="comic",
        label="Comic",
        route="comic",
        model=models.Comic,
        create_schema=schemas.ComicCreate,
        update_schema=schemas.ComicUpdate,
        response_schema=schemas.ComicResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status"),
        hierarchy_names={"en": "comic_name_en", "cn": "comic_name_cn", "alt": "comic_name_alt"},
        search_fields=("comic_name_en", "comic_name_cn", "comic_name_alt"),
        resolve_hierarchy=resolve_comic_parent_hierarchy,
        mark_completed=mark_comic_catalog,
        mark_completed_list=mark_comic_list,
        write_hook=execute_replace_single_comic,
        nested_collections={"sources": media_sources_writer("comic")},
    ),
    "game": MediaTypeSpec(
        key="game",
        owner_type="game",
        label="Game",
        route="game",
        model=models.Game,
        create_schema=schemas.GameCreate,
        update_schema=schemas.GameUpdate,
        response_schema=schemas.GameResponse,
        status_field="playing_status",
        list_filters=("franchise_id", "series_id", "playing_status", "release_status", "game_type"),
        hierarchy_names={"en": "game_name_en", "cn": "game_name_cn", "roman": "game_name_roman",
                         "jp": "game_name_jp", "alt": "game_name_alt"},
        search_fields=("game_name_en", "game_name_cn", "game_name_roman", "game_name_jp", "game_name_alt"),
        resolve_hierarchy=resolve_game_parent_hierarchy,
        mark_completed=mark_game_catalog,
        mark_completed_list=mark_game_list,
        extra_filters=_game_ownership,
        # Nothing external is fetched yet, so this only re-runs the shared
        # post-write step; the name exists from Task 9's pipeline spec.
        write_hook=execute_replace_single_game,
        nested_collections={
            "copies": write_game_copies,
            "sources": media_sources_writer("game"),
        },
    ),
}
