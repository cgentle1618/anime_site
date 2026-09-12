# Game 攻略 / 劇情 / 待辦 Note Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give games three new note groups — 攻略 Guides (15 sections), 劇情 Story (7 sections) and 待辦 Todo (4 sections) — replacing the two flat game-only sections `guides` and `builds_and_mods`, whose rows are migrated.

**Architecture:** Everything is declarative. `app/utils/note_sections.py` is the single registry the backend schema layer and the frontend both read; adding a section is one dataclass entry and no migration, and the only DB work is a data-only Alembic revision that rewrites `note.section` for existing rows. **There is no frontend code change**: every shape used (`text`, `text_links`, `episode_text`, `name_entries`) already has a renderer in `NotesTemplate.jsx`, and no frontend file names either retired key.

**Tech Stack:** Python 3.13, SQLAlchemy, Alembic, pytest. FastAPI for the one API test.

**Spec:** `docs/superpowers/specs/2026-09-12-game-guides-story-todo-design.md`

## Global Constraints

- **Branch:** `feat/game-guides-story-todo`, already created off `dev`. Never commit to `dev` or `main`.
- **Commit messages carry no AI attribution** — no `Co-Authored-By`, no `Claude-Session`, no `claude.ai` link, no trailers at all. CLAUDE.md overrides the harness reminder that asks for them.
- **Stage exact paths, never a directory pathspec**, and commit with `git commit -m "…" -- <exact paths>`.
- **The backend suite takes ~5.5 minutes.** Run the full `venv/Scripts/python.exe -m pytest -q` before every commit, not just the scoped tests. Never run two pytest processes at once.
- All 26 new sections are `owners=("game",)`.
- 攻略 and 劇情 sections are `scope=SCOPE_CATALOG`; the four 待辦 sections are `scope=SCOPE_PERSONAL`.
- Labels use the ASCII solidus `/`, never the fullwidth `／` (`test_labels_use_ascii_solidus` enforces it).
- Alembic head before this work is `b1n2amealign`. Single head must be preserved.

---

### Task 1: The registry — three groups, 26 sections, two retirements

**Files:**
- Modify: `app/utils/note_sections.py` (add to `NOTE_GROUPS`; replace the `guides` and `builds_and_mods` entries in `NOTE_SECTIONS`; add three runs after `symmetry`)
- Test: `tests/unit/test_game_note_sections.py` (rewrite — it asserts both retired keys)
- Test: `tests/unit/test_note_sections.py` (five existing assertions go stale)

**Interfaces:**
- Consumes: nothing.
- Produces: the 26 section keys and three group keys listed below. Task 2's migration rewrites `note.section` to `guide_resources`, `builds_and_styles` and `mods_and_tools`; Task 3's API test uses `todo_now` and `beginner`. Spell them exactly as written here.

- [ ] **Step 1: Write the failing registry test**

Replace the whole of `tests/unit/test_game_note_sections.py` with this. Note the last two tests: the old file used `section="guides"` and `section="builds_and_mods"` as its `name_entries` examples, and both keys are about to stop existing.

```python
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
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_game_note_sections.py -q
```

Expected: failures on `test_the_three_new_groups_exist_in_order` (only four groups today), on every `_group holds_` test (empty lists), and on `test_the_old_flat_game_sections_are_gone` (both keys still resolve).

- [ ] **Step 3: Add the three groups**

In `app/utils/note_sections.py`, inside the `NOTE_GROUPS` tuple, insert these three **between** the `analysis_group` entry and the `music` entry — the tuple's order is not what positions the cards, but a reader uses it as the running order and the test above pins it:

```python
    # The key `guides` is free only because the SECTION `guides` was retired
    # when this group replaced it. Group keys and section keys are separate
    # dicts, so the two could coexist - `analysis_group` is keyed that way to
    # avoid making a reader work that out. Here the collision was removed
    # instead, which is why this key does not need the same suffix.
    NoteGroup(key="guides", label="攻略 Guides", icon="fa-map"),
    # 劇情 is what HAPPENS; `analysis_group` directly above is what it MEANS.
    # Keeping them apart is why `story_other` exists - a stray observation
    # lands there rather than drifting into Analysis.
    NoteGroup(key="story", label="劇情 Story", icon="fa-book-open"),
    # NOT "進度 Progress": Game.jsx already renders a <Slip title="Progress">
    # (playtime and achievements) on the same page, and two cards with one
    # name is the `resources` / `builds_and_mods` collision again.
    NoteGroup(key="todo", label="待辦 Todo", icon="fa-list-check"),
```

- [ ] **Step 4: Delete the two retired sections**

