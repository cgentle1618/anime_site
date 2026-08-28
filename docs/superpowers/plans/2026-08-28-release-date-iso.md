# Truncated ISO-8601 Release Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every media release date as truncated ISO-8601 (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`) in a single String column per date, replacing today's mix of Integer years, `"JUL 2001"` strings, and anime's split year/month columns.

**Architecture:** One new helper module, `app/utils/release_date.py`, owns parsing, validation, normalization, display, and the per-table column registry. Every model, schema, pipeline, and the Google Sheets formatter reads through it, so the format has exactly one implementation. Precision is self-describing from string length, so no companion precision column is needed, and lexicographic ordering equals chronological ordering.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic v2, pytest; React + Vite + Vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-08-28-release-date-iso-design.md`

## Global Constraints

- **Legal stored values only.** Every release column accepts exactly `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or NULL. The canonical regex is `^\d{4}(-\d{2}(-\d{2})?)?$`, defined once as `release_date.RELEASE_DATE_PATTERN`.
- **Never invent precision.** Display code shows the stored string verbatim. Only sort keys fill missing components, and they fill with the FIRST of the period (`"2024"` → `(2024, 1, 1)`).
- **Never silently drop data.** Any value the migration cannot parse is logged with table, primary key, and raw value before the column is set NULL.
- **Column naming.** `release_date` for every single-date type; `end_date` for the manga/novel/comic run-end column; `anime_movie` and `movie` keep their existing `_jp` / `_tw` / `_usa` suffixed names.
- **`anime.release_season` is never cleared.** It is derived only when `release_date` carries month-or-better precision; a year-only date leaves the existing season untouched.
- **Movie priority is TW first.** `release_date_tw`, then `release_date_usa`. Anime movie priority is JP first: `release_date_jp`, then `release_date_tw`.
- **Concurrent sessions.** Other Claude Code sessions may be editing this branch. Stage only the files named in each task's commit step — never `git add -A`.
- **Frontend double build.** Any task touching `frontend/` ends with `cd frontend && npm run build` before the commit, or :8000 keeps serving a stale bundle.

---

### Task 1: The date helper module

The single implementation of the format. Everything else in this plan consumes it.

**Files:**
- Create: `app/utils/release_date.py`
- Test: `tests/unit/test_release_date.py`

**Interfaces:**
- Consumes: nothing (this is the foundation task)
- Produces:
  - `RELEASE_DATE_PATTERN: re.Pattern` — the canonical regex
  - `UNDATED: tuple` — `(9999, 99, 99)`, sorts after every real date
  - `is_valid(value: Any) -> bool`
  - `normalize(value: Any) -> Optional[str]`
  - `sort_key(value: Any) -> Optional[tuple]`
  - `display(value: Any) -> Optional[str]`
  - `RELEASE_PRIORITY: Dict[str, tuple]` — media-type slug to release columns in priority order
  - `DATE_COLUMNS: Dict[str, tuple]` — `__tablename__` to every ISO column on that table

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_release_date.py`:

```python
"""Unit tests for app/utils/release_date.py — the single owner of the
truncated ISO-8601 release date format."""

import pytest

from app.utils.release_date import (
    DATE_COLUMNS,
    RELEASE_PRIORITY,
    UNDATED,
    display,
    is_valid,
    normalize,
    sort_key,
)


@pytest.mark.parametrize("value", ["2024", "2024-05", "2024-05-17", "0001", "9999-12-31"])
def test_is_valid_accepts_the_three_legal_shapes(value):
    assert is_valid(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "24",            # too short
        "2024-5",        # month not zero-padded
        "2024-05-1",     # day not zero-padded
        "2024-05-17-01", # too many components
        "JUL 2001",      # the old format is not a legal stored value
        "2024/05/17",    # wrong separator
        "",
        None,
    ],
)
def test_is_valid_rejects_everything_else(value):
    assert is_valid(value) is False


@pytest.mark.parametrize("value", ["2024-00", "2024-13", "2024-02-30", "2023-02-29", "2024-04-31"])
def test_is_valid_rejects_calendar_impossible_values(value):
    assert is_valid(value) is False


def test_is_valid_accepts_a_real_leap_day():
    assert is_valid("2024-02-29") is True


@pytest.mark.parametrize(
    "source,expected",
    [
        ("JUL 2001", "2001-07"),
        ("jul 2001", "2001-07"),
        ("  NOV 2025  ", "2025-11"),
        ("2001", "2001"),
        (2020, "2020"),
        (2020.0, "2020"),
        ("2020.0", "2020"),
        ("2001-07-20", "2001-07-20"),
        ("2001-07", "2001-07"),
        (None, None),
        ("", None),
        ("   ", None),
        ("not a date", None),
        ("MARCH 2001", None),  # only the three-letter abbreviations are recognized
    ],
)
def test_normalize_converts_every_historical_source_format(source, expected):
    assert normalize(source) == expected


def test_normalize_is_idempotent():
    assert normalize(normalize("JUL 2001")) == "2001-07"


@pytest.mark.parametrize(
    "value,expected",
    [
        ("2024", (2024, 1, 1)),
        ("2024-05", (2024, 5, 1)),
        ("2024-05-17", (2024, 5, 17)),
        (None, None),
        ("garbage", None),
    ],
)
def test_sort_key_fills_missing_precision_with_the_first_of_the_period(value, expected):
    assert sort_key(value) == expected


def test_a_year_only_value_sorts_with_not_before_the_first_of_that_year():
    assert sort_key("2024") == sort_key("2024-01-01")


def test_lexicographic_order_matches_chronological_order():
    values = ["2024-05-17", "2023", "2024-05", "2024", "2023-12-31"]
    assert sorted(values) == ["2023", "2023-12-31", "2024", "2024-05", "2024-05-17"]


def test_undated_sorts_after_every_real_date():
    assert UNDATED > sort_key("9999-12-31")


@pytest.mark.parametrize("value", ["2024", "2024-05", "2024-05-17"])
def test_display_returns_the_stored_string_verbatim(value):
    assert display(value) == value


def test_display_returns_none_for_empty_values():
    assert display(None) is None
    assert display("") is None


def test_movie_priority_puts_taiwan_first():
    assert RELEASE_PRIORITY["movie"] == ("release_date_tw", "release_date_usa")


def test_anime_movie_priority_puts_japan_first():
    assert RELEASE_PRIORITY["anime-movie"] == ("release_date_jp", "release_date_tw")


def test_date_columns_cover_every_media_table():
    assert set(DATE_COLUMNS) == {
        "anime",
        "anime_movies",
        "movies",
        "tv_shows",
        "cartoons",
        "manga",
        "novel",
        "comic",
    }


def test_date_columns_include_the_run_end_columns():
    assert DATE_COLUMNS["manga"] == ("release_date", "end_date")
    assert DATE_COLUMNS["novel"] == ("release_date", "end_date")
    assert DATE_COLUMNS["comic"] == ("release_date", "end_date")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_release_date.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.utils.release_date'`

- [ ] **Step 3: Write the implementation**

Create `app/utils/release_date.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_release_date.py -v`
Expected: PASS, all tests

- [ ] **Step 5: Commit**

```bash
git add app/utils/release_date.py tests/unit/test_release_date.py
git commit -m "feat(dates): add the truncated ISO-8601 release date helper"
```

---

### Task 2: Model columns and CHECK constraints

Rename and retype the columns on all eight media models. No data moves yet — Task 3 owns the migration.

