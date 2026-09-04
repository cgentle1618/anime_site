"""
The read-only link fields on the *Response schemas must stay in step with
credit_roles, and must never leak onto the Create/Update bases.

Dropping a column does not break Python that references it - the whole class of
bug this redesign kept re-hitting. The same is true in reverse: adding a credit
role or tag field without adding its payload key would silently blank a public
page again. This test is the tripwire.
"""

import pytest

from app import schemas
from app.schemas.link_fields import LINK_FIELD_MIXINS
from app.services.domain.credits import legacy_link_fields

RESPONSE_SCHEMAS = {
    "anime": schemas.AnimeResponse,
    "anime-movie": schemas.AnimeMovieResponse,
    "movie": schemas.MovieResponse,
    "tv-show": schemas.TVShowResponse,
    "cartoon": schemas.CartoonResponse,
    "manga": schemas.MangaResponse,
    "novel": schemas.NovelResponse,
    "comic": schemas.ComicResponse,
}

CREATE_SCHEMAS = {
    "anime": schemas.AnimeCreate,
    "anime-movie": schemas.AnimeMovieCreate,
    "movie": schemas.MovieCreate,
    "tv-show": schemas.TVShowCreate,
    "cartoon": schemas.CartoonCreate,
    "manga": schemas.MangaCreate,
    "novel": schemas.NovelCreate,
    "comic": schemas.ComicCreate,
}


# Fields carried on a mixin beside its legacy sheet columns, with no
# credit_roles/tag_fields entry of their own - so the drift test below must
# not expect them from `legacy_link_fields`. Both repeat credits the sheet
# columns already carry, as linkable objects rather than joined strings:
# `studio_refs` for the "studio" credit, `credit_refs` for every person credit.
NON_SHEET_FIELDS = {"studio_refs", "credit_refs"}


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_mixin_matches_the_credit_role_vocabulary(media_type):
    expected = {attr for attr, _kind, _key in legacy_link_fields(media_type)}
    actual = set(LINK_FIELD_MIXINS[media_type].model_fields) - NON_SHEET_FIELDS
    assert actual == expected


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_response_schema_carries_every_link_field(media_type):
    fields = RESPONSE_SCHEMAS[media_type].model_fields
    for attr, _kind, _key in legacy_link_fields(media_type):
        assert attr in fields, f"{media_type}.{attr} missing from the response"


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_create_schema_does_not_accept_link_fields(media_type):
    """A write naming one of these must not be silently stored on the entry."""
    fields = CREATE_SCHEMAS[media_type].model_fields
    for attr, _kind, _key in legacy_link_fields(media_type):
        assert attr not in fields, f"{media_type}.{attr} leaked onto the write schema"
