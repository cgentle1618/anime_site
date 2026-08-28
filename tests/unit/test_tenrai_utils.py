"""
Unit tests for utils/tenrai_utils.py

Tests the Tenrai API JSON → Anime dict transformation logic.
"""

import pytest
from app.utils.tenrai_utils import (
    map_tenrai_to_anime_data,
    map_tenrai_to_manga_data,
    map_tenrai_to_novel_data,
    _convert_airing_type,
    _convert_airing_status,
    _convert_season,
    _extract_date_parts,
    _extract_external_links,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_full_tenrai_response():
    return {
        "type": "TV",
        "status": "Finished Airing",
        "season": "winter",
        # The real shape, verified against api.tenrai.org/v1/anime/{id}/full:
        # `from` is the ISO timestamp, `prop` the split-out parts, and `string`
        # the human rendering. The mapper reads year and month from `prop` and
        # uses `string` to tell a real January from a year-only guess, so a
        # fixture carrying only `from` leaves both of them None.
        "aired": {
            "from": "2023-01-07T00:00:00+00:00",
            "prop": {"from": {"day": 7, "month": 1, "year": 2023}},
            "string": "Jan 7, 2023 to Mar 25, 2023",
        },
        "score": 8.5,
        "rank": 42,
        "episodes": 12,
        "external": [
            {"name": "Official Site", "url": "https://example.com/official"},
            {"name": "Twitter", "url": "https://twitter.com/exampleshow"},
        ],
        "images": {
            "webp": {"large_image_url": "https://example.com/img.webp"},
            "jpg": {"large_image_url": "https://example.com/img.jpg"},
        },
    }


# ---------------------------------------------------------------------------
# _convert_airing_type
# ---------------------------------------------------------------------------

class TestConvertAiringType:
    @pytest.mark.parametrize("tenrai_type,expected", [
        ("TV", "TV"),
        ("Movie", "Movie"),
        ("ONA", "ONA"),
        ("OVA", "OVA"),
        ("Special", "Special"),
    ])
    def test_known_types_pass_through(self, tenrai_type, expected):
        assert _convert_airing_type(tenrai_type) == expected

    def test_unknown_type_becomes_other(self):
        assert _convert_airing_type("Music") == "Other"

    def test_none_returns_none(self):
        assert _convert_airing_type(None) is None

    def test_empty_string_returns_none(self):
        assert _convert_airing_type("") is None


# ---------------------------------------------------------------------------
# _convert_airing_status
# ---------------------------------------------------------------------------

class TestConvertAiringStatus:
    def test_finished_airing(self):
        assert _convert_airing_status("Finished Airing") == "Finished Airing"

    def test_currently_airing(self):
        assert _convert_airing_status("Currently Airing") == "Airing"

    def test_not_yet_aired(self):
        assert _convert_airing_status("Not yet aired") == "Not Yet Aired"

    def test_none_returns_none(self):
        assert _convert_airing_status(None) is None

    def test_unrecognized_returns_none(self):
        assert _convert_airing_status("On Hiatus") is None


# ---------------------------------------------------------------------------
# _convert_season
# ---------------------------------------------------------------------------

class TestConvertSeason:
    @pytest.mark.parametrize("tenrai_season,expected", [
        ("winter", "WIN"),
        ("spring", "SPR"),
        ("summer", "SUM"),
        ("fall", "FAL"),
    ])
    def test_lowercase_season_maps_correctly(self, tenrai_season, expected):
        assert _convert_season(tenrai_season) == expected

    def test_uppercase_input_is_normalized(self):
        assert _convert_season("WINTER") == "WIN"

    def test_none_returns_none(self):
        assert _convert_season(None) is None


# ---------------------------------------------------------------------------
# _extract_date_parts
# ---------------------------------------------------------------------------

class TestExtractDateParts:
    def test_iso_date_parsed_correctly(self):
        year, month, date = _extract_date_parts("2023-01-07T00:00:00+00:00")
        assert year == "2023"
        assert month == "JAN"
        assert date == "2023-01-07"

    def test_z_suffix_handled(self):
        year, month, _ = _extract_date_parts("2023-04-01T00:00:00Z")
        assert year == "2023"
        assert month == "APR"

    def test_october_maps_to_oct(self):
        year, month, _ = _extract_date_parts("2023-10-01T00:00:00+00:00")
        assert month == "OCT"

    def test_none_input_returns_triple_none(self):
        assert _extract_date_parts(None) == (None, None, None)

    def test_invalid_string_returns_triple_none(self):
        assert _extract_date_parts("not-a-date") == (None, None, None)


# ---------------------------------------------------------------------------
# _extract_external_links
# ---------------------------------------------------------------------------

class TestExtractExternalLinks:
    def test_official_link_extracted(self):
        links = [{"name": "Official Site", "url": "https://example.com"}]
        official, twitter = _extract_external_links(links)
        assert official == "https://example.com"
        assert twitter is None

    def test_twitter_link_extracted(self):
        links = [{"name": "Twitter", "url": "https://twitter.com/show"}]
        official, twitter = _extract_external_links(links)
        assert twitter == "https://twitter.com/show"
        assert official is None

    def test_x_com_recognized_as_twitter(self):
        links = [{"name": "X (Twitter)", "url": "https://x.com/show"}]
        _, twitter = _extract_external_links(links)
        assert twitter == "https://x.com/show"

    def test_first_official_only(self):
        links = [
            {"name": "Official Site", "url": "https://first.com"},
            {"name": "Official Mirror", "url": "https://second.com"},
        ]
        official, _ = _extract_external_links(links)
        assert official == "https://first.com"

    def test_empty_list_returns_none_none(self):
        assert _extract_external_links([]) == (None, None)


# ---------------------------------------------------------------------------
# map_tenrai_to_anime_data (full integration of above)
# ---------------------------------------------------------------------------

class TestMapTenraiToAnimeData:
    def test_full_response_mapped_correctly(self):
        raw = make_full_tenrai_response()
        result = map_tenrai_to_anime_data(raw)

        assert result["airing_type"] == "TV"
        assert result["airing_status"] == "Finished Airing"
        assert result["release_season"] == "WIN"
        assert result["release_date"] == "2023-01"
        assert result["mal_rating"] == 8.5
        assert result["mal_rank"] == "42"
        assert result["ep_total"] == 12
        assert result["official_link"] == "https://example.com/official"
        assert result["twitter_link"] == "https://twitter.com/exampleshow"
        assert result["cover_image_url"] == "https://example.com/img.webp"

    def test_year_only_aired_string_suppresses_the_month(self):
        # Tenrai fills prop.from.month with 1 when MAL knows only the year, so
        # trusting it would record every such entry as a January release.
        # `string` is what distinguishes the two: "2026 to ?" versus "Jan 2026".
        raw = make_full_tenrai_response()
        raw["aired"] = {
            "from": "2026-01-01T00:00:00+00:00",
            "prop": {"from": {"day": 1, "month": 1, "year": 2026}},
            "string": "2026 to ?",
        }
        result = map_tenrai_to_anime_data(raw)
        assert result["release_date"] == "2026"

    def test_known_january_still_maps_the_month(self):
        # The other side of the same rule: a month named in `string` is real.
        raw = make_full_tenrai_response()
        raw["aired"] = {
            "from": "2026-01-12T00:00:00+00:00",
            "prop": {"from": {"day": 12, "month": 1, "year": 2026}},
            "string": "Jan 12, 2026 to ?",
        }
        result = map_tenrai_to_anime_data(raw)
        assert result["release_date"] == "2026-01"

    def test_webp_preferred_over_jpg(self):
        raw = make_full_tenrai_response()
        result = map_tenrai_to_anime_data(raw)
        assert "webp" in result["cover_image_url"]

    def test_falls_back_to_jpg_when_no_webp(self):
        raw = make_full_tenrai_response()
        raw["images"]["webp"] = {}
        result = map_tenrai_to_anime_data(raw)
        assert result["cover_image_url"] == "https://example.com/img.jpg"

    def test_missing_fields_return_none(self):
        result = map_tenrai_to_anime_data({})
        assert result["airing_type"] is None
        assert result["mal_rating"] is None
        assert result["cover_image_url"] is None

    def test_rank_none_stays_none(self):
        raw = make_full_tenrai_response()
        raw["rank"] = None
        result = map_tenrai_to_anime_data(raw)
        assert result["mal_rank"] is None

    def test_rank_int_coerced_to_string(self):
        raw = make_full_tenrai_response()
        raw["rank"] = 100
        result = map_tenrai_to_anime_data(raw)
        assert result["mal_rank"] == "100"


# ---------------------------------------------------------------------------
# ISO release dates
# ---------------------------------------------------------------------------

class TestAnimeReleaseDateIsISO:
    def test_a_known_month_maps_to_month_precision(self):
        raw = {
            "aired": {
                "string": "Jan 2026 to ?",
                "prop": {"from": {"year": 2026, "month": 1}},
            },
            "season": "winter",
        }
        mapped = map_tenrai_to_anime_data(raw)
        assert mapped["release_date"] == "2026-01"
        assert mapped["release_season"] == "WIN"

    def test_an_unreliable_month_maps_to_year_precision(self):
        # aired.prop.from.month defaults to 1 when MAL only knows the year; the
        # aired.string is the honest signal.
        raw = {
            "aired": {
                "string": "2026 to ?",
                "prop": {"from": {"year": 2026, "month": 1}},
            },
            "season": "winter",
        }
        mapped = map_tenrai_to_anime_data(raw)
        assert mapped["release_date"] == "2026"
        assert mapped["release_season"] == "WIN"

    def test_split_year_and_month_are_gone(self):
        raw = {
            "aired": {"string": "2026", "prop": {"from": {"year": 2026}}},
            "season": None,
        }
        mapped = map_tenrai_to_anime_data(raw)
        assert "release_year" not in mapped
        assert "release_month" not in mapped

    def test_a_missing_aired_block_yields_no_date(self):
        assert map_tenrai_to_anime_data({})["release_date"] is None


class TestMangaAndNovelReleaseDatesAreISO:
    def _published(self, string, prop_from, prop_to=None):
        return {
            "published": {
                "from": "1997-07-22T00:00:00+00:00",
                "to": "2011-11-18T00:00:00+00:00" if prop_to else None,
                "prop": {"from": prop_from, "to": prop_to or {}},
                "string": string,
            }
        }

    def test_manga_keeps_full_precision_when_mal_knows_the_day(self):
        raw = self._published(
            "Jul 22, 1997 to Nov 18, 2011",
            {"day": 22, "month": 7, "year": 1997},
            {"day": 18, "month": 11, "year": 2011},
        )
        mapped = map_tenrai_to_manga_data(raw)
        assert mapped["release_date"] == "1997-07-22"
        assert mapped["end_date"] == "2011-11-18"

    def test_manga_falls_back_to_year_precision(self):
        raw = self._published("1997 to ?", {"day": None, "month": None, "year": 1997})
        mapped = map_tenrai_to_manga_data(raw)
        assert mapped["release_date"] == "1997"
        assert mapped["end_date"] is None

    def test_manga_no_longer_returns_year_columns(self):
        mapped = map_tenrai_to_manga_data({})
        assert "release_year" not in mapped
        assert "end_year" not in mapped
        assert mapped["release_date"] is None

    def test_novel_keeps_full_precision_when_mal_knows_the_day(self):
        raw = self._published(
            "Jul 22, 1997 to Nov 18, 2011",
            {"day": 22, "month": 7, "year": 1997},
            {"day": 18, "month": 11, "year": 2011},
        )
        mapped = map_tenrai_to_novel_data(raw)
        assert mapped["release_date"] == "1997-07-22"
        assert mapped["end_date"] == "2011-11-18"

    def test_novel_no_longer_returns_year_columns(self):
        mapped = map_tenrai_to_novel_data({})
        assert "release_year" not in mapped
        assert "end_year" not in mapped
        assert mapped["end_date"] is None
