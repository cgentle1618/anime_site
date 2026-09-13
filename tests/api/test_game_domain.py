"""Hierarchy stamping, completion, and the game_copy nested writer."""

from app import models
from app.services.domain import (
    derive_game_ownership,
    mark_game_catalog,
    mark_game_list,
    write_game_copies,
)
from app.services.rbac.permissions import PERM_SELF_LIST


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
    """completion_level is a fact about the work's depth of finish that only
    the player knows, and it stayed on `games` in step 1; the status moved to
    the list row. The halves must respect that division."""
    from types import SimpleNamespace

    game = models.Game(game_name_en="X", completion_level="Main Story")
    row = SimpleNamespace(status="Active Playing")
    mark_game_catalog(game)
    mark_game_list(row, game)
    assert row.status == "Completed"
    # Only the user knows how deep the finish went.
    assert game.completion_level == "Main Story"


class _Viewer:
    """
    A stand-in for the resolved request viewer.

    These tests call the domain function directly rather than through the
    router, and a copy belongs to whoever bought it - so the owner has to be
    named. `acting_user_id` used to invent one by falling back to the first
    admin; it does not any more, and a test that relied on that was asserting
    the fallback as much as the function.

    It carries has() as well as user_id because a copy is a personal-ownership
    row: since 2026-09-12 write_game_copies asks whether the actor may KEEP
    one, and a stand-in that answered only "who" would exercise a different
    function than the routers call.
    """

    def __init__(self, user_id, can_own=True):
        self.user_id = user_id
        self._can_own = can_own

    def has(self, permission):
        return permission == PERM_SELF_LIST and self._can_own


def test_write_game_copies_inserts_updates_and_deletes(db_session, admin_user):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()

    write_game_copies(
        db_session, game, [{"storefront": "Steam", "ownership": "Owned"}], _Viewer(admin_user.id)
    )
    db_session.flush()
    row = db_session.query(models.GameCopy).one()
    assert row.ownership == "Owned"

    write_game_copies(
        db_session,
        game,
        [{"system_id": row.system_id, "storefront": "Steam", "ownership": "Wishlist"}],
        _Viewer(admin_user.id),
    )
    db_session.flush()
    assert db_session.query(models.GameCopy).one().ownership == "Wishlist"

    write_game_copies(db_session, game, [], _Viewer(admin_user.id))
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 0


def test_a_viewer_who_may_not_own_rows_writes_no_copies(db_session, admin_user):
    """
    A copy is personal ownership written through a CATALOGUE route, so the
    gate on the Game write (manage.catalog) is the wrong question and
    `self.list` is the right one.

    Skipped rather than refused: this is a nested field of a write the caller
    IS allowed to make, so failing the whole edit would refuse a legitimate
    catalogue change over a payload the SPA does not render for this account.
    """
    game = models.Game(game_name_en="Administered Not Owned")
    db_session.add(game)
    db_session.flush()

    write_game_copies(
        db_session,
        game,
        [{"storefront": "Steam", "ownership": "Owned"}],
        _Viewer(admin_user.id, can_own=False),
    )
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 0


def test_the_same_payload_from_a_viewer_who_may_own_rows_lands(
    db_session, admin_user
):
    """
    The mirror, same payload and same entry, so the green above proves the
    permission did the skipping rather than the payload being malformed or
    the entry unsaveable.
    """
    game = models.Game(game_name_en="Administered And Owned")
    db_session.add(game)
    db_session.flush()

    write_game_copies(
        db_session,
        game,
        [{"storefront": "Steam", "ownership": "Owned"}],
        _Viewer(admin_user.id, can_own=True),
    )
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 1


def test_none_means_not_supplied_and_leaves_copies_alone(db_session, admin_user):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()
    write_game_copies(db_session, game, [{"storefront": "GOG"}], _Viewer(admin_user.id))
    db_session.flush()
    write_game_copies(db_session, game, None, _Viewer(admin_user.id))
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 1


def test_ownership_is_owned_when_any_copy_is(db_session, admin_user):
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
        _Viewer(admin_user.id),
    )
    db_session.flush()
    db_session.refresh(game)
    assert derive_game_ownership(game) == "Owned"


def test_ownership_is_none_without_copies(db_session):
    game = models.Game(game_name_en="Bare")
    db_session.add(game)
    db_session.flush()
    assert derive_game_ownership(game) is None


