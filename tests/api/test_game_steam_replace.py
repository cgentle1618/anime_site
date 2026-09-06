"""The game pipeline's first bulk Replace: what it selects and what it re-runs."""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.post_processing import apply_single_replace_game
from app.services.pipelines.specs import PIPELINES


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
    monkeypatch.setattr(
        autofill_module, "fetch_steam_appdetails", lambda appid, cc="us": {"d": 1}
    )
    monkeypatch.setattr(
        autofill_module,
        "map_steam_to_game_data",
        lambda p: {
            "metacritic_score": 96,
            "achievements_total": None,
            "is_free": False,
            "price_original_us": None,
            "price_current_us": Decimal("35.99"),
            "price_original_jp": None,
            "price_current_jp": None,
            "price_original_tw": None,
            "price_current_tw": None,
        },
    )
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: None)


class TestSelection:
    def test_only_games_carrying_a_steam_id_are_selected(self, db_session):
        linked = make_game(db_session, steam_appid=1245620)
        by_link = make_game(
            db_session, steam_link="https://store.steampowered.com/app/570/"
        )
        make_game(db_session, igdb_id=119133)  # IGDB only: not Steam's business

        selected = PIPELINES["game"].replace_select(db_session)
        # str(g.system_id): the query returns rows outside `linked`/`by_link`'s
        # own identity (their pk was assigned as a plain str, the query result
        # comes back as uuid.UUID), so compare by string form rather than by
        # object identity or `==`.
        ids = {str(g.system_id) for g in selected}

        assert str(linked.system_id) in ids
        assert str(by_link.system_id) in ids
        assert len(ids) == 2

    def test_the_pipeline_now_advertises_a_bulk_replace(self):
        assert PIPELINES["game"].replace_select is not None
        assert PIPELINES["game"].replace is not None


class TestSingleReplace:
    def test_it_refreshes_the_volatile_columns(self, db_session, patched):
        game = make_game(
            db_session,
            steam_appid=1245620,
            metacritic_score=70,
            price_current_us=Decimal("59.99"),
        )

        apply_single_replace_game(db_session, game)

        assert game.metacritic_score == 96
        assert game.price_current_us == Decimal("35.99")

    def test_it_derives_the_appid_from_a_link_first(self, db_session, patched):
        """A pasted link is enough; Replace does not need the id typed in."""
        game = make_game(
            db_session, steam_link="https://store.steampowered.com/app/1245620/"
        )

        apply_single_replace_game(db_session, game)

        assert game.steam_appid == 1245620
        assert game.metacritic_score == 96


class TestRoutes:
    def test_the_bulk_route_exists(self, admin_client):
        """It must not 404 - the route is registered from the spec."""
        response = admin_client.post("/api/data-control/replace/game")
        assert response.status_code != 404
