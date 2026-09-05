"""
Unit tests for checking rules in app/services/domain/checking.py

Uses SimpleNamespace to create mock Anime objects — no DB required.
"""

import types

from app.services.domain import (
    check_is_tv_completed,
    has_missing_values_anime,
)


def make_anime(**kwargs):
    """Returns a fully-populated Anime-like object that passes has_missing_values_anime."""
    defaults = dict(
        airing_type="TV",
        airing_status="Finished Airing",
        release_season="WIN",
        release_date="2023-01",
        mal_rating=8.5,
        mal_rank="42",
        ep_total=12,
        cover_image_file="abc123.jpg",
        # ep_previous fields (only checked if TV/ONA + no ep_special + has season_part)
        ep_previous=0,
        ep_special=None,
        season_part="Season 1",
        # For check_is_tv_completed
        watching_status="Active Watching",
        ep_fin=0,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# has_missing_values_anime
# ---------------------------------------------------------------------------


class TestHasMissingValues:
    def test_fully_populated_returns_false(self):
        anime = make_anime()
        assert has_missing_values_anime(anime) is False

    def test_missing_airing_type_returns_true(self):
        anime = make_anime(airing_type=None)
        assert has_missing_values_anime(anime) is True

    def test_missing_cover_image_returns_true(self):
        anime = make_anime(cover_image_file=None)
        assert has_missing_values_anime(anime) is True

    def test_empty_string_treated_as_missing(self):
        anime = make_anime(release_season="")
        assert has_missing_values_anime(anime) is True

    def test_whitespace_only_treated_as_missing(self):
        anime = make_anime(release_season="   ")
        assert has_missing_values_anime(anime) is True

    def test_not_yet_aired_skips_mal_rating_check(self):
        # mal_rating and mal_rank should be ignored when airing_status is "Not Yet Aired"
        anime = make_anime(
            airing_status="Not Yet Aired", mal_rating=None, mal_rank=None
        )
        assert has_missing_values_anime(anime) is False

    def test_not_yet_aired_still_checks_other_fields(self):
        anime = make_anime(airing_status="Not Yet Aired", ep_total=None)
        assert has_missing_values_anime(anime) is True

    def test_ep_previous_checked_when_tv_with_season(self):
        # TV + no ep_special + has season_part → ep_previous must be set
        anime = make_anime(
            airing_type="TV", ep_special=None, season_part="Season 2", ep_previous=None
        )
        assert has_missing_values_anime(anime) is True

    def test_ep_previous_not_checked_for_movie(self):
        # Non-TV/ONA types don't need ep_previous
        anime = make_anime(
            airing_type="Movie", ep_special=None, season_part=None, ep_previous=None
        )
        assert has_missing_values_anime(anime) is False

    def test_ep_previous_not_checked_when_ep_special_set(self):
        # ep_special set → skip ep_previous check
        anime = make_anime(
            airing_type="TV", ep_special=1.0, season_part="Season 2", ep_previous=None
        )
        assert has_missing_values_anime(anime) is False

    def test_ep_previous_not_checked_when_no_season_part(self):
        # No season_part → skip ep_previous check
        anime = make_anime(
            airing_type="TV", ep_special=None, season_part=None, ep_previous=None
        )
        assert has_missing_values_anime(anime) is False

    def test_ona_type_also_checks_ep_previous(self):
        anime = make_anime(
            airing_type="ONA", ep_special=None, season_part="Season 2", ep_previous=None
        )
        assert has_missing_values_anime(anime) is True


# ---------------------------------------------------------------------------
# check_is_tv_completed
# ---------------------------------------------------------------------------


class TestCheckIsTvCompleted:
    def test_explicit_completed_status_returns_true(self):
        anime = make_anime(watching_status="Completed", ep_total=12, ep_fin=0)
        assert check_is_tv_completed(anime) is True

    def test_ep_fin_equals_ep_total_returns_true(self):
        anime = make_anime(watching_status="Active Watching", ep_total=12, ep_fin=12)
        assert check_is_tv_completed(anime) is True

    def test_partial_progress_returns_false(self):
        anime = make_anime(watching_status="Active Watching", ep_total=12, ep_fin=6)
        assert check_is_tv_completed(anime) is False

    def test_ep_total_zero_returns_false(self):
        # ep_total must be > 0
        anime = make_anime(watching_status="Active Watching", ep_total=0, ep_fin=0)
        assert check_is_tv_completed(anime) is False

    def test_ep_total_none_returns_false(self):
        anime = make_anime(watching_status="Active Watching", ep_total=None, ep_fin=0)
        assert check_is_tv_completed(anime) is False

    def test_watching_status_takes_precedence_over_episode_count(self):
        # Explicitly "Completed" even if ep_fin < ep_total
        anime = make_anime(watching_status="Completed", ep_total=12, ep_fin=3)
        assert check_is_tv_completed(anime) is True


# ---------------------------------------------------------------------------
# The retired source columns
# ---------------------------------------------------------------------------


def test_no_fill_list_names_a_retired_source_column():
    """
    A dropped column read through getattr(..., None) is permanently blank, so
    naming one here would mark every entry "needs Fill" forever - the trap the
    comment above MOVIE_FIELDS_TO_FILL already warns about.
    """
    from app.utils import utils

    retired = {
        "source_other",
        "source_baha",
        "baha_link",
        "source_netflix",
        "official_link",
        "twitter_link",
        "anilist_link",
    }
    for name in dir(utils):
        if not name.endswith("_FIELDS_TO_FILL"):
            continue
        assert not retired & set(getattr(utils, name)), (
            f"{name} names a retired source column"
        )


# ---------------------------------------------------------------------------
# apply_check_baha
# ---------------------------------------------------------------------------
# Now a database rule - it writes `available` on the entry's Bahamut
# media_source row rather than the retired source_baha column - so its tests
# live in tests/api/test_check_baha_source.py.
