"""Unit tests for the plan_next vocabulary module."""

import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils import plan_next_kinds as k


def test_scopes_are_the_three_tiers():
    assert k.SCOPES == ("entry", "series", "franchise")


def test_every_media_type_key_has_an_allowed_scope_set():
    assert set(k.ALLOWED_SCOPES["next"]) == set(MEDIA_TYPE_KEYS)


def test_every_media_type_allows_entry_scope():
    for media_type, scopes in k.ALLOWED_SCOPES["next"].items():
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
    assert set(k.ALLOWED_SCOPES["next"][media_type]) == expected


def test_scope_allowed_rejects_franchise_scope_manga():
    assert k.scope_allowed("next", "manga", "franchise") is False
    assert k.scope_allowed("next", "manga", "entry") is True


def test_scope_allowed_rejects_unknown_media_type():
    assert k.scope_allowed("next", "podcast", "entry") is False


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


import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils.plan_next_kinds import (
    ALLOWED_SCOPES,
    KINDS,
    allowed_scopes_for,
    kind_valid,
    scope_allowed,
)


class TestKindVocabulary:
    def test_kinds_are_next_and_rewatch(self):
        assert KINDS == ("next", "rewatch")

    def test_kind_valid(self):
        assert kind_valid("next")
        assert kind_valid("rewatch")
        assert not kind_valid("reread")
        assert not kind_valid("")

    def test_every_kind_covers_every_media_type(self):
        for kind in KINDS:
            assert set(ALLOWED_SCOPES[kind]) == set(MEDIA_TYPE_KEYS), kind


class TestRewatchScopes:
    # The whole point of the kind dimension: rewatch's map is not next's.
    @pytest.mark.parametrize(
        "media_type,expected",
        [
            ("anime", {"franchise"}),
            ("anime-movie", {"entry"}),
            ("movie", {"entry", "series", "franchise"}),
            ("tv-show", {"entry", "series", "franchise"}),
            ("cartoon", {"franchise"}),
            ("manga", {"entry"}),
            ("novel", {"entry", "series", "franchise"}),
            ("comic", {"entry", "series"}),
        ],
    )
    def test_rewatch_scope_map(self, media_type, expected):
        assert set(ALLOWED_SCOPES["rewatch"][media_type]) == expected

    def test_anime_differs_between_kinds(self):
        # Anime is queued one season at a time but rewatched whole.
        assert scope_allowed("next", "anime", "entry")
        assert not scope_allowed("rewatch", "anime", "entry")
        assert scope_allowed("rewatch", "anime", "franchise")

    def test_novel_differs_between_kinds(self):
        assert not scope_allowed("next", "novel", "series")
        assert scope_allowed("rewatch", "novel", "series")

    def test_unknown_kind_allows_nothing(self):
        assert not scope_allowed("nope", "movie", "entry")

    def test_allowed_scopes_for_returns_the_inner_map(self):
        assert allowed_scopes_for("rewatch")["manga"] == frozenset({"entry"})
        assert allowed_scopes_for("nope") == {}


class TestEntryRewatchFieldInvariant:
    """
    A media type has an entry-level rewatch virtual field (PLAN_FLAG_FIELDS)
    if and only if "entry" is one of its allowed rewatch scopes
    (ALLOWED_SCOPES["rewatch"]). This is enforced by an assertion at import
    time in plan_next_kinds.py; these tests pin down both directions
    explicitly, by name, for all eight media types, so a future edit that
    breaks the invariant fails here with a readable message instead of only
    an assert at import time.
    """

    EXPECTED_MEMBERS = {"anime-movie", "movie", "tv-show", "manga", "novel", "comic"}
    EXPECTED_NON_MEMBERS = {"anime", "cartoon"}

    def test_expected_and_non_member_sets_cover_all_media_types(self):
        assert self.EXPECTED_MEMBERS | self.EXPECTED_NON_MEMBERS == set(MEDIA_TYPE_KEYS)
        assert self.EXPECTED_MEMBERS.isdisjoint(self.EXPECTED_NON_MEMBERS)

    @pytest.mark.parametrize("media_type", sorted(EXPECTED_MEMBERS))
    def test_member_has_entry_rewatch_scope(self, media_type):
        assert "entry" in ALLOWED_SCOPES["rewatch"][media_type], media_type

    @pytest.mark.parametrize("media_type", sorted(EXPECTED_MEMBERS))
    def test_member_has_a_rewatch_field(self, media_type):
        from app.utils.plan_next_kinds import PLAN_FLAG_FIELDS

        kinds = {kind for _field, kind in PLAN_FLAG_FIELDS.get(media_type, ())}
        assert "rewatch" in kinds, media_type

    @pytest.mark.parametrize("media_type", sorted(EXPECTED_NON_MEMBERS))
    def test_non_member_has_no_entry_rewatch_scope(self, media_type):
        assert "entry" not in ALLOWED_SCOPES["rewatch"][media_type], media_type

    @pytest.mark.parametrize("media_type", sorted(EXPECTED_NON_MEMBERS))
    def test_non_member_has_no_rewatch_field(self, media_type):
        from app.utils.plan_next_kinds import PLAN_FLAG_FIELDS

        kinds = {kind for _field, kind in PLAN_FLAG_FIELDS.get(media_type, ())}
        assert "rewatch" not in kinds, media_type

    def test_invariant_holds_for_every_media_type_both_directions(self):
        from app.utils.plan_next_kinds import PLAN_FLAG_FIELDS

        for media_type in MEDIA_TYPE_KEYS:
            has_entry_rewatch_scope = "entry" in ALLOWED_SCOPES["rewatch"].get(
                media_type, frozenset()
            )
            has_rewatch_field = any(
                kind == "rewatch"
                for _field, kind in PLAN_FLAG_FIELDS.get(media_type, ())
            )
            assert has_entry_rewatch_scope == has_rewatch_field, media_type