**Files:**
- Modify: `app/models/anime.py:73-74` (drop `release_month`, `release_year`; add `release_date`)
- Modify: `app/models/anime_movie.py:58-59` (no rename; add constraints)
- Modify: `app/models/movie.py:51-52` (no rename; add constraints)
- Modify: `app/models/tv_show.py:55` (no rename; add constraint)
- Modify: `app/models/cartoon.py:56` (no rename; add constraint)
- Modify: `app/models/manga.py:70-71` (rename to `release_date`, `end_date`)
- Modify: `app/models/novel.py:77-78` (rename and retype Integer → String)
- Modify: `app/models/comic.py:62-63` (rename and retype Integer → String)
- Test: `tests/unit/test_release_date_models.py`

**Interfaces:**
- Consumes: `app.utils.release_date.RELEASE_DATE_PATTERN`, `DATE_COLUMNS`
- Produces: the renamed columns listed above; every media model's `__table_args__` contains a CHECK constraint named `ck_<tablename>_<column>_iso`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_release_date_models.py`:

```python
"""The eight media models expose ISO release columns and constrain them."""

import pytest
from sqlalchemy import String

from app.models import Anime, AnimeMovies, Cartoon, Comic, Manga, Movies, Novel, TVShows
from app.utils.release_date import DATE_COLUMNS

ALL_MEDIA_MODELS = [Anime, AnimeMovies, Movies, TVShows, Cartoon, Manga, Novel, Comic]


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_in_the_registry_exists_on_its_model(model):
    columns = model.__table__.columns
    for name in DATE_COLUMNS[model.__tablename__]:
        assert name in columns, f"{model.__tablename__} is missing {name}"


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_is_a_nullable_string(model):
    columns = model.__table__.columns
    for name in DATE_COLUMNS[model.__tablename__]:
        column = columns[name]
        assert isinstance(column.type, String), f"{model.__tablename__}.{name} is not String"
        assert column.nullable is True


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_carries_a_check_constraint(model):
    constraint_names = {c.name for c in model.__table__.constraints if c.name}
    for name in DATE_COLUMNS[model.__tablename__]:
        expected = f"ck_{model.__tablename__}_{name}_iso"
        assert expected in constraint_names, f"missing {expected}"


def test_anime_no_longer_splits_year_and_month():
    assert "release_year" not in Anime.__table__.columns
    assert "release_month" not in Anime.__table__.columns
    assert "release_date" in Anime.__table__.columns


def test_anime_still_stores_release_season():
    assert "release_season" in Anime.__table__.columns


@pytest.mark.parametrize("model", [Manga, Novel, Comic])
def test_run_types_renamed_year_columns_to_date_columns(model):
    assert "release_year" not in model.__table__.columns
    assert "end_year" not in model.__table__.columns
    assert "release_date" in model.__table__.columns
    assert "end_date" in model.__table__.columns
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_release_date_models.py -v`
Expected: FAIL — `anime` still has `release_year`, and no `ck_*_iso` constraints exist

- [ ] **Step 3: Edit each model**

In `app/models/anime.py`, replace lines 73-74 (`release_month` at line 73 stays adjacent — remove both it and `release_year`, keep `release_season`):

```python
    release_season = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
```

In `app/models/manga.py`, replace lines 70-71:

```python
    release_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
```

In `app/models/novel.py`, replace lines 77-78, and in `app/models/comic.py`, replace lines 62-63, with the identical pair (both change from `Integer` to `String`):

```python
    release_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
```

`anime_movie.py`, `movie.py`, `tv_show.py` and `cartoon.py` keep their column declarations exactly as they are — they are already nullable Strings with the right names.

Then add the CHECK constraints. Each model gets (or extends) a `__table_args__` immediately after its `__tablename__`. For `app/models/anime.py`:

```python
    __table_args__ = (
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_release_date_iso",
        ),
    )
```

Add `CheckConstraint` to the SQLAlchemy import at the top of each file. Repeat for every table, one constraint per column in `DATE_COLUMNS`, named `ck_<tablename>_<column>_iso`. For example `app/models/movie.py`:

```python
    __table_args__ = (
        CheckConstraint(
            r"release_date_usa ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_movies_release_date_usa_iso",
        ),
        CheckConstraint(
            r"release_date_tw ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_movies_release_date_tw_iso",
        ),
    )
```

If a model already declares `__table_args__`, append the constraints to the existing tuple rather than replacing it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_release_date_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/anime.py app/models/anime_movie.py app/models/movie.py app/models/tv_show.py app/models/cartoon.py app/models/manga.py app/models/novel.py app/models/comic.py tests/unit/test_release_date_models.py
git commit -m "feat(dates): move media models to ISO release columns with CHECK constraints"
```

---

### Task 3: The Alembic migration

Converts every existing row and applies the schema change. The data step runs before the constraints so a bad conversion surfaces as a log line, not a constraint violation mid-migration.

**Files:**
- Create: `alembic/versions/a1b2c3d4e5f6_iso_release_dates.py`
- Test: `tests/unit/test_release_date_migration.py`

**Interfaces:**
- Consumes: `app.utils.release_date.normalize`
- Produces: revision `a1b2c3d4e5f6`, with `down_revision = "z9a0b1c2d3e4"` (the current head)

- [ ] **Step 1: Write the failing test**

The migration's conversion logic is extracted into a module-level function so it can be tested without a database. Create `tests/unit/test_release_date_migration.py`:

```python
"""The migration's row conversion, tested without touching a database."""

import importlib
import pytest

migration = importlib.import_module(
    "alembic.versions.a1b2c3d4e5f6_iso_release_dates"
)


@pytest.mark.parametrize(
    "year,month,expected",
    [
        ("2023", "JAN", "2023-01"),
        ("2023", None, "2023"),
        ("2023", "", "2023"),
        (None, "JAN", None),   # orphan month: no year means no meaningful date
        (None, None, None),
    ],
)
def test_merge_anime_columns(year, month, expected):
    assert migration.merge_anime_release(year, month) == expected


def test_orphan_month_is_reported_as_unparseable():
    assert migration.merge_anime_release(None, "JAN") is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_release_date_migration.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the migration**

Create `alembic/versions/a1b2c3d4e5f6_iso_release_dates.py`:

