"""
Unit tests for the studio side of Tenrai: the producers-endpoint mapper and
the autofill that feeds a Studio row from it.

The network call is patched out — what these lock down is the mapping (which
of MAL's several titles and external links land in which column) and the
fill-only semantics every other autofill already follows: a column the admin
typed is never overwritten.
"""

import types

import pytest

from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_studio_from_mal
from app.services.domain.checking import has_missing_values_studio
from app.services.domain.derivation import apply_extract_mal_id_studio
from app.utils.tenrai_utils import map_tenrai_to_studio_data
from app.utils.utils import extract_mal_id_anime, extract_mal_id_producer

# Trimmed from a real GET /v1/producers/569/full response.
MAPPA_RESULT = {
    "mal_id": 569,
    "url": "https://myanimelist.net/anime/producer/569/MAPPA",
    "titles": [
        {"type": "Default", "title": "MAPPA"},
        {"type": "Japanese", "title": "マッパ"},
        {"type": "Synonym", "title": "Maruyama Animation Produce Project Association"},
    ],
    "images": {
        "jpg": {
            "image_url": "https://cdn.myanimelist.net/s/common/company_logos/e3a5.jpg"
        }
    },
    "favorites": 39564,
    "established": "2011-06-14T00:00:00+00:00",
    "about": "MAPPA (MAPPA Co., Ltd.) is a Japanese animation studio...",
    "count": 123,
    "external": [
        {"name": "@MAPPA_Info_", "url": "https://twitter.com/MAPPA_Info"},
        {"name": "mappa.co.jp", "url": "http://www.mappa.co.jp/"},
        {"name": "Youtube", "url": "https://www.youtube.com/@MAPPACHANNEL"},
    ],
}


def make_studio(**kwargs):
    defaults = dict(
        system_id="44444444-4444-4444-4444-444444444444",
        mal_id=569,
        mal_link=None,
        name_en="MAPPA",
        name_jp=None,
        founded_date=None,
        website_url=None,
        logo_file=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


@pytest.fixture
def patched_studio(monkeypatch):
    """Tenrai answers with MAPPA; the logo download reports a stored filename."""
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_producer_data", lambda mal_id: MAPPA_RESULT
    )
    monkeypatch.setattr(
        autofill_module, "download_cover_image", lambda url, system_id: "stored.jpg"
    )


class TestStudioMapper:
    def test_maps_the_logo_link_date_and_japanese_name(self):
        data = map_tenrai_to_studio_data(MAPPA_RESULT)
        assert data["logo_url"] == (
            "https://cdn.myanimelist.net/s/common/company_logos/e3a5.jpg"
        )
        assert data["mal_link"] == "https://myanimelist.net/anime/producer/569/MAPPA"
        assert data["founded_date"] == "2011-06-14"
        assert data["name_jp"] == "マッパ"

    def test_picks_the_website_past_the_social_links(self):
        # Twitter comes first in `external`; the studio's own site is the
        # second entry and is the one website_url wants.
        assert map_tenrai_to_studio_data(MAPPA_RESULT)["website_url"] == (
            "http://www.mappa.co.jp/"
        )

    def test_no_website_when_every_external_link_is_social(self):
        raw = dict(
            MAPPA_RESULT,
            external=[
                {"name": "@x", "url": "https://twitter.com/x"},
                {"name": "Instagram", "url": "https://instagram.com/x/"},
            ],
        )
        assert map_tenrai_to_studio_data(raw)["website_url"] is None

    def test_an_empty_payload_maps_to_all_nulls(self):
        data = map_tenrai_to_studio_data({})
        assert data == {
            "logo_url": None,
            "mal_link": None,
            "founded_date": None,
            "name_jp": None,
            "website_url": None,
        }


