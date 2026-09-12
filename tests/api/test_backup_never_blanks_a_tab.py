"""
Backup must never replace a tab that has data with a header row alone.

This is the defect that actually destroyed the backup sheet on 2026-09-12.
`bulk_overwrite_sheet` guarded with `if not data_matrix`, and `execute_backup`
always calls it as `[headers] + matrix` - a list that is never falsy. So an
EMPTY TABLE produced a header-only write, which the function dutifully wrote
and then trimmed everything beneath, erasing 16,774 rows across 40 tabs. The
docstring and docs/data-actions.md both claimed "Backup refuses to blank a
tab"; the guard it referred to could not fire.

An empty table is not by itself wrong - Character, Character Casting and Media
Content Label are legitimately empty on this installation - so the rule cannot
be "refuse every header-only write". It is: refuse to blank a tab that
CURRENTLY HAS DATA.
"""

import pytest

from app.services.integrations import sheets


class FakeWorksheet:
    """Enough of a gspread worksheet to exercise the write path."""

    def __init__(self, existing_rows):
        self._existing = existing_rows
        self.row_count = 1000
        self.col_count = 25
        self.updated = None
        self.cleared = None

    def get(self, rng):
        # Only 'A2:A2' is asked for: "is there a first data row?"
        return [["something"]] if len(self._existing) >= 2 else []

    def update(self, *args, **kwargs):
        self.updated = args

    def batch_clear(self, ranges):
        self.cleared = ranges


@pytest.fixture
def fake_tab(monkeypatch):
    def install(existing_rows):
        ws = FakeWorksheet(existing_rows)
        monkeypatch.setattr(sheets, "get_google_sheet_tab", lambda name: ws)
        return ws

    return install


def test_header_only_write_over_a_populated_tab_is_refused(fake_tab):
    """THE regression test. The sheet holds 2081 rows; the database it is being
    backed up from holds none. That is a wrong-database backup, not an empty
    table, and it must not be allowed to erase the sheet."""
    ws = fake_tab([["system_id", "display_name"]] + [["x", "y"]] * 2081)

    with pytest.raises(ValueError) as exc:
        sheets.bulk_overwrite_sheet("Media", [["system_id", "display_name"]])

    assert "Media" in str(exc.value)
    assert ws.updated is None, "nothing may be written"
    assert ws.cleared is None, "and nothing may be cleared"


def test_header_only_write_over_an_already_empty_tab_is_allowed(fake_tab):
    """Character is legitimately empty here. Backing up an empty table over an
    already-empty tab destroys nothing, so it must still work - otherwise every
    Backup on this installation fails."""
    ws = fake_tab([["system_id", "name_en"]])

    assert sheets.bulk_overwrite_sheet("Character", [["system_id", "name_en"]]) is True
    assert ws.updated is not None


def test_a_write_with_real_rows_is_unaffected(fake_tab):
    ws = fake_tab([["system_id"]] + [["old"]] * 500)

    assert sheets.bulk_overwrite_sheet("Media", [["system_id"], ["a"], ["b"]]) is True
    assert ws.updated is not None


def test_a_completely_empty_matrix_is_still_refused(fake_tab):
    """The original guard still stands for the case it was written for."""
    fake_tab([["system_id"]])

    with pytest.raises(ValueError):
        sheets.bulk_overwrite_sheet("Media", [])
