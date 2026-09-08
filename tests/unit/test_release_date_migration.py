"""The migration's row conversion, tested without touching a database."""

import importlib.util
import pathlib

import pytest

# importlib.import_module("alembic.versions...") resolves to the installed
# `alembic` pip package (which has no `versions` submodule), not this repo's
# alembic/ directory, so it raises ModuleNotFoundError. Load the migration
# file directly by path instead — same pattern already used by
# tests/unit/test_note_backfill.py for alembic/versions/note_backfill_rows.py.
_spec = importlib.util.spec_from_file_location(
    "d1e2f3a4b5c6_iso_release_dates",
    pathlib.Path(__file__).parents[2] / "alembic/versions/d1e2f3a4b5c6_iso_release_dates.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


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
