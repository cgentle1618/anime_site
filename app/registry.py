"""
registry.py
Central binding table for the "regular" media types whose CRUD routers share
an identical shape. Each MediaTypeSpec holds the per-type facts (model, schemas,
name fields, filters, and the domain/pipeline callables) that the router factory
(`app/routers/_factory.py`) uses to build a full router.

Only the five uniform types live here. `anime` and `anime_movie` are genuinely
different (anime runs a synchronous ep-previous derivation; anime_movie has no
series and no write hook), so they remain hand-written routers by design.
"""

from dataclasses import dataclass, field
from typing import Callable, Optional

from app import models, schemas
from app.services.domain import (
    resolve_movie_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    mark_movie_completed,
    mark_tv_completed,
    mark_reading_completed,
    mark_novel_completed,
)
from app.services.pipelines import (
    execute_replace_single_movie,
    execute_replace_single_tv_show,
    execute_replace_single_cartoon,
    execute_replace_single_manga,
    execute_replace_single_novel,
)


@dataclass(frozen=True)
class MediaTypeSpec:
    """Per-type configuration consumed by make_media_router()."""

    key: str                       # internal key, e.g. "cartoon"
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
    write_hook: Callable           # async (db, id_str, action_type, log_action) -> ...

    @property
    def tags(self) -> list[str]:
        return [f"{self.label} Management"]


MEDIA_REGISTRY: dict[str, MediaTypeSpec] = {
    "movie": MediaTypeSpec(
        key="movie",
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
        mark_completed=mark_movie_completed,
        write_hook=execute_replace_single_movie,
    ),
    "tv_show": MediaTypeSpec(
        key="tv_show",
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
        mark_completed=mark_tv_completed,
        write_hook=execute_replace_single_tv_show,
    ),
    "cartoon": MediaTypeSpec(
        key="cartoon",
        label="Cartoon",
        route="cartoon",
        model=models.Cartoon,
        create_schema=schemas.CartoonCreate,
        update_schema=schemas.CartoonUpdate,
        response_schema=schemas.CartoonResponse,
        status_field="watching_status",
        list_filters=("franchise_id", "series_id", "watching_status", "airing_status", "to_rewatch"),
        hierarchy_names={"en": "cartoon_name_en", "cn": "cartoon_name_cn", "alt": "cartoon_name_alt"},
        search_fields=("cartoon_name_cn", "cartoon_name_en", "cartoon_name_alt"),
        resolve_hierarchy=resolve_cartoon_parent_hierarchy,
        mark_completed=mark_tv_completed,
        write_hook=execute_replace_single_cartoon,
    ),
    "manga": MediaTypeSpec(
        key="manga",
        label="Manga",
        route="manga",
        model=models.Manga,
        create_schema=schemas.MangaCreate,
        update_schema=schemas.MangaUpdate,
        response_schema=schemas.MangaResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status", "to_reread"),
        hierarchy_names={"en": "manga_name_en", "cn": "manga_name_cn", "roman": "manga_name_roman",
                         "jp": "manga_name_jp", "alt": "manga_name_alt"},
        search_fields=("manga_name_cn", "manga_name_en", "manga_name_roman", "manga_name_jp", "manga_name_alt"),
        resolve_hierarchy=resolve_manga_parent_hierarchy,
        mark_completed=mark_reading_completed,
        write_hook=execute_replace_single_manga,
    ),
    "novel": MediaTypeSpec(
        key="novel",
        label="Novel",
        route="novel",
        model=models.Novel,
        create_schema=schemas.NovelCreate,
        update_schema=schemas.NovelUpdate,
        response_schema=schemas.NovelResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status", "to_reread"),
        hierarchy_names={"en": "novel_name_en", "cn": "novel_name_cn", "roman": "novel_name_roman",
                         "jp": "novel_name_jp", "alt": "novel_name_alt"},
        search_fields=("novel_name_cn", "novel_name_en", "novel_name_roman", "novel_name_jp", "novel_name_alt"),
        resolve_hierarchy=resolve_novel_parent_hierarchy,
        mark_completed=mark_novel_completed,
        write_hook=execute_replace_single_novel,
    ),
}
