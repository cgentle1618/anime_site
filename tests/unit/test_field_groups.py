"""
The field-group registry names real columns, real link fields and real note
sections. Nothing checks that at runtime: a gated column that no longer exists
strips nothing and fails silently, exactly the class of bug that dropping the
26 comma-joined columns produced across 17 files.

Shaped after tests/unit/test_link_fields_schema.py, which is the same tripwire
for the link-field mixins.
"""

import pytest

from app.schemas.link_fields import LINK_FIELD_MIXINS
from app.services.rbac.field_groups import (
    FIELD_GROUP_KEYS,
    FIELD_GROUPS,
    columns_for,
    link_fields_for,
)
from app.utils.media_resolver import MEDIA_TABLES, MEDIA_TYPE_KEYS
from app.utils.note_sections import NOTE_SECTIONS

NOTE_SECTION_KEYS = {section.key for section in NOTE_SECTIONS}


def test_keys_tuple_matches_the_registry():
    assert set(FIELD_GROUP_KEYS) == set(FIELD_GROUPS)
    assert len(FIELD_GROUP_KEYS) == len(set(FIELD_GROUP_KEYS))


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_dict_key_matches_the_group_key(key):
    assert FIELD_GROUPS[key].key == key


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_group_covers_at_least_one_surface(key):
    """A group that gates nothing is a permission nobody can feel."""
    group = FIELD_GROUPS[key]
    covers = (
        any(columns_for(group, mt) for mt in MEDIA_TYPE_KEYS)
        or any(link_fields_for(group, mt) for mt in MEDIA_TYPE_KEYS)
        or group.note_sections
        or group.ui_block
    )
    assert covers, f"{key} gates nothing"


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_declared_media_types_are_real(key):
    group = FIELD_GROUPS[key]
    for mapping in (group.columns, group.link_fields):
        for media_type in mapping:
            assert media_type == "*" or media_type in MEDIA_TABLES, (
                f"{key} names unknown media type {media_type!r}"
            )


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_every_gated_column_exists_on_the_model(key, media_type):
    """The whole point: a renamed or dropped column must break this test."""
    table = MEDIA_TABLES[media_type].model.__table__.columns
    for column in columns_for(FIELD_GROUPS[key], media_type):
        assert column in table, f"{key} gates {media_type}.{column}, which does not exist"


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_every_gated_link_field_exists_on_the_mixin(key, media_type):
    fields = LINK_FIELD_MIXINS[media_type].model_fields
    for attr in link_fields_for(FIELD_GROUPS[key], media_type):
        assert attr in fields, f"{key} gates {media_type}.{attr}, not a link field"


@pytest.mark.parametrize("key", sorted(FIELD_GROUPS))
def test_every_gated_note_section_exists(key):
    for section in FIELD_GROUPS[key].note_sections:
        assert section in NOTE_SECTION_KEYS, f"{key} gates unknown note section {section!r}"


def test_source_other_is_gated_on_every_media_type():
    """The motivating case: source_other is a real column on all eight."""
    group = FIELD_GROUPS["sources_other"]
    for media_type in MEDIA_TYPE_KEYS:
        assert "source_other" in columns_for(group, media_type)


def test_credits_group_gates_credits_but_not_tags():
    """Genre and era are content vocabulary, not people; they stay visible."""
    group = FIELD_GROUPS["credits"]
    assert "studio" in link_fields_for(group, "anime")
    assert "director" in link_fields_for(group, "anime")
    assert "genre_main" not in link_fields_for(group, "anime")
    assert "era" not in link_fields_for(group, "comic")
