"""Two-stage novel progress: rollover, derivation, key fallback."""

from types import SimpleNamespace

import pytest

from app.services.domain.novel_units import (
    derive_novel_progress,
    normalize_arc_progress,
    unit_display_key,
)


def arc(position, ch_count):
    return SimpleNamespace(
        unit_kind="arc", position=position, ch_count=ch_count, unit_key=None
    )


def volume(position):
    return SimpleNamespace(
        unit_kind="volume", position=position, ch_count=None, unit_key=None
    )


# --- normalize_arc_progress -------------------------------------------------

def test_within_current_arc_is_left_alone():
    # Arc 1 (100) done, 101 chapters into arc 2 (112). Nothing to roll over.
    assert normalize_arc_progress([100, 112], 1, 101) == (1, 101)


def test_carries_up_when_current_arc_completes():
    assert normalize_arc_progress([100, 112], 1, 112) == (2, 0)


def test_carries_across_more_than_one_arc():
    # 250 chapters into arc 1 spans arc 1 (100) and arc 2 (112), leaving 38.
    assert normalize_arc_progress([100, 112, 90], 0, 250) == (2, 38)


def test_borrows_down_into_previous_arc():
    # Stepping back from arc 2 chapter 0 lands on the last chapter of arc 1.
    assert normalize_arc_progress([100, 112], 1, -1) == (0, 99)


def test_borrows_across_more_than_one_arc():
    assert normalize_arc_progress([100, 112, 90], 2, -150) == (0, 62)


def test_clamps_at_zero():
    assert normalize_arc_progress([100], 0, -5) == (0, 0)


def test_does_not_clamp_past_the_last_recorded_arc():
    # An ongoing web novel is read into an arc not yet recorded. Clamping
    # here would silently discard that progress.
    assert normalize_arc_progress([100], 1, 40) == (1, 40)


def test_zero_count_arc_stops_the_carry():
    # An arc whose ch_count is unknown cannot be carried through.
    assert normalize_arc_progress([100, 0, 90], 1, 30) == (1, 30)


def test_no_arcs_is_a_no_op():
    assert normalize_arc_progress([], 0, 0) == (0, 0)


# --- derive_novel_progress --------------------------------------------------

def test_derives_totals_and_absolute_chapters():
    entry = SimpleNamespace(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.arc_total == 2
    assert entry.ch_total == 212
    assert entry.ch_fin == 201          # 100 finished + 101 into arc 2
    assert entry.arc_fin == 1
    assert entry.ch_fin_in_arc == 101


def test_absolute_chapters_after_the_arc_closes():
    entry = SimpleNamespace(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=112,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.arc_fin == 2
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 212


def test_units_are_read_in_position_order_not_list_order():
    entry = SimpleNamespace(
        units=[arc(2, 112), arc(1, 100)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.ch_fin == 201


def test_volume_rows_do_not_touch_progress():
    # Decision B: volume rows are optional enrichment. vol_fin may exceed the
    # number of named volumes and nothing derives from them.
    entry = SimpleNamespace(
        units=[volume(1), volume(2)],
        arc_fin=0,
        ch_fin_in_arc=0,
        arc_total=None,
        ch_total=7,
        ch_fin=3,
        vol_fin=9,
        vol_total_original=12,
    )
    derive_novel_progress(entry)
    assert entry.vol_fin == 9
    assert entry.vol_total_original == 12
    assert entry.ch_total == 7          # untouched
    assert entry.ch_fin == 3            # untouched
    assert entry.arc_total is None      # untouched


def test_no_arc_rows_zeroes_only_the_in_arc_cursor():
    entry = SimpleNamespace(
        units=[],
        arc_fin=0,
        ch_fin_in_arc=44,
        arc_total=None,
        ch_total=300,
        ch_fin=120,
    )
    derive_novel_progress(entry)
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 120          # flat pair still governs


# --- unit_display_key -------------------------------------------------------

@pytest.mark.parametrize(
    "kind,position,expected",
    [
        ("volume", 1, "Vol 1"),
        ("arc", 2, "Arc 2"),
        ("story", 3, "Story 3"),
        ("chapter", 4, "Ch 4"),
        ("volume", 1.5, "Vol 1.5"),
    ],
)
def test_generated_key_when_none_given(kind, position, expected):
    assert unit_display_key(kind, position, None) == expected
    assert unit_display_key(kind, position, "   ") == expected


def test_explicit_key_wins():
    assert unit_display_key("volume", 1, "第一卷") == "第一卷"
