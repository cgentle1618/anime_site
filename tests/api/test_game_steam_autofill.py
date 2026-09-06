"""
autofill_game_from_steam: which columns it writes, and the two guards that
stop it overwriting a hand-typed number with a worse one.

The storefront and Web API calls are patched out - these tests lock down
behaviour, not the network layer.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_game_from_steam

MAPPED = {
    "metacritic_score": 96,
    "achievements_total": 42,
    "is_free": False,
    "price_original_us": Decimal("59.99"),
    "price_current_us": Decimal("35.99"),
    "price_original_jp": Decimal("9000.00"),
    "price_current_jp": Decimal("4500.00"),
    "price_original_tw": Decimal("1790.00"),
    "price_current_tw": Decimal("899.00"),
}


def make_game(db_session, **kwargs):
    game = models.Game(
        system_id=str(uuid.uuid4()),
        game_name_en="Test Game",
        playing_status="Might Play",
        **kwargs,
    )
    db_session.add(game)
    db_session.flush()
    return game


@pytest.fixture
def patched(monkeypatch):
    """Storefront answers for all three regions; the library reports 3 hours."""
    calls = {"appdetails": [], "achievements": 0}

    def fake_appdetails(appid, cc="us"):
        calls["appdetails"].append((appid, cc))
        return {"data": "irrelevant, the mapper is patched too"}

    def fake_achievements(appid):
        calls["achievements"] += 1
        return 7

    monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", fake_appdetails)
    monkeypatch.setattr(autofill_module, "map_steam_to_game_data", lambda p: dict(MAPPED))
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {1245620: 180})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", fake_achievements)
    return calls


class TestGating:
    def test_a_game_with_no_appid_makes_no_request_at_all(self, db_session, monkeypatch):
        def explode(*args, **kwargs):
            raise AssertionError("no appid means no Steam call")

        monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", explode)
        game = make_game(db_session)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score is None

    def test_all_three_regions_are_requested(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert [cc for _appid, cc in patched["appdetails"]] == ["us", "jp", "tw"]


class TestFillOnlyColumns:
    def test_the_list_price_is_written_when_empty(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.price_original_us == Decimal("59.99")
        assert game.price_original_jp == Decimal("9000.00")

    def test_a_hand_typed_list_price_is_kept(self, db_session, patched):
        game = make_game(
            db_session, steam_appid=1245620, price_original_us=Decimal("49.99")
        )

        autofill_game_from_steam(game, db_session)

        assert game.price_original_us == Decimal("49.99")

    def test_a_hand_typed_achievement_total_is_kept(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, achievements_total=10)

        autofill_game_from_steam(game, db_session)

        assert game.achievements_total == 10


class TestOverwrittenColumns:
    def test_the_current_price_is_rewritten_every_run(self, db_session, patched):
        """This is what Replace is for: a sale moved the number."""
        game = make_game(
            db_session, steam_appid=1245620, price_current_us=Decimal("59.99")
        )

        autofill_game_from_steam(game, db_session)

        assert game.price_current_us == Decimal("35.99")

    def test_the_metacritic_score_is_rewritten(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, metacritic_score=70)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score == 96

    def test_the_metacritic_user_score_is_never_touched(self, db_session, patched):
        """Steam does not publish it; it stays whatever was typed."""
        game = make_game(db_session, steam_appid=1245620, metacritic_user_score=8.4)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_user_score == 8.4


class TestProgressGuards:
    def test_playtime_is_written_in_hours(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 3.0
        assert game.achievements_earned == 7

    def test_playtime_overwrites_a_hand_typed_value(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, hours_played=1.0)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 3.0

    def test_the_lock_stops_both_progress_writes(self, db_session, patched):
        """Owned on Steam, played on a console: 200 hours must survive."""
        game = make_game(
            db_session,
            steam_appid=1245620,
            hours_played=200.0,
            achievements_earned=30,
            steam_progress_sync=False,
        )

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 200.0
        assert game.achievements_earned == 30

    def test_the_lock_does_not_stop_prices_or_metacritic(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, steam_progress_sync=False)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score == 96
        assert game.price_current_us == Decimal("35.99")

    def test_zero_playtime_never_overwrites(self, db_session, monkeypatch, patched):
        """Owned but never launched on Steam. 42 hours were played elsewhere."""
        monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {1245620: 0})
        game = make_game(db_session, steam_appid=1245620, hours_played=42.0)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 42.0

    def test_an_unknown_achievement_count_never_overwrites(
        self, db_session, monkeypatch, patched
    ):
        """None is not zero: a private profile must not zero the column."""
        monkeypatch.setattr(
            autofill_module, "fetch_player_achievements", lambda appid: None
        )
        game = make_game(db_session, steam_appid=1245620, achievements_earned=12)

        autofill_game_from_steam(game, db_session)

        assert game.achievements_earned == 12


class TestFailureIsContained:
    def test_a_fetch_error_does_not_propagate(self, db_session, monkeypatch):
        def boom(appid, cc="us"):
            raise RuntimeError("Steam is down")

        monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", boom)
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)  # must not raise

        assert game.metacritic_score is None

    def test_no_storefront_answer_writes_nothing(self, db_session, monkeypatch):
        monkeypatch.setattr(
            autofill_module, "fetch_steam_appdetails", lambda appid, cc="us": None
        )
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score is None
