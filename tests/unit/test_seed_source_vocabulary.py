"""The seeded vocabulary matches the spec's tables."""

import importlib.util
import pathlib

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils.source_fields import (
    OPTION_USAGES,
    PLATFORM_CATEGORY,
    REFERENCE_CATEGORY,
)

_spec = importlib.util.spec_from_file_location(
    "sv1o2c3a4b",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/sv1o2c3a4b_seed_source_vocabulary.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_every_seeded_scope_is_a_media_type():
    for _cat, _val, scopes, _usages in migration.SEED:
        for scope in scopes:
            assert scope in MEDIA_TYPE_KEYS, f"{scope} is not a media type"


def test_every_seeded_usage_is_known():
    for _cat, _val, _scopes, usages in migration.SEED:
        for usage in usages:
            assert usage in OPTION_USAGES


def test_only_the_two_source_categories_are_seeded():
    assert {row[0] for row in migration.SEED} == {
        PLATFORM_CATEGORY,
        REFERENCE_CATEGORY,
    }


def test_no_value_is_seeded_twice_in_one_category():
    seen = [(cat, val) for cat, val, _s, _u in migration.SEED]
    assert len(seen) == len(set(seen))


def test_origin_only_values_are_never_offered_as_watch_platforms():
    origin_only = {val for _c, val, _s, u in migration.SEED if u == ["origin"]}
    assert {"Fox", "ABC", "The CW", "Nickelodeon", "Adult Swim", "Cartoon Network"} <= origin_only


def test_reference_values_carry_no_usage():
    for cat, _val, _scopes, usages in migration.SEED:
        if cat == REFERENCE_CATEGORY:
            assert usages == []


def test_seed_never_touches_netflix_or_disney_scopes():
    # st1a2g3s4 deliberately cleared these two so they are offered on every
    # media type. This migration only ever ADDS scope rows, and must not
    # list either of them with a non-empty scope.
    for _cat, val, scopes, _usages in migration.SEED:
        if val in ("Netflix", "Disney+"):
            assert scopes == []
