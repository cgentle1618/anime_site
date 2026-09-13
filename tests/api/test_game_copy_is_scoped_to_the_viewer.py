"""
A game's `copies` array carries only the acting user's rows.

The `?ownership=` FILTER has been per-user since games shipped
(test_game_copy_is_personal.py pins it), which is exactly what made the
unscoped payload easy to miss: the entry list already answered "games I own"
correctly while the copies hanging off each entry answered "every purchase
anyone has recorded". Nothing on the page could tell the difference, because
GameCopyIO does not expose `user_id`.

The second test here is the one worth keeping. `Game.copies` is declared
`cascade="all, delete-orphan"`, so scoping it by ASSIGNING a filtered list to
the relationship would orphan everybody else's rows and delete them on the
next flush - silently, permanently, and only on installations with more than
one account. The scoping therefore populates the loaded value without marking
the attribute dirty, and this asserts the other account's purchase survives a
later write to the same game.
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
    response = admin_client.post("/api/game/", json={"game_name_en": "Scope Sentinel"})
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["system_id"])


@pytest.fixture
def someone_elses_copy(db, a_game):
    """A second account's purchase of the same game.

    Load-bearing, not decoration: with only one account's rows in the table
    every assertion below passes whether the scoping runs or not.
    """
    other = models.User(
        id=uuid.uuid4(),
        username="scope_other_owner",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    copy = models.GameCopy(
        system_id=uuid.uuid4(),
        user_id=other.id,
        game_id=a_game,
        storefront="GOG",
        copy_format="Digital",
        ownership="Owned",
        price_paid=99.99,
        price_currency="USD",
    )
    db.add(copy)
    db.flush()
    return copy


def test_the_detail_route_hides_another_accounts_copy(
    admin_client, a_game, someone_elses_copy,
):
    body = admin_client.get(f"/api/game/{a_game}").json()
    assert body["copies"] == []


def test_the_list_route_hides_another_accounts_copy(
    admin_client, a_game, someone_elses_copy,
):
    rows = admin_client.get("/api/game/?limit=2000").json()
    entry = next(r for r in rows if r["system_id"] == str(a_game))
    assert entry["copies"] == []


def test_the_acting_users_own_copy_still_comes_back(
    db, admin_client, a_game, someone_elses_copy, admin_user,
):
    """The mirror of the two above, on the same fixture: a green there must
    mean the scoping refused the other row, not that copies are always empty."""
    db.add(
        models.GameCopy(
            system_id=uuid.uuid4(),
            user_id=admin_user.id,
            game_id=a_game,
            storefront="Steam",
            copy_format="Digital",
            ownership="Owned",
            price_paid=19.99,
            price_currency="USD",
        )
    )
    db.flush()

    body = admin_client.get(f"/api/game/{a_game}").json()
    assert [c["storefront"] for c in body["copies"]] == ["Steam"]
    assert body["copies"][0]["price_paid"] == "19.99"


def test_a_later_write_does_not_delete_the_other_accounts_copy(
    db, admin_client, a_game, someone_elses_copy,
):
    """
    The data-loss guard. Scoping by assigning to entry.copies would orphan
    every row the filter dropped, and delete-orphan would remove them on the
    next flush. Nothing on screen would report it and no backup taken
    afterwards would contain them.
    """
    other_id = someone_elses_copy.system_id

    response = admin_client.patch(
        f"/api/game/{a_game}",
        json={"copies": [{"storefront": "Steam", "ownership": "Owned",
                          "copy_format": "Digital"}]},
    )
    assert response.status_code == 200, response.text

    db.expire_all()
    survivor = (
        db.query(models.GameCopy)
        .filter(models.GameCopy.system_id == other_id)
        .one_or_none()
    )
    assert survivor is not None, "the other account's purchase was deleted"
    assert survivor.storefront == "GOG"
