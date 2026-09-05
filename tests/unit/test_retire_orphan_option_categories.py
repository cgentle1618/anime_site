"""Guards on the category list migration o1r2p3h4a5n6 deletes.

The migration removes whole `system_option` categories, and both FKs into
system_option are ON DELETE CASCADE — so naming a live category here would
silently delete the media_tag rows of every entry using it. These tests are
the standing check that the drop list only ever holds dead vocabulary.

The migration file is loaded by path: importlib.import_module on
"alembic.versions..." resolves to the installed alembic package, which has no
versions submodule (same reason as tests/unit/test_release_date_migration.py).
"""

import importlib.util
import pathlib

from app.utils.credit_roles import (
    FILTER_ONLY_CATEGORIES,
    OPTION_CATEGORIES,
    TAG_CATEGORIES,
    TAG_FIELDS,
)

_spec = importlib.util.spec_from_file_location(
    "o1r2p3h4a5n6_retire_orphan_option_categories",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/o1r2p3h4a5n6_retire_orphan_option_categories.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)

LIVE = set(OPTION_CATEGORIES) | set(TAG_CATEGORIES) | set(FILTER_ONLY_CATEGORIES)


def test_no_live_category_is_retired():
    assert not (set(migration.RETIRED_CATEGORIES) & LIVE)


def test_no_tag_field_reads_a_retired_category():
    read = {f.category for f in TAG_FIELDS.values()}
    assert not (read & set(migration.RETIRED_CATEGORIES))


def test_preserved_values_land_in_live_categories():
    # A value rescued from a retired category is only rescued if the category
    # it moves into is one a dropdown actually reads.
    for category, _value, _scope in migration.PRESERVED_VALUES:
        assert category in LIVE


def test_preserved_scopes_are_offered_by_their_field():
    # A category can now back more than one TagField - "Platform" backs both
    # original_source and exclusive_source, each with its own media types -
    # so a preserved scope only needs to be legal for SOME field reading the
    # category, not a single one keyed by category alone.
    media_types_by_category: dict[str, set[str]] = {}
    for f in TAG_FIELDS.values():
        media_types_by_category.setdefault(f.category, set()).update(f.media_types)
    for category, _value, scope in migration.PRESERVED_VALUES:
        assert scope in media_types_by_category[category]


def test_retired_categories_are_unique():
    assert len(migration.RETIRED_CATEGORIES) == len(set(migration.RETIRED_CATEGORIES))