Still in `app/utils/note_sections.py`, delete the entire `NoteSection(key="guides", …)` and `NoteSection(key="builds_and_mods", …)` entries from `NOTE_SECTIONS`. They currently sit between `episode_comments` and `highlights`. Delete the comment block above `builds_and_mods` with it.

- [ ] **Step 5: Add the 攻略 run**

Insert immediately **after** the `NoteSection(key="symmetry", …)` entry — that is, after the last `analysis_group` member and before the `# --- 音樂 Music ---` banner. Placement is what puts the card below Analysis: `splitBlocks` in `NotesTemplate.jsx` emits one card per group in registry first-appearance order.

```python
    # --- 攻略 Guides ------------------------------------------------------
    # Fifteen sections rather than one section with a kind, because each is a
    # list somebody actually keeps separately: which build to run is not the
    # same question as where the collectibles are. All game-only - 屬性&配點
    # means nothing for a novel - and all catalogue: a guide is shared.
    #
    # `name_entries` where a row is one NAMED thing and what is known about it
    # (a quest, a build, a boss, an ending); `text_links` where it is advice
    # with sources and no name. Neither shape renders a locator, so "which
    # area" is written as an entry line.
    NoteSection(
        key="beginner",
        shape=SHAPE_TEXT_LINKS,
        label="新手 Beginner",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="controls",
        shape=SHAPE_TEXT_LINKS,
        label="操作 Controls",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="trivia",
        shape=SHAPE_TEXT_LINKS,
        label="小知識 Trivia",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="side_quests",
        shape=SHAPE_NAME_ENTRIES,
        label="支線任務列表 Side Quests",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="builds_and_styles",
        shape=SHAPE_NAME_ENTRIES,
        label="配裝&流派 Builds & Styles",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="stats_and_points",
        shape=SHAPE_TEXT_LINKS,
        label="屬性&配點 Stats & Points",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="skills",
        shape=SHAPE_NAME_ENTRIES,
        label="技能 Skills",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="collectibles",
        shape=SHAPE_NAME_ENTRIES,
        label="收集物 Collectibles",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="items",
        shape=SHAPE_NAME_ENTRIES,
        label="道具 Items",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="weapons_and_gear",
        shape=SHAPE_NAME_ENTRIES,
        label="武器&裝備 Weapons & Gear",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        # NOT `characters`: a `character` table and a /character/:id page
        # already exist, and a bare `characters` note section would read as
        # related to them.
        key="characters_guide",
        shape=SHAPE_NAME_ENTRIES,
        label="角色 Characters",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="enemies",
        shape=SHAPE_NAME_ENTRIES,
        label="敵人 Enemies",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="endings",
        shape=SHAPE_NAME_ENTRIES,
        label="結局 Endings",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        # Where `builds_and_mods`'s Mod and Tool rows went. A mod is not a
        # guide, so it is not folded into one of the sections above; Mod and
        # Tool stay one section with a kind because they are the same shape.
        key="mods_and_tools",
        shape=SHAPE_NAME_ENTRIES,
        label="模組&工具 Mods & Tools",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
        kinds=("Mod", "Tool"),
    ),
    NoteSection(
        # The old `guides` section: a pointer to somebody else's walkthrough,
        # which is all it ever held now that the fourteen above cover the
        # content itself.
        key="guide_resources",
        shape=SHAPE_NAME_ENTRIES,
        label="攻略資源 Guide Resources",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
```

- [ ] **Step 6: Add the 劇情 run**

Immediately after `guide_resources`:

```python
    # --- 劇情 Story -------------------------------------------------------
    # What happens, as opposed to what it means - 解析 Analysis, two cards up,
    # holds the second. This card is a wall of spoilers and the site has no
    # spoiler gate; the collapsible card is all today's UI offers.
    NoteSection(
        key="main_plot",
        shape=SHAPE_EPISODE_TEXT,
        label="主線劇情 Main Plot",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
        # Deliberately NOT locator_required, unlike episode_comments and
        # highlight_moments: a beat remembered without its chapter number is
        # still a beat, whereas a per-chapter comment about nothing in
        # particular is not a per-chapter comment.
        locator_placeholder="Chapter / Part, e.g. Ch 3",
    ),
    NoteSection(
        key="side_plot",
        shape=SHAPE_EPISODE_TEXT,
        label="支線劇情 Side Stories",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
        locator_placeholder="Chapter / Part, e.g. Ch 3",
    ),
    NoteSection(
        key="character_arcs",
        shape=SHAPE_TEXT_LINKS,
        label="角色劇情 Character Arcs",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        key="lore",
        shape=SHAPE_TEXT_LINKS,
        label="世界觀&設定 Lore",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        # Plain text: one ordered list of dated events. Every row wanting a
        # link would mean this should have been text_links.
        key="timeline",
        shape=SHAPE_TEXT,
        label="時間線 Timeline",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        key="mysteries",
        shape=SHAPE_TEXT_LINKS,
        label="未解之謎 Mysteries",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        # The overflow that keeps a stray story observation out of Analysis.
        key="story_other",
        shape=SHAPE_TEXT_LINKS,
        label="其他 Other",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
```

