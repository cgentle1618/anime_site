"""
bulk_overwrite_sheet must never leave a tab empty and must never hide a failure.

The old sequence was clear() then update(); an update failure (quota, 5xx,
grid-size error) left the tab blank and the function returned False, which
Backup ignored and logged as Success.
"""

import pytest

from app.services.integrations import sheets


class FakeWorksheet:
    row_count = 1000
    col_count = 50

    def __init__(self, fail_update=False):
        self.calls = []
        self.fail_update = fail_update

    def update(self, *args, **kwargs):
        self.calls.append("update")
        if self.fail_update:
            raise RuntimeError("grid limit")

    def clear(self):
        self.calls.append("clear")

    def batch_clear(self, ranges):
        self.calls.append(("batch_clear", ranges))


@pytest.fixture
def worksheet(monkeypatch):
    def _install(fail_update=False):
        ws = FakeWorksheet(fail_update=fail_update)
        monkeypatch.setattr(sheets, "get_google_sheet_tab", lambda tab: ws)
        monkeypatch.setattr(sheets.time, "sleep", lambda s: None)
        return ws

    return _install


MATRIX = [["a", "b"], ["1", "2"], ["3", "4"]]


def test_a_failed_update_raises_and_never_clears_the_tab(worksheet):
    ws = worksheet(fail_update=True)
    with pytest.raises(RuntimeError):
        sheets.bulk_overwrite_sheet("Anime", MATRIX)
    assert "clear" not in ws.calls
    assert not any(isinstance(c, tuple) for c in ws.calls)


def test_data_is_written_before_leftover_cells_are_cleared(worksheet):
    ws = worksheet()
    assert sheets.bulk_overwrite_sheet("Anime", MATRIX) is True
    assert ws.calls[0] == "update"
    kind, ranges = ws.calls[1]
    assert kind == "batch_clear"
    # Rows below the 3-row matrix and columns right of the 2-col matrix.
    assert "A4:AX1000" in ranges
    assert "C1:AX3" in ranges


def test_an_empty_matrix_is_refused_rather_than_wiping_the_tab(worksheet):
    ws = worksheet()
    with pytest.raises(ValueError):
        sheets.bulk_overwrite_sheet("Anime", [])
    assert ws.calls == []
