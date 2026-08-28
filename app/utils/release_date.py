"""
The single owner of the truncated ISO-8601 release date format.

Every media release date is stored as one of three shapes:

    YYYY          year known, month and day unknown
    YYYY-MM       year and month known, day unknown
    YYYY-MM-DD    exact date

Precision is self-describing from the string's length, so no companion
precision column is needed, and lexicographic ordering equals chronological
ordering. Parsing, validating, normalizing and displaying these values all
live here so the format has exactly one implementation.
"""

import calendar
import re
from typing import Any, Dict, Optional, Tuple

# The canonical shape. Mirrored by a CHECK constraint on every release column
# and by isValidReleaseDate() in frontend/src/lib/releaseDate.js.
RELEASE_DATE_PATTERN = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")

# Sorts after every real date, so undated entries land at the bottom.
UNDATED: Tuple[int, int, int] = (9999, 99, 99)

# The historical "JUL 2001" format, still arriving from stored data during the
# migration. Only the three-letter abbreviations were ever written.
_MONTH_ABBREVIATIONS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

# Which release columns represent an entry, most preferred first. Consulted by
# sorting, list display, and airing-status derivation. Keyed by media-type slug
# to match the routing vocabulary the frontend and watch_order already use.
RELEASE_PRIORITY: Dict[str, tuple] = {
    "anime": ("release_date",),
    "anime-movie": ("release_date_jp", "release_date_tw"),
    "movie": ("release_date_tw", "release_date_usa"),
    "tv-show": ("release_date",),
    "cartoon": ("release_date",),
    "manga": ("release_date",),
    "novel": ("release_date",),
    "comic": ("release_date",),
}

# Every column on every table holding an ISO release value, including the run-end
# columns that carry no priority meaning. Keyed by __tablename__ so the Google
# Sheets formatter can look up a model instance's date columns without restating
# them per worksheet.
DATE_COLUMNS: Dict[str, tuple] = {
    "anime": ("release_date",),
    "anime_movies": ("release_date_jp", "release_date_tw"),
    "movies": ("release_date_usa", "release_date_tw"),
    "tv_shows": ("release_date",),
    "cartoons": ("release_date",),
    "manga": ("release_date", "end_date"),
    "novel": ("release_date", "end_date"),
    "comic": ("release_date", "end_date"),
}


def is_valid(value: Any) -> bool:
    """
    True only for a legal stored value: the right shape AND a real calendar
    date. "2024-13" matches the regex but is not a month, so it fails here.
    """
    if not isinstance(value, str) or not RELEASE_DATE_PATTERN.match(value):
        return False

    parts = value.split("-")
    year = int(parts[0])

    if len(parts) > 1:
        month = int(parts[1])
        if not 1 <= month <= 12:
            return False
        if len(parts) > 2:
            day = int(parts[2])
            if not 1 <= day <= calendar.monthrange(year, month)[1]:
                return False

    return True


def normalize(value: Any) -> Optional[str]:
    """
    A source value in any format this project has ever stored or received,
    converted to the canonical stored form. Returns None for anything empty or
    unrecognizable — the caller decides whether that is worth logging.

    Handles: canonical values (unchanged), the legacy "JUL 2001" format,
    integer and float years (novel and comic stored Integer; Sheets hands back
    "2020.0"), and full ISO dates from TMDB and Tenrai.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    # Already canonical, or an ISO date needing no work.
    if is_valid(text):
        return text

    # "2020.0" and float 2020.0 — a bare year that took a trip through a
    # spreadsheet or an Integer column.
    if re.match(r"^\d{4}\.0+$", text):
        return text.split(".")[0]

    # "JUL 2001" / "jul 2001"
    pieces = text.upper().split()
    if len(pieces) == 2 and pieces[0] in _MONTH_ABBREVIATIONS:
        if re.match(r"^\d{4}$", pieces[1]):
            return f"{pieces[1]}-{_MONTH_ABBREVIATIONS[pieces[0]]:02d}"
        return None

    # An ISO-shaped value with a bad calendar component is not salvageable
    # without inventing data, so it is rejected rather than clamped.
    return None


def sort_key(value: Any) -> Optional[tuple]:
    """
    A (year, month, day) tuple for ordering, or None when nothing parses.

    Missing precision resolves to the FIRST of the period: a bare year is
    1 January, a month and year the 1st of that month. An entry carrying only
    "2020" therefore sits exactly where a 2020-01-01 release does rather than
    just before it, and the two are separated by name.
    """
    canonical = normalize(value)
    if canonical is None:
        return None

    parts = canonical.split("-")
    year = int(parts[0])
    month = int(parts[1]) if len(parts) > 1 else 1
    day = int(parts[2]) if len(parts) > 2 else 1
    return (year, month, day)


def display(value: Any) -> Optional[str]:
    """
    The stored value as it should be shown, which is verbatim.

    Deliberately NOT derived from sort_key: that key invents missing precision
    ("2020" becomes 2020-01-01) so entries can be ordered against one another.
    Displaying that invented day would claim a precision the entry does not
    have. "2018-09-01", "2025-11" and "2023" are all already readable.
    """
    if value is None:
        return None
    text = str(value).strip()
    return text or None