- [ ] **Step 7: Add the 待辦 run**

Immediately after `story_other`, still before the `# --- 音樂 Music ---` banner:

```python
    # --- 待辦 Todo --------------------------------------------------------
    # Four sections rather than one section with a kind, because ordering is
    # PER SECTION: sort_index orders rows within one (owner, section) pair and
    # PATCH /api/notes/reorder renumbers the whole section, so a kind-tagged
    # single section could not order items within a bucket. Moving an item
    # between buckets is therefore a PATCH of `section`, which the API already
    # accepts - no UI does it, and none does reorder either.
    #
    # Personal, not catalogue: a backlog is one person's. text_links so an
    # item can carry the guide link that prompted it.
    NoteSection(
        key="todo_now",
        shape=SHAPE_TEXT_LINKS,
        label="現在進行 Doing now",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_next",
        shape=SHAPE_TEXT_LINKS,
        label="接下來 To do next",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_later",
        shape=SHAPE_TEXT_LINKS,
        label="未來 To do in the future",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_maybe",
        shape=SHAPE_TEXT_LINKS,
        label="可能 Might do",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
```

- [ ] **Step 8: Run the new test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_game_note_sections.py -q
```

Expected: PASS.

- [ ] **Step 9: Fix the five stale assertions in `tests/unit/test_note_sections.py`**

These are correct tests whose hardcoded expectations this change moves. Do not weaken them into `>=` — the exactness is the point.

1. `test_only_declared_sections_have_kinds` (line ~41). The list is in **registry order**, and `mods_and_tools` sits after `highlights` but before the music run:

```python
def test_only_declared_sections_have_kinds():
    with_kinds = [s.key for s in ns.NOTE_SECTIONS if s.kinds]
    assert with_kinds == [
        "highlights",
        "mods_and_tools",
        "op",
        "ed",
        "ost",
        "op_ed_changes",
    ]
```

2. `PERSONAL_KEYS` (line ~433) gains the four todo keys:

```python
PERSONAL_KEYS = {
    "remark",
    "advantages",
    "disadvantages",
    "double_edged",
    "episode_comments",
    "questions",
    "personal_reviews",
    "todo_now",
    "todo_next",
    "todo_later",
    "todo_maybe",
}
```

3. `CATALOG_KEYS` (line ~443): remove `"guides"` and `"builds_and_mods"`, add the fifteen 攻略 and seven 劇情 keys:

```python
CATALOG_KEYS = {
    "op",
    "ed",
    "insert_songs",
    "ost",
    "op_ed_changes",
    "extended_episodes",
    "adaptation",
    "resources",
    "public_reviews",
    "highlights",
    "highlight_episodes",
    "highlight_passages",
    "highlight_moments",
    "analysis",
    "cinematography",
    "craft",
    "foreshadowing",
    "symmetry",
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
    "main_plot",
    "side_plot",
    "character_arcs",
    "lore",
    "timeline",
    "mysteries",
    "story_other",
}
```

4. Both scope-count tests are renamed for their new counts — 11 personal, 40 catalogue, 51 stored (27 − 2 + 26):

```python
def test_the_personal_sections_are_exactly_these_eleven():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_PERSONAL} == (
        PERSONAL_KEYS
    )
    assert ns.PERSONAL_SECTIONS == PERSONAL_KEYS


def test_the_catalog_sections_are_exactly_these_forty():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_CATALOG} == (
        CATALOG_KEYS
    )
    assert ns.CATALOG_SECTIONS == CATALOG_KEYS


def test_the_two_scopes_partition_every_stored_section():
    stored = {s.key for s in ns.NOTE_SECTIONS if s.shape in ns.STORED_SHAPES}
    assert len(stored) == 51
    assert ns.PERSONAL_SECTIONS | ns.CATALOG_SECTIONS == stored
    assert not (ns.PERSONAL_SECTIONS & ns.CATALOG_SECTIONS)
```

5. `test_sections_by_scope_returns_registry_order` (line ~516). The todo run sits after `symmetry` and before the music group, so it lands between `episode_comments` and `questions`:

```python
def test_sections_by_scope_returns_registry_order():
    keys = [s.key for s in ns.sections_by_scope(ns.SCOPE_PERSONAL)]
    assert keys == [
        "remark",
        "advantages",
        "disadvantages",
        "double_edged",
        "personal_reviews",
        "episode_comments",
        "todo_now",
        "todo_next",
        "todo_later",
        "todo_maybe",
        "questions",
    ]
