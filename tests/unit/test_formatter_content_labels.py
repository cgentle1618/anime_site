"""Content Label and Media Content Label cells parse into typed values."""

from datetime import datetime
from uuid import UUID

from app.utils.formatter import (
    parse_content_label_from_sheet,
    parse_media_content_label_from_sheet,
)


def test_a_full_content_label_row_parses():
    parsed = parse_content_label_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "key": "nsfw",
            "label": "NSFW",
            "description": "Adult content",
            "sort_order": "2",
            "created_at": "2026-01-02 03:04:05",
            "updated_at": "2026-01-02 03:04:05",
        }
    )

    assert parsed["system_id"] == UUID("11111111-1111-1111-1111-111111111111")
    assert parsed["key"] == "nsfw"
    assert parsed["label"] == "NSFW"
    assert parsed["description"] == "Adult content"
    assert parsed["sort_order"] == 2
    assert isinstance(parsed["created_at"], datetime)


def test_blank_content_label_cells_become_none():
    parsed = parse_content_label_from_sheet(
        {"system_id": "", "key": "", "label": "", "description": "", "sort_order": ""}
    )

    assert parsed["system_id"] is None
    assert parsed["key"] is None
    assert parsed["description"] is None
    assert parsed["sort_order"] is None


def test_a_full_media_content_label_row_parses():
    parsed = parse_media_content_label_from_sheet(
        {
            "system_id": "22222222-2222-2222-2222-222222222222",
            "media_type": "anime",
            "entry_id": "33333333-3333-3333-3333-333333333333",
            "label_id": "44444444-4444-4444-4444-444444444444",
            "position": "1",
            "created_at": "2026-01-02 03:04:05",
        }
    )

    assert parsed["media_type"] == "anime"
    assert parsed["entry_id"] == UUID("33333333-3333-3333-3333-333333333333")
    assert parsed["label_id"] == UUID("44444444-4444-4444-4444-444444444444")
    assert parsed["position"] == 1


def test_an_unparseable_pointer_becomes_none_rather_than_reaching_the_db():
    """
    entry_id and label_id are plain UUID pointers with no name-resolution
    fallback, so a stray string must not be handed to Postgres as one.
    """
    parsed = parse_media_content_label_from_sheet(
        {"entry_id": "Tokyo Ghoul", "label_id": "nsfw"}
    )

    assert parsed["entry_id"] is None
    assert parsed["label_id"] is None
