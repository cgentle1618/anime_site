"""
services/domain/search.py
Cross-type search — one query per media table, run in the database.

Every table that carries a name is searchable here, so the frontend can ask one
question ("what matches 'gundam'?") instead of downloading each table and
filtering the rows in the browser.

Matching mirrors the frontend's `cleanString` (frontend/src/lib/naming.js):
both the query and the column are lowercased and stripped of whitespace and
punctuation before the substring test, so "re zero" still finds "Re:Zero". The
normalisation runs in SQL, which means it is the database that decides what
matches - the same rule the browser used to apply after the fact.
"""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.registry import MEDIA_REGISTRY
from app.services.domain.credits import attach_link_fields
from app.services.domain.plan_next import planned_entry_ids
from app.services.rbac.enforcement import apply_entry_visibility
from app.services.rbac.field_gate import gate
from app.utils.plan_next_kinds import PLAN_FLAG_FIELDS

# The characters cleanString deletes: whitespace plus the punctuation that
# separates words in a title. translate() drops every character listed here
# because the replacement string is empty.
#
# Kept character-for-character in step with the JS regex. Two notes for anyone
# editing it: '%' is on the list, so a query of nothing but wildcards
# normalises to the empty string rather than matching every row; '_' is NOT on
# the list, which is why the LIKE below still has to autoescape.
_STRIPPED = " \t\n\r-:;,.'\"!?()[]{}<>~`+*&^%$#@\/|"


def clean_string(value: Optional[str]) -> str:
    """Python-side `cleanString`. Used for the query; the columns use SQL."""
    if not value:
        return ""
    return "".join(c for c in value.lower() if c not in _STRIPPED)


def normalized(column):
    """The SQL expression that puts a column in cleanString form."""
    return func.translate(func.lower(column), _STRIPPED, "")


@dataclass(frozen=True)
class SearchableType:
    """One bucket of the search response."""

    key: str                       # bucket key, also the public `scope` value
    model: type
    response_schema: type
    name_fields: tuple[str, ...]   # columns the query is matched against
    sort_field: str                # column results are ordered by
    # Entry types are gated by RBAC and carry plan flags and link fields; the
    # grouping tiers and seasonal are none of those things.
    owner_type: Optional[str] = None
    # Seasonal reads newest-first; every name-sorted type reads A-Z.
    sort_desc: bool = False


def _spec(key: str, registry_key: str, sort_field: str) -> SearchableType:
    """A searchable type whose columns are already declared in MEDIA_REGISTRY."""
    entry = MEDIA_REGISTRY[registry_key]
    return SearchableType(
        key=key,
        model=entry.model,
        response_schema=entry.response_schema,
        name_fields=entry.search_fields,
        sort_field=sort_field,
        owner_type=entry.owner_type,
    )


# Ordered as the search page stacks its sections: grouping tiers, then entries,
# then seasonal. The six registry-backed types read their name columns from the
# registry so the two searches can never drift apart; the other six are
# hand-written routers with no spec of their own, so they declare theirs here.
SEARCHABLE_TYPES: tuple[SearchableType, ...] = (
    SearchableType(
        key="collection",
        model=models.Collection,
        response_schema=schemas.CollectionResponse,
        name_fields=(
            "collection_name_cn", "collection_name_en", "collection_name_roman",
            "collection_name_jp", "collection_name_alt",
        ),
        sort_field="collection_name_cn",
    ),
    SearchableType(
        key="franchise",
        model=models.Franchise,
        response_schema=schemas.FranchiseResponse,
        name_fields=(
            "franchise_name_cn", "franchise_name_en", "franchise_name_roman",
            "franchise_name_jp", "franchise_name_alt",
        ),
        sort_field="franchise_name_cn",
    ),
    SearchableType(
        key="series",
        model=models.Series,
        response_schema=schemas.SeriesResponse,
        name_fields=("series_name_cn", "series_name_en", "series_name_alt"),
        sort_field="series_name_cn",
    ),
    SearchableType(
        key="anime",
        model=models.Anime,
        response_schema=schemas.AnimeResponse,
        name_fields=(
            "anime_name_cn", "anime_name_en", "anime_name_roman",
            "anime_name_jp", "anime_name_alt",
        ),
        sort_field="anime_name_cn",
        owner_type="anime",
    ),
    SearchableType(
        key="anime-movie",
        model=models.AnimeMovies,
        response_schema=schemas.AnimeMovieResponse,
        name_fields=(
            "anime_movie_name_cn", "anime_movie_name_en",
            "anime_movie_name_roman", "anime_movie_name_jp",
            "anime_movie_name_alt",
        ),
        sort_field="anime_movie_name_cn",
        owner_type="anime-movie",
    ),
    _spec("movie", "movie", "movie_name_cn"),
    _spec("tv-show", "tv_show", "tv_name_cn"),
    _spec("cartoon", "cartoon", "cartoon_name_cn"),
    _spec("manga", "manga", "manga_name_cn"),
    _spec("novel", "novel", "novel_name_cn"),
    # Comic sorts on the English title, not the Chinese one every other type
    # sorts by: a comic's display name falls back EN -> CN -> Alt, so sorting on
    # CN would order the list by a name most rows do not show.
    _spec("comic", "comic", "comic_name_en"),
    SearchableType(
        key="seasonal",
        model=models.Seasonal,
        response_schema=schemas.SeasonalResponse,
        name_fields=("seasonal",),
        sort_field="seasonal",
        sort_desc=True,
    ),
)

