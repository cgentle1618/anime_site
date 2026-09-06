"""Hierarchy stamping, completion, and the game_copy nested writer."""

from app import models
from app.services.domain import (
    derive_game_ownership,
    mark_game_completed,
    write_game_copies,
)


def test_an_auto_created_franchise_is_stamped_game(admin_client, db_session):
    admin_client.post(
        "/api/game/",
        json={"game_name_en": "Hollow Knight", "franchise_text": "Hollow Knight"},
    )
    franchise = (
        db_session.query(models.Franchise)
        .filter(models.Franchise.franchise_name_en == "Hollow Knight")
        .first()
    )
    assert franchise is not None
    assert franchise.franchise_type == "Game"


def test_mark_completed_sets_status_and_leaves_depth_alone():
    game = models.Game(
        game_name_en="X",
        playing_status="Active Playing",
        completion_level="Main Story",
    )
    mark_game_completed(game)
    assert game.playing_status == "Completed"
    # Only the user knows how deep the finish went.
    assert game.completion_level == "Main Story"


def test_write_game_copies_inserts_updates_and_deletes(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()

    write_game_copies(
        db_session, game, [{"storefront": "Steam", "ownership": "Owned"}]
    )
    db_session.flush()
    row = db_session.query(models.GameCopy).one()
    assert row.ownership == "Owned"

    write_game_copies(
        db_session,
        game,
        [{"system_id": row.system_id, "storefront": "Steam", "ownership": "Wishlist"}],
    )
    db_session.flush()
    assert db_session.query(models.GameCopy).one().ownership == "Wishlist"

    write_game_copies(db_session, game, [])
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 0


def test_none_means_not_supplied_and_leaves_copies_alone(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()
    write_game_copies(db_session, game, [{"storefront": "GOG"}])
    db_session.flush()
    write_game_copies(db_session, game, None)
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 1


def test_ownership_is_owned_when_any_copy_is(db_session):
    game = models.Game(game_name_en="Multi")
    db_session.add(game)
    db_session.flush()
    write_game_copies(
        db_session,
        game,
        [
            {"storefront": "Nintendo eShop", "ownership": "Wishlist"},
            {"storefront": "Steam", "ownership": "Owned"},
        ],
    )
    db_session.flush()
    db_session.refresh(game)
    assert derive_game_ownership(game) == "Owned"


def test_ownership_is_none_without_copies(db_session):
    game = models.Game(game_name_en="Bare")
    db_session.add(game)
    db_session.flush()
    assert derive_game_ownership(game) is None


def test_the_list_endpoint_filters_on_derived_ownership(admin_client):
    owned = admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Owned Game",
            "copies": [{"storefront": "Steam", "ownership": "Owned"}],
        },
    ).json()
    admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Wanted Game",
            "copies": [{"storefront": "Steam", "ownership": "Wishlist"}],
        },
    )
    ids = [
        e["system_id"] for e in admin_client.get("/api/game/?ownership=Owned").json()
    ]
    assert owned["system_id"] in ids
    assert len(ids) == 1


def test_a_listed_game_carries_its_plan_flags(admin_client):
    """
    PLAN_FLAG_FIELDS["game"] names play_next/to_replay and the router factory
    setattrs both onto every listed entry - but a response schema that does not
    declare them drops them silently, which is exactly the sort of blanking the
    link-field tripwire exists for.
    """
    admin_client.post("/api/game/", json={"game_name_en": "Flagged"})
    entry = admin_client.get("/api/game/").json()[0]
    assert entry["play_next"] is False
    assert entry["to_replay"] is False
