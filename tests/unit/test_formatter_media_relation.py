"""
Unit tests for the Media Relation sheet parser.

Mirrors tests/unit/test_formatter_watch_order.py. Pure parsing — no database.
"""

import uuid

from app.utils.formatter import parse_media_relation_from_sheet


def test_parses_a_full_row():
    system_id, from_id, to_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    parsed = parse_media_relation_from_sheet(
        {
            "system_id": str(system_id),
            "from_type": "anime",
            "from_id": str(from_id),
            "relation_type": "sequel",
            "to_type": "anime-movie",
            "to_id": str(to_id),
            "remark": "covers ep 1-12 only",
            "created_at": "2026-08-23 10:00:00",
            "updated_at": "2026-08-23 10:00:00",
        }
    )
    assert parsed["system_id"] == system_id
    assert parsed["from_id"] == from_id
    assert parsed["to_id"] == to_id
    assert parsed["from_type"] == "anime"
    assert parsed["to_type"] == "anime-movie"
    assert parsed["relation_type"] == "sequel"
    assert parsed["remark"] == "covers ep 1-12 only"


def test_blank_cells_become_none():
    parsed = parse_media_relation_from_sheet(
        {
            "system_id": "",
            "from_type": "",
            "from_id": "",
            "relation_type": "",
            "to_type": "",
            "to_id": "",
            "remark": "",
        }
    )
    assert parsed["from_id"] is None
    assert parsed["to_id"] is None
    assert parsed["remark"] is None


def test_an_unparseable_endpoint_id_becomes_none_rather_than_raising():
    # Endpoints are FK-less, so a junk cell must not fail the whole Pull; the
    # row simply shows up in the admin page as a missing endpoint.
    parsed = parse_media_relation_from_sheet(
        {"from_id": "not-a-uuid", "to_id": "also-not-a-uuid"}
    )
    assert parsed["from_id"] is None
    assert parsed["to_id"] is None


def test_an_unknown_relation_type_is_preserved_not_coerced():
    # Unlike importance, which coerces to "Normal", a kind is preserved so a
    # sheet written by a newer version restores losslessly.
    parsed = parse_media_relation_from_sheet({"relation_type": "future_kind"})
    assert parsed["relation_type"] == "future_kind"
