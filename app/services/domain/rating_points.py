"""
One place that turns a letter grade into a number and back.

my_rating is one of app.utils.constants.MY_RATINGS - "S", "A+", "A", "B", "C",
"D", "E", "F" - stored as a String on every table that has it. Two things need
it as a number: ordering a profile's list best-first, and averaging the public
lists' opinion of one work. Doing either in SQL against the raw string is
wrong in two different ways ("A+" sorts before "A"; "A+"::numeric raises), so
both go through this module and cannot drift apart.

The scale is the index of MY_RATINGS reversed: S=8 down to F=1. It is ordinal,
not interval - the gap between S and A+ is not claimed to equal the gap between
E and F - which is why an average is reported alongside its sample size and
rendered as the nearest letter rather than as a bare figure.
"""

from typing import Optional

from sqlalchemy import Integer, case

from app.utils.constants import MY_RATINGS

# {"S": 8, "A+": 7, ..., "F": 1}
RATING_POINTS: dict[str, int] = {
    letter: len(MY_RATINGS) - index for index, letter in enumerate(MY_RATINGS)
}


def rating_points(letter: Optional[str]) -> Optional[int]:
    """Points for one letter grade; None for missing, blank or unknown."""
    if not letter:
        return None
    return RATING_POINTS.get(str(letter).strip())


def points_to_letter(points: Optional[float]) -> Optional[str]:
    """
    The declared letter nearest to `points`, or None without a sample.

    An average of 6.4 is reported as "A", not as "6.4": the scale is ordinal
    and a decimal implies a precision the data does not have.
    """
    if points is None:
        return None
    return min(RATING_POINTS, key=lambda k: abs(RATING_POINTS[k] - points))


def rating_rank_case(column):
    """
    A SQL CASE turning a my_rating column into its points, for ORDER BY and
    AVG. Unknown and NULL become NULL, so `NULLS LAST` puts unrated rows at the
    end and AVG skips them.
    """
    return case(
        {letter: points for letter, points in RATING_POINTS.items()},
        value=column,
        else_=None,
    ).cast(Integer)
