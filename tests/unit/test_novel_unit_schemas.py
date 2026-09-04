"""Novel unit schemas — write shape, response shape, display_key."""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.novel import NovelBase, NovelUnitResponse, NovelUnitWrite


def test_write_accepts_a_new_unit_without_system_id():
    unit = NovelUnitWrite(unit_kind="volume", position=1, name_cn="第一卷")
    assert unit.system_id is None
    assert unit.ch_count is None


def test_write_accepts_an_existing_unit_with_system_id():
    sid = uuid.uuid4()
    unit = NovelUnitWrite(system_id=sid, unit_kind="arc", position=2, ch_count=112)
    assert unit.system_id == sid
    assert unit.ch_count == 112


def test_write_rejects_an_unknown_kind():
    with pytest.raises(ValidationError):
        NovelUnitWrite(unit_kind="tankobon", position=1)


def test_response_generates_the_display_key():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="arc",
        position=2,
        unit_key=None,
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=112,
    )
    assert resp.display_key == "Arc 2"


def test_response_prefers_an_explicit_key():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="volume",
        position=1,
        unit_key="第一卷",
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=None,
    )
    assert resp.display_key == "第一卷"


def test_novel_base_carries_units_and_the_in_arc_cursor():
    novel = NovelBase(
        novel_name_cn="測試",
        ch_fin_in_arc=101,
        units=[{"unit_kind": "arc", "position": 1, "ch_count": 100}],
    )
    assert novel.ch_fin_in_arc == 101
    assert novel.units[0].ch_count == 100


def test_the_old_json_lists_are_gone():
    assert "novel_name_each_cn" not in NovelBase.model_fields
    assert "novel_name_each_en" not in NovelBase.model_fields
