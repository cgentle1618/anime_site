"""
my_rating is a letter grade, not a number.

app/utils/constants.py declares MY_RATINGS = ("S", "A+", "A", "B", "C", "D",
"E", "F") and every my_rating column is a String. Averaging them and sorting
them both need a mapping, and this is the only one.
"""

import pytest

from app.services.domain.rating_points import (
    points_to_letter,
    rating_points,
)
from app.utils.constants import MY_RATINGS


def test_s_is_the_best_and_f_is_the_worst():
    assert rating_points("S") == 8
    assert rating_points("F") == 1


def test_a_plus_beats_a():
    assert rating_points("A+") > rating_points("A")


def test_every_declared_rating_maps_to_a_point():
    assert all(rating_points(r) is not None for r in MY_RATINGS)


def test_an_unknown_or_missing_rating_maps_to_none():
    assert rating_points(None) is None
    assert rating_points("") is None
    assert rating_points("9.5") is None


def test_whitespace_is_tolerated():
    assert rating_points(" A ") == rating_points("A")


def test_points_round_trip_to_the_nearest_letter():
    assert points_to_letter(8.0) == "S"
    assert points_to_letter(1.0) == "F"
    assert points_to_letter(6.4) == "A"


def test_points_to_letter_is_none_without_a_sample():
    assert points_to_letter(None) is None


@pytest.mark.parametrize("letter", MY_RATINGS)
def test_each_letter_round_trips(letter):
    assert points_to_letter(float(rating_points(letter))) == letter
