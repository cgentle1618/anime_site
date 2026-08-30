"""
routers/search.py
The cross-type search endpoint backing the nav dropdown and the /search page.

One request, one bucket per media type. The frontend used to fetch up to 2000
rows from each of twelve tables and filter them in the browser; the filtering
now happens in Postgres, so the response carries matches instead of the whole
collection. Matching rules live in services/domain/search.py.
"""

from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain.search import SCOPES, search
from app.services.rbac.resolver import Viewer, get_viewer

router = APIRouter(prefix="/api/search", tags=["Search"])

# Built from the service's own list so a new searchable type is accepted by the
# endpoint the moment it is registered, and an unknown scope is a 422 rather
# than a silently empty result.
Scope = Enum("Scope", {value.replace("-", "_"): value for value in SCOPES}, type=str)


class SearchBuckets(BaseModel):
    """One list per searchable type. Keys are the `scope` values."""

    collection: List[schemas.CollectionResponse] = []
    franchise: List[schemas.FranchiseResponse] = []
    series: List[schemas.SeriesResponse] = []
    anime: List[schemas.AnimeResponse] = []
    anime_movie: List[schemas.AnimeMovieResponse] = Field(
        default=[], alias="anime-movie"
    )
    movie: List[schemas.MovieResponse] = []
    tv_show: List[schemas.TVShowResponse] = Field(default=[], alias="tv-show")
    cartoon: List[schemas.CartoonResponse] = []
    manga: List[schemas.MangaResponse] = []
    novel: List[schemas.NovelResponse] = []
    comic: List[schemas.ComicResponse] = []
    seasonal: List[schemas.SeasonalResponse] = []

    # The bucket keys the frontend uses are hyphenated media-type keys, but
    # "anime-movie" is not a Python identifier. The aliases keep the wire format
    # equal to the media type, so the client can index buckets by type with no
    # translation table; populate_by_name lets this side build it by field name.
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class SearchResponse(BaseModel):
    query: str
    scope: str
    results: SearchBuckets
    # Franchises the anime results belong to — the filter pills on the search
    # page. Not the same as results.franchise, which is franchises whose own
    # name matched the query.
    related_franchises: List[schemas.FranchiseResponse] = []


@router.get("/", response_model=SearchResponse, summary="Search Across All Types")
def search_everything(
    q: Optional[str] = Query(default="", description="Search text."),
    scope: Scope = Query(default=Scope("all"), description="A media type, or 'all'."),
    limit: int = Query(default=500, ge=1, le=2000, description="Cap per bucket."),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Every entry, group, and season whose name matches `q`.

    Query and column are both stripped of case, whitespace, and punctuation
    before matching, so "re zero" finds "Re:Zero". An empty or all-punctuation
    query returns empty buckets rather than the whole collection.
    """
    buckets, related = search(db, viewer, q or "", scope.value, limit)
    return SearchResponse(
        query=q or "",
        scope=scope.value,
        results=SearchBuckets(
            **{key.replace("-", "_"): rows for key, rows in buckets.items()}
        ),
        related_franchises=related,
    )
