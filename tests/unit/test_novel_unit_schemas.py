"""Novel unit schemas — write shape, response shape, display_key."""

import uuid
from typing import get_args

import pytest
from pydantic import ValidationError

from app.schemas.novel import NovelBase, NovelUnitResponse, NovelUnitWrite
from app.utils.constants import MY_RATINGS, NOVEL_UNIT_KINDS


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


def test_unit_kind_literal_matches_the_constant():
    annotation = NovelUnitWrite.model_fields["unit_kind"].annotation
    assert get_args(annotation) == NOVEL_UNIT_KINDS


# --- my_rating --------------------------------------------------------------
# Each unit carries its own grade, on the same S..F scale as novel.my_rating.
# Nothing derives from it: the novel's own rating stays hand-set.


def test_write_accepts_a_rating():
    unit = NovelUnitWrite(unit_kind="volume", position=1, my_rating="A+")
    assert unit.my_rating == "A+"


def test_write_defaults_the_rating_to_none():
    assert NovelUnitWrite(unit_kind="volume", position=1).my_rating is None


def test_write_accepts_every_grade():
    for grade in MY_RATINGS:
        assert NovelUnitWrite(unit_kind="volume", position=1, my_rating=grade).my_rating == grade


def test_response_carries_the_rating():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="volume",
        position=1,
        unit_key=None,
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=None,
        my_rating="S",
    )
    assert resp.my_rating == "S"


def test_response_rating_is_optional():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="volume",
        position=1,
        unit_key=None,
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=None,
    )
    assert resp.my_rating is None
