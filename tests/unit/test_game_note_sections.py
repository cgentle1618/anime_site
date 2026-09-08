"""The game note sections and the name_entries shape."""

import pytest

from app.schemas.note import NoteCreate, validate_note_payload
from app.utils import note_sections as ns


def test_name_entries_is_a_stored_shape():
    assert ns.SHAPE_NAME_ENTRIES == "name_entries"
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES


def test_game_sections_exist_with_the_right_shapes():
    by_key = {s.key: s for s in ns.NOTE_SECTIONS}
    assert by_key["guides"].shape == ns.SHAPE_NAME_ENTRIES
    assert by_key["builds_and_mods"].shape == ns.SHAPE_NAME_ENTRIES
    assert by_key["builds_and_mods"].kinds == ("Build", "Mod", "Tool")
    assert by_key["highlight_moments"].shape == ns.SHAPE_EPISODE_TEXT
    for key in ("guides", "builds_and_mods", "highlight_moments"):
        assert "game" in by_key[key].owners


def test_the_site_wide_resources_section_is_untouched():
    """`builds_and_mods` is a distinct key precisely so this stays as it was."""
    section = ns.section_by_key("resources")
    assert section.shape == ns.SHAPE_NAME_LINKS
    assert section.owners == ns.ALL_OWNERS
    assert section.standalone is True


def test_part_reviews_reuse_episode_comments_with_a_game_label():
    section = next(s for s in ns.NOTE_SECTIONS if s.key == "episode_comments")
    assert "game" in section.owners
    assert section.labels["game"] == "各章評論 Part Reviews"
    assert section.locator_placeholders["game"] == "Chapter / Part, e.g. Ch 3"


def test_a_name_entries_note_needs_a_title_or_an_entry():
    """
    validate_note_payload raises ValueError, which the router turns into a 422 -
    it is not a pydantic validator, so constructing the model cannot fail here.
    """
    with pytest.raises(ValueError, match="needs a name or an entry"):
        validate_note_payload(
            NoteCreate(owner_type="game", owner_id=None, section="guides")
        )


def test_a_name_entries_note_accepts_mixed_text_and_link_entries():
    note = NoteCreate(
        owner_type="game",
        owner_id=None,
        section="guides",
        title="Malenia",
        entries=[
            {"type": "text", "value": "Learn the waterfowl dodge"},
            {"type": "link", "value": "https://example.com", "label": "Phase 2"},
        ],
    )
    validate_note_payload(note)
    assert len(note.entries) == 2
    assert note.entries[0]["type"] == "text"


def test_an_entry_alone_is_enough_without_a_title():
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="builds_and_mods",
            entries=[{"type": "link", "value": "https://example.com"}],
        )
    )