class TestStudioAutofill:
    def test_fills_every_empty_column(self, patched_studio):
        studio = make_studio()
        autofill_studio_from_mal(studio)
        assert studio.logo_file == "stored.jpg"
        assert studio.mal_link == "https://myanimelist.net/anime/producer/569/MAPPA"
        assert studio.founded_date == "2011-06-14"
        assert studio.name_jp == "マッパ"
        assert studio.website_url == "http://www.mappa.co.jp/"

    def test_does_not_overwrite_what_the_admin_typed(self, patched_studio):
        studio = make_studio(
            name_jp="ＭＡＰＰＡ",
            founded_date="2011",
            website_url="https://mappa.example/",
            logo_file="mine.png",
        )
        autofill_studio_from_mal(studio)
        assert studio.name_jp == "ＭＡＰＰＡ"
        assert studio.founded_date == "2011"
        assert studio.website_url == "https://mappa.example/"
        assert studio.logo_file == "mine.png"

    def test_a_studio_without_a_mal_id_never_calls_tenrai(self, monkeypatch):
        def boom(mal_id):
            raise AssertionError("Tenrai must not be called without a mal_id")

        monkeypatch.setattr(autofill_module, "fetch_tenrai_producer_data", boom)
        studio = make_studio(mal_id=None)
        autofill_studio_from_mal(studio)
        assert studio.logo_file is None

    def test_a_failed_fetch_leaves_the_studio_untouched(self, monkeypatch):
        monkeypatch.setattr(
            autofill_module, "fetch_tenrai_producer_data", lambda mal_id: None
        )
        studio = make_studio()
        autofill_studio_from_mal(studio)
        assert studio.logo_file is None
        assert studio.mal_link is None

    def test_a_network_error_is_swallowed_so_a_save_never_fails(self, monkeypatch):
        def boom(mal_id):
            raise RuntimeError("connection reset")

        monkeypatch.setattr(autofill_module, "fetch_tenrai_producer_data", boom)
        studio = make_studio()
        autofill_studio_from_mal(studio)
        assert studio.logo_file is None


class TestStudioMissingValues:
    def test_a_studio_with_no_logo_needs_filling(self):
        assert has_missing_values_studio(make_studio()) is True

    def test_a_fully_populated_studio_does_not(self):
        studio = make_studio(
            mal_link="https://myanimelist.net/anime/producer/569/MAPPA",
            name_jp="マッパ",
            founded_date="2011-06-14",
            website_url="http://www.mappa.co.jp/",
            logo_file="stored.jpg",
        )
        assert has_missing_values_studio(studio) is False

    def test_a_blank_string_counts_as_missing(self):
        studio = make_studio(
            mal_link="https://myanimelist.net/anime/producer/569/MAPPA",
            name_jp="マッパ",
            founded_date="2011-06-14",
            website_url="http://www.mappa.co.jp/",
            logo_file="   ",
        )
        assert has_missing_values_studio(studio) is True


class TestStudioMalIdExtraction:
    def test_a_producer_link_yields_its_id(self):
        assert (
            extract_mal_id_producer(
                "https://myanimelist.net/anime/producer/56/A-1_Pictures"
            )
            == 56
        )

    def test_a_producer_link_without_a_slug_still_works(self):
        assert (
            extract_mal_id_producer("https://myanimelist.net/anime/producer/569") == 569
        )

    def test_a_plain_anime_link_is_not_a_producer(self):
        assert extract_mal_id_producer("https://myanimelist.net/anime/1234/Title") is None

    def test_the_anime_extractor_still_declines_a_producer_link(self):
        # The two patterns must not poach each other's links: /anime/producer/56
        # is a studio, not anime 56.
        assert (
            extract_mal_id_anime(
                "https://myanimelist.net/anime/producer/56/A-1_Pictures"
            )
            is None
        )

    @pytest.mark.parametrize("value", [None, "", "not a url"])
    def test_a_missing_or_junk_link_yields_nothing(self, value):
        assert extract_mal_id_producer(value) is None

    def test_apply_writes_the_id_onto_the_studio(self):
        studio = make_studio(
            mal_id=None,
            mal_link="https://myanimelist.net/anime/producer/56/A-1_Pictures",
        )
        assert apply_extract_mal_id_studio(studio) is True
        assert studio.mal_id == 56

    def test_apply_leaves_the_studio_alone_when_the_link_has_no_id(self):
        studio = make_studio(mal_id=None, mal_link="https://a-1pictures.jp/")
        assert apply_extract_mal_id_studio(studio) is False
        assert studio.mal_id is None

    def test_apply_survives_a_studio_with_no_link_at_all(self):
        studio = make_studio(mal_id=None, mal_link=None)
        assert apply_extract_mal_id_studio(studio) is False
        assert studio.mal_id is None
