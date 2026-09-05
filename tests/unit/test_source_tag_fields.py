"""The three origin fields: what each answers, and where each is offered."""

import pytest

from app.utils.credit_roles import TAG_FIELDS
from app.utils.source_fields import PLATFORM_CATEGORY, SERIALIZATION_CATEGORY


def test_source_official_is_gone():
    assert "source_official" not in TAG_FIELDS


def test_original_source_is_offered_on_the_reality_types():
    field = TAG_FIELDS["original_source"]
    assert field.category == PLATFORM_CATEGORY
    assert set(field.media_types) == {"movie", "tv-show", "cartoon"}


def test_exclusive_source_is_offered_on_the_anime_types():
    field = TAG_FIELDS["exclusive_source"]
    assert field.category == PLATFORM_CATEGORY
    assert set(field.media_types) == {"anime", "anime-movie"}


def test_serialization_platform_is_offered_on_manga_and_novel():
    """
    Manga's real `serialization_platform` column was dropped in Task 11, in
    the same migration that backfilled its values into media_tag - so this
    field now covers both media types that can carry it.
    """
    field = TAG_FIELDS["serialization_platform"]
    assert field.category == SERIALIZATION_CATEGORY
    assert set(field.media_types) == {"manga", "novel"}


def test_the_two_platform_fields_never_overlap():
    """A type answers 'where first' or 'exclusive to', never both."""
    a = set(TAG_FIELDS["original_source"].media_types)
    b = set(TAG_FIELDS["exclusive_source"].media_types)
    assert not a & b


@pytest.mark.parametrize("key", ["original_source", "exclusive_source"])
def test_both_platform_fields_share_one_vocabulary(key):
    assert TAG_FIELDS[key].category == PLATFORM_CATEGORY
