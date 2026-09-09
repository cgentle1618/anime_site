"""Media Source cells parse into typed values, blanks into None."""

from uuid import UUID

from app.utils.formatter import parse_media_source_from_sheet


def test_a_full_row_parses():
    parsed = parse_media_source_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "media_id": "22222222-2222-2222-2222-222222222222",
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
    assert isinstance(parsed["media_id"], UUID)
    assert parsed["available"] is True
    assert parsed["position"] == 2
    assert parsed["name"] is None


def test_an_unparseable_media_id_becomes_none_not_a_string():
    parsed = parse_media_source_from_sheet({"media_id": "Tokyo Ghoul"})
    assert parsed["media_id"] is None


def test_a_sheet_written_before_the_move_still_restores():
    """
    An older Backup spells the link `entry_id`, with a `media_type` beside it.
    media.system_id IS that entry_id - Phase A reused each detail row's uuid -
    so the older sheet restores exactly, with no loss.
    """
    parsed = parse_media_source_from_sheet(
        {
            "media_type": "anime",
            "entry_id": "22222222-2222-2222-2222-222222222222",
        }
    )
    assert parsed["media_id"] == UUID("22222222-2222-2222-2222-222222222222")


def test_a_blank_available_stays_unknown():
    parsed = parse_media_source_from_sheet({"available": ""})
    assert parsed["available"] is None