```

- [ ] **Step 10: Add a retirement assertion beside the existing one**

In `tests/unit/test_note_sections.py`, extend `test_retired_sections_are_gone` (line ~188):

```python
def test_retired_sections_are_gone():
    assert ns.section_by_key("special_changes") is None
    assert ns.section_by_key("special_episodes") is None
    # Replaced by the 攻略 group; their rows were migrated, not dropped.
    assert ns.section_by_key("guides") is None
    assert ns.section_by_key("builds_and_mods") is None
```

- [ ] **Step 11: Run the whole backend suite**

```bash
venv/Scripts/python.exe -m pytest -q
```

Expected: PASS. `test_grouped_sections_are_adjacent` and `test_every_group_is_a_known_group` should pass without edits — the three new runs are contiguous and every new `group=` value is now a real `NoteGroup`. If either fails, the runs were inserted non-contiguously.

- [ ] **Step 12: Lint**

```bash
venv/Scripts/ruff.exe check .
```

- [ ] **Step 13: Commit**

```bash
git add app/utils/note_sections.py tests/unit/test_game_note_sections.py tests/unit/test_note_sections.py
git commit -m "feat(notes): 攻略, 劇情 and 待辦 groups for games

Twenty-six game-only sections in three groups, placed after the analysis
run so their cards render below 解析. Retires the flat guides and
builds_and_mods sections; Task 2's migration moves their rows.

