"""Two-stage novel progress: rollover, derivation, key fallback."""

from types import SimpleNamespace

import pytest

from app.services.domain.novel_units import (
    derive_novel_catalog,
    derive_novel_list,
    normalize_arc_progress,
    unit_display_key,
)

# The derivation split in step 1: arc_total and ch_total are the work's,
# arc_fin / ch_fin / ch_fin_in_arc / vol_fin are one reader's and live on
# their user_media_list row. These two helpers keep every assertion below
# reading the way it did, aimed at whichever object now owns the field.
_ROW_FIELDS = ("arc_fin", "ch_fin", "ch_fin_in_arc", "vol_fin")


def split(**kw):
    """Build the (entry, row) pair from one pre-split field set."""
    row = SimpleNamespace(**{k: kw.pop(k) for k in _ROW_FIELDS if k in kw})
    return SimpleNamespace(**kw), row


def derive(entry, row):
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)


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


# --- derive_novel_catalog / derive_novel_list --------------------------------------------------

def test_derives_totals_and_absolute_chapters():
    entry, row = split(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive(entry, row)
    assert entry.arc_total == 2
    assert entry.ch_total == 212
    assert row.ch_fin == 201            # 100 finished + 101 into arc 2
    assert row.arc_fin == 1
    assert row.ch_fin_in_arc == 101


def test_absolute_chapters_after_the_arc_closes():
    entry, row = split(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=112,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive(entry, row)
    assert row.arc_fin == 2
    assert row.ch_fin_in_arc == 0
    assert row.ch_fin == 212


def test_units_are_read_in_position_order_not_list_order():
    entry, row = split(
        units=[arc(2, 112), arc(1, 100)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive(entry, row)
    assert row.ch_fin == 201


def test_volume_rows_do_not_touch_progress():
    # Decision B: volume rows are optional enrichment. vol_fin may exceed the
    # number of named volumes and nothing derives from them.
    entry, row = split(
        units=[volume(1), volume(2)],
        arc_fin=0,
        ch_fin_in_arc=0,
        arc_total=None,
        ch_total=7,
        ch_fin=3,
        vol_fin=9,
        vol_total_original=12,
    )
    derive(entry, row)
    assert row.vol_fin == 9
    assert entry.vol_total_original == 12
    assert entry.ch_total == 7          # untouched
    assert row.ch_fin == 3              # untouched
    assert entry.arc_total is None      # untouched


def test_no_arc_rows_zeroes_only_the_in_arc_cursor():
    entry, row = split(
        units=[],
        arc_fin=0,
        ch_fin_in_arc=44,
        arc_total=None,
        ch_total=300,
        ch_fin=120,
    )
    derive(entry, row)
    assert row.ch_fin_in_arc == 0
    assert row.ch_fin == 120            # flat pair still governs


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


# --- type gates the counters ------------------------------------------------
# A Light Novel or a Novel counts volumes and nothing else, so its chapter and
# arc columns are not "empty", they are meaningless. derive_novel_progress
# clears them on every write path (forms, tracker PATCH, Pull, Fill, Calculate)
# so a stale value cannot come back in through any of them.


def light_novel(**kw):
    base = dict(
        type="Light Novel",
        units=[],
        arc_total=3,
        arc_fin=2,
        ch_total=110,
        ch_fin=44,
        ch_fin_in_arc=7,
        vol_fin=3,
        vol_total_original=11,
        vol_total_tw=11,
    )
    base.update(kw)
    return split(**base)


def test_light_novel_clears_chapter_and_arc_columns():
    entry, row = light_novel()
    derive(entry, row)
    assert entry.ch_total is None
    assert entry.arc_total is None
    assert row.ch_fin == 0
    assert row.arc_fin == 0
    assert row.ch_fin_in_arc == 0


def test_light_novel_keeps_its_volume_columns():
    entry, row = light_novel()
    derive(entry, row)
    assert row.vol_fin == 3
    assert entry.vol_total_original == 11
    assert entry.vol_total_tw == 11


def test_novel_type_clears_chapter_and_arc_columns_too():
    entry, row = light_novel(type="Novel")
    derive(entry, row)
    assert entry.ch_total is None
    assert row.ch_fin == 0


def test_clearing_is_idempotent():
    entry, row = light_novel()
    derive(entry, row)
    derive(entry, row)
    assert entry.ch_total is None
    assert row.ch_fin == 0
    assert row.vol_fin == 3


def test_arc_rows_on_a_light_novel_do_not_resurrect_chapters():
    # Arc rows cannot be created for this type through the editor, but a Pull
    # from the sheet can carry them. The type wins: nothing is derived.
    entry, row = light_novel(units=[arc(1, 100), arc(2, 112)])
    derive(entry, row)
    assert entry.ch_total is None
    assert entry.arc_total is None
    assert row.ch_fin == 0


def test_web_novel_keeps_its_flat_chapter_pair():
    entry, row = light_novel(type="Web")
    derive(entry, row)
    assert entry.ch_total == 110
    assert row.ch_fin == 44
    assert row.ch_fin_in_arc == 0     # no arc rows, so the cursor is zeroed


def test_web_novel_with_arcs_still_derives():
    entry, row = light_novel(type="Web", units=[arc(1, 100), arc(2, 112)], arc_fin=1, ch_fin_in_arc=101)
    derive(entry, row)
    assert entry.arc_total == 2
    assert entry.ch_total == 212
    assert row.ch_fin == 201


def test_other_type_keeps_its_chapters():
    # "Other" may count volumes, chapters or stories, so nothing is cleared.
    entry, row = light_novel(type="Other")
    derive(entry, row)
    assert entry.ch_total == 110
    assert row.ch_fin == 44
