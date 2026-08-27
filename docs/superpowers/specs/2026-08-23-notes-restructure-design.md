# Notes Restructure — Design

Date: 2026-08-23

## Problem

The `notes` JSONB column exists on the seven media tables and nowhere else. Its
shape is defined entirely in the frontend, by seven
`frontend/src/pages/notes/configs/*.js` files rendered through the 1545-line
`NotesTemplate.jsx`. The backend treats the column as an opaque blob.

Four consequences motivate the change:

1. **No authoritative schema.** The backend cannot validate, query, or migrate
   notes content. A malformed note is stored silently.
2. **Per-type duplication.** The seven configs repeat a common core with small
   drifts, so a change to a shared section means seven edits.
3. **Blob-granular editing.** Editing one bullet rewrites the entry's entire
   `notes` value. Nothing inside notes is queryable across the library.
4. **Entry-only.** Collections, franchises, and series have a `remark` Text
   column but no notes at all, though franchise-level commentary is exactly what
   a franchise page wants.

Quotes and memes already left this structure for their own tables
(`app/models/quote.py`, `app/models/meme.py`). `Meme` in particular established
the polymorphic `owner_type`/`owner_id` pattern spanning all ten tables. This
design applies that same pattern to the rest of notes.

## Approach

One polymorphic `note` table, one row per note item, plus a backend-owned
section registry. Rejected alternatives:

- **Table per shape** (`note_item`, `note_link`, `note_episode`): cleaner column
  semantics, but triples the model/schema/router/frontend code and makes a
  single ordered section list awkward when it spans shapes.
- **Keep JSONB, move the schema definition backend-side**: cheapest, but leaves
  blob-granular editing and non-queryability untouched.

## Section registry

`NOTE_SECTIONS` in `app/utils/note_sections.py`. (This design first said
`app/utils/constants.py`; the registry shipped in a module of its own, which
is the better home — it carries its own dataclass, lookups and helpers.)
One entry per section:

| field                 | meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `key`                 | stable identifier, stored in `note.section`               |
| `shape`               | one of `text`, `text_links`, `episode_text`, `name_links` |
| `label`               | display label; may be overridden per owner type           |
| `owners`              | owner types this section applies to                       |
| `order`               | position in the notes page                                |
| `kinds`               | optional dropdown values for `note.kind`                  |
| `episode_placeholder` | optional, e.g. `Episode(s), e.g. ep 3` vs `Chapter(s), e.g. ch 6` |
| `singleton`           | at most one row per owner (only `remark`)                 |
| `desc_required`       | `content` may not be empty                                |

Adding a section is one registry entry and no migration. Adding a new _shape_ is
rare and costs one nullable column.

### Shapes

| shape          | columns used                                       |
| -------------- | -------------------------------------------------- |
| `text`         | `content`                                          |
| `text_links`   | `content`, `links`, optional `episode`             |
| `episode_text` | `episode`, `content`, `kind` where `kinds` declared |
| `name_links`   | `title`, `links`                                   |

`text_links` carries an optional `episode` because `foreshadowing`, `symmetry`,
and `cinematography` are frequently episode-anchored in practice.

### Vocabulary

23 sections. Keys that look similar across media types are deliberately kept
distinct — the drift is intentional, not accidental.

| key                  | shape          | notes                                          |
| -------------------- | -------------- | ---------------------------------------------- |
| `remark`             | text           | singleton; unrelated to the `remark` Text column |
| `advantages`         | text           |                                                |
| `disadvantages`      | text           |                                                |
| `double_edged`       | text           |                                                |
| `public_reviews`     | text           |                                                |
| `personal_reviews`   | text           |                                                |
| `questions`          | text           |                                                |
| `highlight_passages` | text           | novel only                                     |
| `analysis`           | text_links     |                                                |
| `cinematography`     | text_links     |                                                |
| `craft`              | text_links     | novel only                                     |
| `foreshadowing`      | text_links     |                                                |
| `symmetry`           | text_links     |                                                |
| `adaptation`         | text_links     | `desc_required` on anime, anime_movie, novel   |
| `episode_comments`   | episode_text   |                                                |
| `highlights`         | episode_text   | anime only; kinds below                        |
| `highlight_episodes` | episode_text   | tv_show, cartoon, manga                        |
| `op_ed_changes`      | episode_text   | kinds below                                    |
| `extended_episodes`  | episode_text   | no dropdown; the section is the kind           |
| `resources`          | name_links     |                                                |
| `unread`             | name_links     |                                                |
| `quotes`             | external table | entry-only, backed by `quote`                  |
| `memes`              | external table | all ten owners, backed by `meme`               |

