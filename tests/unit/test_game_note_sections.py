"""The game note sections and the name_entries shape."""

import pytest

from app.schemas.note import NoteCreate, validate_note_payload
from app.utils import note_sections as ns

GUIDE_KEYS = [
    "beginner",
    "controls",
    "trivia",
    "side_quests",
    "builds_and_styles",
    "stats_and_points",
    "skills",
    "collectibles",
    "items",
    "weapons_and_gear",
    "characters_guide",
    "enemies",
    "endings",
    "mods_and_tools",
    "guide_resources",
]

STORY_KEYS = [
    "main_plot",
    "side_plot",
    "character_arcs",
    "lore",
    "timeline",
    "mysteries",
    "story_other",
]

TODO_KEYS = ["todo_now", "todo_next", "todo_later", "todo_maybe"]


def test_name_entries_is_a_stored_shape():
    assert ns.SHAPE_NAME_ENTRIES == "name_entries"
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES


def test_the_three_new_groups_exist_in_order():
    keys = [g.key for g in ns.NOTE_GROUPS]
    assert keys == [
        "reviews",
        "analysis_group",
        "guides",
        "story",
        "todo",
        "music",
        "quotes_memes",
    ]


def test_the_guides_group_holds_fifteen_sections_in_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "guides"] == GUIDE_KEYS


def test_the_story_group_holds_seven_sections_in_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "story"] == STORY_KEYS


def test_the_todo_group_holds_four_buckets_in_order():
    assert [s.key for s in ns.NOTE_SECTIONS if s.group == "todo"] == TODO_KEYS


def test_the_new_sections_are_game_only():
    for key in GUIDE_KEYS + STORY_KEYS + TODO_KEYS:
        assert ns.section_by_key(key).owners == ("game",), key


def test_guides_and_story_are_catalogue_and_todo_is_personal():
    """
    A todo list is one person's. A catalogue-scope todo would be admin-written
    and read by every viewer, which is not what a todo list is.
    """
    for key in GUIDE_KEYS + STORY_KEYS:
        assert ns.section_by_key(key).scope == ns.SCOPE_CATALOG, key
    for key in TODO_KEYS:
        assert ns.section_by_key(key).scope == ns.SCOPE_PERSONAL, key


def test_the_old_flat_game_sections_are_gone():
    """Retired by the migration in the same change; their rows moved."""
    assert ns.section_by_key("guides") is None
    assert ns.section_by_key("builds_and_mods") is None


def test_the_guides_group_key_is_free_because_the_section_was_retired():
    """
    Group keys and section keys live in separate dicts, so `guides` COULD name
    both. It names only the group, which is the whole reason the section was
    renamed rather than relabelled.
    """
    assert ns.group_by_key("guides") is not None
    assert ns.section_by_key("guides") is None


def test_mods_and_tools_is_the_only_new_section_with_kinds():
    with_kinds = [
        s.key
        for s in ns.NOTE_SECTIONS
        if s.kinds and s.key in GUIDE_KEYS + STORY_KEYS + TODO_KEYS
    ]
    assert with_kinds == ["mods_and_tools"]
    assert ns.section_by_key("mods_and_tools").kinds == ("Mod", "Tool")


def test_the_plot_sections_anchor_to_a_chapter_without_requiring_one():
    """
    The opposite of episode_comments and highlight_moments, which require a
    locator. A plot beat remembered without its chapter number is still a plot
    beat; a per-chapter comment about nothing in particular is not.
    """
    for key in ("main_plot", "side_plot"):
        section = ns.section_by_key(key)
        assert section.shape == ns.SHAPE_EPISODE_TEXT
        assert section.locator_placeholder == "Chapter / Part, e.g. Ch 3"
        assert section.locator_required is False


def test_no_new_section_carries_a_locator_except_the_two_plot_ones():
    anchored = [
        s.key
        for s in ns.NOTE_SECTIONS
        if s.locator_placeholder and s.key in GUIDE_KEYS + STORY_KEYS + TODO_KEYS
    ]
    assert anchored == ["main_plot", "side_plot"]


def test_highlight_moments_still_belongs_to_game_and_stays_flat():
    section = ns.section_by_key("highlight_moments")
    assert section.shape == ns.SHAPE_EPISODE_TEXT
    assert section.owners == ("game",)
    assert section.group is None


def test_the_site_wide_resources_section_is_untouched():
    """It is a peer of guide_resources, not a replacement for it."""
    section = ns.section_by_key("resources")
    assert section.shape == ns.SHAPE_NAME_LINKS
    assert section.owners == ns.ALL_OWNERS
    assert section.standalone is True


def test_part_reviews_reuse_episode_comments_with_a_game_label():
    section = ns.section_by_key("episode_comments")
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
            NoteCreate(owner_type="game", owner_id=None, section="side_quests")
        )


def test_a_name_entries_note_accepts_mixed_text_and_link_entries():
    note = NoteCreate(
        owner_type="game",
        owner_id=None,
        section="enemies",
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
            section="builds_and_styles",
            entries=[{"type": "link", "value": "https://example.com"}],
        )
    )


def test_builds_and_styles_takes_no_kind():
    """
    The migration clears kind='Build' for exactly this reason: a surviving kind
    fails validation check 5 on the next edit of a migrated row.
    """
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=None,
                section="builds_and_styles",
                title="Bleed build",
                kind="Build",
            )
        )


def test_mods_and_tools_rejects_the_retired_build_kind():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=None,
                section="mods_and_tools",
                title="Seamless co-op",
                kind="Build",
            )
        )


def test_a_todo_item_may_carry_the_link_that_prompted_it():
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=None,
            section="todo_next",
            content="Clear Caelid",
            links=["https://example.com/guide"],
        )
    )


def test_the_new_sections_do_not_apply_to_anime():
    keys = {s.key for s in ns.sections_for("anime")}
    for key in GUIDE_KEYS + STORY_KEYS + TODO_KEYS:
        assert key not in keys, key
