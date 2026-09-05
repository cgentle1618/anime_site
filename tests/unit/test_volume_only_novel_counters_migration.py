"""The volume-only novel counter cleanup, checked without running Alembic."""

import importlib.util
import pathlib

from app.utils.constants import NOVEL_UNIT_KINDS_BY_TYPE, NOVEL_VOLUME_ONLY_TYPES

# Loaded by path: alembic/versions is not an importable package.
_path = (
    pathlib.Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "v1o2l3o4n5l6_volume_only_novel_counters.py"
)
_spec = importlib.util.spec_from_file_location("v1o2l3o4n5l6", _path)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_volume_only_types_are_light_novel_and_novel():
    assert set(NOVEL_VOLUME_ONLY_TYPES) == {"Light Novel", "Novel"}


def test_volume_only_types_are_exactly_the_volume_only_unit_kinds():
    # The constant is derived, not typed twice. If a type's allowed kinds
    # change, its counters follow without anyone editing a second list.
    derived = {
        t for t, kinds in NOVEL_UNIT_KINDS_BY_TYPE.items() if kinds == ("volume",)
    }
    assert set(NOVEL_VOLUME_ONLY_TYPES) == derived


def test_both_statements_target_only_the_volume_only_types():
    for sql in (mod.DELETE_NON_VOLUME_UNITS, mod.CLEAR_COUNTERS):
        for t in NOVEL_VOLUME_ONLY_TYPES:
            assert f"'{t}'" in sql
        assert "'Web'" not in sql
        assert "'Other'" not in sql


def test_delete_spares_volume_rows():
    assert "unit_kind <> 'volume'" in mod.DELETE_NON_VOLUME_UNITS


def test_clear_blanks_every_chapter_and_arc_column():
    for column in ("arc_total", "ch_total", "arc_fin", "ch_fin", "ch_fin_in_arc"):
        assert column in mod.CLEAR_COUNTERS


def test_clear_leaves_the_volume_columns_alone():
    for column in ("vol_fin", "vol_total_original", "vol_total_tw"):
        assert column not in mod.CLEAR_COUNTERS


def test_clear_skips_rows_that_are_already_clean():
    # The guard keeps the UPDATE from touching (and re-stamping updated_at on)
    # every light novel in the database on a re-run.
    assert "arc_total IS NOT NULL" in mod.CLEAR_COUNTERS
