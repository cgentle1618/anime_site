"""System Option Usage cells parse into typed values, blanks into None."""

from uuid import UUID

from app.utils.formatter import parse_system_option_usage_from_sheet


def test_a_full_row_parses():
    parsed = parse_system_option_usage_from_sheet(
        {
            "id": "3",
            "option_id": "11111111-1111-1111-1111-111111111111",
            "usage": "origin",
        }
    )
    assert parsed["id"] == 3
    assert isinstance(parsed["option_id"], UUID)
    assert parsed["usage"] == "origin"


def test_an_unparseable_option_id_becomes_none_not_a_string():
    parsed = parse_system_option_usage_from_sheet({"option_id": "Tokyo Ghoul"})
    assert parsed["option_id"] is None
