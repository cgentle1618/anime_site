"""
autofill_game_from_igdb: fill-only semantics, alias translation, DLC parenting.

The IGDB fetch and the cover download are both patched out - these tests lock
down behaviour, not the network layer.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_game_from_igdb
from app.services.domain.credits import credit_names, tag_values
from app.utils.game_vocabulary import seed_game_vocabulary

MAPPED = {
    "summary": "A vast world.",
    "release_date": "2022-02-25",
    "cover_image_url": "https://images.igdb.com/big.jpg",
    "developers": ["FromSoftware"],
    "publishers": ["Bandai Namco"],
    "genres": ["Role-playing (RPG)"],
    "themes": ["Fantasy"],
    "game_modes": ["Single player"],
    "platforms": ["PlayStation 4", "PlayStation 5", "PC (Microsoft Windows)"],
    "parent_igdb_id": None,
}


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


@pytest.fixture
def patched(monkeypatch):
    calls = {"download": []}
    monkeypatch.setattr(
        autofill_module, "fetch_igdb_game", lambda igdb_id: {"id": igdb_id}
    )
    monkeypatch.setattr(
        autofill_module, "map_igdb_to_game_data", lambda raw: dict(MAPPED)
    )
    monkeypatch.setattr(
        autofill_module,
        "fetch_igdb_time_to_beat",
        lambda igdb_id: {
            "hltb_main": 55.0,
            "hltb_main_extra": 100.0,
            "hltb_completionist": 133.0,
        },
    )
    monkeypatch.setattr(
        autofill_module,
        "download_cover_image",
        lambda url, owner_type, sid: calls["download"].append(url) or "stored.jpg",
    )
    return calls


def make_game(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), game_name_en="Elden Ring", igdb_id=1029)
    defaults.update(kwargs)
    game = models.Game(**defaults)
    db_session.add(game)
    db_session.flush()
    return game


def test_fills_every_blank_column(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date == "2022-02-25"
    assert game.hltb_main == 55.0
    assert game.cover_image_file == "stored.jpg"


def test_does_not_overwrite_what_the_user_typed(db_session, patched):
    game = make_game(db_session, release_date="2022", hltb_main=40.0)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date == "2022"
    assert game.hltb_main == 40.0


def test_never_touches_the_english_name(db_session, patched):
    game = make_game(db_session, game_name_en="ER (shorthand)")
    autofill_game_from_igdb(game, db_session)
    assert game.game_name_en == "ER (shorthand)"


def test_igdb_english_is_translated_through_the_alias_table(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert tag_values(db_session, "game", game.system_id, "game_genre") == ["角色扮演"]
    assert tag_values(db_session, "game", game.system_id, "game_theme") == ["奇幻"]


def test_a_console_generation_folds_into_one_platform_value(db_session, patched):
    """PS4 and PS5 are one PlayStation tag, not two - replace_tags keeps both."""
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert tag_values(db_session, "game", game.system_id, "game_platform") == [
        "PlayStation",
        "PC",
    ]


def test_an_unmatched_igdb_value_is_skipped_not_stored_raw(
    db_session, patched, monkeypatch, caplog
):
    """A new IGDB genre must surface as a gap to fill, never as English data."""
    patched_map = dict(MAPPED, genres=["Roguelite"])
    monkeypatch.setattr(
        autofill_module, "map_igdb_to_game_data", lambda raw: dict(patched_map)
    )
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert tag_values(db_session, "game", game.system_id, "game_genre") == []
    assert "Roguelite" in caplog.text


def test_developer_becomes_a_studio_and_publisher_a_publisher(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert credit_names(db_session, "game", game.system_id, "studio") == ["FromSoftware"]
    assert credit_names(db_session, "game", game.system_id, "publisher") == [
        "Bandai Namco"
    ]


def test_a_dlc_is_linked_to_a_base_game_already_in_the_database(
    db_session, patched, monkeypatch
):
    base = make_game(db_session, game_name_en="Elden Ring", igdb_id=1029)
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(MAPPED, parent_igdb_id=1029),
    )
    dlc = make_game(
        db_session,
        game_name_en="Shadow of the Erdtree",
        igdb_id=2000,
        game_type="DLC",
    )
    autofill_game_from_igdb(dlc, db_session)
    assert dlc.base_game_id == base.system_id


def test_an_unknown_parent_leaves_base_game_id_null(db_session, patched, monkeypatch):
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(MAPPED, parent_igdb_id=999999),
    )
    dlc = make_game(db_session, igdb_id=2000, game_type="DLC")
    autofill_game_from_igdb(dlc, db_session)
    assert dlc.base_game_id is None


def test_does_nothing_without_an_igdb_id(db_session, patched):
    game = make_game(db_session, igdb_id=None)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date is None


def test_swallows_fetch_errors_so_one_bad_entry_cannot_abort_a_run(
    db_session, monkeypatch, patched
):
    def boom(_id):
        raise RuntimeError("IGDB is down")

    monkeypatch.setattr(autofill_module, "fetch_igdb_game", boom)
    autofill_game_from_igdb(make_game(db_session), db_session)  # must not raise


def test_the_steam_appid_and_link_are_written_from_igdb(db_session, patched, monkeypatch):
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(
            MAPPED,
            steam_appid=1245620,
            steam_link="https://store.steampowered.com/app/1245620/",
        ),
    )
    game = make_game(db_session, igdb_id=119133)

    autofill_game_from_igdb(game, db_session)

    assert game.steam_appid == 1245620
    assert game.steam_link == "https://store.steampowered.com/app/1245620/"


def test_a_hand_typed_steam_link_is_not_replaced_by_igdb(db_session, patched, monkeypatch):
    """Fill-only: the admin's link is the identity, exactly as igdb_link is."""
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(
            MAPPED,
            steam_appid=999,
            steam_link="https://store.steampowered.com/app/999/",
        ),
    )
    game = make_game(
        db_session,
        igdb_id=119133,
        steam_link="https://store.steampowered.com/app/1245620/",
    )

    autofill_game_from_igdb(game, db_session)

    assert game.steam_link == "https://store.steampowered.com/app/1245620/"
    assert game.steam_appid is None, (
        "IGDB's appid must not be paired with a link that names another app"
    )


def test_a_hand_typed_appid_is_not_given_igdbs_link(db_session, patched, monkeypatch):
    """The mirror case: the pair is adopted only when BOTH are empty."""
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(
            MAPPED,
            steam_appid=999,
            steam_link="https://store.steampowered.com/app/999/",
        ),
    )
    game = make_game(
        db_session,
        igdb_id=119133,
        steam_appid=1245620,
    )

    autofill_game_from_igdb(game, db_session)

    assert game.steam_appid == 1245620
    assert game.steam_link is None


def test_a_game_with_no_steam_presence_keeps_null_columns(db_session, patched):
    """MAPPED carries no steam keys, which is the console-only case."""
    game = make_game(db_session, igdb_id=119133)

    autofill_game_from_igdb(game, db_session)

    assert game.steam_appid is None
    assert game.steam_link is None


def test_extracting_ids_reads_both_links(db_session):
    from app.services.domain.derivation import apply_extract_game_ids

    game = make_game(
        db_session,
        igdb_link="https://api.igdb.com/v4/games/119133",
        steam_link="https://store.steampowered.com/app/1245620/",
    )

    apply_extract_game_ids(game)

    assert game.igdb_id == 119133
    assert game.steam_appid == 1245620
