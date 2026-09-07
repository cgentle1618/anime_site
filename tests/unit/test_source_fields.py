"""The source vocabulary is small, closed, and named in exactly one place."""

import pytest

from app.utils.source_fields import (
    FREE_FORM_BUCKETS,
    OPTION_USAGES,
    PLATFORM_CATEGORY,
    REFERENCE_CATEGORY,
    SOURCE_BUCKETS,
    SOURCE_KINDS,
    category_for_kind,
)


def test_free_form_buckets_are_a_subset_of_all_buckets():
    assert set(FREE_FORM_BUCKETS) < set(SOURCE_BUCKETS)


def test_main_is_the_only_vocabulary_bucket():
    assert set(SOURCE_BUCKETS) - set(FREE_FORM_BUCKETS) == {"main"}


@pytest.mark.parametrize(
    "kind,expected",
    [("access", PLATFORM_CATEGORY), ("reference", REFERENCE_CATEGORY)],
)
def test_each_kind_draws_from_its_own_category(kind, expected):
    assert category_for_kind(kind) == expected


def test_an_unknown_kind_is_rejected():
    with pytest.raises(KeyError):
        category_for_kind("nonsense")


def test_usages_are_the_two_the_platform_vocabulary_serves():
    assert OPTION_USAGES == ("watch", "origin")


def test_kinds_and_buckets_have_no_overlap():
    assert not set(SOURCE_KINDS) & set(SOURCE_BUCKETS)
