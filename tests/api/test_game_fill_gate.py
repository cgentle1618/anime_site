"""Which games Fill picks up."""

import uuid

from app import models
from app.services.pipelines.specs import PIPELINES


def eligible(db, game):
    return PIPELINES["game"].fill_eligible(db, game)


def test_a_game_with_no_igdb_id_is_skipped(db_session):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Manual")
    assert eligible(db_session, game) is False


def test_a_fully_filled_game_is_skipped(db_session):
    game = models.Game(
        system_id=uuid.uuid4(),
        game_name_en="Done",
        igdb_id=1,
        igdb_link="https://igdb/1",
        release_date="2022-02-25",
        cover_image_file="x.jpg",
        hltb_main=55.0,
        hltb_main_extra=100.0,
        hltb_completionist=133.0,
    )
    assert eligible(db_session, game) is False


def test_a_linked_game_missing_a_column_is_eligible(db_session):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Partial", igdb_id=1)
    assert eligible(db_session, game) is True
