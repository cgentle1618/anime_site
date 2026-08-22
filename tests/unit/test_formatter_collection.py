"""
Unit tests for the Collection-related sheet parsers in app/utils/formatter.py.

Covers the Collection parser plus two Franchise-parser guarantees:
the inert-pull safeguard and the five fields that used to be dropped.
"""

import uuid
from datetime import datetime

from app.utils.formatter import (
    parse_collection_from_sheet,
    parse_franchise_from_sheet,
)


class TestFranchiseCollectionIdSafeguard:
    """
    collection_id must only appear when the sheet actually has that column.
    Otherwise pulling a Franchise tab that predates the Collection tier would
    set collection_id=None on every franchise - a silent wipe.
    """

    def test_absent_column_omits_key(self):
        assert "collection_id" not in parse_franchise_from_sheet({})

    def test_absent_column_omits_key_even_with_other_fields(self):
        parsed = parse_franchise_from_sheet({"franchise_name_en": "Marvel"})
        assert "collection_id" not in parsed

    def test_present_column_includes_key(self):
        assert "collection_id" in parse_franchise_from_sheet({"collection_id": ""})

    def test_uuid_value_is_parsed(self):
        val = uuid.uuid4()
        parsed = parse_franchise_from_sheet({"collection_id": str(val)})
        assert parsed["collection_id"] == val

    def test_name_string_is_preserved_for_later_resolution(self):
        """pull.py resolves a name to a UUID; the parser must not discard it."""
        parsed = parse_franchise_from_sheet({"collection_id": "Marvel"})
        assert parsed["collection_id"] == "Marvel"


class TestFranchisePreviouslyDroppedFields:
    """These five were omitted, so every Pull of the Franchise tab wiped them."""

    def test_all_five_round_trip(self):
        cover = uuid.uuid4()
        parsed = parse_franchise_from_sheet(
            {
                "cover_entry_id": str(cover),
                "type_covers": '{"ACG": "abc"}',
                "type_slots": '{"slot": 1}',
                "watch_next_group": "Group A",
                "to_rewatch": "true",
            }
        )
        assert parsed["cover_entry_id"] == cover
        assert parsed["type_covers"] == {"ACG": "abc"}
        assert parsed["type_slots"] == {"slot": 1}
        assert parsed["watch_next_group"] == "Group A"
        assert parsed["to_rewatch"] is True

    def test_malformed_json_becomes_none_not_crash(self):
        parsed = parse_franchise_from_sheet({"type_covers": "{not json"})
        assert parsed["type_covers"] is None

    def test_non_uuid_cover_entry_id_becomes_none(self):
        """cover_entry_id has no name-resolution step, so junk must not reach the DB."""
        assert parse_franchise_from_sheet({"cover_entry_id": "junk"})["cover_entry_id"] is None


class TestParseCollectionFromSheet:
    def test_parses_every_column(self):
        sid, cover = uuid.uuid4(), uuid.uuid4()
        parsed = parse_collection_from_sheet(
            {
                "system_id": str(sid),
                "collection_name_en": "Marvel",
                "collection_name_cn": "漫威",
                "collection_name_roman": "Maabaru",
                "collection_name_jp": "マーベル",
                "collection_name_alt": "MCU",
                "my_rating": "S",
                "collection_expectation": "High",
                "cover_franchise_id": str(cover),
                "remark": "note",
                "created_at": "2026-01-01T00:00:00",
                "updated_at": "2026-01-02T00:00:00",
            }
        )
        assert parsed["system_id"] == sid
        assert parsed["collection_name_en"] == "Marvel"
        assert parsed["collection_name_cn"] == "漫威"
        assert parsed["my_rating"] == "S"
        assert parsed["collection_expectation"] == "High"
        assert parsed["cover_franchise_id"] == cover
        assert parsed["remark"] == "note"
        assert parsed["created_at"] == datetime(2026, 1, 1)

    def test_empty_row_yields_all_none(self):
        parsed = parse_collection_from_sheet({})
        assert all(v is None for v in parsed.values())

    def test_non_uuid_cover_franchise_id_becomes_none(self):
        """A franchise *name* in this cell must not reach the DB as a string."""
        parsed = parse_collection_from_sheet({"cover_franchise_id": "Marvel"})
        assert parsed["cover_franchise_id"] is None

    def test_keys_match_model_columns(self):
        """
        no_built_in_orders is emitted only when the sheet has that column, the
        same safeguard franchise.collection_id uses, so a row supplying every
        column is what must round-trip completely.
        """
        from app.models import Collection

        columns = {c.name for c in Collection.__table__.columns}
        assert set(parse_collection_from_sheet({c: "" for c in columns})) == columns

    def test_absent_no_built_in_orders_column_omits_the_key(self):
        """
        Emitting it unconditionally would set the flag to None on every
        collection whenever a Collection tab predating it is pulled.
        """
        assert "no_built_in_orders" not in parse_collection_from_sheet({})

    def test_present_no_built_in_orders_column_is_parsed(self):
        parsed = parse_collection_from_sheet({"no_built_in_orders": "TRUE"})
        assert parsed["no_built_in_orders"] is True
