# System Options Redesign — Design Spec

**Date:** 2026-08-29
**Status:** Approved (pending implementation plan)

---

## Context

Every dynamic choice list in the app is a row in one table:

```
system_options
  id            Integer PK
  category      String   -- "Studio", "Director", "Genre Main", ...
  option_value  String
```

Nothing references it. `anime.director`, `anime.studio`, `manga.author_plot`,
`comic.writer` and eighteen other columns are plain `String`s holding
comma-joined names. The table is a **dropdown suggestion list**, not a
constraint: `extract_system_options_from_*` scans entries and back-fills any
value it has not seen, and no writer is ever required to pick from the list.

Four problems follow from that shape.

1. **It collapses three different kinds of value into one.** `Airing Status`
   (code branches on the exact string), `Genre Sub` (only humans read it) and
   `Director` (a person with a face, a rating and a career) are all
   `(category, value)` rows today.
2. **Per-consumer duplication.** The same vocabulary is split into separate
   categories per media type: `TV Show Official Source` / `Cartoon Official
   Source`, `Region (TV Show)` / `Region (Manga)`, and TW distributors split
   three ways across `Distributor TW`, `Manga Publisher TW` and `Novel
   Publisher TW` — 東立 and 尖端 live in three unconnected lists.
3. **Staff cannot grow attributes.** Directors and seiyuu need multilingual
   names, a rating, a photo and a remark; seiyuu additionally link to
   characters. A flat `(category, value)` string cannot hold any of it.
4. **No integrity anywhere.** There is no unique constraint on
   `(category, option_value)`, so duplicates are possible; renaming an option
   leaves every entry holding the old string; deleting one silently orphans
   values.

### Findings from the current data

Established while designing, and each one shapes a decision below:

- **`Studio` is unambiguous.** `anime.studio`, `anime_movie.studio` and
  `manga.anime_studio` all read category `Studio` and all mean "anime
  production studio."