Four todo sections rather than one with a kind dropdown: sort_index is
per-section and /reorder renumbers the whole section, so a kind-tagged
single section could not order items within a bucket." -- app/utils/note_sections.py tests/unit/test_game_note_sections.py tests/unit/test_note_sections.py
```

---

### Task 2: The data migration

**Files:**
- Create: `alembic/versions/g1u2i3d4e5s6_guides_group_sections.py`
- Test: `tests/api/test_guides_section_migration.py` (create)

**Interfaces:**
- Consumes: the section keys from Task 1.
- Produces: module-level `UPGRADE_STATEMENTS` and `DOWNGRADE_STATEMENTS`, each a `tuple[str, ...]` of SQL strings. The test imports them by file path and executes them against the test session, so the SQL that is tested is the SQL that ships.

- [ ] **Step 1: Write the failing migration test**

Create `tests/api/test_guides_section_migration.py`:

```python
"""
The data migration that moves `guides` and `builds_and_mods` rows onto the
攻略 group's keys.

The suite has no Alembic harness - tests/api/conftest.py builds its schema with
create_all - so this executes the revision's OWN statement tuples against the
test session. Importing them by file path rather than restating them is the
point: a test that restates the SQL passes while the shipped SQL is wrong.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "g1u2i3d4e5s6_guides_group_sections.py"


def _load_revision():
    spec = importlib.util.spec_from_file_location("_guides_revision", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def revision():
    return _load_revision()


@pytest.fixture
def game(db_session, sample_franchise):
    g = models.Game(
        game_name_en="Elden Ring", franchise_id=sample_franchise.system_id
    )
    db_session.add(g)
    db_session.flush()
    return g


def _note(db, game, section, kind, content, author_id):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=game.system_id,
        section=section,
        kind=kind,
        content=content,
        author_id=author_id,
    )
    db.add(row)
    return row


def _run(db, statements):
    for statement in statements:
        db.execute(text(statement))
    db.commit()


@pytest.fixture
def legacy_rows(db_session, game, admin_user):
    rows = {
        "guide": _note(db_session, game, "guides", None, "walkthrough", admin_user.id),
        "build": _note(
            db_session, game, "builds_and_mods", "Build", "bleed", admin_user.id
        ),
        "mod": _note(
            db_session, game, "builds_and_mods", "Mod", "co-op", admin_user.id
        ),
        "tool": _note(
            db_session, game, "builds_and_mods", "Tool", "save editor", admin_user.id
        ),
        "kindless": _note(
            db_session, game, "builds_and_mods", None, "no kind chosen", admin_user.id
        ),
    }
    db_session.commit()
    return rows


def _reload(db, row):
    db.expire(row)
    return row


def test_guides_rows_become_guide_resources(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    assert _reload(db_session, legacy_rows["guide"]).section == "guide_resources"


def test_build_rows_become_builds_and_styles_with_the_kind_cleared(
    db_session, revision, legacy_rows
):
    """
    builds_and_styles declares no kinds, so a surviving kind='Build' would fail
    validate_note_payload check 5 the next time the row is edited.
    """
    _run(db_session, revision.UPGRADE_STATEMENTS)
    row = _reload(db_session, legacy_rows["build"])
    assert row.section == "builds_and_styles"
    assert row.kind is None


def test_mod_and_tool_rows_become_mods_and_tools_keeping_their_kind(
    db_session, revision, legacy_rows
):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    mod = _reload(db_session, legacy_rows["mod"])
    tool = _reload(db_session, legacy_rows["tool"])
    assert (mod.section, mod.kind) == ("mods_and_tools", "Mod")
    assert (tool.section, tool.kind) == ("mods_and_tools", "Tool")


def test_a_kindless_row_is_treated_as_a_build(db_session, revision, legacy_rows):
    """
    A row entered without choosing a kind is far likelier to be a build than a
    tool - builds are what that section was mostly used for.
    """
    _run(db_session, revision.UPGRADE_STATEMENTS)
    row = _reload(db_session, legacy_rows["kindless"])
    assert row.section == "builds_and_styles"
    assert row.kind is None


def test_no_row_is_left_on_a_retired_key(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    left = (
        db_session.query(models.Note)
        .filter(models.Note.section.in_(("guides", "builds_and_mods")))
        .count()
    )
    assert left == 0


def test_downgrade_puts_every_row_back(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    _run(db_session, revision.DOWNGRADE_STATEMENTS)

    sections = {
        name: _reload(db_session, row).section for name, row in legacy_rows.items()
    }
    assert sections["guide"] == "guides"
    assert sections["build"] == "builds_and_mods"
    assert sections["mod"] == "builds_and_mods"
    assert sections["tool"] == "builds_and_mods"
    assert _reload(db_session, legacy_rows["build"]).kind == "Build"
    assert _reload(db_session, legacy_rows["mod"]).kind == "Mod"


def test_the_migration_touches_no_other_section(
    db_session, revision, game, admin_user, legacy_rows
):
    """
    A refusal test needs something to refuse. `highlight_moments` is a game
    section that is NOT being migrated, and `resources` is the site-wide
    section whose key `builds_and_mods` was named around - if either moved,
    the WHERE clauses are too wide.
    """
    _note(db_session, game, "highlight_moments", None, "Ch 3 boss", admin_user.id)
    _note(db_session, game, "resources", None, "wiki", admin_user.id)
    db_session.commit()

    _run(db_session, revision.UPGRADE_STATEMENTS)

    kept = {
        row.section
        for row in db_session.query(models.Note)
        .filter(models.Note.section.in_(("highlight_moments", "resources")))
        .all()
    }
    assert kept == {"highlight_moments", "resources"}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_guides_section_migration.py -q
```

Expected: collection error — the revision file does not exist, so `spec_from_file_location` returns a spec whose loader raises `FileNotFoundError`.

- [ ] **Step 3: Write the migration**

Create `alembic/versions/g1u2i3d4e5s6_guides_group_sections.py`. **Write the file by hand — do not use `alembic revision --autogenerate`**: this revision changes no schema, and autogenerate would produce an empty one.

```python
"""move the two flat game note sections onto the 攻略 group's keys

Revision ID: g1u2i3d4e5s6
Revises: b1n2amealign
Create Date: 2026-09-12

`guides` and `builds_and_mods` were a game's whole guide vocabulary. The 攻略
group replaces them with fifteen sections, so their rows need new section keys.
Data only - `note.section` is a plain String column and nothing here alters a
table.

Three arms, and the kind clauses are the part worth reading:

  * `builds_and_styles` declares NO kinds, so a row arriving with kind='Build'
    would fail validate_note_payload check 5 ("takes no kind") the next time
    anyone edited it - accepted by the migration, rejected by the app. The
    Build arm therefore clears the column.
  * `mods_and_tools` keeps kinds ('Mod', 'Tool'), so those rows keep theirs.
  * A `builds_and_mods` row with a NULL kind goes to `builds_and_styles`, not
    to `mods_and_tools`: that section was mostly used for builds, so an
    unlabelled row is likelier to be one.

BACK UP TO GOOGLE SHEETS AFTER RUNNING THIS. A sheet written before it still
holds `guides` and `builds_and_mods` in its section column, and Pull writes
note rows WITHOUT running validate_note_payload (it is called only in
app/routers/note.py) - so pulling an old sheet reintroduces rows whose section
key no longer exists in the registry, which the notes page silently drops.

