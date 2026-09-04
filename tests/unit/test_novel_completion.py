"""mark_novel_completed with the two-stage cursor."""

from types import SimpleNamespace

from app.services.domain.completion import mark_novel_completed


def arc(position, ch_count):
    return SimpleNamespace(unit_kind="arc", position=position, ch_count=ch_count)


def novel(**overrides):
    base = dict(
        units=[],
        serialization_status=None,
        reading_status="Active Reading",
        vol_total_original=None,
        vol_total_tw=None,
        vol_fin=0,
        arc_total=None,
        arc_fin=0,
        ch_total=None,
        ch_fin=0,
        ch_fin_in_arc=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_completing_an_arc_novel_closes_every_arc():
    entry = novel(units=[arc(1, 100), arc(2, 112)], arc_fin=1, ch_fin_in_arc=101)
    mark_novel_completed(entry)
    assert entry.reading_status == "Completed"
    assert entry.serialization_status == "完結"
    assert entry.arc_fin == 2
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 212
    assert entry.ch_total == 212


def test_completing_a_volume_novel_is_unchanged():
    entry = novel(vol_total_original=12, vol_total_tw=9, vol_fin=3)
    mark_novel_completed(entry)
    assert entry.vol_fin == 12
    assert entry.vol_total_tw == 12
    assert entry.ch_fin_in_arc == 0
