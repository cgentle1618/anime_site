"""
The seeded game vocabulary.

Scope rows are the load-bearing part. SystemOptionScope's docstring says a
value with no scope rows is offered EVERYWHERE, so an unscoped 角色扮演 would
appear in anime's genre picker - the exact failure Ruling R27 was written
about. The leak is silent, so it is asserted directly.

tests/api/conftest.py builds the schema with create_all and never runs Alembic,
so the seed is applied here through the same helper the migration calls.
"""

import pytest

from app import models
from app.utils.game_vocabulary import seed_game_vocabulary

GAME_CATEGORIES = ("Game Genre", "Game Theme", "Game Mode", "Combat Mode")


@pytest.fixture(autouse=True)
def seeded(db_session):
    seed_game_vocabulary(db_session)
    db_session.commit()


def test_every_seeded_game_value_is_scoped_to_game(db_session):
    options = (
        db_session.query(models.SystemOption)
        .filter(models.SystemOption.category.in_(GAME_CATEGORIES))
        .all()
    )
    assert options, "no game vocabulary seeded"
    for option in options:
        scopes = {s.scope for s in option.scopes}
        assert scopes == {"game"}, f"{option.category}/{option.value} scoped {scopes}"


def test_seeded_values_are_chinese_and_igdb_english_is_an_alias(db_session):
    rpg = (
        db_session.query(models.SystemOption)
        .filter_by(category="Game Genre", value="角色扮演")
        .one()
    )
    assert {(a.source, a.value) for a in rpg.aliases} == {("igdb", "Role-playing (RPG)")}


def test_combat_mode_has_no_igdb_aliases(db_session):
    """PvE/PvP is not an IGDB field; those values are hand-entered."""
    for option in (
        db_session.query(models.SystemOption).filter_by(category="Combat Mode").all()
    ):
        assert option.aliases == []


def test_game_reference_sources_are_seeded_and_scoped(db_session):
    """
    SteamDB, Bahamut and HowLongToBeat are display-only links, so they are
    media_source reference rows drawn from this vocabulary - not columns.
    """
    values = {
        o.value
        for o in db_session.query(models.SystemOption)
        .filter_by(category="Reference Source")
        .all()
        if any(s.scope == "game" for s in o.scopes)
    }
    assert {"SteamDB", "Bahamut", "HowLongToBeat"} <= values


def test_game_access_platforms_are_usable_as_access_rows(db_session):
    """
    A Platform value with no `watch` usage row never reaches the access
    picker - it would only be offered as an origin tag.
    """
    game_pass = (
        db_session.query(models.SystemOption)
        .filter_by(category="Platform", value="Game Pass")
        .one()
    )
    assert {s.scope for s in game_pass.scopes} == {"game"}
    assert "watch" in {u.usage for u in game_pass.usages}


def test_seeding_twice_is_a_no_op(db_session):
    """
    The migration seeds once, but a Pull or a re-run must not double the rows -
    a second 角色扮演 would trip uq_system_option_value and fail the whole tab.
    """
    before = db_session.query(models.SystemOption).count()
    seed_game_vocabulary(db_session)
    db_session.commit()
    assert db_session.query(models.SystemOption).count() == before
