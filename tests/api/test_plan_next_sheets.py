"""
Sheet parsing for plan_next and the size-group maps.

Guards the regression recorded at docs/business-logic.md:1548, where JSONB
franchise fields the parser omitted were silently wiped by every Pull.
"""

import uuid

from app.utils.formatter import (
    parse_franchise_from_sheet,
    parse_plan_next_from_sheet,
    parse_series_from_sheet,
)


def test_plan_next_row_parses():
    target = uuid.uuid4()
    parsed = parse_plan_next_from_sheet(
        {
            "system_id": str(uuid.uuid4()),
            "media_type": "tv-show",
            "scope": "series",
            "target_id": str(target),
            "remark": "after the movie",
        }
    )
    assert parsed["media_type"] == "tv-show"
    assert parsed["scope"] == "series"
    assert parsed["target_id"] == target
    assert parsed["remark"] == "after the movie"


def test_an_unparseable_target_becomes_none_rather_than_failing():
    parsed = parse_plan_next_from_sheet(
        {"system_id": str(uuid.uuid4()), "media_type": "anime", "scope": "entry",
         "target_id": "not-a-uuid"}
    )
    assert parsed["target_id"] is None


def test_a_media_type_the_code_does_not_know_survives_the_round_trip():
    parsed = parse_plan_next_from_sheet(
        {"media_type": "podcast", "scope": "entry", "target_id": str(uuid.uuid4())}
    )
    assert parsed["media_type"] == "podcast"


def test_franchise_parser_keeps_both_size_group_maps():
    parsed = parse_franchise_from_sheet(
        {
            "franchise_name_en": "Some Franchise",
            "size_group_derived": '{"anime": "24ep"}',
            "size_group_manual": '{"anime": "12ep"}',
        }
    )
    assert parsed["size_group_derived"] == {"anime": "24ep"}
    assert parsed["size_group_manual"] == {"anime": "12ep"}


def test_series_parser_keeps_both_size_group_maps():
    parsed = parse_series_from_sheet(
        {
            "series_name_en": "Some Series",
            "size_group_derived": '{"tv-show": "2season"}',
            "size_group_manual": "",
        }
    )
    assert parsed["size_group_derived"] == {"tv-show": "2season"}
    assert parsed["size_group_manual"] is None


def test_the_dropped_columns_are_no_longer_parsed():
    parsed = parse_franchise_from_sheet(
        {"franchise_name_en": "F", "watch_next_group": "12ep"}
    )
    assert "watch_next_group" not in parsed
