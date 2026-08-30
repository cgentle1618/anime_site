"""
Unit tests for utils/utils.py

Tests pure functions with no DB or network dependencies.
"""

import pytest

from app.utils.utils import (
    calculate_seasonal_from_month,
    extract_mal_id_anime,
    extract_season_from_title,
    validate_episode_math,
)


class TestValidateEpisodeMath:
    def test_valid_integers_pass_through(self):
        total, fin = validate_episode_math(12, 5)
        assert total == 12
        assert fin == 5

    def test_fin_clamped_when_exceeds_total(self):
        total, fin = validate_episode_math(12, 99)
        assert total == 12
        assert fin == 12

    def test_none_total_returns_none(self):
        total, fin = validate_episode_math(None, 5)
        assert total is None
        assert fin == 5

    def test_empty_string_total_returns_none(self):
        total, fin = validate_episode_math("", 5)
        assert total is None

    def test_question_mark_total_returns_none(self):
        total, fin = validate_episode_math("?", 0)
        assert total is None

    def test_float_string_coerced_to_int(self):
        total, fin = validate_episode_math("12.0", "5.0")
        assert total == 12
        assert fin == 5

    def test_none_fin_defaults_to_zero(self):
        total, fin = validate_episode_math(12, None)
        assert fin == 0

    def test_empty_fin_defaults_to_zero(self):
        total, fin = validate_episode_math(12, "")
        assert fin == 0

    def test_negative_total_clamped_to_zero(self):
        total, fin = validate_episode_math(-5, 0)
        assert total == 0

    def test_negative_fin_clamped_to_zero(self):
        total, fin = validate_episode_math(12, -3)
        assert fin == 0

    def test_zero_total_allows_zero_fin(self):
        total, fin = validate_episode_math(0, 0)
        assert total == 0
        assert fin == 0

    def test_equal_fin_and_total_allowed(self):
        total, fin = validate_episode_math(12, 12)
        assert total == 12
        assert fin == 12

    def test_string_integers_accepted(self):
        total, fin = validate_episode_math("24", "10")
        assert total == 24
        assert fin == 10


class TestExtractMalId:
    def test_valid_mal_url_returns_id(self):
        url = "https://myanimelist.net/anime/1234/some-title"
        assert extract_mal_id_anime(url) == 1234

    def test_url_without_anime_path_returns_none(self):
        assert extract_mal_id_anime("https://myanimelist.net/manga/1234") is None

    def test_none_input_returns_none(self):
        assert extract_mal_id_anime(None) is None

    def test_empty_string_returns_none(self):
        assert extract_mal_id_anime("") is None

    def test_plain_string_returns_none(self):
        assert extract_mal_id_anime("not a url") is None

    def test_url_with_query_params_still_extracts(self):
        url = "https://myanimelist.net/anime/5678?q=test"
        assert extract_mal_id_anime(url) == 5678


class TestExtractSeasonFromTitle:
    def test_season_number_extracted(self):
        assert extract_season_from_title("My Show Season 2") == "Season 2"

    def test_part_number_extracted(self):
        assert extract_season_from_title("My Show Part 3") == "Part 3"

    def test_cour_number_extracted(self):
        assert extract_season_from_title("My Show Cour 2") == "Cour 2"

    def test_none_input_returns_none(self):
        assert extract_season_from_title(None) is None

    def test_empty_string_returns_none(self):
        assert extract_season_from_title("") is None

    def test_no_season_returns_none(self):
        assert extract_season_from_title("My Show Title") is None

    def test_case_insensitive_match(self):
        assert extract_season_from_title("My Show SEASON 2") == "Season 2"

    def test_multiple_parts_joined(self):
        result = extract_season_from_title("My Show Season 2 Part 1")
        assert "Season 2" in result
        assert "Part 1" in result


class TestCalculateSeasonalFromMonth:
    @pytest.mark.parametrize(
        "month,expected",
        [
            ("JAN", "WIN"),
            ("FEB", "WIN"),
            ("MAR", "WIN"),
            ("APR", "SPR"),
            ("MAY", "SPR"),
            ("JUN", "SPR"),
            ("JUL", "SUM"),
            ("AUG", "SUM"),
            ("SEP", "SUM"),
            ("OCT", "FAL"),
            ("NOV", "FAL"),
            ("DEC", "FAL"),
        ],
    )
    def test_month_abbrev_maps_to_season(self, month, expected):
        assert calculate_seasonal_from_month(month) == expected

    @pytest.mark.parametrize(
        "month,expected",
        [
            ("1", "WIN"),
            ("01", "WIN"),
            ("4", "SPR"),
            ("7", "SUM"),
            ("10", "FAL"),
        ],
    )
    def test_numeric_string_maps_to_season(self, month, expected):
        assert calculate_seasonal_from_month(month) == expected

    def test_none_returns_none(self):
        assert calculate_seasonal_from_month(None) is None

    def test_empty_string_returns_none(self):
        assert calculate_seasonal_from_month("") is None

    def test_unknown_returns_none(self):
        assert calculate_seasonal_from_month("XYZ") is None

    def test_lowercase_accepted(self):
        assert calculate_seasonal_from_month("jan") == "WIN"