`op_ed_changes` kinds: `變化OP`, `變化ED`, `無OP`, `無ED`, `特殊OP`, `特殊ED`.

`highlights` kinds: `神回`, `神篇章`. (This design first said `op_ed_changes`
was the only section carrying kinds. The real data distinguishes a great
episode from a great arc, so `highlights` gained a dropdown too — its
siblings `highlight_episodes` and `highlight_passages` still have none.)

The former `special_changes` (anime) and `special_episodes` (tv/cartoon)
sections are retired and split into `op_ed_changes` + `extended_episodes`. The
kinds `回顧` and `其他` are dropped from the vocabulary; they were selectable
dropdown values believed to be unused.

Labels come from the existing configs, normalized to the ASCII solidus (`/`)
where the configs disagree between `／` and `/`.

### Applicability

Media entries keep exactly the sections they have today, minus the retired
`special_*` keys and plus the two that replace them.

| owner                | sections                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anime`              | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, episode_comments, highlights, analysis, cinematography, foreshadowing, symmetry, op_ed_changes, extended_episodes, adaptation, resources, unread, questions, quotes, memes |
| `anime_movie`        | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, analysis, cinematography, foreshadowing, symmetry, adaptation, resources, unread, questions, quotes, memes                                    |
| `movie`              | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, analysis, resources, unread, questions, quotes, memes                                                                                          |
| `tv_show`, `cartoon` | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, episode_comments, highlight_episodes, analysis, cinematography, foreshadowing, symmetry, op_ed_changes, extended_episodes, adaptation, resources, unread, questions, quotes, memes |
| `manga`              | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, highlight_episodes, analysis, cinematography, foreshadowing, symmetry, resources, unread, questions, quotes, memes                             |
| `novel`              | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, highlight_passages, analysis, craft, foreshadowing, symmetry, adaptation, resources, unread, questions, quotes, memes                          |
| `series`             | remark, advantages, disadvantages, double_edged, public_reviews, personal_reviews, questions, analysis, cinematography, foreshadowing, symmetry, adaptation, resources, unread, memes                                             |
| `franchise`          | as `series`, minus cinematography                                                                                                                                                                                                |
| `collection`         | remark, public_reviews, personal_reviews, analysis, questions, resources, unread, memes                                                                                                                                           |

Two exclusions are deliberate:

- Episode-anchored sections stop at the entry. A `note` row carries `episode`
  but no way to name _which_ entry that episode belongs to, so a
  franchise-level 神回 would be ambiguous.
- `quotes` stays entry-only because `Quote` is entry-only by design; a quote is
  said in a specific work. `Meme` already spans all ten owners.

## Data model

`app/models/note.py`, following `Meme`'s conventions — FK-less polymorphic
owner, and declaration order doubling as Google Sheets column order.

```
note
  system_id     UUID PK
  owner_type    String, indexed      -- one of OWNER_TYPE_KEYS
  owner_id      UUID, indexed        -- FK-less, resolved via media_resolver
  section       String, indexed
  episode       String
  kind          String
  title         String
  content       Text
  links         JSONB                -- list of URLs
  sort_index    Float
  created_at / updated_at