```python
"""Convert every media release column to truncated ISO-8601.

Revision ID: a1b2c3d4e5f6
Revises: z9a0b1c2d3e4
"""

import logging
from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.utils.release_date import normalize

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "z9a0b1c2d3e4"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.iso_release_dates")

ISO_CHECK = r"^\d{4}(-\d{2}(-\d{2})?)?$"

# Tables whose existing column keeps its name and only needs its values rewritten.
IN_PLACE = [
    ("anime_movies", "release_date_jp"),
    ("anime_movies", "release_date_tw"),
    ("movies", "release_date_usa"),
    ("movies", "release_date_tw"),
    ("tv_shows", "release_date"),
    ("cartoons", "release_date"),
]

# Tables whose year columns are renamed (and, for novel and comic, retyped).
RENAMED = [
    ("manga", "release_year", "release_date", False),
    ("manga", "end_year", "end_date", False),
    ("novel", "release_year", "release_date", True),
    ("novel", "end_year", "end_date", True),
    ("comic", "release_year", "release_date", True),
    ("comic", "end_year", "end_date", True),
]


def merge_anime_release(year: Optional[str], month: Optional[str]) -> Optional[str]:
    """
    Anime's split columns collapsed into one value.

    A year with a recognized month name yields YYYY-MM; a year alone yields
    YYYY. A month with no year is an orphan with no meaningful ISO form, so it
    yields None and the caller logs it.
    """
    if not year:
        return None
    if month:
        merged = normalize(f"{month} {year}")
        if merged:
            return merged
    return normalize(year)


def _log_unparseable(table: str, pk: str, column: str, raw) -> None:
    logger.warning(
        "iso_release_dates: could not parse %s.%s for id=%s, raw=%r — set NULL",
        table, column, pk, raw,
    )


def upgrade() -> None:
    conn = op.get_bind()

    # --- Anime: merge release_year + release_month into release_date --------
    op.add_column("anime", sa.Column("release_date", sa.String(), nullable=True))
    rows = conn.execute(
        sa.text("SELECT system_id, release_year, release_month FROM anime")
    ).fetchall()
    for pk, year, month in rows:
        merged = merge_anime_release(year, month)
        if merged is None and (year or month):
            _log_unparseable("anime", pk, "release_year/release_month", (year, month))
        if merged is not None:
            conn.execute(
                sa.text("UPDATE anime SET release_date = :v WHERE system_id = :id"),
                {"v": merged, "id": pk},
            )
    op.drop_column("anime", "release_year")
    op.drop_column("anime", "release_month")

    # --- In-place rewrites ---------------------------------------------------
    for table, column in IN_PLACE:
        rows = conn.execute(
            sa.text(f"SELECT system_id, {column} FROM {table} WHERE {column} IS NOT NULL")
        ).fetchall()
        for pk, raw in rows:
            converted = normalize(raw)
            if converted is None:
                _log_unparseable(table, pk, column, raw)
            conn.execute(
                sa.text(f"UPDATE {table} SET {column} = :v WHERE system_id = :id"),
                {"v": converted, "id": pk},
            )

    # --- Renames, with a String retype for the Integer columns ---------------
    for table, old, new, was_integer in RENAMED:
        op.add_column(table, sa.Column(new, sa.String(), nullable=True))
        rows = conn.execute(
            sa.text(f"SELECT system_id, {old} FROM {table} WHERE {old} IS NOT NULL")
        ).fetchall()
        for pk, raw in rows:
            converted = normalize(raw)
            if converted is None:
                _log_unparseable(table, pk, old, raw)
            conn.execute(
                sa.text(f"UPDATE {table} SET {new} = :v WHERE system_id = :id"),
                {"v": converted, "id": pk},
            )
        op.drop_column(table, old)

    # --- Constraints, applied only after every value is canonical ------------
    for table, column in [("anime", "release_date")] + IN_PLACE + [
        (t, n) for t, _, n, _ in RENAMED
    ]:
        op.create_check_constraint(
            f"ck_{table}_{column}_iso", table, f"{column} ~ '{ISO_CHECK}'"
        )


def downgrade() -> None:
    """
    Structural reversal only. The original "JUL 2001" spellings are not
    reconstructed — the ISO values are copied back into the old column names
    and types, which is lossless for ordering but changes the text.
    """
    conn = op.get_bind()

    for table, column in [("anime", "release_date")] + IN_PLACE + [
        (t, n) for t, _, n, _ in RENAMED
    ]:
        op.drop_constraint(f"ck_{table}_{column}_iso", table, type_="check")

    for table, old, new, was_integer in RENAMED:
        col_type = sa.Integer() if was_integer else sa.String()
        op.add_column(table, sa.Column(old, col_type, nullable=True))
        cast = "::integer" if was_integer else ""
        conn.execute(
            sa.text(
                f"UPDATE {table} SET {old} = substring({new} from 1 for 4){cast} "
                f"WHERE {new} IS NOT NULL"
            )
        )
        op.drop_column(table, new)

    op.add_column("anime", sa.Column("release_year", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("release_month", sa.String(), nullable=True))
    conn.execute(
        sa.text(
            "UPDATE anime SET release_year = substring(release_date from 1 for 4) "
            "WHERE release_date IS NOT NULL"
        )
    )
    op.drop_column("anime", "release_date")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_release_date_migration.py -v`
Expected: PASS

- [ ] **Step 5: Run the migration against the test database**

Run: `alembic upgrade head`
Expected: completes without error. Review any `iso_release_dates: could not parse` warnings in the output — each one is a row that lost its date and needs a human decision. Do not proceed past this task until that list has been reviewed.

- [ ] **Step 6: Verify the downgrade path**

Run: `alembic downgrade -1 && alembic upgrade head`
Expected: both complete without error.

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/a1b2c3d4e5f6_iso_release_dates.py tests/unit/test_release_date_migration.py
git commit -m "feat(dates): migrate every media release column to truncated ISO-8601"
```

---

### Task 4: Pydantic schema validation

The API rejects a malformed release date before it reaches the CHECK constraint, so the client gets a 422 with a useful message rather than a 500.

**Files:**
- Modify: `app/schemas/anime.py:42-44`
- Modify: `app/schemas/anime_movie.py:28-29`
- Modify: `app/schemas/movie.py:26-27`
- Modify: `app/schemas/tv_show.py:30`
- Modify: `app/schemas/cartoon.py:31`
- Modify: `app/schemas/manga.py:38-39`
- Modify: `app/schemas/novel.py:52-53`
- Modify: `app/schemas/comic.py:29-30`
- Create: `app/schemas/release_date_field.py`
- Test: `tests/unit/test_release_date_schemas.py`

**Interfaces:**
- Consumes: `app.utils.release_date.is_valid`, `normalize`
- Produces: `app.schemas.release_date_field.release_date_validator(*field_names)` — returns a Pydantic `field_validator` to mount on a schema class

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_release_date_schemas.py`:

```python
"""Release date fields are validated and normalized at the API boundary."""

import pytest
from pydantic import ValidationError

from app.schemas.anime import AnimeBase
from app.schemas.comic import ComicBase
from app.schemas.movie import MovieBase


def test_anime_accepts_every_precision():
    for value in ("2024", "2024-05", "2024-05-17"):
        assert AnimeBase(release_date=value).release_date == value


def test_anime_accepts_a_null_release_date():
    assert AnimeBase().release_date is None


def test_anime_normalizes_the_legacy_format_on_the_way_in():
    assert AnimeBase(release_date="JUL 2001").release_date == "2001-07"


def test_anime_rejects_an_impossible_month():
    with pytest.raises(ValidationError):
        AnimeBase(release_date="2024-13")


def test_anime_rejects_unparseable_text():
    with pytest.raises(ValidationError):
        AnimeBase(release_date="sometime next year")


def test_movie_validates_both_regional_columns():
    movie = MovieBase(release_date_tw="2024-05", release_date_usa="JUL 2001")
    assert movie.release_date_tw == "2024-05"
    assert movie.release_date_usa == "2001-07"


def test_comic_accepts_an_integer_year_and_stores_it_as_a_string():
    comic = ComicBase(release_date=2020, end_date=2023)
    assert comic.release_date == "2020"
    assert comic.end_date == "2023"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_release_date_schemas.py -v`
Expected: FAIL — `AnimeBase` has no `release_date` field

- [ ] **Step 3: Write the shared validator and mount it**

Create `app/schemas/release_date_field.py`:

```python
"""The shared release-date field validator, mounted by every media schema."""

from typing import Any, Optional

from pydantic import field_validator

from app.utils.release_date import is_valid, normalize


def _coerce(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None

    canonical = normalize(value)
    if canonical is None or not is_valid(canonical):
        raise ValueError(
            f"{value!r} is not a release date. Use YYYY, YYYY-MM, or YYYY-MM-DD."
        )
    return canonical


def release_date_validator(*field_names: str):
    """
    A Pydantic validator for the named release-date fields. Accepts anything
    normalize() understands and stores the canonical form, so a client posting
    the legacy "JUL 2001" is corrected rather than rejected.
    """
    return field_validator(*field_names, mode="before")(
        classmethod(lambda cls, v: _coerce(v))
    )
```

In `app/schemas/anime.py`, replace lines 42-44 with:

```python
    release_season: Optional[str] = None
    release_date: Optional[str] = None
```

and add inside the `AnimeBase` class body, after the field declarations:

```python
    _validate_release_dates = release_date_validator("release_date")
```

with `from app.schemas.release_date_field import release_date_validator` at the top.

Apply the same pattern to the other seven schemas, changing only the field names:

- `app/schemas/anime_movie.py`: `release_date_validator("release_date_jp", "release_date_tw")`
- `app/schemas/movie.py`: `release_date_validator("release_date_usa", "release_date_tw")`
- `app/schemas/tv_show.py`: `release_date_validator("release_date")`
- `app/schemas/cartoon.py`: `release_date_validator("release_date")`
- `app/schemas/manga.py`: fields become `release_date: Optional[str]` and `end_date: Optional[str]`; `release_date_validator("release_date", "end_date")`
- `app/schemas/novel.py`: same as manga, and the fields change from `Optional[int]` to `Optional[str]`
- `app/schemas/comic.py`: same as novel

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_release_date_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/schemas/release_date_field.py app/schemas/anime.py app/schemas/anime_movie.py app/schemas/movie.py app/schemas/tv_show.py app/schemas/cartoon.py app/schemas/manga.py app/schemas/novel.py app/schemas/comic.py tests/unit/test_release_date_schemas.py
git commit -m "feat(dates): validate and normalize release dates at the API boundary"
```

---

### Task 5: External API mappers emit ISO

TMDB already sends full ISO dates and the current mapper throws the day away. This task stops that.

**Files:**
- Modify: `app/utils/tmdb_utils.py:41-56` (`_convert_tmdb_date`)
- Modify: `app/utils/tenrai_utils.py:145-155` (release mapping in `map_tenrai_to_anime_data`)
- Modify: `app/utils/comicvine_utils.py` (the `release_year` mapping)
- Modify: `app/utils/utils.py:40-124` (the `*_FIELDS_TO_FILL` lists)
- Test: `tests/unit/test_tmdb_utils.py` (create), `tests/unit/test_tenrai_utils.py` (extend)

**Interfaces:**
- Consumes: `app.utils.release_date.normalize`
- Produces: `_convert_tmdb_date` returns canonical ISO; `map_tenrai_to_anime_data` returns a `release_date` key and no longer returns `release_year` or `release_month`; `map_comicvine_to_comic_data` returns `release_date`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_tmdb_utils.py`:

```python
"""TMDB dates keep their day precision instead of being flattened to a month."""

import pytest

from app.utils.tmdb_utils import _convert_tmdb_date


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2008-07-18", "2008-07-18"),
        ("2008-07", "2008-07"),
        ("2008", "2008"),
        ("", None),
        (None, None),
        ("not-a-date", None),
    ],
)
def test_tmdb_dates_are_stored_at_full_precision(raw, expected):
    assert _convert_tmdb_date(raw) == expected
```

Append to `tests/unit/test_tenrai_utils.py`:

```python
def test_tenrai_maps_a_known_month_to_month_precision():
    raw = {
        "aired": {"string": "Jan 2026 to ?", "prop": {"from": {"year": 2026, "month": 1}}},
        "season": "winter",
    }
    mapped = map_tenrai_to_anime_data(raw)
    assert mapped["release_date"] == "2026-01"
    assert mapped["release_season"] == "WIN"


def test_tenrai_maps_an_unreliable_month_to_year_precision():
    # aired.prop.from.month defaults to 1 when MAL only knows the year; the
    # aired.string is the honest signal.
    raw = {
        "aired": {"string": "2026 to ?", "prop": {"from": {"year": 2026, "month": 1}}},
        "season": "winter",
    }
    mapped = map_tenrai_to_anime_data(raw)
    assert mapped["release_date"] == "2026"
    assert mapped["release_season"] == "WIN"


def test_tenrai_no_longer_returns_split_year_and_month():
    raw = {"aired": {"string": "2026", "prop": {"from": {"year": 2026}}}, "season": None}
    mapped = map_tenrai_to_anime_data(raw)
    assert "release_year" not in mapped
    assert "release_month" not in mapped
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_tmdb_utils.py tests/unit/test_tenrai_utils.py -v`
Expected: FAIL — `_convert_tmdb_date("2008-07-18")` returns `"JUL 2008"`, and the Tenrai mapper has no `release_date` key

- [ ] **Step 3: Rewrite the mappers**

In `app/utils/tmdb_utils.py`, replace `_convert_tmdb_date` entirely:

```python
def _convert_tmdb_date(date_str: Optional[str]) -> Optional[str]:
    """
    TMDB's date string in canonical stored form.

    TMDB usually sends a full "2008-07-18", which is already canonical. The
    previous implementation flattened that to "JUL 2008", discarding a day we
    actually knew.
    """
    return normalize(date_str)
```

Add `from app.utils.release_date import normalize` at the top and delete the now-unused `MONTH_MAP` from this module.

In `app/utils/tenrai_utils.py`, replace the release block inside `map_tenrai_to_anime_data` (the `release_year` / `month_is_known` / `release_month` lines):

```python
    # aired.prop.from.month is unreliable: Tenrai defaults it to 1 (January) when
    # MAL only knows the year. The aired.string field is honest — "2026 to ?" means
    # year-only, while "Jan 2026 to ?" means the month is actually known.
    aired = raw_data.get("aired") or {}
    aired_string = aired.get("string") or ""
    prop_from = (aired.get("prop") or {}).get("from") or {}
    prop_year = prop_from.get("year")
    prop_month = prop_from.get("month")
    month_is_known = prop_month and not re.match(r"^\d{4}", aired_string)
    if prop_year and month_is_known:
        release_date = f"{int(prop_year):04d}-{int(prop_month):02d}"
    elif prop_year:
        release_date = f"{int(prop_year):04d}"
    else:
        release_date = None
    release_season = _convert_season(raw_data.get("season"))
```

and in the returned dictionary replace the `"release_year"` and `"release_month"` keys with a single `"release_date": release_date`. `MONTH_MAP` in this module is still used by `_parse_tenrai_date` — leave it.

In `app/utils/comicvine_utils.py`, change the mapper's output key from `release_year` to `release_date`, passing the value through `normalize`.

In `app/utils/utils.py`, update the fill lists: `ANIME_FIELDS_TO_FILL` drops `"release_month"` and `"release_year"` and gains `"release_date"` (keeping `"release_season"`); `MANGA_FIELDS_TO_FILL` and `NOVEL_FIELDS_TO_FILL` replace `"release_year"`/`"end_year"` with `"release_date"`/`"end_date"`; `COMIC_FIELDS_TO_FILL` replaces `"release_year"` with `"release_date"`. The comment above `COMIC_FIELDS_TO_FILL` referencing `end_year` becomes `end_date`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_tmdb_utils.py tests/unit/test_tenrai_utils.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/tmdb_utils.py app/utils/tenrai_utils.py app/utils/comicvine_utils.py app/utils/utils.py tests/unit/test_tmdb_utils.py tests/unit/test_tenrai_utils.py
git commit -m "feat(dates): map TMDB, Tenrai and Comic Vine responses to ISO release dates"
```

---

### Task 6: Autofill wiring

`autofill.py` assigns the mapper output onto model instances. Its field names must follow Task 5.

**Files:**
- Modify: `app/services/domain/autofill.py:96-101` (anime), `:157-158` (anime movie), `:203-206` (manga), `:253-256` (novel), `:304-320` (movie), `:363-364` (tv show), `:417-455` (cartoon), `:505` (comic)
- Test: `tests/unit/test_release_date_autofill.py`

**Interfaces:**
- Consumes: the Task 5 mapper output keys (`release_date`, `end_date`)
- Produces: no new public names; the existing autofill functions now set the ISO columns

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_release_date_autofill.py`:

