# Game guides, story and todo — design

Last verified: 2026-09-12
Status: **SHIPPED 2026-09-12.** Four tasks — 9dc8908f (registry), 331c1fe5
(migration), c9879f26 (scope tests), plus the docs commit. Design approved by
the owner on 2026-09-12; Decisions 1–4 below all survived implementation
unchanged.

## What this spec got wrong

Recorded because a spec that is only amended forward teaches nothing about its
own reasoning, and its confident paragraphs are what the next design pass leans
on.

- **"There is no frontend code change" was right for the wrong reason.** The
  spec asserted every shape already had a renderer, and it does — but
  `docs/systems/notes.md` claimed the opposite in two places (`name_entries`
  "has no component yet"; `parse_note_from_sheet` "has no `entries` key"), and
  the spec was written without checking either. Both doc claims were stale, so
  the conclusion held by luck. Had the docs been right, this would have shipped
  eleven sections rendering null and a Sheets round trip that ate their
  contents. The check that settled it — reading `NotesTemplate.jsx:27` and
  `formatter.py:1397` — happened during the docs task, three tasks too late.
- **The spec did not anticipate `mods_and_tools`.** The section list had
  fourteen entries and `builds_and_mods`'s Mod and Tool rows had nowhere to go.
  That was caught while drafting the design rather than while writing the spec;
  a migration written from the section list alone would have stranded them.
- **The spec was silent on which test database its tests take**, which is where
  this work's only real hazard lived: `tests/conftest.py` does
  `os.environ.setdefault("POSTGRES_DB", "anime_site_test")` and
  `tests/api/conftest.py` then runs `DROP SCHEMA public CASCADE` on whatever
  that resolves to. A spec for work done during a multi-session run should name
  its database.

Decision 1's reasoning — `sort_index` is per-section — is the one load-bearing
claim that was verified against the code *before* being written down, and it is
the only one nothing later revised.

## The problem

A game's notes today are three game-only sections sitting flat in the Notes
card: `guides`, `builds_and_mods` and `highlight_moments`. That is the whole
vocabulary a game has for the thing a game actually generates — a guide is not
one list, it is fifteen: what a beginner needs, what the controls do, which
side quests exist, which build to run, where the collectibles are, which ending
needs what.

Three things are missing, and each is a group of sections rather than a
section:

1. **攻略 Guides** — the fifteen lists above, of which `guides` and
   `builds_and_mods` are a partial and badly-named start.
2. **劇情 Story** — the record of *what happens*. 解析 Analysis already exists
   and holds what it *means*; there is nowhere to write the plot itself.
3. **待辦 Todo** — what to play next in this game, in four ordered buckets.

All three are notes-shaped: rows in the existing `note` table, declared in the
`app/utils/note_sections.py` registry. None of them needs a schema change.

## What this is not

- **Not a new nesting level.** The registry has exactly two display levels —
  `NOTE_GROUPS` (a card) and `NOTE_SECTIONS` (a list inside it). Everything
  here fits, including the four Todo buckets (Decision 1).
- **Not a new shape.** Every section below uses one of `text`, `text_links`,
  `episode_text` or `name_entries`, all of which already have a renderer in
  `frontend/src/pages/notes/NotesTemplate.jsx`. There is no frontend component
  work in this change.
- **Not a widening to other media types.** All twenty-six sections are
  `owners=("game",)` (Decision 3). A TV show plausibly has a timeline too;
  widening `owners` later is one tuple edit and no migration, which is exactly
  why it is not being decided now.
- **Not a spoiler gate.** The 劇情 card is a wall of spoilers and the site has
  no mechanism to hide it from a viewer who has not finished the game. The
  group label and the collapsible card are all today's UI offers. Recorded as
  an open item, not built here.
- **Not a reorder or move UI.** Moving a Todo item between buckets is a `PATCH`
  of `note.section`, which the API already accepts; `/api/notes/reorder`
  likewise exists with no caller. Both are pre-existing gaps and stay that way.

## Decisions

### Decision 1 — the four Todo buckets are four sections, not one section with a dropdown

