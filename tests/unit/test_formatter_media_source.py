"""Media Source cells parse into typed values, blanks into None."""

from uuid import UUID

from app.utils.formatter import parse_media_source_from_sheet


def test_a_full_row_parses():
    parsed = parse_media_source_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "media_type": "anime",
            "entry_id": "22222222-2222-2222-2222-222222222222",
            "kind": "access",
            "bucket": "main",
            "option_category": "Platform",
            "option_value": "Netflix",
            "name": "",
            "available": "TRUE",
            "url": "https://netflix.test",
            "position": "2",
        }
    )
    assert parsed["media_type"] == "anime"
    assert isinstance(parsed["entry_id"], UUID)
    assert parsed["available"] is True
    assert parsed["position"] == 2
    assert parsed["name"] is None


def test_an_unparseable_entry_id_becomes_none_not_a_string():
    parsed = parse_media_source_from_sheet({"entry_id": "Tokyo Ghoul"})
    assert parsed["entry_id"] is None


def test_a_blank_available_stays_unknown():
    parsed = parse_media_source_from_sheet({"available": ""})
    assert parsed["available"] is None
