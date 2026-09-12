"""
The suite may never reach the real Google Sheet.

Backup and Pull talk to a live spreadsheet using the developer's real
credentials, and the test database is EMPTY. A test that reached the real sheet
through the backup path would therefore write header-only tabs over it and trim
everything beneath - which is exactly how 16,774 rows were erased on
2026-09-12 (see test_backup_never_blanks_a_tab.py for the defect that made a
header-only write destructive).

Every test that touches the backup path already patches `bulk_overwrite_sheet`
itself. That is a per-test discipline: it holds only as long as every future
test remembers, and the failure mode of forgetting is not a red test but a
destroyed backup. The autouse guard in conftest makes it structural instead,
and this file is what proves the guard is actually armed - without it, someone
deleting the fixture would break nothing visible.
"""

import pytest

from app.services.integrations import sheets


def test_reaching_the_real_sheet_is_an_error():
    with pytest.raises(AssertionError) as exc:
        sheets.get_google_sheet_tab("Media")

    message = str(exc.value)
    assert "Media" in message
    assert "real" in message.lower() or "production" in message.lower()


def test_the_guard_names_whichever_tab_was_asked_for():
    with pytest.raises(AssertionError) as exc:
        sheets.get_google_sheet_tab("Anime Movie")

    assert "Anime Movie" in str(exc.value)


def test_a_test_may_still_patch_the_sheet_helpers_for_itself(monkeypatch):
    """The guard must not get in the way of the normal pattern: a test that
    stubs bulk_overwrite_sheet or get_all_raw_rows still works, because it
    never reaches the real accessor."""
    monkeypatch.setattr(sheets, "bulk_overwrite_sheet", lambda tab, matrix: True)

    assert sheets.bulk_overwrite_sheet("Media", [["a"], ["b"]]) is True
