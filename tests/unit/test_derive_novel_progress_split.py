"""
derive_novel_progress splits into a catalogue half and a per-user half.

The arithmetic is unchanged - normalize_arc_progress still does the folding -
but arc_total and ch_total are the work's, while arc_fin, ch_fin_in_arc and
ch_fin are the reader's and live on their list row. Two people reading the
same web novel fold their own cursors through the same arc widths and land in
different places, which is the whole point.
"""

from app.models import Novel, NovelUnit, UserMediaList
from app.services.domain.novel_units import (
    derive_novel_catalog,
    derive_novel_list,
)


def _novel_with_arcs(*counts):
    entry = Novel(type="Web Novel")
    entry.units = [
        NovelUnit(unit_kind="arc", position=float(i + 1), ch_count=float(c))
        for i, c in enumerate(counts)
    ]
    return entry


def test_catalog_half_sets_the_totals_only():
    entry = _novel_with_arcs(10, 20, 30)
    derive_novel_catalog(entry)
    assert entry.arc_total == 3.0
    assert entry.ch_total == 60.0


def test_list_half_folds_an_overflowing_cursor_into_the_next_arc():
    entry = _novel_with_arcs(10, 20, 30)
    row = UserMediaList(status="Active Reading", arc_fin=0, ch_fin_in_arc=25)
    derive_novel_list(row, entry)
    assert row.arc_fin == 1.0
    assert row.ch_fin_in_arc == 15.0
    assert row.ch_fin == 25.0


def test_list_half_borrows_downward_on_a_negative_cursor():
    entry = _novel_with_arcs(10, 20, 30)
    row = UserMediaList(status="Active Reading", arc_fin=2, ch_fin_in_arc=-5)
    derive_novel_list(row, entry)
    assert row.arc_fin == 1.0


def test_a_volume_only_type_clears_both_halves():
    """'Light Novel' is counted in volumes, so arcs carry no meaning for it -
    even when a Pull has carried arc rows in."""
    entry = _novel_with_arcs(10, 20)
    entry.type = "Light Novel"
    row = UserMediaList(status="Active Reading", arc_fin=1, ch_fin_in_arc=5)
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    assert entry.arc_total is None
    assert entry.ch_total is None
    assert row.arc_fin == 0
    assert row.ch_fin == 0
    assert row.ch_fin_in_arc == 0


def test_both_halves_are_idempotent():
    entry = _novel_with_arcs(10, 20)
    row = UserMediaList(status="Active Reading", arc_fin=1, ch_fin_in_arc=5)
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    first = (
        entry.arc_total, entry.ch_total, row.arc_fin, row.ch_fin_in_arc, row.ch_fin
    )
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    assert (
        entry.arc_total, entry.ch_total, row.arc_fin, row.ch_fin_in_arc, row.ch_fin
    ) == first