A single `todo` section whose `kind` is 現在進行/接下來/未來/可能 would be less
registry surface, and it is what the codebase does elsewhere
(`highlights`, `builds_and_mods`). It was rejected because **ordering is
per-section**: `sort_index` orders rows within one `(owner, section)` pair, and
`PATCH /api/notes/reorder` rewrites it as `0,1,2…` across the whole section. A
kind-tagged single section therefore cannot order items *within* a bucket
without teaching the reorder endpoint about kinds.

Four sections give ordering within a bucket for free and grouping for free —
the group card is what holds them together visually. The cost is that moving an
item between buckets changes `section` rather than `kind`; the API already
allows that (`NoteBase.section` is settable and `NoteUpdate` inherits it), so
the cost is a UI affordance that does not exist for either shape today.

### Decision 2 — `guides` and `builds_and_mods` are retired, their rows migrated

Three options were weighed: relabel in place, split `builds_and_mods` only, or
retire both and migrate. Retire-and-migrate was chosen: the final key names
should describe the final sections, and a key called `builds_and_mods` holding
builds, mods *and* tools in a group where each of those is its own section is
the kind of name that stays wrong forever because renaming it later is the same
migration as renaming it now.

Both sections are `owners=("game",)`, so retiring them removes nothing from any
other owner type.

### Decision 3 — all three groups are game-only

攻略's sections are meaningless elsewhere (屬性&配點 for a novel). 劇情 and 待辦
are not — a TV show has lore, and "what to watch next" is a tracker-wide idea —
but a narrower change is the one that can be widened by a one-tuple edit, and
the wider one cannot be narrowed again once rows exist under other owners.

### Decision 4 — the third group is called 待辦 Todo, not 進度 Progress

`frontend/src/pages/detail/Game.jsx:499` already renders `<Slip
title="Progress">` (playtime and achievements, via `GameProgress`). A second
card on the same page also called Progress is the `resources` /
`builds_and_mods` collision again, which CLAUDE.md records as a rule. The group
*is* the todo list, so 待辦 Todo names it accurately and collides with nothing.

## Structure

### Groups

`NOTE_GROUPS` in `app/utils/note_sections.py` gains three entries:

| Key | Label | Icon |
| --- | --- | --- |
| `guides` | 攻略 Guides | `fa-map` |
| `story` | 劇情 Story | `fa-book-open` |
| `todo` | 待辦 Todo | `fa-list-check` |

**The group key `guides` is only free because the section `guides` is retired
in the same change.** Group keys and section keys are separate dicts
(`_GROUPS_BY_KEY` and `_BY_KEY`), so they *could* coexist — `analysis_group` is
keyed that way precisely to avoid making a reader work that out. Here the
collision is removed rather than dodged, and the registry carries a comment
saying so.

### Card order

`splitBlocks` in `NotesTemplate.jsx` builds one group per section as it walks
the registry, and the page renders the flat Notes card, then every group card
in **first-appearance order**, then the standalone cards. Card placement is
therefore decided entirely by where a group's first section sits in
`NOTE_SECTIONS`.

All three runs go immediately after `symmetry`, the last `analysis_group`
section. The resulting card order is:

    Notes → 評論 Reviews → 解析 Analysis → 攻略 Guides → 劇情 Story
          → 待辦 Todo → 音樂 Music → 名言/梗 Quotes and Memes
          → Resources → Questions

Sections sharing a group are kept adjacent in the registry, as the existing
runs are — the page no longer requires it, but adjacency is what lets a reader
see a group whole.

## 攻略 Guides — fifteen sections

All `scope=SCOPE_CATALOG`, all `owners=("game",)`, none with a locator.

