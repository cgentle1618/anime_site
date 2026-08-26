"""parse_comic_from_sheet — sheet strings in, typed values out."""

import uuid
from datetime import datetime

from app.utils.formatter import parse_comic_from_sheet


class TestParseComicFromSheet:
    def test_parses_names_and_ids(self):
        fid = str(uuid.uuid4())
        parsed = parse_comic_from_sheet(
            {
                "system_id": "",
                "franchise_id": fid,
                "comic_name_en": "Amazing Spider-Man",
                "comic_name_cn": "蜘蛛人",
            }
        )
        assert str(parsed["franchise_id"]) == fid
        assert parsed["comic_name_en"] == "Amazing Spider-Man"
        assert parsed["comic_name_cn"] == "蜘蛛人"

    def test_franchise_id_may_be_a_raw_name(self):
        # Pull resolves these through resolve_comic_parent_hierarchy.
        parsed = parse_comic_from_sheet({"franchise_id": "Spider-Man"})
        assert parsed["franchise_id"] == "Spider-Man"

    def test_issue_counts_parse_as_ints(self):
        parsed = parse_comic_from_sheet({"issue_total": "93", "issue_fin": "74"})
        assert parsed["issue_total"] == 93
        assert parsed["issue_fin"] == 74

    def test_blank_issue_fin_defaults_to_zero(self):
        parsed = parse_comic_from_sheet({"issue_fin": ""})
        assert parsed["issue_fin"] == 0

    def test_blank_reading_status_defaults_to_might_read(self):
        parsed = parse_comic_from_sheet({"reading_status": ""})
        assert parsed["reading_status"] == "Might Read"

    def test_events_stay_a_comma_joined_string(self):
        parsed = parse_comic_from_sheet({"events": "Hunted, Sinister War"})
        assert parsed["events"] == "Hunted, Sinister War"

    def test_booleans_parse(self):
        parsed = parse_comic_from_sheet({"is_main_entry": "TRUE", "to_reread": "FALSE"})
        assert parsed["is_main_entry"] is True
        assert parsed["to_reread"] is False

    def test_round_trips_every_model_column(self):
        # Guards against a column being added to the model but forgotten here.
        from app.models.comic import Comic

        parsed = parse_comic_from_sheet({})
        model_cols = {c.name for c in Comic.__table__.columns}
        # Every column round-trips, created_at/updated_at included: Backup
        # writes both to the Comic tab, so Pull has to restore them rather than
        # letting the model default re-stamp "now" on every restored row.
        assert model_cols <= set(parsed.keys())

    def test_timestamps_are_restored_from_the_sheet(self):
        # A restored row must keep its original created_at - the list endpoint
        # sorts on it, so re-stamping would reshuffle the library.
        parsed = parse_comic_from_sheet(
            {"created_at": "2024-03-05 10:11:12", "updated_at": "2025-01-02 03:04:05"}
        )
        assert parsed["created_at"] == datetime(2024, 3, 5, 10, 11, 12)
        assert parsed["updated_at"] == datetime(2025, 1, 2, 3, 4, 5)
