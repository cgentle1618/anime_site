"""
Unit tests for the Tenrai-fed autofills' release date handling.

The Tenrai fetch is patched out — these tests lock down the fill-only ISO date
semantics (never overwrite what the admin typed) rather than the network layer.
"""

import types

import pytest

from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import (
    autofill_anime_from_mal,
    autofill_manga_from_mal,
    autofill_novel_from_mal,
)

ANIME_RESULT = {
    "type": "TV",
    "status": "Finished Airing",
    "season": "winter",
    "aired": {
        "from": "2023-01-07T00:00:00+00:00",
        "prop": {"from": {"day": 7, "month": 1, "year": 2023}},
        "string": "Jan 7, 2023 to Mar 25, 2023",
    },
    "score": 8.5,
    "rank": 42,
    "episodes": 12,
}

MANGA_RESULT = {
    "status": "Finished",
    "published": {
        "from": "1997-07-22T00:00:00+00:00",
        "to": "2011-11-18T00:00:00+00:00",
        "prop": {
            "from": {"day": 22, "month": 7, "year": 1997},
            "to": {"day": 18, "month": 11, "year": 2011},
        },
        "string": "Jul 22, 1997 to Nov 18, 2011",
    },
    "score": 9.0,
    "volumes": 27,
    "chapters": 258,
}


def make_anime(**kwargs):
    defaults = dict(
        system_id="11111111-1111-1111-1111-111111111111",
        mal_id="1",
        airing_type=None,
        airing_status=None,
        release_season=None,
        release_date=None,
        ep_total=None,
        official_link=None,
        twitter_link=None,
        mal_rating=None,
        mal_rank=None,
        cover_image_file="already-there.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def make_manga(**kwargs):
    defaults = dict(
        system_id="22222222-2222-2222-2222-222222222222",
        mal_id="2",
        serialization_status=None,
        release_date=None,
        end_date=None,
        vol_total=None,
        ch_total=None,
        mal_rating=None,
        mal_rank=None,
        cover_image_file="already-there.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def make_novel(**kwargs):
    defaults = dict(
        system_id="33333333-3333-3333-3333-333333333333",
        mal_id="3",
        serialization_status=None,
        release_date=None,
        end_date=None,
        vol_total_original=None,
        ch_total=None,
        mal_rating=None,
        mal_rank=None,
        cover_image_file="already-there.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


@pytest.fixture
def patched_anime(monkeypatch):
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_anime_data", lambda mal_id: ANIME_RESULT
    )


@pytest.fixture
def patched_manga(monkeypatch):
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_manga_novel_data", lambda mal_id: MANGA_RESULT
    )


class TestAnimeReleaseDateFill:
    def test_fills_the_iso_release_date(self, patched_anime):
        anime = make_anime()
        autofill_anime_from_mal(anime)
        assert anime.release_date == "2023-01-07"
        assert anime.release_season == "WIN"

    def test_does_not_overwrite_an_admin_entered_date(self, patched_anime):
        anime = make_anime(release_date="2023-01")
        autofill_anime_from_mal(anime)
        assert anime.release_date == "2023-01"

    def test_no_longer_writes_the_split_year_and_month(self, patched_anime):
        anime = make_anime()
        autofill_anime_from_mal(anime)
        assert not hasattr(anime, "release_year")
        assert not hasattr(anime, "release_month")


class TestMangaReleaseDateFill:
    def test_fills_both_ends_of_the_run(self, patched_manga):
        manga = make_manga()
        autofill_manga_from_mal(manga)
        assert manga.release_date == "1997-07-22"
        assert manga.end_date == "2011-11-18"

    def test_does_not_overwrite_admin_entered_dates(self, patched_manga):
        manga = make_manga(release_date="1997", end_date="2011")
        autofill_manga_from_mal(manga)
        assert manga.release_date == "1997"
        assert manga.end_date == "2011"


class TestNovelReleaseDateFill:
    def test_fills_both_ends_of_the_run(self, patched_manga):
        novel = make_novel()
        autofill_novel_from_mal(novel)
        assert novel.release_date == "1997-07-22"
        assert novel.end_date == "2011-11-18"

    def test_does_not_overwrite_admin_entered_dates(self, patched_manga):
        novel = make_novel(release_date="1997", end_date="2011")
        autofill_novel_from_mal(novel)
        assert novel.release_date == "1997"
        assert novel.end_date == "2011"
