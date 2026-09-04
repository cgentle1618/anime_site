"""The JSONB-lists -> novel_unit rows zip, tested without running Alembic."""

import importlib.util
import pathlib

# Loaded by path: alembic/versions is not an importable package.
_path = (
    pathlib.Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "nv1u2n3i4t5s_novel_units.py"
)
_spec = importlib.util.spec_from_file_location("nv1u2n3i4t5s_novel_units", _path)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)
migrate_each_lists = mod.migrate_each_lists
rebuild_each_lists = mod.rebuild_each_lists


def test_aligned_lists_merge_into_one_row_each():
    rows = migrate_each_lists(
        [{"key": "vol 1", "name": "第一卷"}, {"key": "vol 2", "name": "第二卷"}],
        [{"key": "vol 1", "name": "Volume One"}, {"key": "vol 2", "name": "Volume Two"}],
    )
    assert rows == [
        {"position": 1, "unit_key": "vol 1", "name_cn": "第一卷", "name_en": "Volume One"},
        {"position": 2, "unit_key": "vol 2", "name_cn": "第二卷", "name_en": "Volume Two"},
    ]


def test_longer_list_governs_and_missing_language_is_null():
    rows = migrate_each_lists(
        [{"key": "vol 1", "name": "第一卷"}],
        [
            {"key": "vol 1", "name": "Volume One"},
            {"key": "vol 2", "name": "Volume Two"},
        ],
    )
    assert len(rows) == 2
    assert rows[1] == {
        "position": 2,
        "unit_key": "vol 2",
        "name_cn": None,
        "name_en": "Volume Two",
    }


def test_key_falls_back_to_the_other_language():
    rows = migrate_each_lists(
        [{"key": "", "name": "第一卷"}],
        [{"key": "vol 1", "name": "Volume One"}],
    )
    assert rows[0]["unit_key"] == "vol 1"


def test_fully_empty_entries_are_skipped():
    rows = migrate_each_lists(
        [{"key": "", "name": ""}, {"key": "vol 2", "name": "第二卷"}],
        [{"key": "", "name": ""}, {"key": "vol 2", "name": "Volume Two"}],
    )
    assert len(rows) == 1
    assert rows[0]["position"] == 2      # position follows the original index


def test_both_lists_absent_produces_nothing():
    assert migrate_each_lists(None, None) == []
    assert migrate_each_lists([], []) == []


def test_round_trip_reproduces_aligned_entries():
    cn_in = [{"key": "vol 1", "name": "第一卷"}, {"key": "vol 2", "name": "第二卷"}]
    en_in = [
        {"key": "vol 1", "name": "Volume One"},
        {"key": "vol 2", "name": "Volume Two"},
    ]
    rows = migrate_each_lists(cn_in, en_in)
    unit_rows = [
        ("volume", row["position"], row["unit_key"], row["name_cn"], row["name_en"])
        for row in rows
    ]
    cn_out, en_out = rebuild_each_lists(unit_rows)
    assert cn_out == cn_in
    assert en_out == en_in


def test_name_present_in_only_one_language_leaves_other_side_well_formed():
    unit_rows = [
        ("volume", 1, "vol 1", "第一卷", None),
        ("volume", 2, "vol 2", None, "Volume Two"),
    ]
    cn, en = rebuild_each_lists(unit_rows)
    assert cn == [
        {"key": "vol 1", "name": "第一卷"},
        {"key": "vol 2", "name": ""},
    ]
    assert en == [
        {"key": "vol 1", "name": ""},
        {"key": "vol 2", "name": "Volume Two"},
    ]


def test_non_volume_rows_are_not_reconstructed_as_volume_names():
    unit_rows = [
        ("volume", 1, "vol 1", "CN1", "EN1"),
        ("arc", 1.5, "arc 1", "ArcCN", "ArcEN"),
        ("volume", 2, "vol 2", "CN2", "EN2"),
    ]
    cn, en = rebuild_each_lists(unit_rows)
    assert cn == [{"key": "vol 1", "name": "CN1"}, {"key": "vol 2", "name": "CN2"}]
    assert en == [{"key": "vol 1", "name": "EN1"}, {"key": "vol 2", "name": "EN2"}]

    only_arc_rows = [("arc", 1, "arc 1", "ArcCN", "ArcEN")]
    assert rebuild_each_lists(only_arc_rows) == (None, None)


def test_empty_row_list_produces_null_not_empty_list():
    # Matches the old column definition
    # (`Column(JSONB, default=None, nullable=True)`): a novel with no volume
    # units gets NULL back, not an empty-but-present [].
    assert rebuild_each_lists([]) == (None, None)
