"""The Publisher sheet parser."""

from app.services.pipelines.tabs import TAB_NAMES
from app.utils.formatter import parse_publisher_from_sheet


def test_parses_every_column():
    parsed = parse_publisher_from_sheet(
        {
            "system_id": "8a7cb6b4-0000-4000-8000-000000000000",
            "name_en": "Bandai Namco",
            "name_cn": "",
            "founded_date": "1955",
            "country": "Japan",
        }
    )
    assert parsed["name_en"] == "Bandai Namco"
    assert parsed["name_cn"] is None
    assert parsed["founded_date"] == "1955"


def test_publisher_restores_before_every_media_tab():
    """Credits resolve against it, so the entity rows must already exist."""
    assert TAB_NAMES.index("Publisher") < TAB_NAMES.index("Anime")
