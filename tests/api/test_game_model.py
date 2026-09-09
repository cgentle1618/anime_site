"""The games and game_copy tables: constraints, name fallback, date CHECKs."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_falls_back_cn_first():
    game = models.Game(game_name_en="Elden Ring", game_name_cn="艾爾登法環")
    assert game.display_name == "艾爾登法環"
    assert models.Game(game_name_en="Hades").display_name == "Hades"


def test_names_dict_covers_all_five():
    game = models.Game(game_name_en="Nier", game_name_jp="ニーア")
    assert set(game.names_dict) == {"en", "cn", "roman", "jp", "alt"}
    assert game.names_dict["jp"] == "ニーア"


def test_playing_status_defaults_to_might_play(db_session):
    """The default outlived the column: playing_status moved to the list row
    in step 1, and a game with no row still reads back as Might Play."""
    from app.services.domain.user_list import DEFAULT_STATUS, attach_list_fields

    game = models.Game(game_name_en="Default Test")
    db_session.add(game)
    db_session.flush()
    attach_list_fields(db_session, "game", game, None)
    assert game.playing_status == DEFAULT_STATUS["game"] == "Might Play"


def test_a_base_game_may_not_have_a_parent(db_session):
    parent = models.Game(game_name_en="Parent")
    db_session.add(parent)
    db_session.flush()
    db_session.add(
        models.Game(
            game_name_en="Bad", game_type="Base Game", base_game_id=parent.system_id
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_dlc_may_have_a_parent(db_session):
    parent = models.Game(game_name_en="Base")
    db_session.add(parent)
    db_session.flush()
    dlc = models.Game(
        game_name_en="DLC", game_type="DLC", base_game_id=parent.system_id
    )
    db_session.add(dlc)
    db_session.commit()
    assert dlc.base_game_id == parent.system_id


def test_a_dlc_without_a_parent_is_allowed(db_session):
    """Deliberate: a DLC is often entered before its base game."""
    db_session.add(models.Game(game_name_en="Orphan DLC", game_type="DLC"))
    db_session.commit()


def test_a_game_may_not_be_its_own_parent(db_session):
    game_id = uuid.uuid4()
    db_session.add(
        models.Game(system_id=game_id, game_name_en="Self", base_game_id=game_id)
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_release_date_must_be_iso(db_session):
    db_session.add(models.Game(game_name_en="Bad Date", release_date="Feb 2022"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_one_game_may_hold_two_copies_on_different_formats(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()
    db_session.add_all(
        [
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
            models.GameCopy(
                game_id=game.system_id,
                storefront="Steam",
                copy_format="Physical",
            ),
        ]
    )
    db_session.commit()


def test_a_duplicate_copy_row_is_rejected(db_session):
    game = models.Game(game_name_en="Dup")
    db_session.add(game)
    db_session.flush()
    db_session.add_all(
        [
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
        ]
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_a_game_deletes_its_copies(db_session):
    game = models.Game(game_name_en="Cascade")
    db_session.add(game)
    db_session.flush()
    db_session.add(models.GameCopy(game_id=game.system_id, storefront="GOG"))
    db_session.commit()
    db_session.delete(game)
    db_session.commit()
    assert db_session.query(models.GameCopy).count() == 0
