"""
Unit tests for the Watch Order sheet parsers in app/utils/formatter.py.

These two tabs round-trip through Google Sheets, so every cell arrives as a
string and every column must survive Backup -> Pull unchanged.
"""

import uuid
from datetime import datetime

from app.utils.formatter import (
    parse_watch_order_item_from_sheet,
    parse_watch_order_list_from_sheet,
)


class TestWatchOrderListParser:
    def test_empty_row_yields_all_none(self):
        parsed = parse_watch_order_list_from_sheet({})
        assert all(value is None for value in parsed.values())

    def test_every_column_is_present(self):
        """A missing key would silently drop that column on Pull."""
        assert set(parse_watch_order_list_from_sheet({})) == {
            "system_id",
            "franchise_id",
            "collection_id",
            "list_name",
            "list_type",
            "is_default",
            "sort_index",
            "remark",
            "created_at",
            "updated_at",
        }

    def test_full_row_round_trips(self):
        list_id, franchise_id = uuid.uuid4(), uuid.uuid4()
        parsed = parse_watch_order_list_from_sheet(
            {
                "system_id": str(list_id),
                "franchise_id": str(franchise_id),
                "collection_id": "",
                "list_name": "Chronological",
                "list_type": "Chronological",
                "is_default": "TRUE",
                "sort_index": "2.5",
                "remark": "start here",
                "created_at": "2026-08-22T10:00:00",
                "updated_at": "2026-08-22T11:00:00",
            }
        )
        assert parsed["system_id"] == list_id
        assert parsed["franchise_id"] == franchise_id
        assert parsed["collection_id"] is None
        assert parsed["list_name"] == "Chronological"
        assert parsed["is_default"] is True
        assert parsed["sort_index"] == 2.5
        assert parsed["remark"] == "start here"
        assert parsed["created_at"] == datetime(2026, 8, 22, 10, 0, 0)

    def test_collection_owned_row(self):
        collection_id = uuid.uuid4()
        parsed = parse_watch_order_list_from_sheet(
            {"collection_id": str(collection_id), "franchise_id": ""}
        )
        assert parsed["collection_id"] == collection_id
        assert parsed["franchise_id"] is None

    def test_junk_owner_cell_becomes_none_not_a_string(self):
        """
        Owner columns have no name-resolution step in pull.py, so a raw string
        would reach the database and blow up the whole Pull.
        """
        parsed = parse_watch_order_list_from_sheet({"franchise_id": "Tokyo Ghoul"})
        assert parsed["franchise_id"] is None

    def test_false_is_not_confused_with_missing(self):
        assert parse_watch_order_list_from_sheet({"is_default": "FALSE"})[
            "is_default"
        ] is False


class TestWatchOrderItemParser:
    def test_every_column_is_present(self):
        assert set(parse_watch_order_item_from_sheet({})) == {
            "system_id",
            "list_id",
            "position",
            "media_type",
            "entry_id",
            "ep_start",
            "ep_end",
            "is_optional",
            "note",
            "created_at",
            "updated_at",
        }

    def test_full_row_round_trips(self):
        item_id, list_id, entry_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        parsed = parse_watch_order_item_from_sheet(
            {
                "system_id": str(item_id),
                "list_id": str(list_id),
                "position": "1.5",
                "media_type": "anime",
                "entry_id": str(entry_id),
                "ep_start": "1",
                "ep_end": "10",
                "is_optional": "TRUE",
                "note": "skip the recap",
                "created_at": "2026-08-22T10:00:00",
                "updated_at": "2026-08-22T11:00:00",
            }
        )
        assert parsed["system_id"] == item_id
        assert parsed["list_id"] == list_id
        assert parsed["position"] == 1.5
        assert parsed["media_type"] == "anime"
        assert parsed["entry_id"] == entry_id
        assert parsed["ep_start"] == 1
        assert parsed["ep_end"] == 10
        assert parsed["is_optional"] is True
        assert parsed["note"] == "skip the recap"

    def test_whole_entry_item_has_no_episode_range(self):
        parsed = parse_watch_order_item_from_sheet(
            {"media_type": "movie", "ep_start": "", "ep_end": ""}
        )
        assert parsed["ep_start"] is None
        assert parsed["ep_end"] is None

    def test_sheet_exported_float_episode_becomes_int(self):
        """Sheets renders an integer cell as '11.0' often enough to matter."""
        parsed = parse_watch_order_item_from_sheet({"ep_start": "11.0"})
        assert parsed["ep_start"] == 11

    def test_junk_entry_id_becomes_none(self):
        """A None entry_id shows up in the guide as a missing step, not a 500."""
        parsed = parse_watch_order_item_from_sheet({"entry_id": "not-a-uuid"})
        assert parsed["entry_id"] is None

    def test_hyphenated_media_type_survives(self):
        parsed = parse_watch_order_item_from_sheet({"media_type": "anime-movie"})
        assert parsed["media_type"] == "anime-movie"