| Key | Label | Shape | Kinds |
| --- | --- | --- | --- |
| `beginner` | 新手 Beginner | text_links | — |
| `controls` | 操作 Controls | text_links | — |
| `trivia` | 小知識 Trivia | text_links | — |
| `side_quests` | 支線任務列表 Side Quests | name_entries | — |
| `builds_and_styles` | 配裝&流派 Builds & Styles | name_entries | — |
| `stats_and_points` | 屬性&配點 Stats & Points | text_links | — |
| `skills` | 技能 Skills | name_entries | — |
| `collectibles` | 收集物 Collectibles | name_entries | — |
| `items` | 道具 Items | name_entries | — |
| `weapons_and_gear` | 武器&裝備 Weapons & Gear | name_entries | — |
| `characters_guide` | 角色 Characters | name_entries | — |
| `enemies` | 敵人 Enemies | name_entries | — |
| `endings` | 結局 Endings | name_entries | — |
| `mods_and_tools` | 模組&工具 Mods & Tools | name_entries | `Mod`, `Tool` |
| `guide_resources` | 攻略資源 Guide Resources | name_entries | — |

Notes on three of them:

- **`mods_and_tools` was not in the original list of fourteen.** It exists
  because `builds_and_mods`'s `Mod` and `Tool` rows need a home and a mod is not
  a guide. It keeps a two-value `kinds` dropdown for the same reason the old
  section had a three-value one: the two are the same shape and folding them
  into one section with a tag is cheaper than two near-identical sections.
- **`characters_guide`, not `characters`.** A `character` table and a
  `/character/:id` detail page already exist; a bare `characters` note section
  key would read as related to them and is not.
- **`guide_resources` is the old `guides`** — the pointer to somebody else's
  walkthrough, which is what that section has always held now that the
  fourteen sections above cover the content itself.

`name_entries` carries a title and an ordered list of text lines and labelled
links, which is the right shape for "one named thing and what I know about it"
— a quest, a build, a boss, an ending. `text_links` carries a body and its
sources, which is the right shape for advice that is not a list of named
things. Neither shape renders a locator, so "which area" is written as an entry
line rather than a field; adding a locator to `name_entries` would be a
frontend change for no gain here.

## 劇情 Story — seven sections

All `scope=SCOPE_CATALOG`, all `owners=("game",)`.

| Key | Label | Shape | Locator | Locator required |
| --- | --- | --- | --- | --- |
| `main_plot` | 主線劇情 Main Plot | episode_text | "Chapter / Part, e.g. Ch 3" | no |
| `side_plot` | 支線劇情 Side Stories | episode_text | "Chapter / Part, e.g. Ch 3" | no |
| `character_arcs` | 角色劇情 Character Arcs | text_links | — | — |
| `lore` | 世界觀&設定 Lore | text_links | — | — |
| `timeline` | 時間線 Timeline | text | — | — |
| `mysteries` | 未解之謎 Mysteries | text_links | — | — |
| `story_other` | 其他 Other | text_links | — | — |

The two plot sections are `episode_text` because a plot beat belongs to a
chapter; the locator is **not** required, because a beat remembered without its
chapter number is still worth writing down. That is the opposite of
`episode_comments` and `highlight_moments`, which are required — a comment on
nothing in particular is not a per-chapter comment, but a plot note with no
chapter is still a plot note.

`timeline` is plain `text` deliberately: it is one ordered list of dated
events, and every row wanting a link would mean it should have been
`text_links`. If that turns out to be wrong it is a one-word registry edit.

劇情 is the record of *what happens*; 解析 Analysis, which already exists as its
own group directly above, is the record of what it means. Keeping them apart is
why `story_other` exists — a stray observation lands there rather than
drifting into Analysis.

## 待辦 Todo — four sections

All `scope=SCOPE_PERSONAL`, all `owners=("game",)`, shape `text_links`.

| Key | Label |
| --- | --- |
| `todo_now` | 現在進行 Doing now |
| `todo_next` | 接下來 To do next |
| `todo_later` | 未來 To do in the future |
| `todo_maybe` | 可能 Might do |

`text_links` rather than `text` so an item can carry the guide link that
prompted it. Personal scope because a backlog is one person's: a catalogue-scope
todo list would be admin-written and read by every viewer, which is not what a
todo list is. Personal scope also means writes need `self.personal_notes` and
reads filter on `author_id`, both of which the router already does from
`section.scope`.