```python
"""Autofill writes ISO release dates and derives airing status from them."""

import types
from datetime import date

from app.services.domain.autofill import _airing_status_from_release


def test_a_past_full_date_is_released():
    assert _airing_status_from_release("2001-07-20") == "Released"


def test_a_future_full_date_is_not_yet_released():
    future = f"{date.today().year + 5}-01-01"
    assert _airing_status_from_release(future) == "Not Yet Released"


def test_a_year_only_value_resolves_to_the_first_of_that_year():
    # "first of the period": a bare current year counts as already released,
    # matching how the value sorts.
    assert _airing_status_from_release(str(date.today().year)) == "Released"


def test_an_unparseable_value_yields_no_status():
    assert _airing_status_from_release("who knows") is None


def test_a_missing_value_yields_no_status():
    assert _airing_status_from_release(None) is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_release_date_autofill.py -v`
Expected: FAIL with `ImportError: cannot import name '_airing_status_from_release'`

- [ ] **Step 3: Update autofill**

Add to `app/services/domain/autofill.py`, replacing the two inline `date.fromisoformat(raw_date)` blocks (currently at lines 314-320 for movie and 425-431 for cartoon) with one shared helper:

```python
def _airing_status_from_release(value: Any) -> Optional[str]:
    """
    "Released" or "Not Yet Released" from a stored release date, or None when
    nothing parses. Missing precision resolves to the first of the period, the
    same rule the sort key uses, so a bare current year reads as released.
    """
    key = release_date.sort_key(value)
    if key is None:
        return None
    year, month, day = key
    return "Released" if date(year, month, day) <= date.today() else "Not Yet Released"
```

with `from app.utils import release_date` at the top. Then update each fill block to the new field names:

- Anime (lines 96-101): drop the `release_month` and `release_year` assignments; add `if anime.release_date is None: anime.release_date = j_data.get("release_date")`. Keep the `release_season` assignment exactly as it is.
- Manga (203-206) and novel (253-256): `release_year` → `release_date`, `end_year` → `end_date`.
- Movie (304-320): assign `movie.release_date_usa` from `mapped.get("release_date_usa")` as today, then derive airing status via `_airing_status_from_release(movie.release_date_tw or movie.release_date_usa)` — TW first, matching `RELEASE_PRIORITY`.
- TV show (363-364) and cartoon (417-455): unchanged field names; replace the inline date parsing with `_airing_status_from_release`.
- Comic (505): `"release_year"` → `"release_date"` in the field tuple.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_release_date_autofill.py tests/unit/test_comic_autofill.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/autofill.py tests/unit/test_release_date_autofill.py
git commit -m "feat(dates): fill ISO release dates and derive airing status through one helper"
```

---

### Task 7: Anime season derivation

The rule change that keeps `release_season` alive: derive from month precision, never clear on year-only.

**Files:**
- Modify: `app/services/domain/derivation.py:121-130` (`apply_calculate_seasonal_from_month`)
- Modify: `app/services/domain/post_processing.py:180-190`
- Test: `tests/unit/test_derivations.py` (extend)

**Interfaces:**
- Consumes: `app.utils.release_date.sort_key`, `app.utils.utils.calculate_seasonal_from_month`
- Produces: `apply_calculate_seasonal_from_month(anime) -> bool` keeps its name and signature; it now reads `anime.release_date`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_derivations.py`:

```python
import types

from app.services.domain import apply_calculate_seasonal_from_month


def test_month_precision_derives_the_season():
    anime = types.SimpleNamespace(release_date="2024-07", release_season=None)
    assert apply_calculate_seasonal_from_month(anime) is True
    assert anime.release_season == "SUM"


def test_day_precision_derives_the_season_too():
    anime = types.SimpleNamespace(release_date="2024-10-05", release_season=None)
    assert apply_calculate_seasonal_from_month(anime) is True
    assert anime.release_season == "FAL"


def test_year_only_precision_leaves_an_existing_season_untouched():
    # Tenrai fills release_season directly, independent of any month. Clearing
    # it here would destroy real data.
    anime = types.SimpleNamespace(release_date="2024", release_season="WIN")
    assert apply_calculate_seasonal_from_month(anime) is False
    assert anime.release_season == "WIN"


def test_year_only_precision_does_not_invent_a_season():
    anime = types.SimpleNamespace(release_date="2024", release_season=None)
    assert apply_calculate_seasonal_from_month(anime) is False
    assert anime.release_season is None


def test_an_existing_season_is_never_overwritten():
    anime = types.SimpleNamespace(release_date="2024-07", release_season="WIN")
    assert apply_calculate_seasonal_from_month(anime) is False
    assert anime.release_season == "WIN"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_derivations.py -v`
Expected: FAIL — the current implementation reads `anime.release_month`

- [ ] **Step 3: Rewrite the derivation**

Replace `apply_calculate_seasonal_from_month` in `app/services/domain/derivation.py`:

```python
def apply_calculate_seasonal_from_month(anime: Anime) -> bool:
    """
    Fills release_season from the month component of release_date.

    Only fires when release_date carries month-or-better precision and no
    season is already set. A year-only date leaves the season exactly as it
    is: autofill writes release_season straight from the Tenrai response,
    independently of any month, so an anime can legitimately carry a season
    it never had a month for. Clearing that would destroy real data.

    Returns True only when it actually wrote a value.
    """
    if anime.release_season is not None:
        return False
    if not anime.release_date or len(str(anime.release_date)) < 7:
        return False

    key = release_date.sort_key(anime.release_date)
    if key is None:
        return False

    season = calculate_seasonal_from_month(f"{key[1]:02d}")
    if season is None:
        return False

    anime.release_season = season
    return True
```

Add `from app.utils import release_date` to the imports. In `app/services/domain/post_processing.py:180-190`, change the guard from `anime.release_month is not None` to `anime.release_date is not None`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_derivations.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/derivation.py app/services/domain/post_processing.py tests/unit/test_derivations.py
git commit -m "feat(dates): derive anime season from release_date without clearing it on year-only"
```

---

### Task 8: Seasonal grouping and the season filter

Three call sites read the anime year standalone. They take a four-character prefix instead of a column.

**Files:**
- Modify: `app/services/domain/seasonal.py:71-96` (`create_missing_seasonal`), `:120-135` (`sync_seasonal_counts`)
- Modify: `app/routers/anime.py:66-72` (the `airing_season` filter)
- Test: `tests/api/test_seasonal_release_date.py`

**Interfaces:**
- Consumes: `app.models.Anime.release_date`
- Produces: no new public names; the seasonal string format `"WIN 2026"` is unchanged

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_seasonal_release_date.py`:

```python
"""Seasonal grouping reads the year out of release_date."""

from app.models import Anime, Seasonal
from app.services.domain.seasonal import create_missing_seasonal


def test_seasonal_entries_are_created_from_release_date(db_session):
    db_session.add(Anime(anime_name_en="Test A", release_season="WIN", release_date="2026-01"))
    db_session.add(Anime(anime_name_en="Test B", release_season="SUM", release_date="2025"))
    db_session.commit()

    create_missing_seasonal(db_session)

    created = {s.seasonal for s in db_session.query(Seasonal).all()}
    assert "WIN 2026" in created
    assert "SUM 2025" in created


def test_an_anime_with_no_release_date_creates_no_seasonal(db_session):
    db_session.add(Anime(anime_name_en="Test C", release_season="WIN", release_date=None))
    db_session.commit()

    create_missing_seasonal(db_session)

    assert not [s for s in db_session.query(Seasonal).all() if s.seasonal.endswith("None")]


def test_the_airing_season_filter_matches_on_the_year_prefix(client, db_session):
    db_session.add(Anime(anime_name_en="Filter Me", release_season="WIN", release_date="2026-01-15"))
    db_session.commit()

    response = client.get("/api/anime/?airing_season=WIN 2026")
    assert response.status_code == 200
    assert any(a["anime_name_en"] == "Filter Me" for a in response.json())
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_seasonal_release_date.py -v`
Expected: FAIL — `Anime` has no `release_year` for the query to group on

- [ ] **Step 3: Update the three call sites**

In `app/services/domain/seasonal.py`, `create_missing_seasonal` selects the year prefix instead of a column:

```python
    year_expr = func.substr(Anime.release_date, 1, 4)
    unique_combinations = (
        db.query(Anime.release_season, year_expr)
        .filter(Anime.release_season.isnot(None), Anime.release_date.isnot(None))
        .distinct()
        .all()
    )
```

with `from sqlalchemy import func` imported. The loop body below it is unchanged — it already builds `f"{season} {year}"`.

In `sync_seasonal_counts`, change the filter from `Anime.release_year.isnot(None)` to `Anime.release_date.isnot(None)`, and the key construction from `f"{anime.release_season} {anime.release_year}"` to:

```python
        key = f"{anime.release_season} {str(anime.release_date)[:4]}"
```

In `app/routers/anime.py`, replace the `airing_season` filter body:

```python
    if airing_season:
        parts = airing_season.strip().split(" ", 1)
        if len(parts) == 2:
            query = query.filter(
                models.Anime.release_season == parts[0],
                func.substr(models.Anime.release_date, 1, 4) == parts[1],
            )
```

with `from sqlalchemy import func` added to the imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/api/test_seasonal_release_date.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/seasonal.py app/routers/anime.py tests/api/test_seasonal_release_date.py
git commit -m "feat(dates): read the seasonal year from the release_date prefix"
```

---

### Task 9: Watch order priority and remarks

The private parser is deleted, the movie priority is flipped, and remarks stops hardcoding the USA date.

**Files:**
- Modify: `app/services/domain/watch_order.py:295-400` (delete `_RELEASE_FIELDS`, `_UNDATED`, `_parse_release_value`; rewrite `release_sort_key` and `release_display`)
- Modify: `app/services/domain/remarks.py:85-95`
- Test: `tests/unit/test_watch_order_release_priority.py`

**Interfaces:**
- Consumes: `app.utils.release_date.RELEASE_PRIORITY`, `sort_key`, `display`, `UNDATED`
- Produces: `release_sort_key(entry, media_type) -> tuple` and `release_display(entry, media_type) -> Optional[str]` keep their names and signatures

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_watch_order_release_priority.py`:

```python
"""Multi-region entries resolve through one documented priority order."""

import types

from app.services.domain.watch_order import release_display, release_sort_key


def test_a_movie_prefers_the_taiwan_date():
    movie = types.SimpleNamespace(release_date_tw="2024-05-01", release_date_usa="2023-01-01")
    assert release_sort_key(movie, "movie") == (2024, 5, 1)
    assert release_display(movie, "movie") == "2024-05-01"


def test_a_movie_falls_back_to_the_usa_date():
    # TMDB autofills the USA date; TW is manual, so this is the common case.
    movie = types.SimpleNamespace(release_date_tw=None, release_date_usa="2023-01-01")
    assert release_sort_key(movie, "movie") == (2023, 1, 1)


def test_an_anime_movie_prefers_the_japan_date():
    entry = types.SimpleNamespace(release_date_jp="2001-07", release_date_tw="2003-02")
    assert release_sort_key(entry, "anime-movie") == (2001, 7, 1)


def test_an_anime_movie_falls_back_to_the_taiwan_date():
    entry = types.SimpleNamespace(release_date_jp=None, release_date_tw="2003-02")
    assert release_sort_key(entry, "anime-movie") == (2003, 2, 1)


def test_an_undated_entry_sorts_last():
    entry = types.SimpleNamespace(release_date=None)
    assert release_sort_key(entry, "manga") == (9999, 99, 99)


def test_a_year_only_entry_sorts_with_the_first_of_that_year():
    year_only = types.SimpleNamespace(release_date="2020")
    exact = types.SimpleNamespace(release_date="2020-01-01")
    assert release_sort_key(year_only, "manga") == release_sort_key(exact, "manga")


def test_display_never_invents_precision():
    entry = types.SimpleNamespace(release_date="2020")
    assert release_display(entry, "manga") == "2020"


def test_anime_display_reads_the_single_column():
    anime = types.SimpleNamespace(release_date="2024-07")
    assert release_display(anime, "anime") == "2024-07"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_watch_order_release_priority.py -v`
Expected: FAIL — `test_a_movie_prefers_the_taiwan_date` returns the USA date, and the anime branch still reads `release_year`

- [ ] **Step 3: Rewrite the watch order date handling**

In `app/services/domain/watch_order.py`, delete `_RELEASE_FIELDS`, `_UNDATED`, `_parse_release_value` and the anime special-case entirely, replacing them with:

```python
def release_sort_key(entry: Any, media_type: str) -> tuple:
    """
    (year, month, day) for an entry, or UNDATED when nothing parses.

    The column consulted, and the order for the multi-region types, comes from
    release_date.RELEASE_PRIORITY — the single source of truth. Precision is
    limited by whatever the entry stores: a manga carrying only a year cannot
    be placed accurately against a movie with a full date, so entries sharing a
    year sort together and are then broken by name.
    """
    for field in release_date.RELEASE_PRIORITY.get(media_type, ()):
        parsed = release_date.sort_key(getattr(entry, field, None))
        if parsed is not None:
            return parsed
    return release_date.UNDATED


def release_display(entry: Any, media_type: str) -> Optional[str]:
    """
    The entry's release date as stored, for showing next to a step.

    Deliberately NOT derived from release_sort_key: that key invents missing
    precision ("2020" becomes 2020-01-01) so entries can be ordered against one
    another. Displaying that invented day would claim a precision the entry
    does not have.
    """
    for field in release_date.RELEASE_PRIORITY.get(media_type, ()):
        shown = release_date.display(getattr(entry, field, None))
        if shown is not None:
            return shown
    return None
```

Add `from app.utils import release_date` to the imports, and remove the now-unused `MONTH_MAP` import and `_clean_release_text` helper if nothing else in the module uses them.

In `app/services/domain/remarks.py`, replace the hardcoded `"release_date_usa": e.release_date_usa` in the movie block with the priority-resolved value:

```python
                "release_date": release_display(e, "movie"),
```

importing `release_display` from `app.services.domain.watch_order`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_watch_order_release_priority.py tests/unit/test_formatter_watch_order.py tests/api/test_watch_order.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/watch_order.py app/services/domain/remarks.py tests/unit/test_watch_order_release_priority.py
git commit -m "fix(watch-order): resolve release dates through one priority table, TW first for movies"
```

---

### Task 10: Google Sheets round trip

Without this, the first backup-then-pull cycle silently rewrites every ISO date into the spreadsheet's locale format.

**Files:**
- Modify: `app/utils/formatter.py:37-52` (`format_model_for_sheet`)
- Test: `tests/unit/test_formatter_release_date.py`

**Interfaces:**
- Consumes: `app.utils.release_date.DATE_COLUMNS`
- Produces: `format_model_for_sheet` unchanged in signature; release columns are emitted with a leading apostrophe

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_release_date.py`:

```python
"""Release columns are written as text so Sheets cannot reinterpret them.

Google Sheets, given "2024-05-17" under USER_ENTERED, stores a date cell and
hands back the locale rendering ("5/17/2024") on the next get_all_values. A
leading apostrophe forces text and is stripped from the value on read.
"""

from app.models import Anime, Movies
from app.utils.formatter import format_model_for_sheet


def _cell(model_cls, instance, column_name):
    names = [c.name for c in model_cls.__table__.columns]
    return format_model_for_sheet(instance)[names.index(column_name)]


def test_a_full_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024-05-17")
    assert _cell(Anime, anime, "release_date") == "'2024-05-17"


def test_a_month_precision_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024-05")
    assert _cell(Anime, anime, "release_date") == "'2024-05"


def test_a_year_only_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024")
    assert _cell(Anime, anime, "release_date") == "'2024"


def test_an_empty_date_is_not_escaped():
    anime = Anime(anime_name_en="X", release_date=None)
    assert _cell(Anime, anime, "release_date") == ""


def test_both_regional_columns_are_escaped():
    movie = Movies(movie_name_en="X", release_date_tw="2024-05", release_date_usa="2023")
    assert _cell(Movies, movie, "release_date_tw") == "'2024-05"
    assert _cell(Movies, movie, "release_date_usa") == "'2023"


def test_a_non_date_column_is_untouched():
    anime = Anime(anime_name_en="Cowboy Bebop", release_date="1998-04")
    assert _cell(Anime, anime, "anime_name_en") == "Cowboy Bebop"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_formatter_release_date.py -v`
