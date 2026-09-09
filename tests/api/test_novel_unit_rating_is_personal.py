"""A unit rating belongs to the reader, not to the unit.

novel_unit.my_rating was one person's opinion of one volume or arc sitting on
a row everybody shares. It cannot move to user_media_list, which is keyed by
media_id, because a unit is a part of an entry rather than an entry - so it
gets its own two-column join table.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def novel_with_arcs(admin_client):
    response = admin_client.post(
        "/api/novel/",
        json={
            "novel_name_en": "Unit Rating Sentinel",
            "type": "Web",
            "units": [
                {"unit_kind": "arc", "position": 1, "name_en": "Arc One",
                 "ch_count": 10, "my_rating": "A"},
                {"unit_kind": "arc", "position": 2, "name_en": "Arc Two",
                 "ch_count": 12},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_the_unit_row_carries_no_rating_column(db, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    assert not hasattr(unit, "my_rating")


def test_the_rating_lands_in_the_readers_own_row(db, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    rating = db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit.system_id
    ).one()
    assert rating.my_rating == "A"
    assert rating.user_id == acting_user_id(db, None)


def test_the_response_still_carries_my_rating_on_each_unit(novel_with_arcs):
    by_name = {u["name_en"]: u for u in novel_with_arcs["units"]}
    assert by_name["Arc One"]["my_rating"] == "A"
    assert by_name["Arc Two"]["my_rating"] is None


def test_an_unrated_unit_stores_no_row(db, novel_with_arcs):
    """A null rating is nothing to record; only a real grade earns a row."""
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc Two"
    ).one()
    assert db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit.system_id
    ).first() is None


def test_deleting_the_unit_removes_the_rating(db, admin_client, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    unit_id = unit.system_id
    db.delete(unit)
    db.commit()
    assert db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit_id
    ).first() is None


def test_a_patch_updates_the_readers_rating(db, admin_client, novel_with_arcs):
    unit_id = novel_with_arcs["units"][0]["system_id"]
    response = admin_client.patch(
        f"/api/novel/{novel_with_arcs['system_id']}",
        json={"units": [
            {"system_id": unit_id, "unit_kind": "arc", "position": 1,
             "name_en": "Arc One", "ch_count": 10, "my_rating": "S"},
        ]},
    )
    assert response.status_code == 200, response.text
    rating = db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == uuid.UUID(unit_id)
    ).one()
    assert rating.my_rating == "S"
