"""
Unit tests for utils/comicvine_utils.py

Tests the Comic Vine volume JSON → Comic dict transformation logic.
"""

import pytest
from app.utils.comicvine_utils import (
    map_comicvine_to_comic_data,
    extract_comicvine_id,
    _extract_credits_by_role,
    _build_volume_label,
    _pick_cover_url,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_full_volume_response():
    """
    The real shape of a Comic Vine `volume` detail result, verified against
    comicvine.gamespot.com/api/documentation. `person_credits` carries a
    comma-joined `role` string per person, and `image` carries one URL per
    size rather than a path needing a base prefix.
    """
    return {
        "id": 2127,
        "name": "The Amazing Spider-Man",
        "start_year": "1963",
        "count_of_issues": 441,
        "deck": "The flagship Spider-Man title.",
        "publisher": {"id": 31, "name": "Marvel"},
        "person_credits": [
            {"id": 1, "name": "Stan Lee", "role": "writer"},
            {"id": 2, "name": "Steve Ditko", "role": "penciler, inker"},
            {"id": 3, "name": "Sam Rosen", "role": "letterer"},
        ],
        "image": {
            "icon_url": "https://comicvine.example/icon.jpg",
            "medium_url": "https://comicvine.example/medium.jpg",
            "super_url": "https://comicvine.example/super.jpg",
            "original_url": "https://comicvine.example/original.jpg",
        },
        "site_detail_url": "https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
    }


# ---------------------------------------------------------------------------
# extract_comicvine_id
# ---------------------------------------------------------------------------

class TestExtractComicvineId:
    def test_extracts_id_from_standard_volume_url(self):
        url = "https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/"
        assert extract_comicvine_id(url) == 2127

    def test_extracts_id_without_trailing_slash(self):
        url = "https://comicvine.gamespot.com/daredevil/4050-42117"
        assert extract_comicvine_id(url) == 42117

    def test_ignores_the_4050_resource_prefix(self):
        """4050 is the volume resource type, not the ID — it must not be returned."""
        url = "https://comicvine.gamespot.com/batman/4050-796/"
        assert extract_comicvine_id(url) == 796

    def test_returns_none_for_issue_url(self):
        """4000 is the issue resource; only volume URLs are accepted."""
        url = "https://comicvine.gamespot.com/asm-1/4000-12345/"
        assert extract_comicvine_id(url) is None

    def test_returns_none_for_empty_input(self):
        assert extract_comicvine_id("") is None
        assert extract_comicvine_id(None) is None

    def test_returns_none_for_unrelated_url(self):
        assert extract_comicvine_id("https://myanimelist.net/manga/2/Berserk") is None


# ---------------------------------------------------------------------------
# _extract_credits_by_role
# ---------------------------------------------------------------------------

class TestExtractCreditsByRole:
    def test_returns_single_matching_name(self):
        credits = [{"name": "Stan Lee", "role": "writer"}]
        assert _extract_credits_by_role(credits, ("writer",)) == "Stan Lee"

    def test_joins_multiple_matching_names(self):
        credits = [
            {"name": "Stan Lee", "role": "writer"},
            {"name": "Roy Thomas", "role": "writer"},
        ]
        assert _extract_credits_by_role(credits, ("writer",)) == "Stan Lee, Roy Thomas"

    def test_matches_role_inside_comma_joined_role_string(self):
        credits = [{"name": "Steve Ditko", "role": "penciler, inker"}]
        assert _extract_credits_by_role(credits, ("penciler",)) == "Steve Ditko"

    def test_does_not_match_role_as_substring_of_another_role(self):
        """'inker' must not satisfy a search for 'ink' — roles match whole tokens."""
        credits = [{"name": "Steve Ditko", "role": "inker"}]
        assert _extract_credits_by_role(credits, ("ink",)) is None

    def test_accepts_any_of_several_roles(self):
        credits = [{"name": "Alex Ross", "role": "artist"}]
        assert _extract_credits_by_role(credits, ("penciler", "artist")) == "Alex Ross"

    def test_deduplicates_a_person_credited_under_two_matching_roles(self):
        credits = [{"name": "Steve Ditko", "role": "penciler, artist"}]
        assert _extract_credits_by_role(credits, ("penciler", "artist")) == "Steve Ditko"

    def test_returns_none_when_no_role_matches(self):
        credits = [{"name": "Sam Rosen", "role": "letterer"}]
        assert _extract_credits_by_role(credits, ("writer",)) is None

    def test_returns_none_for_empty_credits(self):
        assert _extract_credits_by_role([], ("writer",)) is None
        assert _extract_credits_by_role(None, ("writer",)) is None


# ---------------------------------------------------------------------------
# _build_volume_label
# ---------------------------------------------------------------------------

class TestBuildVolumeLabel:
    def test_wraps_start_year_in_parentheses(self):
        assert _build_volume_label("2018") == "(2018)"

    def test_accepts_integer_start_year(self):
        assert _build_volume_label(2018) == "(2018)"

    def test_returns_none_for_missing_start_year(self):
        assert _build_volume_label(None) is None
        assert _build_volume_label("") is None


# ---------------------------------------------------------------------------
# _pick_cover_url
# ---------------------------------------------------------------------------

class TestPickCoverUrl:
    def test_prefers_original_url(self):
        image = {
            "original_url": "https://cv.example/original.jpg",
            "super_url": "https://cv.example/super.jpg",
        }
        assert _pick_cover_url(image) == "https://cv.example/original.jpg"

    def test_falls_back_to_super_then_medium(self):
        assert _pick_cover_url({"super_url": "https://cv.example/s.jpg"}) == "https://cv.example/s.jpg"
        assert _pick_cover_url({"medium_url": "https://cv.example/m.jpg"}) == "https://cv.example/m.jpg"

    def test_rejects_the_no_image_placeholder(self):
        """Comic Vine serves a stock placeholder rather than omitting the field."""
        image = {
            "original_url": "https://comicvine.gamespot.com/a/uploads/original/img/blank.png"
        }
        assert _pick_cover_url(image) is None

    def test_rejects_the_image_not_available_placeholder(self):
        image = {"original_url": "https://cv.example/12/image_not_available.jpg"}
        assert _pick_cover_url(image) is None

    def test_returns_none_for_missing_image_object(self):
        assert _pick_cover_url(None) is None
        assert _pick_cover_url({}) is None


# ---------------------------------------------------------------------------
# map_comicvine_to_comic_data
# ---------------------------------------------------------------------------

class TestMapComicvineToComicData:
    def test_maps_every_supported_field(self):
        result = map_comicvine_to_comic_data(make_full_volume_response())

        assert result["comic_name_en"] == "The Amazing Spider-Man"
        assert result["volume_label"] == "(1963)"
        assert result["publisher"] == "Marvel"
        assert result["issue_total"] == 441
        assert result["release_year"] == 1963
        assert result["writer"] == "Stan Lee"
        assert result["artist"] == "Steve Ditko"
        assert result["cover_image_url"] == "https://comicvine.example/original.jpg"

    def test_release_year_is_an_integer_not_the_raw_string(self):
        """Comic Vine returns start_year as a string; the column is Integer."""
        result = map_comicvine_to_comic_data({"start_year": "1963"})
        assert result["release_year"] == 1963

    def test_release_year_is_none_when_start_year_is_unparseable(self):
        result = map_comicvine_to_comic_data({"start_year": "n/a"})
        assert result["release_year"] is None

    def test_handles_a_volume_with_no_publisher(self):
        result = map_comicvine_to_comic_data({"name": "Orphan Run", "publisher": None})
        assert result["publisher"] is None
        assert result["comic_name_en"] == "Orphan Run"

    def test_handles_an_entirely_empty_response(self):
        result = map_comicvine_to_comic_data({})
        assert result["comic_name_en"] is None
        assert result["publisher"] is None
        assert result["writer"] is None
        assert result["artist"] is None
        assert result["release_year"] is None
        assert result["issue_total"] is None
        assert result["cover_image_url"] is None
        assert result["volume_label"] is None

    def test_does_not_emit_an_end_year_key(self):
        """
        The volume object's `last_issue` carries no cover date, so end_year
        cannot be derived without a second request. It stays manual.
        """
        result = map_comicvine_to_comic_data(make_full_volume_response())
        assert "end_year" not in result