Expected: FAIL — the cell comes back as `"2024-05-17"` with no apostrophe

- [ ] **Step 3: Escape the date columns**

Replace `format_model_for_sheet` in `app/utils/formatter.py`:

```python
def format_model_for_sheet(instance: Any) -> list:
    """
    Dynamically extracts and formats all fields from a SQLAlchemy model instance.
    This guarantees the Google Sheet order is 100% identical to the Postgres Database order forever,
    preventing column-shifting bugs.

    Release date columns are prefixed with an apostrophe. The backup writes with
    value_input_option="USER_ENTERED", under which Sheets parses "2024-05-17"
    into a date cell and returns the spreadsheet's locale rendering on the next
    read — corrupting the value on the first backup-then-pull cycle. The
    apostrophe forces a text cell and is not part of the value on read.
    """
    if not instance:
        return []

    date_columns = release_date.DATE_COLUMNS.get(instance.__class__.__tablename__, ())

    row_data = []
    # Loop through the exact columns in the exact order they appear in the database schema
    for column in instance.__class__.__table__.columns:
        val = getattr(instance, column.name, None)
        cell = format_for_sheet(val)
        if column.name in date_columns and cell:
            cell = f"'{cell}"
        row_data.append(cell)

    return row_data
```

Add `from app.utils import release_date` to the imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_formatter_release_date.py tests/unit/test_formatter_comic.py -v`
Expected: PASS

- [ ] **Step 5: Verify the real round trip**

Run a Backup followed by a Pull from the admin pipelines page against the test sheet, then confirm every release value in the database is byte-identical to what it was before the backup. Cover all three precisions.
Expected: no value changed.

- [ ] **Step 6: Commit**

```bash
git add app/utils/formatter.py tests/unit/test_formatter_release_date.py
git commit -m "fix(sheets): write release dates as text so the round trip cannot reformat them"
```

---

### Task 11: Frontend release date input

A shared input and validator, replacing the free-text fields and anime's season/month/year trio.

**Files:**
- Create: `frontend/src/lib/releaseDate.js`
- Create: `frontend/src/lib/releaseDate.test.js`
- Create: `frontend/src/components/forms/ReleaseDateInput.jsx`
- Modify: `frontend/src/config/formFactories.js:37-39, 79-80, 113-114, 143, 172, 207, 252, 290`
- Modify: `frontend/src/config/formFields/fieldMeta.js:150-152, 254-266, 315-323, 340-341`
- Modify: `frontend/src/pages/add-tabs/AnimeAddTab.jsx:442-479`, and the release fields in `AnimeMovieAddTab.jsx`, `MovieAddTab.jsx:302-318`, `TvShowAddTab.jsx`, `CartoonAddTab.jsx`, `MangaAddTab.jsx`, `NovelAddTab.jsx:465-482`, `ComicAddTab.jsx`
- Modify: `frontend/src/lib/payloads.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (mirrors the backend regex by contract)
- Produces:
  - `isValidReleaseDate(value: string) -> boolean`
  - `formatReleaseDate(value: string) -> string` — display, verbatim, `"TBA"` when empty
  - `<ReleaseDateInput value onChange label />` — a text input with inline validity feedback

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/releaseDate.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { isValidReleaseDate, formatReleaseDate } from "./releaseDate";

describe("isValidReleaseDate", () => {
  it("accepts the three legal shapes", () => {
    expect(isValidReleaseDate("2024")).toBe(true);
    expect(isValidReleaseDate("2024-05")).toBe(true);
    expect(isValidReleaseDate("2024-05-17")).toBe(true);
  });

  it("treats an empty value as valid so a blank field is not an error", () => {
    expect(isValidReleaseDate("")).toBe(true);
    expect(isValidReleaseDate(null)).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(isValidReleaseDate("24")).toBe(false);
    expect(isValidReleaseDate("2024-5")).toBe(false);
    expect(isValidReleaseDate("JUL 2001")).toBe(false);
    expect(isValidReleaseDate("2024/05/17")).toBe(false);
  });

  it("rejects calendar-impossible values", () => {
    expect(isValidReleaseDate("2024-13")).toBe(false);
    expect(isValidReleaseDate("2024-02-30")).toBe(false);
    expect(isValidReleaseDate("2023-02-29")).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(isValidReleaseDate("2024-02-29")).toBe(true);
  });
});

