"""
Unit tests for derivation functions in app/services/domain/derivation.py

Uses mocked DB sessions (MagicMock with self-referential chaining) so these
tests run without a real PostgreSQL connection.
"""

import types
import uuid
from unittest.mock import MagicMock

import pytest

from app.services.domain import (
    derive_ep_previous_anime,
    derive_season_1_anime,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FRANCHISE_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
SERIES_A_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
SERIES_B_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def make_anime(**kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        franchise_id=FRANCHISE_ID,
        series_id=None,
        airing_type="TV",
        airing_status="Finished Airing",
        season_part="Season 1",
        ep_previous=None,
        ep_total=12,
        ep_special=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def make_series(system_id=None, display_name="Series A"):
    obj = MagicMock()
    obj.system_id = system_id or SERIES_A_ID
    obj.display_name = display_name
    return obj


def mock_db_returns(anime_list, series_list=None):
    """
    Returns a mock DB session where any .query().filter()...all() chain
    returns the provided anime_list. Series queries return series_list.
    The mock is self-referential so chained .filter().filter() works.
    """
    db = MagicMock()
    series_list = series_list or []

    def make_chain(return_val, count_val=None):
        q = MagicMock()
        q.all.return_value = return_val
        q.count.return_value = count_val if count_val is not None else len(return_val)
        q.filter.return_value = q
        q.filter_by.return_value = q
        q.order_by.return_value = q
        q.first.return_value = return_val[0] if return_val else None
        return q

    from app.models import Anime, Series

    def query_side_effect(model):
        if model is Series:
            return make_chain(series_list)
        return make_chain(anime_list)

    db.query.side_effect = query_side_effect
    return db


# ---------------------------------------------------------------------------
# derive_ep_previous_anime
# ---------------------------------------------------------------------------


class TestDeriveEpPrevious:
    def test_season_1_gets_ep_previous_zero(self):
        s1 = make_anime(season_part="Season 1", ep_total=12, ep_previous=None)
        db = mock_db_returns([s1])
        derive_ep_previous_anime(db, FRANCHISE_ID)
        assert s1.ep_previous == 0

    def test_season_2_gets_sum_from_season_1(self):
        s1 = make_anime(season_part="Season 1", ep_total=12, ep_previous=0)
        s2 = make_anime(season_part="Season 2", ep_total=13, ep_previous=None)
        db = mock_db_returns([s1, s2])
        derive_ep_previous_anime(db, FRANCHISE_ID)
        assert s2.ep_previous == 12  # 0 + 12

    def test_season_3_cumulative(self):
        s1 = make_anime(season_part="Season 1", ep_total=12, ep_previous=0)
        s2 = make_anime(season_part="Season 2", ep_total=13, ep_previous=12)
        s3 = make_anime(season_part="Season 3", ep_total=12, ep_previous=None)
        db = mock_db_returns([s1, s2, s3])
        derive_ep_previous_anime(db, FRANCHISE_ID)
        assert s3.ep_previous == 25  # 12 + 13

    def test_already_set_ep_previous_not_overwritten(self):
        s1 = make_anime(season_part="Season 1", ep_total=12, ep_previous=99)
        db = mock_db_returns([s1])
        derive_ep_previous_anime(db, FRANCHISE_ID)
        assert s1.ep_previous == 99  # untouched

    def test_none_franchise_id_is_noop(self):
        s1 = make_anime(season_part="Season 1", ep_previous=None)
        db = mock_db_returns([s1])
        derive_ep_previous_anime(db, None)
        assert s1.ep_previous is None

    def test_stops_when_prev_ep_total_missing(self):
        # If season 1 has no ep_total, season 2 cannot be derived
        s1 = make_anime(season_part="Season 1", ep_total=None, ep_previous=0)
        s2 = make_anime(season_part="Season 2", ep_previous=None)
        db = mock_db_returns([s1, s2])
        derive_ep_previous_anime(db, FRANCHISE_ID)
        assert s2.ep_previous is None  # cannot derive


# ---------------------------------------------------------------------------
# derive_season_1_anime
# ---------------------------------------------------------------------------


class TestDeriveSeason1:
    def test_single_tv_in_franchise_gets_season_1(self):
        anime = make_anime(airing_type="TV", season_part=None)
        # DB returns count=1 for TV entries in franchise
        db = mock_db_returns([anime], series_list=[])
        # Override to return count=1
        count_q = MagicMock()
        count_q.count.return_value = 1
        count_q.filter.return_value = count_q
        db.query.return_value = count_q

        derive_season_1_anime(anime, db)
        assert anime.season_part == "Season 1"

    def test_season_part_already_set_is_not_changed(self):
        anime = make_anime(airing_type="TV", season_part="Season 2")
        db = MagicMock()
        derive_season_1_anime(anime, db)
        assert anime.season_part == "Season 2"
        db.query.assert_not_called()

    def test_non_tv_type_skipped(self):
        anime = make_anime(airing_type="Movie", season_part=None)
        db = MagicMock()
        derive_season_1_anime(anime, db)
        assert anime.season_part is None
        db.query.assert_not_called()

    def test_no_franchise_id_skipped(self):
        anime = make_anime(airing_type="TV", season_part=None, franchise_id=None)
        db = MagicMock()
        derive_season_1_anime(anime, db)
        assert anime.season_part is None
        db.query.assert_not_called()

    def test_multiple_tv_entries_in_franchise_not_changed(self):
        anime = make_anime(airing_type="TV", season_part=None)
        count_q = MagicMock()
        count_q.count.return_value = 2  # More than 1 TV entry
        count_q.filter.return_value = count_q
        db = MagicMock()
        db.query.return_value = count_q

        derive_season_1_anime(anime, db)
        assert anime.season_part is None  # Not changed