SEARCHABLE_BY_KEY: dict[str, SearchableType] = {t.key: t for t in SEARCHABLE_TYPES}

# Every accepted `scope` value.
SCOPES: tuple[str, ...] = ("all",) + tuple(SEARCHABLE_BY_KEY)


def _name_filter(spec: SearchableType, q_clean: str):
    """OR of "this name column contains the normalised query"."""
    return or_(
        *[
            normalized(getattr(spec.model, field)).contains(q_clean, autoescape=True)
            for field in spec.name_fields
        ]
    )


def _exact_first(spec: SearchableType, q_clean: str):
    """
    Sort key floating whole-title matches to the top.

    Searching "one piece" should not bury the show under every title that
    merely contains it. The nav dropdown already did this in JS; doing it in SQL
    means the ordering survives the per-type limit, which the JS pass could not
    - an exact match ranked 501st was cut before it could be floated.
    """
    matches = or_(
        *[
            normalized(getattr(spec.model, field)) == q_clean
            for field in spec.name_fields
        ]
    )
    # False sorts before True in Postgres, so negate to put exact matches first.
    return ~matches


def _run(
    db: Session, viewer, spec: SearchableType, criteria, q_clean: str, limit: int
) -> list:
    """One type's matching rows, visibility-filtered, ordered, and capped."""
    query = db.query(spec.model)
    if spec.owner_type is not None:
        query = apply_entry_visibility(query, spec.model, spec.owner_type, db, viewer)
    sort_column = getattr(spec.model, spec.sort_field)
    order = sort_column.desc() if spec.sort_desc else sort_column.asc()
    return (
        query.filter(criteria)
        .order_by(_exact_first(spec, q_clean), order)
        .limit(limit)
        .all()
    )


def _decorate(db: Session, viewer, spec: SearchableType, entries: list):
    """Attach the non-column fields the list endpoints attach, then field-gate."""
    if spec.owner_type is None:
        return entries
    for field, kind in PLAN_FLAG_FIELDS.get(spec.owner_type, ()):
        planned = planned_entry_ids(db, spec.owner_type, kind)
        for entry in entries:
            setattr(entry, field, entry.system_id in planned)
    attach_link_fields(db, spec.owner_type, entries)
    return gate(viewer, spec.owner_type, entries, spec.response_schema)


def _related_franchises(db: Session, entries: list, limit: int) -> list:
    """The franchise rows the anime results belong to — the filter pills.

    Distinct from the `franchise` bucket, which holds franchises whose own name
    matched. A pill exists so the anime list can be narrowed, so it is derived
    from the results rather than from the query.
    """
    ids = {entry.franchise_id for entry in entries if entry.franchise_id}
    if not ids:
        return []
    return (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id.in_(ids))
        .order_by(models.Franchise.franchise_name_cn)
        .limit(limit)
        .all()
    )


def search(db: Session, viewer, query: str, scope: str = "all", limit: int = 500):
    """
    Search every type (or the one named by `scope`) for `query`.

    Returns (buckets, related_franchises). Buckets always carry a key for every
    searchable type, empty for the ones this scope did not ask about, so the
    caller never has to test for a missing key.
    """
    buckets: dict[str, list] = {spec.key: [] for spec in SEARCHABLE_TYPES}
    q_clean = clean_string(query)
    if not q_clean:
        return buckets, []

    active = (
        SEARCHABLE_TYPES if scope == "all" else (SEARCHABLE_BY_KEY[scope],)
    )
    raw: dict[str, list] = {}
    for spec in active:
        criteria = _name_filter(spec, q_clean)
        # A franchise whose name matched brings its anime with it, so searching
        # a franchise finds the shows in it even when none of their own titles
        # contain the query. Only at scope "all": a scoped anime search is a
        # question about anime names, and the widened result would look wrong.
        if spec.key == "anime" and scope == "all":
            matched_franchises = raw.get("franchise", [])
            if matched_franchises:
                criteria = or_(
                    criteria,
                    models.Anime.franchise_id.in_(
                        [f.system_id for f in matched_franchises]
                    ),
                )
        raw[spec.key] = _run(db, viewer, spec, criteria, q_clean, limit)

    related = _related_franchises(db, raw.get("anime", []), limit)
    for spec in active:
        buckets[spec.key] = _decorate(db, viewer, spec, raw[spec.key])
    return buckets, related