- **`manga.anime_studio` is not a credit of the manga** — it points at the
  studio that adapted it. Out of scope here (see [Out of Scope](#out-of-scope)).
- **`anime.seiyuu` is not a cast list.** It is a `Need`/`Done` status column
  tracking whether the seiyuu work has been done for that entry. It is
  untouched by this work.
- **`TV Official Source` ≠ `TV Show Official Source`.**
  `options_extraction.py:_TV_SHOW_OPTION_FIELD_MAP` writes `"TV Official
  Source"`; `docs/options.md` documents `TV Show Official Source`; and no
  `optionsCategory` in `fieldMeta.js` reads either. Extracted values land in a
  category nothing displays. `Cartoon Official Source` and `Movie Franchise for
  Filter` have the same problem.
- **`Dub Preference` is used nowhere** — no service, no form, no column. It
  exists only in `docs/options.md`.
- **Four categories exist in code but not in the docs**: `Manga Publisher TW`,
  `Novel Author`, `Novel Illustrator`, `Novel Publisher TW`.
- **Every option-backed field is multi-valued in the UI.** All 22 entries with
  an `optionsCategory` in `fieldMeta.js` use `control: "tags"`.
- **`anime.music` is the score composer credit** — a tags input in the Credits
  group, written only by manual entry and Sheets restore. No integration fills
  it.

---

## The Three Tiers

The single table is replaced by three homes, divided by one question:
**does code branch on the exact value?**

### Tier 1 — Closed enums (code, not database)

Values the business logic compares against. `Not Yet Aired` makes Fill skip
`mal_rating`/`mal_rank`; the watching-status filter groups `Completed` with
`Completed (解說)`; `完結` gates the novel volume/chapter checks. If an admin can
rename or delete these, logic breaks silently and no migration catches it.

They stay in `app/utils/constants.py` and are documented in `docs/options.md`,
which remains their canonical reference.

| Enum | Note |
|---|---|
| Watching Status / Reading Status | |
| Airing Status | |
| Airing Type (anime, cartoon) | |
| Franchise Type | |
| My Rating | Reused by `person.my_rating` and `studio.my_rating` |
| Franchise Expectation | |
| Movie Type | |
| Serialization Status | |
| Music Status / Seiyuu Status | |
| Day of Week | |
| Watch Order Step Importance | |
| Note Section Kinds | |
| Media Relation Kinds | Already code-side in `app/utils/relation_kinds.py` |
| **Main / Spinoff** | Moved here from `system_options` |
| **Region** (TV Show, Manga) | Moved here from `system_options` |

`Dub Preference` is **dropped entirely** — from the table, from
`docs/options.md`, and it becomes no column anywhere.

### Tier 2 — Open vocabularies (`system_option`)

Values only humans read. Nothing in the code compares against them, so they are
safe to add, rename and reorder at will.

| Category | Scopes |
|---|---|
| `Genre Main` | — |
| `Genre Sub` | — |
| `Official Source` | `tv_show`, `cartoon`, `movie` — merges two categories |
| `Franchise for Filter` | `movie`, `tv_show` — merges two lists |
| `Publisher / Distributor TW` | `anime`, `manga`, `novel`, `comic` — merges three categories |
| `Comic Publisher` | `comic` |
| `Comic Imprint` | `comic` |
| `Comic Continuity` | `comic` |
| `Comic Era` | `comic` |
| `Comic Event` | `comic` |

Comic Era, Continuity and Event carry more structure in principle (a date range,
an ordering) but are treated as plain vocabularies for now. If they earn columns
later they graduate to Tier 3 the way `person` did.

### Tier 3 — Entities (new tables)

`person`, `person_role`, `studio`, and — designed here, built in a follow-up —
`character`, `character_voice`.

**Net:** twenty categories become ten vocabularies, fifteen code enums and
three entity tables.

---

## The Scope Mechanism

Per-consumer duplication (problem 2) and the anime-vs-non-anime director split
are the same problem. Rather than duplicating a category per consumer, **one
vocabulary holds the values and each value carries the scopes it is offered
in.** A dropdown asks for `category=Official Source, scope=cartoon`. A value
with no scope rows is offered everywhere.

The identical mechanism on the person side is what makes `anime_director` vs
`director` work. It is **explicit, not derived from credits** — otherwise a
newly added director could not appear in any dropdown until their first credit
existed.

---

## Data Model

### `system_option` (replaces `system_options`)

```
system_option
  system_id   UUID    PK, default uuid4, indexed
  category    String  NOT NULL, indexed
  value       String  NOT NULL
  sort_order  Integer NOT NULL DEFAULT 0
  remark      Text    NULL
  created_at / updated_at

  UNIQUE (category, value)          -- uq_system_option_value
```

```
system_option_scope
  option_id  UUID   NOT NULL -> system_option.system_id  ON DELETE CASCADE
  scope      String NOT NULL   -- anime | anime_movie | movie | tv_show
                               -- | cartoon | manga | novel | comic
  UNIQUE (option_id, scope)
```

The integer `id` becomes a UUID `system_id` to match every other table in the
schema.

### `person`

```
person
  system_id    UUID    PK, default uuid4, indexed
  name_native  String  NOT NULL      -- 原文名 (JP/KR/EN as appropriate)
  name_en      String  NULL
  name_cn      String  NULL
  gender       String  NULL
  my_rating    String  NULL          -- Tier 1 My Rating enum
  photo_file   String  NULL          -- GCS key, same convention as cover_image_file
  remark       Text    NULL
  created_at / updated_at

  UNIQUE (name_native, name_en)      -- uq_person_name
```

`gender` lives on the base rather than on a seiyuu extension. Only seiyuu need
it filled today, but gender is a fact about the person, not about the role — a
director has one whether or not it is recorded. Putting it on an extension
would encode a data-entry habit into the schema and force a table move the day
it is wanted elsewhere. The form shows the field only where it matters, which
`fieldMeta.js` already supports.

### `person_role`

```
person_role
  person_id  UUID   NOT NULL -> person.system_id  ON DELETE CASCADE
  role       String NOT NULL   -- director | producer | composer | seiyuu
                               -- | manga_author | novel_author
                               -- | novel_illustrator | comic_writer | comic_artist
  scope      String NULL       -- director: anime | non_anime; NULL = every scope
  UNIQUE (person_id, role, scope)
```

An anime entry's director dropdown asks for `role=director, scope=anime`. The
anime/non-anime split is one row, not a table.

**No role extension tables are built.** With `gender` on the base, no role has a
column of its own today. The base-plus-extensions shape is preserved and an
extension is added when a role earns several columns that are genuinely
meaningless elsewhere — if seiyuu later gains agency, debut year and per-character
stats, `person_seiyuu` is created then and `gender` may move into it as part of
that change.

### `studio`

```
studio
  system_id    UUID    PK, default uuid4, indexed
  name_native  String  NOT NULL
  name_en      String  NULL
  name_cn      String  NULL
  my_rating    String  NULL
  logo_file    String  NULL
  remark       Text    NULL
  created_at / updated_at

  UNIQUE (name_native, name_en)
```

Anime production studios only. Publishers and distributors stay Tier 2 —
they need no profile, and one shared `Publisher / Distributor TW` vocabulary is
what fixes the three-way split.

### `media_credit`

```
media_credit
  system_id   UUID    PK, default uuid4, indexed
  media_type  String  NOT NULL   -- anime | anime_movie | movie | tv_show
                                 -- | cartoon | manga | novel | comic
  entry_id    UUID    NOT NULL
  role        String  NOT NULL   -- from CREDIT_ROLES
  person_id   UUID    NULL -> person.system_id  ON DELETE CASCADE
  studio_id   UUID    NULL -> studio.system_id  ON DELETE CASCADE
  position    Integer NOT NULL DEFAULT 0    -- preserves today's comma order
  remark      Text    NULL

  CHECK (num_nonnulls(person_id, studio_id) = 1)   -- ck_media_credit_one_target
  UNIQUE (media_type, entry_id, role, person_id, studio_id)
  INDEX (media_type, entry_id) / (person_id) / (studio_id)
```

Both endpoints are deliberately FK-less `(media_type, entry_id)` pairs — the
same contract `media_relation` and `watch_order_item` use, because no single
foreign key can span the eight media tables.

### `media_tag`

```
media_tag
  system_id   UUID    PK, default uuid4, indexed
  media_type  String  NOT NULL
  entry_id    UUID    NOT NULL
  field       String  NOT NULL   -- genre_main | genre_sub | source_official
                                 -- | publisher_tw | comic_publisher | comic_imprint
                                 -- | comic_continuity | comic_era | comic_event
  option_id   UUID    NOT NULL -> system_option.system_id  ON DELETE CASCADE
  position    Integer NOT NULL DEFAULT 0

  UNIQUE (media_type, entry_id, field, option_id)
  INDEX (media_type, entry_id) / (option_id)
```

`field` rather than `category` because one category serves several fields
(`publisher_tw` on four media types) and one field maps to exactly one category.
The field → category map lives in code beside `CREDIT_ROLES`.

### `CREDIT_ROLES` (`app/utils/credit_roles.py`)

A code-side vocabulary mirroring the existing `app/utils/relation_kinds.py`
pattern. Each role declares its label, its target kind, which `person_role` it
implies, and which media types may use it.

| Credit role | Target | Source column(s) | Implies `person_role` |
|---|---|---|---|
| `studio` | studio | `anime.studio`, `anime_movie.studio` | — |
| `director` | person | `anime.director`, `anime_movie.director`, `movie.director` | `director` |
| `producer` | person | `anime.producer` | `producer` |
| `composer` | person | `anime.music` | `composer` |
| `manga_author_plot` | person | `manga.author_plot` | `manga_author` |
| `manga_author_draw` | person | `manga.author_draw` | `manga_author` |
| `novel_author` | person | `novel.author` | `novel_author` |
| `novel_illustrator` | person | `novel.illustrator` | `novel_illustrator` |
| `comic_writer` | person | `comic.writer` | `comic_writer` |
| `comic_artist` | person | `comic.artist` | `comic_artist` |

Credit roles and person roles are separate vocabularies because two credits can
imply one role: 原作 and 作画 are distinct credits sharing a single dropdown,
exactly as today's one `Manga Author` category behaves.

Director scope is derived from the media type on write: `anime` and
`anime_movie` credits imply `scope=anime`, everything else `non_anime`.

### One shape, not two

Everything an entry references becomes a link row. No nullable FK columns on
entry tables, no partial unique indexes keyed to a role list baked into a
migration.

The alternative — single-valued fields as a plain FK column, multi-valued as a
link row — was considered and rejected: all 22 option-backed fields are already
`control: "tags"` in the UI, and of the fields checked only `comic.publisher`,
`comic.imprint` and `comic.events` are plausibly single-valued. Where a field
should hold one value, the service layer enforces it and the form uses a
single-select. That is a UI and validation concern, not a schema one.

---

## Columns Removed

All 22 migrate into `media_credit` / `media_tag` and are then dropped.

| Table | Credit columns | Tag columns |
|---|---|---|
| `anime` | `studio`, `director`, `producer`, `music` | `distributor_tw`, `genre_main`, `genre_sub` |
| `anime_movie` | `studio`, `director` | — |
| `movie` | `director` | — |
| `tv_show` | — | `source_official` |
| `cartoon` | — | `source_official` |
| `manga` | `author_plot`, `author_draw` | `publisher_tw` |
| `novel` | `author`, `illustrator` | `publisher_tw` |
| `comic` | `writer`, `artist` | `publisher`, `imprint`, `continuity`, `era`, `events`, `publisher_tw` |

`anime.seiyuu` is **not** in this list — it is a `Need`/`Done` status column,
not a cast list.

---

## Migration

Per column: split on comma → trim → dedupe case-insensitively → upsert a
`person` / `studio` / `system_option` row keyed on the trimmed name → write the
link row with `position` taken from the comma order → derive `person_role` rows
from the credits created, with director scope from the source table.

Category merges happen in the same pass: `TV Show Official Source` +
`Cartoon Official Source` + `TV Official Source` → one `Official Source`
vocabulary with scope rows; `Distributor TW` + `Manga Publisher TW` +
`Novel Publisher TW` → one `Publisher / Distributor TW`; the two
franchise-filter lists → one `Franchise for Filter`.

The migration **reports rather than guesses**. Anything it cannot place —
empty fragments, values differing only by whitespace or full-width/half-width
form — is logged with its owner id and original value and left for manual
placement, the posture `note_backfill_rows` took with 回顧/其他.

Spelling variants will produce duplicate people (`新海誠` vs `新海 誠`). That is
expected and handled by the merge action below, not by the migration guessing.

---

## Deletion and Merge

**Delete cascades.** Removing a `person`, `studio` or `system_option` removes
its link rows. Fast and simple; the cost is that the record of which entries
they were attached to is gone.

**Merge is the tool for duplicates**, and is a separate operation:
`POST /api/person/{id}/merge` repoints every `media_credit` and `person_role`
from the losing row onto the survivor, then deletes the loser. Because delete
cascades, merge — not delete — is the correct response to a duplicate, and the
duplicate-people check below is what makes duplicates findable.

---

## API

| Router | Change |
|---|---|
| `/api/constants` | **New.** Read-only; serves the Tier 1 enums from `app/utils/constants.py` so the frontend stops keeping its own copies (`frontend/src/config/weekdays.js` and the hardcoded status lists). |
| `/api/options` | Keeps CRUD. Reads gain `?scope=`; writes gain `sort_order`, `remark` and scope rows. Add and update enforce `UNIQUE (category, value)`. |
| `/api/person` | **New.** CRUD, `?role=&scope=` for scoped dropdowns, `POST /{id}/merge`, photo upload reusing the existing GCS path. |
| `/api/studio` | **New.** Same shape, no role filter. |
| `/api/credits` | **New.** Read and replace an entry's credits and tags as one payload, matching how the entry forms already submit. |

---

## Pipelines

- **`options_extraction.py` is rewritten, not extended.** Its six near-identical
  per-media-type functions become one table-driven pass over `CREDIT_ROLES` and
  the field → category map, targeting `person` / `studio` / `system_option` plus
  link rows. The `TV Official Source` mismatch is fixed here.
- **Fill / Pull** resolve incoming names (Tenrai studios, TMDB directors, Comic
  Vine writers) to `person` / `studio` rows, creating on miss — the same
  create-if-unseen behavior the Add form already performs.
- **Backup / Restore** gains tabs for `person`, `person_role`, `studio`,
  `system_option`, `system_option_scope`. Entry tabs **keep their comma-joined
  name columns**, generated from the links on backup and resolved back to ids on
  restore, so existing sheets stay readable and unchanged in shape. Restore
  order: entity tabs before entry tabs.
- **Checking** gains a duplicate-people/studio check flagging names that differ
  only by whitespace or full-width/half-width form.

---

## Admin Frontend

The Options page becomes a management area with tabs: **Options / People /
Studios**.

`fieldMeta.js`'s `optionsCategory` becomes a source descriptor —
`{kind: "option", category, scope}` or `{kind: "person", role, scope}` — so the
existing `tags` control keeps working and only its data source changes. Entry
forms are otherwise untouched.

Public detail pages for people and studios ("every anime this director made")
are wanted but deferred; nothing in this design blocks them.

---

## Testing

The migration carries the weight:

- Comma splitting, trimming, and `position` preserving the original order.
- Whitespace and full-width/half-width duplicates surfacing in the report rather
  than being silently merged.
- Category merges producing one vocabulary with correct scope rows.
- A full backup → restore round-trip reconstructing identical links from
  unchanged sheet columns.
- Cascade delete removing link rows; merge repointing them instead.
- Scoped dropdown reads returning only in-scope values, and unscoped values
  appearing everywhere.

---

## Out of Scope

- **`character` and `character_voice`.** Designed below, built in a follow-up
  spec. They touch no existing column, so they land independently.
- **`manga.anime_studio`.** Not a credit of the manga but a pointer at its
  adaptation. It stays a string here; its honest home is a `media_relation`
  `adaptation` row, which already exists.
- **Public person / studio detail pages.**
- **Comic Era / Continuity / Event as structured entities.** Plain vocabularies
  for now.

---

## Designed, Deferred: Character

Recorded here so the follow-up reuses this shape rather than inventing another.

```
character
  system_id     UUID PK
  franchise_id  UUID NULL -> franchise.system_id   -- NULL = standalone
  name_native / name_en / name_cn
  gender        String NULL
  my_rating     String NULL
  photo_file    String NULL
  remark        Text NULL

character_voice
  character_id  UUID NOT NULL -> character.system_id  ON DELETE CASCADE
  person_id     UUID NOT NULL -> person.system_id     -- a seiyuu
  language      String NOT NULL     -- jp | en | zh | ...
  media_type    String NULL         -- NULL = applies across the franchise
  entry_id      UUID   NULL
  UNIQUE (character_id, person_id, language, media_type, entry_id)
```

A character belongs to a franchise, not an entry, so one profile serves every
season and adaptation. Casting lives on `character_voice` with a `language`
dimension for dubs and a nullable entry endpoint — set only when a recast
actually happens.

---

## Documentation

`docs/options.md` is restructured around the three tiers: Tier 1 enums keep
their tables (they remain the canonical reference), Tier 2 gains a scope column,
and the categories that became entities move to a new section pointing at
`docs/database-schema.md`. `Dub Preference` is deleted; `Manga Publisher TW`,
`Novel Author`, `Novel Illustrator` and `Novel Publisher TW` are folded into
their merged homes rather than documented as-is.

`docs/database-schema.md`, `docs/api.md`, `docs/business-logic.md`,
`docs/admin-forms.md` and `docs/integrations.md` all need updates for the new
tables, routers, extraction pass, form sources and restore ordering.
