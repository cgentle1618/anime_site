"""Unit tests for the plan_next vocabulary module."""

import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils import plan_next_kinds as k


def test_scopes_are_the_three_tiers():
    assert k.SCOPES == ("entry", "series", "franchise")


def test_every_media_type_key_has_an_allowed_scope_set():
    assert set(k.ALLOWED_SCOPES) == set(MEDIA_TYPE_KEYS)


def test_every_media_type_allows_entry_scope():
    for media_type, scopes in k.ALLOWED_SCOPES.items():
        assert "entry" in scopes, media_type


@pytest.mark.parametrize(
    "media_type,expected",
    [
        ("anime", {"entry", "series", "franchise"}),
        ("movie", {"entry", "series", "franchise"}),
        ("tv-show", {"entry", "series", "franchise"}),
        ("cartoon", {"entry", "series", "franchise"}),
        ("comic", {"entry", "series"}),
        ("anime-movie", {"entry"}),
        ("manga", {"entry"}),
        ("novel", {"entry"}),
    ],
)
def test_allowed_scopes_match_the_spec(media_type, expected):
    assert set(k.ALLOWED_SCOPES[media_type]) == expected


def test_scope_allowed_rejects_franchise_scope_manga():
    assert k.scope_allowed("manga", "franchise") is False
    assert k.scope_allowed("manga", "entry") is True


def test_scope_allowed_rejects_unknown_media_type():
    assert k.scope_allowed("podcast", "entry") is False


@pytest.mark.parametrize(
    "media_type,expected",
    [
        ("anime", ("12ep", "24ep", "30ep_plus")),
        ("tv-show", ("1season", "2season", "3season_plus")),
        ("cartoon", ("1season", "2season", "3season_plus")),
        ("movie", ("standalone", "2_3movies", "4movies_plus")),
        ("comic", ("1_3", "4_10", "11_plus")),
        ("anime-movie", ()),
        ("manga", ()),
        ("novel", ()),
    ],
)
def test_size_group_keys_match_the_spec(media_type, expected):
    assert k.size_group_keys(media_type) == expected


def test_thresholds_and_groups_agree():
    for media_type, thresholds in k.SIZE_THRESHOLDS.items():
        assert tuple(key for _, key in thresholds) == k.size_group_keys(media_type)
        # The last band is open-ended.
        assert thresholds[-1][0] is None


def test_every_bucketed_type_declares_a_measure():
    assert set(k.SIZE_MEASURE) == set(k.SIZE_THRESHOLDS)
    assert set(k.SIZE_MEASURE.values()) <= {"sum_ep_total", "count", "sum_issue_total"}


def test_every_size_group_has_a_display_label():
    for groups in k.SIZE_GROUPS.values():
        for group in groups:
            assert group.label and group.label != group.key
