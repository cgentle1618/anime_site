"""Unit tests for name normalization and comma splitting."""

import pytest

from app.utils.name_normalize import normalize_name, split_names


def test_trims_and_collapses_whitespace():
    assert normalize_name("  新海 誠  ") == normalize_name("新海誠")


def test_folds_full_width_to_half_width():
    assert normalize_name("ＭＡＰＰＡ") == normalize_name("MAPPA")


def test_case_insensitive():
    assert normalize_name("Mappa") == normalize_name("MAPPA")


def test_distinct_names_stay_distinct():
    assert normalize_name("新海誠") != normalize_name("宮崎駿")


def test_split_names_splits_and_trims():
    assert split_names("A, B ,C") == ["A", "B", "C"]


def test_split_names_drops_empty_fragments():
    assert split_names("A,,  ,B") == ["A", "B"]


def test_split_names_dedupes_on_normalized_key_keeping_first_spelling():
    assert split_names("新海 誠, 新海誠") == ["新海 誠"]


@pytest.mark.parametrize("raw", [None, "", "   ", ","])
def test_split_names_of_nothing_is_empty(raw):
    assert split_names(raw) == []
