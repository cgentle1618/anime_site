"""Novel Unit sheet parser and tab ordering."""

from uuid import UUID

from app.services.pipelines.tabs import TAB_NAMES
from app.utils.formatter import parse_novel_unit_from_sheet


def test_parses_a_full_row():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "22222222-2222-2222-2222-222222222222",
            "unit_kind": "arc",
            "position": "2",
            "unit_key": "arc 2",
            "name_cn": "第二章",
            "name_en": "Arc Two",
            "remark": "best arc",
            "ch_count": "112",
        }
    )
    assert parsed["system_id"] == UUID("11111111-1111-1111-1111-111111111111")
    assert parsed["novel_id"] == UUID("22222222-2222-2222-2222-222222222222")
    assert parsed["unit_kind"] == "arc"
    assert parsed["position"] == 2.0
    assert parsed["ch_count"] == 112.0


def test_blank_cells_become_none():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "22222222-2222-2222-2222-222222222222",
            "unit_kind": "volume",
            "position": "1",
            "unit_key": "",
            "name_cn": "",
            "name_en": "",
            "remark": "",
            "ch_count": "",
        }
    )
    assert parsed["unit_key"] is None
    assert parsed["ch_count"] is None


def test_an_unresolvable_novel_id_becomes_none_not_a_string():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "not-a-uuid",
            "unit_kind": "volume",
            "position": "1",
        }
    )
    assert parsed["novel_id"] is None


def test_the_tab_restores_after_its_parent():
    assert "Novel Unit" in TAB_NAMES
    assert TAB_NAMES.index("Novel Unit") > TAB_NAMES.index("Novel")