```

Composite index on `(owner_type, owner_id, section)` — the only read path the
notes page uses.

A deleted owner leaves rows whose owner resolves to `missing=True` via
`app/utils/media_resolver.py`, consistent with `quote` and `meme`.

## Validation

Enforced in the schema layer, driven by the registry:

- `section` must be a known registry key.
- The section's `owners` must include the row's `owner_type`.
- `kind` must be one of the section's `kinds`, or absent when none are declared.
- A `singleton` section rejects a second row for the same owner.
- `desc_required` sections reject empty `content`.

A violation is a 422, not a silently stored value.

## API

`app/routers/note.py`, following `app/routers/meme.py`.

| endpoint                            | auth  | purpose                                     |
| ----------------------------------- | ----- | ------------------------------------------- |
| `GET /api/notes/sections?owner_type=` | guest | registry filtered to that owner type        |
| `GET /api/notes?owner_type=&owner_id=` | guest | rows for one owner, registry-ordered        |
| `POST /api/notes`                   | admin | create one row                              |
| `PATCH /api/notes/{system_id}`      | admin | update one row                              |
| `DELETE /api/notes/{system_id}`     | admin | delete one row                              |
| `PATCH /api/notes/reorder`          | admin | bulk `sort_index` update within one section |

## Registration surface

A new table must be wired into the same places `Meme` is:

- `app/models/__init__.py`
- `app/schemas/note.py`
- `app/routers/note.py` and `app/main.py` (`include_router`)
- `app/services/pipelines/backup.py` (`bulk_overwrite_sheet("Note", ...)`)
- `app/services/pipelines/pull.py` — model map, parser map, tab dispatch, and
  the tab-name list
- `app/utils/data_control_utils.py` — deleted-record display name
- `app/utils/formatter.py` — `parse_note_from_sheet`

Notes therefore get a Google Sheets tab and round-trip through backup/restore
like every other table.

## Migration

One Alembic revision, mirroring
`alembic/versions/w6x7y8z9a0b1_add_meme_table.py`.

The stored item shapes differ more than the configs suggest; the mapping is:

| current type        | stored JSONB                        | → `note` row                             |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| `remark`            | bare string                         | `content`, one row                       |
| `string_list`       | list of strings                     | `content`, one row each                  |
| `desc_links`        | `{description, links: []}`          | `content` + `links`                      |
| `name_link`         | `{name, link}` — single link        | `title` + `links: [link]`                |
| `episode_entry`     | `{episodes, type, description}`     | `episode` + `kind` + `content`           |
| `episode_type_desc` | `{episode, type, description}`      | `episode` + `kind` + `content`           |
| `episode_comments`  | object map `{"ep 1": "comment"}`    | `episode` + `content`, one row per key   |

Steps:

1. Create `note` and its indexes.
2. Walk the seven media tables and expand each row's `notes` per the table above.
3. Split `special_changes` / `special_episodes` by `type`: `加長` →
   `extended_episodes` with `kind` cleared; OP/ED kinds → `op_ed_changes`, with
   `特別` normalized to `特殊`. Any other value is **logged with its owner id and
   content, not dropped**, producing a list to place by hand.
4. Skip residual `quotes` / `memes` keys, which already live in their own
   tables. Log counts to confirm they are dead.
5. Drop the `notes` column from the seven media tables.

`downgrade()` folds rows back into a rebuilt `notes` JSONB and drops the table,
matching the quote migration's contract.

### Known lossiness

- `name_link` holds one link; `links` is a list. Widening, so nothing is lost,
  and `resources` gains multi-link support.
- `episode_comments` is a JSONB object with no insertion order preserved.
  Original ordering is not recoverable. The migration assigns `sort_index` by
  natural-sort of the episode string rather than pretending otherwise.

Both are documented in the revision docstring.

## Frontend

`NotesTemplate.jsx` becomes a registry-driven renderer: it fetches
`/api/notes/sections` and `/api/notes`, groups rows by section in registry
order, and dispatches to four shape components — `TextSection`,
`TextLinksSection`, `EpisodeTextSection`, `NameLinksSection` — replacing today's
nine section types.

- Editing is per-row (`POST`/`PATCH`/`DELETE` one row) rather than
  `updateSection` rewriting the whole blob.
- The seven `frontend/src/pages/notes/configs/*.js` files are deleted.
- `NotesTemplate` serves all ten owner types, so collection, franchise, and
  series pages gain a Notes tab wired to the same component.
- `Delete.jsx`'s seven `selectedX.notes?.remark` previews switch to the `remark`
  Text column.

Dropping the column also removes `notes` from every payload path that currently
carries it, since those writes have nowhere to land:

- `frontend/src/lib/payloads.js` — `notes` fields in the franchise and series
  payload builders.
- `frontend/src/pages/admin/Modify.jsx` — the seven `notes: X.notes || {}`
  prefills and the seven `notes: Object.keys(...).length > 0 ? ... : null`
  submit fields.
- `frontend/src/pages/add-tabs/*.jsx` — the "Private notes..." inputs.
- `frontend/src/pages/detail/*.jsx` — `performUpdate({ notes: ... })` calls.
- `app/schemas/*.py` — the `notes` field on all seven media schemas.

Notes are edited only through the notes page and its per-row endpoints; the add
and modify forms no longer touch them.

## Out of scope

The `remark` Text column on every table is untouched. It is a separate field
from the `remark` notes section and keeps its current role.

## Testing

- Registry validation: unknown section, wrong owner type, invalid kind,
  singleton violation, empty `desc_required` content.
- Migration round-trip on a copy of real data: upgrade → downgrade → compare
  against the original `notes` values, allowing for the two documented lossiness
  cases.
- Router CRUD and reorder, following the `meme` router's test conventions.
- Sheets round-trip: backup then pull, confirming row counts match.