The statements are module-level tuples because
tests/api/test_guides_section_migration.py executes these exact strings: the
suite has no Alembic harness, and a test that restated the SQL would pass while
the shipped SQL was wrong.
"""

from alembic import op

revision = "g1u2i3d4e5s6"
down_revision = "b1n2amealign"
branch_labels = None
depends_on = None

UPGRADE_STATEMENTS = (
    "UPDATE note SET section = 'guide_resources' WHERE section = 'guides'",
    # Before the Mod/Tool arm only for readability; the two are disjoint by
    # kind, so either order gives the same result.
    """
    UPDATE note SET section = 'builds_and_styles', kind = NULL
     WHERE section = 'builds_and_mods'
       AND (kind = 'Build' OR kind IS NULL)
    """,
    """
    UPDATE note SET section = 'mods_and_tools'
     WHERE section = 'builds_and_mods'
       AND kind IN ('Mod', 'Tool')
    """,
)

# Lossy in one direction only, and correctly so: a build row created AFTER the
# upgrade also gets kind='Build' here, which is the value the old section would
# have held for it.
DOWNGRADE_STATEMENTS = (
    "UPDATE note SET section = 'guides' WHERE section = 'guide_resources'",
    """
    UPDATE note SET section = 'builds_and_mods', kind = 'Build'
     WHERE section = 'builds_and_styles'
    """,
    "UPDATE note SET section = 'builds_and_mods' WHERE section = 'mods_and_tools'",
)


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
```

- [ ] **Step 4: Run the migration test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_guides_section_migration.py -q
```

Expected: PASS.

- [ ] **Step 5: Verify the chain still has one head and actually runs**

```bash
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: `heads` prints exactly one revision, `g1u2i3d4e5s6 (head)`. The upgrade applies cleanly against the local development database.

- [ ] **Step 6: Run the whole backend suite**

```bash
venv/Scripts/python.exe -m pytest -q
```

Expected: PASS, `tests/api/test_migrations_build_the_schema.py` included — it runs `alembic upgrade head` as a subprocess against a scratch database, so a broken revision file fails there too.

- [ ] **Step 7: Lint**

```bash
venv/Scripts/ruff.exe check .
```

- [ ] **Step 8: Commit**

```bash
git add alembic/versions/g1u2i3d4e5s6_guides_group_sections.py tests/api/test_guides_section_migration.py
git commit -m "feat(notes): migrate guides and builds_and_mods rows to the 攻略 keys

Data only. guides -> guide_resources; Build and kindless builds_and_mods
rows -> builds_and_styles with kind cleared, since that section declares no
kinds and a surviving kind fails validation on the next edit; Mod and Tool
rows -> mods_and_tools keeping theirs.

Back up to Sheets after running: Pull writes note rows without calling
validate_note_payload, so an older sheet would reintroduce the retired keys." -- alembic/versions/g1u2i3d4e5s6_guides_group_sections.py tests/api/test_guides_section_migration.py
```

---

### Task 3: Scope enforcement over the wire

**Files:**
- Test: `tests/api/test_note_scope_reads.py` (append two tests)

**Interfaces:**
- Consumes: `todo_now` (personal) and `beginner` (catalogue) from Task 1.
- Produces: nothing.

The router already reads `section.scope`, so this task writes **no production code** — it asserts that the new sections inherit the existing behaviour. It is a task rather than a step because a reviewer could reasonably approve Tasks 1–2 and reject this one's coverage.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_note_scope_reads.py`. The file already has `db`, `two_authors` and `_note` at module level — reuse them; do not redefine them.

```python
@pytest.fixture
def game(db, sample_franchise):
    g = models.Game(
        game_name_en="Elden Ring", franchise_id=sample_franchise.system_id
    )
    db.add(g)
    db.commit()
    return g


def test_a_todo_bucket_reaches_only_its_author(
    db, admin_client, game, two_authors, admin_user
):
    """
    todo_* is personal scope. The alice and bob rows are what makes this bite:
    an author filter over a table holding one user's rows passes whether or not
    the filter is applied.
    """
    alice, bob = two_authors
    db.add_all(
        [
            _note(game.system_id, "todo_now", "admin 的待辦", admin_user.id),
            _note(game.system_id, "todo_now", "alice 的待辦", alice.id),
            _note(game.system_id, "todo_now", "bob 的待辦", bob.id),
        ]
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "game", "owner_id": str(game.system_id)},
    )
    assert r.status_code == 200
    bodies = [n["content"] for n in r.json() if n["section"] == "todo_now"]
    assert bodies == ["admin 的待辦"]


def test_a_guides_section_is_the_same_for_everyone(
    db, admin_client, client, game, two_authors, admin_user
):
    """The mirror of the test above, with the same fixture: it proves the
    filter above did the filtering, rather than something incidental."""
    alice, _bob = two_authors
    db.add_all(
        [
            _note(game.system_id, "beginner", "先打史東薇爾", admin_user.id),
            _note(game.system_id, "beginner", "別急著點等級", alice.id),
        ]
    )
    db.commit()

    params = {"owner_type": "game", "owner_id": str(game.system_id)}
    signed_in = admin_client.get("/api/notes", params=params)
    logged_out = client.get("/api/notes", params=params)

    assert signed_in.status_code == logged_out.status_code == 200
    for response in (signed_in, logged_out):
        bodies = sorted(
            n["content"] for n in response.json() if n["section"] == "beginner"
        )
        assert bodies == ["先打史東薇爾", "別急著點等級"]
```

- [ ] **Step 2: Run them**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_note_scope_reads.py -q
```

Expected: PASS immediately — the router derives both behaviours from `section.scope`, and Task 1 declared it. **If either fails, that is a real defect in Task 1's scope declarations, not a test to adjust.** A green run here is the evidence that scope was declared correctly; there is no red phase to stage because no production code is being added.

- [ ] **Step 3: Run the whole backend suite**

```bash
venv/Scripts/python.exe -m pytest -q
```

- [ ] **Step 4: Commit**

```bash
git add tests/api/test_note_scope_reads.py
git commit -m "test(notes): todo buckets are per author, 攻略 sections are shared

Both halves use the same two-author fixture, so the personal assertion
cannot pass because there was nobody else's row to hide." -- tests/api/test_note_scope_reads.py
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/systems/notes.md`
- Modify: `docs/options.md:225-273`
- Modify: `docs/entry-types.md:279-290`
- Modify: `docs/frontend/components.md:231`
- Modify: `docs/frontend/pages.md:608`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-09-12-game-guides-story-todo-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

Docs here are **present-tense only** (CLAUDE.md). Write what the registry holds today; do not write "used to be `builds_and_mods`" anywhere outside `roadmap.md` and the spec. Bump each file's `Last verified` line to 2026-09-12.

- [ ] **Step 1: Find every copy of the claim before editing anything**

```bash
grep -rn "builds_and_mods\|\bguides\b" docs/ --include=*.md | grep -v superpowers/
```

The `builds_and_mods`-is-not-`resources` rationale is stated in at least four files. CLAUDE.md: grep the claim, not the file — fixing the copy in front of you leaves the other asserting the old thing with equal confidence. Every hit outside `docs/superpowers/` must be resolved in this task.

- [ ] **Step 2: Update `docs/systems/notes.md`**

Four edits:
1. **Groups table** — add three rows: `guides` / 攻略 Guides / `fa-map`, `story` / 劇情 Story / `fa-book-open`, `todo` / 待辦 Todo / `fa-list-check`. Add a sentence under it saying the `guides` group key is free because no section holds it, in contrast to `analysis_group`.
2. **Section registry table** — delete the `guides` and `builds_and_mods` rows; add 26 rows in registry order with the same columns the table already uses (Key, Label, Shape, Group/standalone, Owners, Kinds, Statuses, Locator placeholder, Locator req., Singleton, Content req.).
3. **Rules table** — delete the `builds_and_mods`-is-not-`resources` row. Replace it with two rows: *"A game's guide vocabulary is the 攻略 group, not one section"* (why fifteen), and *"The 待辦 buckets are four sections because `sort_index` is per-section"* (why not one with a kind).
4. **Scope table** — the counts change: catalogue 40, personal 11 (now listing the four `todo_*` keys).

- [ ] **Step 3: Update `docs/options.md`**

Delete the `guides` and `builds_and_mods` rows from the section table (lines ~237-238) and add the 26 new rows in registry order, matching the existing column layout. Then **delete the entire `**builds_and_mods` is deliberately not called `resources`.**` paragraph** (lines ~267-273) and replace it with:

```markdown
**`guide_resources` is not `resources`, and neither is a replacement for the
other.** The site-wide `resources` section (`name_links`, all owners,
standalone) holds plain bookmarks and games inherit it; `guide_resources`
(`name_entries`, game-only, inside the 攻略 group) holds a pointer to somebody
else's walkthrough with notes attached. Two keys and two labels, because a
second card also called "Resources" would be unreadable.

**The 待辦 buckets are four sections, not one section with a kind.**
`sort_index` orders rows within one `(owner, section)` pair and
`PATCH /api/notes/reorder` renumbers the whole section, so a kind-tagged
single section could not order items *within* a bucket.
```

- [ ] **Step 4: Update `docs/entry-types.md`**

In the per-type section matrix, delete the `guides` and `builds_and_mods` rows (lines ~279-280) and add the 26 new rows, each with an `x` in the game column only. Then rewrite the prose at line ~290:

```markdown
Movie and comic get only the shared sections. Game carries 27 of its own —
`highlight_moments` plus the 攻略 (15), 劇情 (7) and 待辦 (4) groups — beside
the shared ones. Its guide bookmarks are `guide_resources` inside the 攻略
group; the site-wide `resources` section (`name_links`, `ALL_OWNERS`) is a
separate section that games also inherit. Shapes, groups and validation:
[systems/notes.md](systems/notes.md).
```

- [ ] **Step 5: Update the two frontend docs**

`docs/frontend/components.md:231` and `docs/frontend/pages.md:608` both name `guides` and `builds_and_mods` as the `name_entries` users. Replace both with a description of the current set — `name_entries` is used by the nine game-only sections `side_quests`, `builds_and_styles`, `skills`, `collectibles`, `items`, `weapons_and_gear`, `characters_guide`, `enemies`, `endings`, `mods_and_tools` and `guide_resources`. Check the exact surrounding sentence in each file before editing; the two phrasings differ.

- [ ] **Step 6: Add the roadmap entry**

`docs/roadmap.md` is one of the three files that keep history. Add a **Done** entry, newest first, in the style of the entries already there: what changed, why it was done that way, what was deliberately not done (no spoiler gate, no bucket-move UI, game-only owners), and the defect avoided (clearing `kind='Build'`, without which migrated rows would have been accepted by the migration and rejected by validation on the next edit).

- [ ] **Step 7: Mark the spec shipped**

In `docs/superpowers/specs/2026-09-12-game-guides-story-todo-design.md`, change the `Status:` line to `**SHIPPED 2026-09-12.**` with the commit shas. Per CLAUDE.md, also record **what the spec got wrong** — if nothing was wrong, say that explicitly rather than leaving the section absent, and note anything the implementation discovered that the spec had assumed.

- [ ] **Step 8: Update `docs/PROGRESS.md`**

If this plan has a task table there, delete it; leave only what is still open. If it does not, add nothing.

- [ ] **Step 9: Verify no stale claim survives**

```bash
grep -rn "builds_and_mods" docs/ --include=*.md | grep -v superpowers/
```

Expected: no output. Hits under `docs/superpowers/` are plans and specs, which keep their history and must not be rewritten.

- [ ] **Step 10: Commit**

```bash
git add docs/systems/notes.md docs/options.md docs/entry-types.md docs/frontend/components.md docs/frontend/pages.md docs/roadmap.md docs/superpowers/specs/2026-09-12-game-guides-story-todo-design.md
git commit -m "docs: the 攻略, 劇情 and 待辦 note groups

Present tense throughout; the record of the change is the roadmap entry and
the spec's shipped status." -- docs/systems/notes.md docs/options.md docs/entry-types.md docs/frontend/components.md docs/frontend/pages.md docs/roadmap.md docs/superpowers/specs/2026-09-12-game-guides-story-todo-design.md
```

---

## Final verification

- [ ] **Full backend suite** — `venv/Scripts/python.exe -m pytest -q` (~5.5 min). Green.
- [ ] **Backend lint** — `venv/Scripts/ruff.exe check .`. Clean.
- [ ] **Frontend, despite no frontend change.** No file under `frontend/src` names either retired key — confirmed by `grep -rn "builds_and_mods" frontend/src`, whose only hits are the word "guides" in unrelated watch-order prose. Run the frontend gates anyway, because CI does:

```bash
cd frontend && npm run build && npm run test:run && npm run lint
```

- [ ] **Look at it in the app.** Start the dev server, open a game's detail page, and confirm the card order reads Notes → 評論 → 解析 → 攻略 → 劇情 → 待辦 → 音樂 → 名言/梗 → Resources → Questions, and that every new card collapses when empty. This is the one thing no test checks: card order comes from registry position via `splitBlocks`, and nothing asserts it.
- [ ] **Run a Backup** from admin `/system` after `alembic upgrade head`, so the sheet stops holding the retired section keys.
- [ ] **Push the branch.** Opening the PR and merging it are the owner's — show the title and body and wait.

## Notes for the executor

- **Tasks 1 and 2 are a pair.** Between them the branch has a registry with no rows behind `guide_resources` and a database with rows on keys the registry no longer knows. That is fine on a feature branch and is not fine on `dev` — do not propose a PR after Task 1 alone.
- **`git checkout` does not move `alembic_version`.** Leaving this branch after running the migration leaves the local database ahead of the code you switch to. `alembic downgrade b1n2amealign` before switching away, or `upgrade head` after switching back.
- **Do not "fix" a failing test by relaxing it.** The count and order assertions in `tests/unit/test_note_sections.py` are exact on purpose; an unexpected failure there means the registry is not what this plan says it is.
