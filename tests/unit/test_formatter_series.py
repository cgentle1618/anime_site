"""
Unit tests for parse_series_from_sheet in app/utils/formatter.py.

Covers the eight fields added with the Series hub page, and pins that the
parser no longer emits `remark` - series remarks are note rows now.
"""

import uuid
from datetime import datetime

from app.utils.formatter import parse_series_from_sheet


class TestSeriesRemarkNoLongerDropped:
    def test_remark_key_is_not_emitted(self):
        # Series remarks are note rows now, so the Series tab has no such
        # column and the parser must not invent one - pull.py would try to
        # assign it to a read-only attribute.
        assert "remark" not in parse_series_from_sheet({"remark": "ignored"})


class TestSeriesNewFields:
    def test_all_new_keys_are_emitted(self):
        parsed = parse_series_from_sheet({})
        for key in (
            "series_name_roman",
            "series_name_jp",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "to_rewatch",
            "created_at",
            "updated_at",
        ):
            assert key in parsed

    def test_names_are_parsed(self):
        parsed = parse_series_from_sheet(
            {"series_name_roman": "Roman", "series_name_jp": "日本語"}
        )
        assert parsed["series_name_roman"] == "Roman"
        assert parsed["series_name_jp"] == "日本語"

    def test_rating_and_expectation_are_parsed(self):
        parsed = parse_series_from_sheet(
            {"my_rating": "A+", "series_expectation": "High"}
        )
        assert parsed["my_rating"] == "A+"
        assert parsed["series_expectation"] == "High"

    def test_to_rewatch_is_parsed_as_bool(self):
        assert parse_series_from_sheet({"to_rewatch": "TRUE"})["to_rewatch"] is True

    def test_cover_entry_id_parses_a_uuid(self):
        val = uuid.uuid4()
        parsed = parse_series_from_sheet({"cover_entry_id": str(val)})
        assert parsed["cover_entry_id"] == val

    def test_cover_entry_id_rejects_a_non_uuid(self):
        """Unlike franchise_id there is no name-resolution step, so junk must not reach the DB."""
        assert parse_series_from_sheet({"cover_entry_id": "Not A UUID"})["cover_entry_id"] is None

    def test_timestamps_are_parsed(self):
        parsed = parse_series_from_sheet({"created_at": "2026-08-23 10:00:00"})
        assert isinstance(parsed["created_at"], datetime)


class TestSeriesBlankCells:
    def test_blank_cells_become_none(self):
        raw = {k: "" for k in (
            "series_name_en", "series_name_cn", "series_name_roman",
            "series_name_jp", "series_name_alt", "my_rating",
            "series_expectation", "cover_entry_id",
        )}
        parsed = parse_series_from_sheet(raw)
        for key in raw:
            assert parsed[key] is None


class TestSeriesFranchiseIdStillResolvable:
    def test_name_string_is_preserved_for_later_resolution(self):
        """pull.py resolves a franchise name to a UUID; the parser must not discard it."""
        parsed = parse_series_from_sheet({"franchise_id": "Marvel"})
        assert parsed["franchise_id"] == "Marvel"
