"""Unit tests for the Note sheet parser."""

import json
import uuid

from app.utils.formatter import parse_note_from_sheet


def test_parses_a_full_row():
    owner_id = uuid.uuid4()
    parsed = parse_note_from_sheet(
        {
            "system_id": str(uuid.uuid4()),
            "owner_type": "anime",
            "owner_id": str(owner_id),
            "section": "op_ed_changes",
            "locator": "ep 10",
            "kind": "變化OP",
            "title": "",
            "content": "這集OP換成劇中曲",
            "links": '["https://example.com/a"]',
            "sort_index": "0",
            "created_at": "",
            "updated_at": "",
        }
    )
    assert parsed["owner_id"] == owner_id
    assert parsed["section"] == "op_ed_changes"
    assert parsed["locator"] == "ep 10"
    assert parsed["kind"] == "變化OP"
    assert parsed["links"] == ["https://example.com/a"]
    assert parsed["sort_index"] == 0.0
    assert parsed["created_at"] is None


def test_unparseable_owner_id_becomes_none():
    # owner_id is FK-less with no name-resolution step in Pull, so a junk cell
    # must not fail the import - the note shows up unlinked instead.
    parsed = parse_note_from_sheet({"owner_id": "not-a-uuid", "section": "advantages"})
    assert parsed["owner_id"] is None


def test_blank_links_cell_becomes_none():
    parsed = parse_note_from_sheet({"section": "advantages", "links": ""})
    assert parsed["links"] is None


def test_legacy_episode_header_still_parses_as_locator():
    # The column was renamed after sheets already existed. A spreadsheet backed
    # up before the rename must still Pull, or its anchors are silently lost.
    parsed = parse_note_from_sheet({"section": "highlights", "episode": "ep 6"})
    assert parsed["locator"] == "ep 6"


def test_locator_wins_over_a_stale_episode_column():
    # A sheet carrying both (renamed header added beside the old one) trusts
    # the current name.
    parsed = parse_note_from_sheet(
        {"section": "highlights", "locator": "ep 6", "episode": "ep 1"}
    )
    assert parsed["locator"] == "ep 6"


def test_entries_round_trip_through_the_sheet():
    # Backup writes `entries` because the headers derive from the model's
    # columns; a parser that drops it loses every guides / builds_and_mods
    # item on the machine-to-machine round trip this project runs on.
    raw = [
        {"type": "text", "value": "Kill the boss first", "label": None},
        {"type": "link", "value": "https://example.com/build", "label": "Build"},
    ]
    parsed = parse_note_from_sheet(
        {"section": "guides", "entries": json.dumps(raw, ensure_ascii=False)}
    )
    assert parsed["entries"] == raw


def test_blank_entries_cell_becomes_none():
    parsed = parse_note_from_sheet({"section": "guides", "entries": ""})
    assert parsed["entries"] is None
