"""
Parent-hierarchy resolution: one rule for every media type.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import hierarchy as h
from app.utils.constants import FranchiseType

ENTRY_RESOLVERS = {
    "anime": (h.resolve_anime_parent_hierarchy, FranchiseType.ANIME),
    "movie": (h.resolve_movie_parent_hierarchy, FranchiseType.MOVIE),
    "tv-show": (h.resolve_tv_show_parent_hierarchy, FranchiseType.TV),
    "cartoon": (h.resolve_cartoon_parent_hierarchy, FranchiseType.CARTOON),
    "manga": (h.resolve_manga_parent_hierarchy, FranchiseType.ACG),
    "novel": (h.resolve_novel_parent_hierarchy, FranchiseType.NOVEL),
    "comic": (h.resolve_comic_parent_hierarchy, FranchiseType.COMIC),
}


@pytest.fixture
def existing(db_session):
    f = models.Franchise(system_id=uuid.uuid4(), franchise_name_en="Cowboy Bebop", franchise_type="ACG")
    s = models.Series(system_id=uuid.uuid4(), franchise_id=f.system_id, series_name_en="Bebop Movies")
    db_session.add_all([f, s])
    db_session.flush()
    return f, s


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_uuid_passes_through_untouched(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, s = existing
    assert resolve(db_session, f.system_id, s.system_id, {}) == (f.system_id, s.system_id)


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_name_in_the_franchise_cell_resolves_case_insensitively(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = existing
    fid, _ = resolve(db_session, "cowboy BEBOP", None, {"en": "Something Else"})
    assert fid == f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_blank_franchise_falls_back_to_the_entry_names(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = existing
    fid, _ = resolve(db_session, None, None, {"en": None, "cn": "cowboy bebop"})
    assert fid == f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_an_unknown_franchise_is_created_with_the_type_for_that_media(db_session, key):
    resolve, expected_type = ENTRY_RESOLVERS[key]
    fid, _ = resolve(db_session, None, None, {"en": "Brand New", "cn": "全新"})
    created = db_session.get(models.Franchise, fid)
    assert created.franchise_name_en == "Brand New"
    assert created.franchise_name_cn == "全新"
    assert created.franchise_type == expected_type


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_series_name_resolves_or_becomes_null_never_a_new_row(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, s = existing
    assert resolve(db_session, f.system_id, "bebop movies", {})[1] == s.system_id
    assert resolve(db_session, f.system_id, "No Such Series", {})[1] is None
    assert db_session.query(models.Series).count() == 1


def test_anime_movie_resolver_has_no_series(db_session, existing):
    f, _ = existing
    assert h.resolve_anime_movie_parent_hierarchy(db_session, "COWBOY bebop", {}) == f.system_id


def test_series_entries_resolve_their_franchise_by_the_series_names(db_session, existing):
    f, _ = existing
    assert h.resolve_series_parent_hierarchy(db_session, None, {"en": "cowboy bebop"}) == f.system_id
