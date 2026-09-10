"""A game copy belongs to whoever bought it.

A game_copy row records which storefront I own a game on, what I paid and when
I bought it. That is a purchase record, not a fact about the game, so two
people own two rows for the same edition - and uq_game_copy_row has to admit
that, or the second buyer collides with the first.
"""

import uuid

import pytest

from app import models
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def a_game(db, admin_client):
    response = admin_client.post("/api/game/", json={"game_name_en": "Copy Sentinel"})
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["system_id"])


def test_a_copy_written_through_the_router_belongs_to_the_acting_user(
    db, admin_client, a_game, admin_user,
):
    response = admin_client.patch(
        f"/api/game/{a_game}",
        json={"copies": [{"storefront": "Steam", "ownership": "Owned",
                          "copy_format": "Digital"}]},
    )
    assert response.status_code == 200, response.text
    copy = db.query(models.GameCopy).filter(models.GameCopy.game_id == a_game).one()
    assert copy.user_id == admin_user.id


def test_two_people_can_own_the_same_edition(db, admin_client, a_game, admin_user):
    """The old uq_game_copy_row was UNIQUE (game_id, storefront, copy_format),
    which is exactly the row two owners both need."""
    other = models.User(
        id=uuid.uuid4(),
        username="copy_owner_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()

    for user_id in (admin_user.id, other.id):
        db.add(
            models.GameCopy(
                system_id=uuid.uuid4(),
                user_id=user_id,
                game_id=a_game,
                storefront="Steam",
                copy_format="Digital",
                ownership="Owned",
            )
        )
    db.flush()
    assert db.query(models.GameCopy).filter(
        models.GameCopy.game_id == a_game
    ).count() == 2


def test_the_ownership_filter_sees_only_the_acting_users_copies(
    db, admin_client, a_game
):
    other = models.User(
        id=uuid.uuid4(),
        username="copy_filter_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    db.add(
        models.GameCopy(
            system_id=uuid.uuid4(),
            user_id=other.id,
            game_id=a_game,
            storefront="GOG",
            copy_format="Digital",
            ownership="Owned",
        )
    )
    db.flush()

    rows = admin_client.get("/api/game/?ownership=Owned&limit=2000").json()
    assert str(a_game) not in {r["system_id"] for r in rows}
