"""
Sheet parsing for plan_next and the size-group maps.

Guards the regression recorded at docs/business-logic.md:1548, where JSONB
franchise fields the parser omitted were silently wiped by every Pull.
"""

import uuid

from app.utils.formatter import (
    parse_cartoon_from_sheet,
    parse_comic_from_sheet,
    parse_franchise_from_sheet,
    parse_manga_from_sheet,
    parse_movie_from_sheet,
    parse_novel_from_sheet,
    parse_plan_next_from_sheet,
    parse_series_from_sheet,
    parse_tv_show_from_sheet,
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
    # The sheet speaks (scope, target_id); the table speaks foreign keys.
    assert parsed["series_id"] == target
    assert parsed["media_id"] is None
    assert parsed["remark"] == "after the movie"


def test_an_unparseable_target_becomes_none_rather_than_failing():
    parsed = parse_plan_next_from_sheet(
        {"system_id": str(uuid.uuid4()), "media_type": "anime", "scope": "entry",
         "target_id": "not-a-uuid"}
    )
    assert parsed["media_id"] is None


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


class TestPlanNextKindParsing:
    def test_kind_is_parsed(self):
        assert parse_plan_next_from_sheet({"kind": "rewatch"})["kind"] == "rewatch"

    def test_missing_kind_defaults_to_next(self):
        # A Plan Next tab backed up before the kind column existed.
        assert parse_plan_next_from_sheet({})["kind"] == "next"


class TestDroppedRewatchColumns:
    # A stale sheet still carrying these columns must parse without error and
    # without inventing a key: pull.py would assign it to a dropped attribute.
    def test_franchise_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_franchise_from_sheet({"to_rewatch": "TRUE"})

    def test_series_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_series_from_sheet({"to_rewatch": "TRUE"})

    def test_movie_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_movie_from_sheet({"to_rewatch": "TRUE"})

    def test_tv_show_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_tv_show_from_sheet({"to_rewatch": "TRUE"})

    def test_cartoon_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_cartoon_from_sheet({"to_rewatch": "TRUE"})

    def test_manga_parser_drops_to_reread(self):
        assert "to_reread" not in parse_manga_from_sheet({"to_reread": "TRUE"})

    def test_novel_parser_drops_to_reread(self):
        assert "to_reread" not in parse_novel_from_sheet({"to_reread": "TRUE"})

    def test_comic_parser_drops_to_reread(self):
        assert "to_reread" not in parse_comic_from_sheet({"to_reread": "TRUE"})


class TestPlanNextOwnerColumns:
    """The sheet still speaks (scope, target_id); the table speaks foreign keys."""

    def test_an_entry_row_parses_into_media_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "entry", "target_id": str(target)}
        )
        assert parsed["media_id"] == target
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None
        assert "scope" not in parsed
        assert "target_id" not in parsed

    def test_a_franchise_row_parses_into_franchise_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "franchise", "target_id": str(target)}
        )
        assert parsed["franchise_id"] == target
        assert parsed["media_id"] is None

    def test_a_series_row_parses_into_series_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "comic", "scope": "series", "target_id": str(target)}
        )
        assert parsed["series_id"] == target

    def test_an_unparseable_target_leaves_every_owner_none(self):
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "entry", "target_id": "not-a-uuid"}
        )
        assert parsed["media_id"] is None
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None

    def test_an_unknown_scope_leaves_every_owner_none(self):
        parsed = parse_plan_next_from_sheet(
            {
                "media_type": "anime",
                "scope": "collection",
                "target_id": str(uuid.uuid4()),
            }
        )
        assert parsed["media_id"] is None
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None


def test_the_plan_next_tab_hides_the_new_columns_and_shows_the_old_pair():
    from app.services.pipelines.tabs import TAB_BY_NAME

    tab = TAB_BY_NAME["Plan Next"]
    assert set(tab.drop_columns) == {
        "user_id",
        "media_id",
        "franchise_id",
        "series_id",
    }
    assert [name for name, _fn in tab.extra_columns] == ["scope", "target_id"]
