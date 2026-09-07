"""The game vocabularies, and the one cross-vocabulary fact they rely on."""

from app.utils import constants as c


def test_play_status_values():
    assert [s.value for s in c.PlayStatus] == [
        "Might Play",
        "Plan to Play",
        "Play When Released",
        "Active Playing",
        "Passive Playing",
        "Paused",
        "Completed",
        "Temp Dropped",
        "Dropped",
        "Won't Play",
    ]


def test_completed_play_statuses_holds_completed():
    assert c.PlayStatus.COMPLETED in c.COMPLETED_PLAY_STATUSES


def test_a_completed_game_gets_a_completion_timestamp():
    """
    apply_completion_timestamp tests membership in COMPLETED_WATCH_STATUSES,
    which is a frozenset of WatchStatus members. PlayStatus.COMPLETED shares
    the *value* "Completed", and the str mixin's hash is what the frozenset
    uses - so a game reaches the same branch with no change to completion.py.
    Pinned here because it is load-bearing and non-obvious.
    """
    assert c.PlayStatus.COMPLETED.value in c.COMPLETED_WATCH_STATUSES


def test_game_vocabularies():
    assert c.GAME_TYPES == ("Base Game", "DLC", "Expansion", "Bundle")
    assert c.COMPLETION_LEVELS == (
        "Main Story",
        "Main + Extras",
        "Post-game",
        "Completionist",
    )
    assert c.GAME_RELEASE_STATUSES == (
        "Rumored",
        "Unreleased",
        "Early Access",
        "Released",
        "Ongoing",
        "Discontinued",
        "Cancelled",
    )
    assert c.GAME_OWNERSHIP_KINDS == (
        "Owned",
        "Wishlist",
        "Subscription",
        "Free",
        "Not Owned",
    )
    assert c.GAME_COPY_FORMATS == ("Digital", "Physical")
    assert c.GAME_ACQUISITION_KINDS == (
        "Bought",
        "Gifted",
        "Free",
        "Bundled",
        "Subscription",
    )
    assert "Steam" in c.GAME_STOREFRONTS


def test_franchise_type_has_game():
    assert c.FranchiseType.GAME.value == "Game"
    assert "Game" in c.FRANCHISE_TYPES