**Where the card renders.** The 待辦 card appears with the other note cards, at
`Game.jsx:669`, roughly 170 lines of JSX below the Progress slip at 499 —
both in the right-hand column. Rendering it beside Progress would require the
page to name section keys, which the codebase treats as a narrow documented
exception (`hideSections` is the only one today, and it exists because `remark`
would otherwise render twice). The distance is accepted; this is a note about
the state of the page, not a deferred task.

## Migration

One Alembic revision, data only, no schema change. Three `UPDATE`s on `note`:

| From | To | Kind |
| --- | --- | --- |
| `section = 'guides'` | `section = 'guide_resources'` | unchanged (always null) |
| `section = 'builds_and_mods'` AND `kind = 'Build'` | `section = 'builds_and_styles'` | set to `NULL` |
| `section = 'builds_and_mods'` AND (`kind` IN ('Mod','Tool') OR `kind` IS NULL) | `section = 'mods_and_tools'` | unchanged |

**A `builds_and_mods` row with a null kind goes to `builds_and_styles`,** not
`mods_and_tools` — a row entered without choosing a kind is far more likely to
be a build than a tool, since builds are what that section was mostly used for.
The `kind = NULL` clause on the Build arm matters: `builds_and_styles` declares
no `kinds`, so a surviving `kind = 'Build'` would fail
`validate_note_payload` check 5 on the next edit of that row.

Downgrade reverses all three, restoring `kind = 'Build'` for every row in
`builds_and_styles`. That is lossy in one direction only — a build row created
*after* the migration also gets `kind = 'Build'` on downgrade, which is
correct, because that is the value the old section would have held.

**Back up to Google Sheets immediately after migrating.** A sheet written
before this change still holds `guides` and `builds_and_mods` in its section
column, and Pull writes rows without running `validate_note_payload` — pulling
an old sheet would reintroduce rows whose section key no longer exists in the
registry, which the notes page silently drops.

## Testing

- `tests/unit/test_game_note_sections.py` is rewritten: it asserts the two
  retired keys today (lines 16–25). The replacement asserts the new group
  membership, the fifteen + seven + four keys, and that `guides` and
  `builds_and_mods` are **absent** from the registry.
- The existing registry invariant tests (scope is never None for a stored
  shape; `group` and `standalone` are never both set) cover the twenty-six new
  entries without change — confirm they are parameterised over `NOTE_SECTIONS`
  rather than over a hardcoded list.
- One API test that a `todo_now` row written by user A is absent from user B's
  `GET /api/notes`, and that a `beginner` row is present for both. **The
  refusal half needs a second user actually created**, per the CLAUDE.md rule:
  an author filter on a database holding one user's rows passes whether or not
  the filter is applied.
- A migration test asserting the three `UPDATE` arms, including the null-kind
  row landing in `builds_and_styles` and its `kind` being cleared on the Build
  arm.

## Documentation

Changed in the same commit as the code, `Last verified` bumped:

- `docs/systems/notes.md` — the Groups table, the Section registry table, and
  the Rules table (the `builds_and_mods`-is-not-`resources` rule goes).
- `docs/options.md` — line 240 (the `builds_and_mods` row) and the rationale
  paragraph at 267.
- `docs/entry-types.md` — the per-type section matrix at 280 and the prose at
  290, which says "Game's three own sections".
- `docs/frontend/components.md` — line 231, which names the two game-only
  sections as the `name_entries` users.
- `docs/frontend/pages.md` — line 608, same claim.

The `builds_and_mods`-is-not-`resources` rationale is stated in at least four
of those files. Per CLAUDE.md, grep the claim rather than editing the file in
front of you: a claim worth stating once is usually stated twice.

## Open items

- **No spoiler gate on 劇情.** Out of scope here; it belongs with the
  authorization redesign, where content labels and field groups already live.
- **No UI for moving a Todo item between buckets**, and no reorder UI for any
  section. Both are pre-existing.
- **`owners` is game-only for all three groups.** Widening 劇情 or 待辦 to other
  media types is a one-tuple edit per section and no migration.