# super_client, not admin_client, in the two tests below: `copies` is a
# personal-ownership payload, and since 2026-09-12 the server skips one sent
# by an account that holds no self.* grant. An administrative account edits
# the game without acquiring a copy of it, so posting copies as the admin
# would derive ownership from an empty set and assert nothing.
def test_the_list_endpoint_filters_on_derived_ownership(super_client):
    owned = super_client.post(
        "/api/game/",
        json={
            "game_name_en": "Owned Game",
            "copies": [{"storefront": "Steam", "ownership": "Owned"}],
        },
    ).json()
    super_client.post(
        "/api/game/",
        json={
            "game_name_en": "Wanted Game",
            "copies": [{"storefront": "Steam", "ownership": "Wishlist"}],
        },
    )
    ids = [
        e["system_id"] for e in super_client.get("/api/game/?ownership=Owned").json()
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


def test_reads_carry_the_derived_ownership(super_client):
    """
    ownership is declared on GameResponse but derived from the copy rows, so a
    read that never derives it returns null - which reads as "not owned"
    rather than as "unknown", and is worse than the field being absent.
    """
    created = super_client.post(
        "/api/game/",
        json={
            "game_name_en": "Owned On Read",
            "copies": [
                {"storefront": "Nintendo eShop", "ownership": "Wishlist"},
                {"storefront": "Steam", "ownership": "Owned"},
            ],
        },
    ).json()
    assert created["ownership"] == "Owned"

    detail = super_client.get(f"/api/game/{created['system_id']}").json()
    assert detail["ownership"] == "Owned"

    listed = {e["system_id"]: e for e in super_client.get("/api/game/").json()}
    assert listed[created["system_id"]]["ownership"] == "Owned"


def test_a_game_without_copies_reads_null_ownership(admin_client):
    created = admin_client.post("/api/game/", json={"game_name_en": "No Copies"}).json()
    assert created["ownership"] is None
    detail = admin_client.get(f"/api/game/{created['system_id']}").json()
    assert detail["ownership"] is None


def test_the_duplicate_report_covers_games(db_session):
    """find_all_duplicates is hand-maintained; a missing key means games are
    never checked, silently."""
    from app.services.domain.duplicates import find_all_duplicates

    assert "game" in find_all_duplicates(db_session)


def test_the_three_completion_flags_round_trip(admin_client):
    """All Endings / All Achievements / All Collected are independent axes.

    Nothing derives them from each other or from the achievement counts.
    """
    created = admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Nier Automata",
            "all_endings": "Yes",
            "all_achievements": "No",
            "all_collected": None,
        },
    ).json()
    assert created["all_endings"] == "Yes"
    assert created["all_achievements"] == "No"
    assert created["all_collected"] is None

    patched = admin_client.patch(
        f"/api/game/{created['system_id']}",
        json={"all_collected": "Yes", "achievements_earned": 3, "achievements_total": 50},
    ).json()
    # The counts say "not everything earned"; the flag is still whatever the
    # user set, because it is not derived.
    assert patched["all_collected"] == "Yes"
    assert patched["all_achievements"] == "No"


def test_an_axis_the_game_does_not_have_is_inapplicable(admin_client):
    """The fourth state, and the reason these are not booleans.

    A racing game has no endings to see. "No" would claim they were missed and
    a blank would claim only that nobody filled the field in, so "Inapplicable"
    is a recorded answer about the game and must survive the round trip
    distinctly from both.
    """
    created = admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Forza Horizon 5",
            "all_endings": "Inapplicable",
            "all_achievements": "No",
        },
    ).json()
    assert created["all_endings"] == "Inapplicable"
    assert created["all_achievements"] == "No"
    # Unanswered stays unanswered - it is not the same claim as Inapplicable.
    assert created["all_collected"] is None


def test_steam_progress_sync_is_not_a_completion_axis(admin_client):
    """It kept its boolean when the three axes became a vocabulary: it says
    whether Steam may write, not what happened in the game."""
    created = admin_client.post(
        "/api/game/",
        json={"game_name_en": "Hades", "steam_progress_sync": False},
    ).json()
    assert created["steam_progress_sync"] is False


def test_the_metacritic_scores_round_trip_and_are_independent(admin_client):
    """
    Two separate figures on two separate scales - critics out of 100, users
    out of 10. Neither is derived from the other or from my_rating.
    """
    created = admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Disco Elysium",
            "metacritic_score": 91,
            "metacritic_user_score": 8.6,
        },
    ).json()
    assert created["metacritic_score"] == 91
    assert created["metacritic_user_score"] == 8.6

    patched = admin_client.patch(
        f"/api/game/{created['system_id']}",
        json={"metacritic_user_score": 7.9},
    ).json()
    assert patched["metacritic_user_score"] == 7.9
    assert patched["metacritic_score"] == 91
