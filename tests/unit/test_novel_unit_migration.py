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
