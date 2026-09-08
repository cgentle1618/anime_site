"""Unit tests for the remark write-through helpers."""

from app.services.domain.remark_field import pop_remark


def test_pop_remark_splits_the_value_out():
    rest, value, present = pop_remark({"anime_name_en": "X", "remark": "重看第三次"})
    assert rest == {"anime_name_en": "X"}
    assert value == "重看第三次"
    assert present is True


def test_pop_remark_reports_an_absent_key():
    rest, value, present = pop_remark({"anime_name_en": "X"})
    assert rest == {"anime_name_en": "X"}
    assert value is None
    assert present is False


def test_pop_remark_distinguishes_an_explicit_none_from_absence():
    # A PUT that clears the remark sends null; a PATCH that never mentions it
    # sends nothing. They must not be the same thing.
    _, value, present = pop_remark({"remark": None})
    assert value is None
    assert present is True


def test_pop_remark_does_not_mutate_its_input():
    original = {"remark": "x", "manga_name_en": "Y"}
    pop_remark(original)
    assert original == {"remark": "x", "manga_name_en": "Y"}