describe("formatReleaseDate", () => {
  it("shows the stored value verbatim, never inventing precision", () => {
    expect(formatReleaseDate("2024")).toBe("2024");
    expect(formatReleaseDate("2024-05")).toBe("2024-05");
    expect(formatReleaseDate("2024-05-17")).toBe("2024-05-17");
  });

  it("shows TBA when there is nothing stored", () => {
    expect(formatReleaseDate("")).toBe("TBA");
    expect(formatReleaseDate(null)).toBe("TBA");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/releaseDate.test.js`
Expected: FAIL — cannot resolve `./releaseDate`

- [ ] **Step 3: Write the helper and the input**

Create `frontend/src/lib/releaseDate.js`:

```javascript
// Mirrors app/utils/release_date.py. Release dates are stored as YYYY,
// YYYY-MM, or YYYY-MM-DD; precision is self-describing from the length, and
// display never invents the components a value does not have.

const RELEASE_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function isValidReleaseDate(value) {
  // An empty field is not an error — the column is nullable.
  if (value === null || value === undefined || value === "") return true;
  if (!RELEASE_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (month !== undefined) {
    if (month < 1 || month > 12) return false;
    if (day !== undefined) {
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > lastDay) return false;
    }
  }
  return true;
}

export function formatReleaseDate(value) {
  if (value === null || value === undefined || value === "") return "TBA";
  return String(value);
}
```

Create `frontend/src/components/forms/ReleaseDateInput.jsx`:

```jsx
// A release date field. Free text rather than <input type="date"> because the
// column deliberately supports year-only and month-only precision, which a
// native date picker cannot express.
import { Field, inputCls } from "./FormField";
import { isValidReleaseDate } from "../../lib/releaseDate";

export default function ReleaseDateInput({ label, value, onChange }) {
  const invalid = !isValidReleaseDate(value);
  return (
    <Field label={label} hint="YYYY, YYYY-MM, or YYYY-MM-DD">
      <input
        className={
          invalid
            ? `${inputCls} border-red-400 focus:ring-red-400`
            : inputCls
        }
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="2024-05-17"
      />
      {invalid && (
        <p className="text-[10px] font-bold text-red-500 mt-0.5">
          Use YYYY, YYYY-MM, or YYYY-MM-DD.
        </p>
      )}
    </Field>
  );
}
```

In `frontend/src/config/formFactories.js`, update the blank-form field lists: the anime factory drops `release_month` and `release_year` and gains `release_date: ""` (keeping `release_season: ""`); the manga, novel and comic factories replace `release_year: ""` with `release_date: ""` and `end_year: ""` with `end_date: ""`.

In `frontend/src/config/formFields/fieldMeta.js`: delete the `release_year`, `end_year` and `release_month` entries; change the shared `release_date` entry to `{ label: "Release Date", control: "text", group: "Release" }`; add `end_date: { label: "End Date", control: "text", group: "Release" }`; and change the `anime_movie` and `movie` regional entries from `control: "date"` to `control: "text"` — a native date picker cannot express year-only precision.

In `frontend/src/pages/add-tabs/AnimeAddTab.jsx`, replace the three-field Release block (lines 442-479) with the season select followed by one `ReleaseDateInput`:

```jsx
      <SectionHeader icon="fa-industry" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Season">
          <select
            className={selectCls}
            value={af.release_season}
            onChange={(e) => ua("release_season", e.target.value)}
          >
            <option value="">—</option>
            {RELEASE_SEASONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <ReleaseDateInput
          label="Release Date"
          value={af.release_date}
          onChange={(v) => ua("release_date", v)}
        />
      </div>
```

Remove the now-unused `RELEASE_MONTHS` import from this file.

In each of the other seven add tabs, replace the plain `<Field>`/`<input>` pairs for release columns with `ReleaseDateInput`, keeping the same labels — for example in `MovieAddTab.jsx`:

```jsx
        <ReleaseDateInput
          label="Release Date TW"
          value={mf.release_date_tw}
          onChange={(v) => umf("release_date_tw", v)}
        />
        <ReleaseDateInput
          label="Release Date USA"
          value={mf.release_date_usa}
          onChange={(v) => umf("release_date_usa", v)}
        />
```

TW is listed first, matching the stored priority. In `NovelAddTab.jsx`, `MangaAddTab.jsx` and `ComicAddTab.jsx` the two fields become "Release Date" (`release_date`) and "End Date" (`end_date`).

In `frontend/src/lib/payloads.js`, rename every `release_year` / `end_year` / `release_month` key to its new name.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/releaseDate.test.js`
Expected: PASS

- [ ] **Step 5: Build the bundle**

Run: `cd frontend && npm run build`
Expected: build succeeds. Without this, :8000 keeps serving the old bundle.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/releaseDate.js frontend/src/lib/releaseDate.test.js frontend/src/components/forms/ReleaseDateInput.jsx frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/pages/add-tabs/
git commit -m "feat(dates): add a partial-precision release date input across the admin forms"
```

---

### Task 12: Frontend display

Every place a release date is rendered.

**Files:**
- Modify: `frontend/src/lib/formatters.js:10-17` (`getReleaseFallback`)
- Modify: `frontend/src/components/cards/MediaCard.jsx`
- Modify: `frontend/src/pages/detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`
- Modify: `frontend/src/pages/library/LibraryAnime.jsx` and the sibling library pages
- Modify: `frontend/src/pages/admin/Modify.jsx`, `Add.jsx`, `Delete.jsx`, `ReviewQueue.jsx`
- Test: `frontend/src/lib/formatters.test.js`

**Interfaces:**
- Consumes: `formatReleaseDate` from Task 11
- Produces: `getReleaseFallback(entry) -> string` keeps its name; it now reads `release_date`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/formatters.test.js` (or append if it exists):

```javascript
import { describe, it, expect } from "vitest";
import { getReleaseFallback } from "./formatters";

describe("getReleaseFallback", () => {
  it("prefers the season and year when both are known", () => {
    expect(getReleaseFallback({ release_season: "WIN", release_date: "2024-01" })).toBe(
      "WIN 2024",
    );
  });

  it("falls back to the stored date when there is no season", () => {
    expect(getReleaseFallback({ release_date: "2024-05-17" })).toBe("2024-05-17");
  });

  it("shows a year-only date as the year", () => {
    expect(getReleaseFallback({ release_date: "2024" })).toBe("2024");
  });

  it("shows TBA when nothing is stored", () => {
    expect(getReleaseFallback({})).toBe("TBA");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/formatters.test.js`
Expected: FAIL — the current implementation reads `release_year` and returns `"TBA"`

- [ ] **Step 3: Update the display code**

Replace `getReleaseFallback` in `frontend/src/lib/formatters.js`:

```javascript
export function getReleaseFallback(entry) {
  const date = entry.release_date;
  if (entry.release_season && date) return `${entry.release_season} ${String(date).slice(0, 4)}`;
  if (date) return formatReleaseDate(date);
  return "TBA";
}
```

with `import { formatReleaseDate } from "./releaseDate";` at the top.

Then sweep the remaining references. Run this to find every one:

```bash
grep -rn "release_year\|release_month\|end_year" frontend/src
```

Each hit is a rename to `release_date` / `end_date`, except the anime detail and library pages, which previously composed a display string from the season/month/year trio — those call `getReleaseFallback` or `formatReleaseDate` instead. The sweep is done when that grep returns nothing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm run test:run`
Expected: PASS, whole suite

- [ ] **Step 5: Verify the grep is clean**

Run: `grep -rn "release_year\|release_month\|end_year" frontend/src app/`
Expected: no output.

- [ ] **Step 6: Build the bundle**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/formatters.js frontend/src/lib/formatters.test.js frontend/src/components/cards/MediaCard.jsx frontend/src/pages/detail/ frontend/src/pages/library/ frontend/src/pages/admin/
git commit -m "feat(dates): render ISO release dates across cards, detail and library pages"
```

---

### Task 13: Documentation

**Files:**
- Modify: `docs/database-schema.md:235-236, 314, 356-357, 399, 435-436, 476, 520, 559, 604, 643, 699-700, 806-807, 906-907`
- Modify: `docs/business-logic.md`
- Modify: `docs/integrations.md`

**Interfaces:**
- Consumes: the finished behavior from Tasks 1-12
- Produces: no code

- [ ] **Step 1: Update the schema tables**

In `docs/database-schema.md`, for each of the eight media tables, replace the release row(s) with the new column name, `String` type, and the format note:

```markdown
| `release_date` | String | Yes | Truncated ISO-8601: `"2024"`, `"2024-05"`, or `"2024-05-17"` |
```

Update the anime table to show `release_date` and `release_season` with `release_month` and `release_year` gone; update manga, novel and comic to `release_date` / `end_date`, noting that novel and comic changed from Integer to String. Update every "**Notes:**" line that describes these columns as free-form strings.

- [ ] **Step 2: Update the business logic doc**

In `docs/business-logic.md`, add or update three rules:

- **Release date format.** The three legal shapes, that precision is self-describing, and that missing precision resolves to the first of the period for ordering but is never shown.
- **Release priority.** `anime-movie` is JP then TW; `movie` is TW then USA; the order lives in `release_date.RELEASE_PRIORITY`.
- **Season derivation.** `release_season` is derived from `release_date` only at month-or-better precision, and is never cleared on a year-only date because autofill writes it independently from the Tenrai response.

- [ ] **Step 3: Update the integrations doc**

In `docs/integrations.md`, document that the Sheets backup escapes release columns with a leading apostrophe under `USER_ENTERED`, and why: without it Sheets parses the ISO value into a date cell and `get_all_values` returns the locale rendering, corrupting the value on the first backup-then-pull cycle.

- [ ] **Step 4: Run the whole suite**

Run: `pytest -q && cd frontend && npm run test:run`
Expected: PASS, both suites

- [ ] **Step 5: Commit**

```bash
git add docs/database-schema.md docs/business-logic.md docs/integrations.md
git commit -m "docs(dates): document the ISO release date format, priority and Sheets escaping"
```

---

## Verification checklist

Before calling this done, confirm each of these with actual command output, not by inspection:

- [ ] `pytest -q` passes.
- [ ] `cd frontend && npm run test:run` passes.
- [ ] `grep -rn "release_year\|release_month\|end_year" app/ frontend/src alembic/` returns only the migration file.
- [ ] `alembic upgrade head` runs clean, and its `could not parse` warnings have been reviewed row by row.
- [ ] A Backup followed by a Pull leaves every release value byte-identical, checked at all three precisions.
- [ ] `cd frontend && npm run build` has been run, so :8000 and :5173 agree.
