# Notes

Last verified: 2026-08-30 (commit 4339702)

## What this is for

Notes are the structured commentary you attach to anything in the library: a media entry (anime, comic, novel...) or one of the three grouping tiers (collection, franchise, series). Every bullet — an advantage, an episode comment, an OP you still need to find, a link to a resource — is one row in the single `note` table, and a backend registry decides which *sections* exist, which owners they apply to, and what each row may contain. The frontend notes page reads that registry and renders it; it does not know section names itself (with two narrow, documented exceptions). The old per-owner `remark` column is now just one more section, so the same table also feeds the "Remark" field on the Add/Modify forms and detail pages.

## Model

The table lives in `app/models/note.py` (class `Note`, `__tablename__ = "note"`). It is deliberately **one wide table**: every section stores into the same columns and leaves the ones its shape does not use as null. Adding a section is a registry entry, not a migration; adding a *shape* costs one nullable column.

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | UUID PK | Generated with `uuid.uuid4()`. |
| `owner_type` | String, indexed | Hyphenated owner key: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`, `series`, `franchise`, `collection`. Values come from `OWNER_TABLES` in `app/utils/media_resolver.py` (`MEDIA_TABLES` + `TIER_TABLES`). |
| `owner_id` | UUID, indexed | **No foreign key** — it points at whichever of the eleven owner tables `owner_type` names, and one FK cannot span them (same reasoning as `meme.owner_id`). Deleting an owner leaves orphan rows that `media_resolver` flags as missing. |
| `section` | String, indexed | Key of an entry in `NOTE_SECTIONS` (`app/utils/note_sections.py`). |
| `locator` | String | "Where in the work": episode, chapter, scene, timestamp, or source. One free-text column; the section supplies the label and whether it is required. Renamed from `episode` by migration `alembic/versions/l1o2c3a4t5o6_note_episode_to_locator.py`. |
| `kind` | String | First dropdown, only where the section declares `kinds` (highlight type, OP/ED change type, music cut). |
| `status` | String | Second dropdown, only for music sections: Need / Pending / Done. Kept separate from `kind` because one row needs both (which cut it is vs. how far my tracking has got). |
| `title` | String | The name half of a `name_links` row, or the song name in music shapes. |
| `content` | Text | The body. |
| `links` | JSONB | A list of URL strings — always a list, even for shapes that allow one link, so multi-link support needs no migration. |
| `sort_index` | Float | Ordering within one `(owner, section)`. New rows append at `max + 1.0`. |
| `created_at` / `updated_at` | DateTime | Taipei time via `app/database.get_taipei_now`. Nullable — a Pull from a blank sheet cell leaves them None, so `NoteResponse` tolerates that. |

Indexes (declared in `__table_args__`, so `create_all` test databases enforce them too):

| Index | Definition | Why |
| --- | --- | --- |
| `ix_note_owner_section` | `(owner_type, owner_id, section)` | The only read path the notes page uses. |
| `ix_note_one_remark_per_owner` | unique `(owner_type, owner_id)` **WHERE `section = 'remark'`** | Load-bearing: the `remark` read side is a scalar subquery, so a second remark row would make *every read of that owner* raise "more than one row returned by a subquery". Created by `alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`; name and predicate must stay identical. |

Column declaration order is also the Google Sheets column order, because `format_model_for_sheet` in `app/utils/formatter.py` walks `__table__.columns`.

### Shapes

A shape names which columns a section uses. Declared as constants at the top of `app/utils/note_sections.py`; the seven stored ones are collected in `STORED_SHAPES`.

| Shape | Columns used | Rule of thumb |
| --- | --- | --- |
| `text` | `content` | A plain bullet. |
| `text_links` | `content`, `links`, optional `locator` | A body *and* its sources. |
| `text_or_link` | `content` **xor** `links[0]` | Either what someone said or where they said it, never both. |
| `episode_text` | `locator`, `content`, `kind` where declared | Anchored to an episode/chapter. |
| `name_links` | `title`, `links` | A named resource. |
| `episode_name_links` | `locator`, `title`, `content`, `links`, `status` | The widest shape — used only by `insert_songs`. |
| `music_track` | `title`, `kind`, `status`, `links`, `content` | One theme song; the only shape with two dropdowns. |
| `external` | *(none — its own table)* | `quotes` → `quote` table, `memes` → `meme` table. Never a `note` row; `validate_note_payload` rejects writes to it. |

### Groups

Display-only. A grouped section is still an ordinary registry entry; `group` only decides which card it renders inside. Defined in `NOTE_GROUPS` (`app/utils/note_sections.py`).

| Key | Label | Icon |
| --- | --- | --- |
| `reviews` | 評論 Reviews and Comments | `fa-comments` |
| `analysis_group` | 解析 Analysis and Cinematography | `fa-clapperboard` (keyed `analysis_group` because a section already owns `analysis`) |
| `music` | 音樂 Music | `fa-music` |
| `quotes_memes` | 名言/梗 Quotes and Memes | `fa-quote-right` |

### Section registry

`NOTE_SECTIONS` in `app/utils/note_sections.py`, in display order. "All" = all eleven owners (`ALL_OWNERS`); "Entries" = the eight media types (`ENTRY_OWNERS`). Both derive from `media_resolver`, so a new media type joins them automatically.

| Key | Label | Shape | Group / standalone | Owners | Kinds (`kind`) | Statuses | Locator placeholder | Locator req. | Singleton | Content req. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `remark` | 備註 Remark | text | flat | All | — | — | — | no | **yes** | no |
| `advantages` | 優點 Advantages | text | reviews | All | — | — | — | no | no | no |
| `disadvantages` | 缺點 Disadvantages | text | reviews | All | — | — | — | no | no | no |
| `double_edged` | 優缺點 | text | reviews | All | — | — | — | no | no | no |
| `public_reviews` | 大眾評價 Public Reviews | text_or_link | reviews | All | — | — | — | no | no | no |
| `personal_reviews` | 我的評價 Personal Reviews | text | reviews | All | — | — | — | no | no | no |
| `episode_comments` | 各集評論 Episode Comments | text_links | reviews | anime, tv-show, cartoon | — | — | "Episode, e.g. ep 1" | **yes** | no | no |
| `highlights` | 神回/神片段 Highlights | episode_text | flat | anime | 神回, 神片段, 神篇章 | — | "Episode(s), e.g. ep 6" | **yes** | no | no |
| `highlight_episodes` | 神回/神片段 (manga: 神回) | episode_text | flat | tv-show, cartoon, manga | tv-show & cartoon: 神回, 神片段, 神篇章; manga: none | — | "Episode(s), e.g. ep 3" (manga: "Chapter(s), e.g. ch 6") | **yes** | no | no |
| `highlight_passages` | 神片段 | text | flat | novel | — | — | — | no | no | no |
| `analysis` | 解析 Analysis | text_links | analysis_group | All | — | — | — | no | no | no |
| `cinematography` | 分鏡/演出/巧思 | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, series | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `craft` | 巧思 | text_links | analysis_group | novel | — | — | — | no | no | no |
| `foreshadowing` | Foreshadowing | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, novel, series, franchise | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `symmetry` | 對稱 Symmetry | text_links | analysis_group | same as foreshadowing | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `op` | OP | music_track | music | anime | normal, different version, all inclusive version (default `normal`) | Need, Pending, Done | — | no | no | no |
| `ed` | ED | music_track | music | anime | same as `op` | Need, Pending, Done | — | no | no | no |
| `insert_songs` | 插入曲 Insert Song | episode_name_links | music | anime | — | Need, Pending, Done | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `ost` | OST | music_track | music | anime | same as `op` | Need, Pending, Done | — | no | no | no |
| `op_ed_changes` | OP/ED 變動 | episode_text | music | anime, tv-show, cartoon | 變化OP, 變化ED, 無OP, 無ED, 特殊OP, 特殊ED | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `extended_episodes` | 加長 | episode_text | flat | anime, tv-show, cartoon | — | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `adaptation` | 改編 Adaptation | text_links | flat | anime, anime-movie, tv-show, cartoon, novel, series, franchise | — | — | — | no | no | anime, anime-movie, novel |
| `resources` | Resources | name_links | **standalone** | All | — | — | — | no | no | no |
| `questions` | Questions | episode_text | **standalone** | All | — | — | "Source, e.g. ep 3" | no | no | **All** |
| `quotes` | 名言 Quotes | external | quotes_memes | Entries only | — | — | — | — | — | — |
| `memes` | 梗/迷因 Memes | external | quotes_memes | All | — | — | — | — | — | — |

Per-owner overrides (`labels`, `kinds_by_owner`, `locator_placeholders`, `desc_required`) are resolved for one owner by `section_out()` in `app/schemas/note.py` before they reach the frontend, so the page only ever sees a flat `NoteSectionOut`.

Registry helpers (`app/utils/note_sections.py`): `section_by_key`, `sections_for(owner_type)`, `label_for`, `kinds_for`, `locator_for`, `group_by_key`.

## Rules

Design rules baked into the registry:

| Rule | Where it shows |
| --- | --- |
| **Episode-anchored sections stop at entry level.** Anything whose point is a locator (`episode_comments`, `highlights`, `highlight_episodes`, `op_ed_changes`, `extended_episodes`, `insert_songs`) is limited to episodic entries — never series/franchise/collection. `cinematography`, `foreshadowing`, `symmetry` and `adaptation` reach series (and franchise for the last three) because their locator is optional. | `owners` on each entry in `NOTE_SECTIONS`. |
| **`quotes` is entry-only.** A quote is said in a specific work (`ENTRY_OWNERS`; see the docstring in `app/models/quote.py`). | `NOTE_SECTIONS["quotes"]`. |
| **`memes` is allowed on all owners**, because a running gag often spans a franchise; `meme.owner_id` already accepts all eleven. | `NOTE_SECTIONS["memes"]`. |
| **Similar sections are deliberately distinct** (`highlights` vs `highlight_episodes` vs `highlight_passages`; `cinematography` vs `craft`) so they can drift on purpose. | Module docstring of `app/utils/note_sections.py`. |
| **Music sections stay separate** (`op`, `ed`, `insert_songs`, `ost`, `op_ed_changes`) rather than one section with a dropdown, so "which OPs do I still need?" stays a section, not a filter. | Comment above `op` in the registry. |
| `group` and `standalone` are mutually exclusive; a test forbids setting both. | `NoteSection` docstring. |
| `locator_required` is section-wide; `desc_required` is per owner. | `NoteSection` fields. |

### Validation (`validate_note_payload`, `app/schemas/note.py`)

Runs on every POST and on the *merged* row of every PATCH. Raises `ValueError`, which the router turns into **422**. In order:

| # | Check | Message |
| --- | --- | --- |
| 1 | `owner_type` in `OWNER_TABLES` | Unknown owner_type '…'. |
| 2 | `section` is a registry key | Unknown note section '…'. |
| 3 | Section's shape is a stored shape (not `external`) | Section '…' has its own table and is not stored as a note. |
| 4 | Owner type is in the section's `owners` | Section '…' does not apply to owner type '…'. |
| 5 | If `kind` given: section has kinds for this owner, and the value is one of them | Section '…' takes no kind for owner type '…'. / '…' is not a valid kind for section '…'. |
| 6 | If `status` given: section has statuses, and the value is one of them | Section '…' takes no status. / '…' is not a valid status for section '…'. |
| 7 | `desc_required` for this owner ⇒ stripped `content` non-empty | Section '…' requires content. |
| 8 | `locator_required` ⇒ stripped `locator` non-empty | Section '…' requires a locator. |
| 9 | Emptiness, by shape: `name_links` needs content or title or links; `text_or_link` needs content or a non-blank link, forbids both ("takes text or a link, not both"), and allows at most one link ("takes one link per note"); `episode_text` needs content or locator; `episode_name_links` needs any of content/locator/title/status/links; `music_track` allows at most one link and needs any of content/title/status/links (kind alone never counts, since it defaults to `normal`); every other shape needs content or links | Section '…' note is empty. |

Singleton uniqueness is **not** here — it needs a query, so `_reject_second_singleton` in `app/routers/note.py` does it (422 "This owner already has a 'remark' note.").

### Viewer visibility

`GET /api/notes` applies the RBAC layer:

- If the owner is a media entry and `entry_visible()` (`app/services/rbac/enforcement.py`) says the viewer may not see it, the endpoint answers **404 "Owner not found."** rather than an empty list. Grouping tiers carry no labels, so they skip this check.
- `gated_note_sections(viewer)` (`app/services/rbac/field_gate.py`) returns section keys the viewer is not entitled to; those rows are simply **absent** from the response (an empty card would advertise that there is something to not-see). Today the only field group naming a note section is `personal_notes` → `personal_reviews` (`app/services/rbac/field_groups.py`).
- `GET /api/notes/sections` is *not* filtered: withheld sections still appear in the registry, they just never have rows.

## API

Router: `app/routers/note.py`, prefix `/api/notes`. Thin fetch wrappers on the frontend: `frontend/src/pages/notes/api.js`.

| Method | Path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notes/sections` | public | `?owner_type=` | `List[NoteSectionOut]` — registry resolved for that owner, display order | 400 unknown owner_type |
| GET | `/api/notes` | public (viewer-aware) | `?owner_type=&owner_id=` | `List[NoteResponse]`, sorted by registry position then `sort_index` (`_ordered`) | 400 unknown owner_type; 404 owner not visible |
| POST | `/api/notes` | admin | body `NoteCreate` (`owner_type`, `owner_id`, `section`, `locator`, `kind`, `status`, `title`, `content`, `links`, `sort_index`) | 201 `NoteResponse`; `sort_index` defaults to last-in-section + 1 | 422 validation / second singleton |
| PATCH | `/api/notes/reorder` | admin | body `NoteReorder` `{owner_type, owner_id, section, ordered_ids}` | `{"status":"success","reordered":n}`; rewrites `sort_index` as 0,1,2… | 400 unknown owner_type / unknown section / `ordered_ids` not exactly the section's rows |
| PATCH | `/api/notes/{note_id}` | admin | body `NoteUpdate` (partial; `exclude_unset`) | `NoteResponse` | 404; 422 — the merged row (current values + patch, built from `NoteUpdate.model_fields`) is validated **before** mutation so autoflush never writes a bad row. A PATCH may move a note to another owner. |
| DELETE | `/api/notes/{note_id}` | admin | — | 204 | 404. Audited via `log_deleted_record(db, note, "Note")` (`app/utils/data_control_utils.py`). |

`/reorder` is declared before `/{note_id}` on purpose (FastAPI matches in order). No frontend calls it yet; it is intentional surface kept for a future reorder UI and covered by tests — do not delete as unused.

## UI

### NotesTemplate

`frontend/src/pages/notes/NotesTemplate.jsx` is the notes page for every owner type. It takes `ownerType`, `ownerId`, `isAdmin`, `hideSections`. Eleven thin wrappers under `frontend/src/pages/detail/*Notes.jsx` (e.g. `AnimeNotes.jsx`, `ComicNotes.jsx`, `FranchiseNotes.jsx`) fix the owner type and forward the rest.

| Behaviour | How |
| --- | --- |
| Loads registry + rows in parallel (`fetchSections`, `fetchNotes`), then refetches only rows after a mutation; the registry is static for the session. | `useEffect` / `reloadNotes`. |
| Dispatches on `section.shape` via the `SHAPES` map (7 stored shapes → components). `external` shapes dispatch on **section key** via `EXTERNAL_SHAPES` (`quotes` → `QuoteSection`, `memes` → `MemeSection`) — the first of two scoped exceptions to "the frontend never names sections". An external key with no component renders null. | `renderSection`. |
| `splitBlocks()` splits the registry into `flat` (ungrouped, non-standalone), `groups` (one card per group key, registry order), `standalone`. | `splitBlocks`. |
| The **Notes card** holds the flat sections and **renders only when ≥1 flat section is visible** (`flat.length > 0`). A comic with `remark` hidden has no flat section, so no empty headed card. | JSX near the bottom. |
| Each group renders as its own `GroupCard` *beside* Notes (Music is a peer of Notes, not inside it). Standalone sections (`resources`, `questions`) render lifted out with no wrapper — every shape component already draws its own `SectionCard`. | Same. |
| **Collapse-when-empty**: `GroupCard` starts collapsed when `count === 0` (`useCollapsed` in `sections/ui.jsx`); the user can toggle it. Notes card wears the same chrome but `showCount={false}`. External sections report their row count via `onCount`; while any is still `null` the card counts as unknown and stays open. | `blockCount`, `reporterFor`. |
| `hideSections` — the second scoped exception — lets an embedding page suppress sections it renders itself. Detail pages pass `hideSections={entry.remark ? ["remark"] : []}` (e.g. `frontend/src/pages/detail/Comic.jsx`, `Cartoon.jsx`, `AnimeMovie.jsx`) because they keep a dedicated remark editor writing the *same* singleton row; two editors on one row means the form's stale state would revert or delete what was typed in the notes box. | `visibleSections` memo. |
| Errors from any card show in one banner above all cards (a group card is a sibling of Notes, so an error must not report inside the wrong one). | `error` state. |

### Section components (`frontend/src/pages/notes/sections/`)

| Component | Shape | Fields it shows |
| --- | --- | --- |
| `TextSection.jsx` | text | content |
| `TextLinksSection.jsx` | text_links | locator (only if the section has a `locator_placeholder`), content, links; enforces `desc_required` / `locator_required` client-side |
| `TextOrLinkSection.jsx` (+ `textOrLink.js`) | text_or_link | content xor one link |
| `EpisodeTextSection.jsx` | episode_text | locator, kind dropdown when `kinds` non-empty, content |
| `NameLinksSection.jsx` | name_links | title, links |
| `EpisodeNameLinksSection.jsx` | episode_name_links | locator, title, content, links, status |
| `MusicTrackSection.jsx` | music_track | title, kind (starts on `default_kind`), status, link, content |
| `QuoteSection.jsx` / `MemeSection.jsx` | external | adapt the long-lived quote/meme components; report counts |
| `ui.jsx` | — | `GroupCard`, `SectionCard`, `ItemActions`, `useCollapsed`, shared classes |

### Remark as a note

| Piece | Where |
| --- | --- |
| The `remark` column is **dropped** from all eleven owner tables (`alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`). | migration |
| Read side: each owner model gets a read-only `column_property` — a correlated scalar subquery selecting `note.content` where `section = 'remark'` for that owner — attached at the bottom of `app/models/__init__.py` (`_REMARK_OWNERS` loop). It reads like a plain column in response schemas, detail pages, `Delete.jsx` previews and `find_all_remarks`; assigning to it raises. | `app/models/__init__.py` |
| `remark` stays on every owner's Pydantic Base schema, so the Add form, Modify form and hub `RemarkModal` still send a plain string to the owner's own endpoint. | `app/schemas/*` |
| Write side: `pop_remark(data)` splits `remark` out of the payload and returns `(rest, value, was_present)`; `upsert_remark(db, owner_type, owner_id, text)` creates/updates the singleton row, or **deletes it when the text is empty or whitespace**. Absent ≠ None: a PATCH that never mentions `remark` leaves the row alone; a PUT/PATCH that sends null clears it. Called from the create/update/patch handlers in `app/routers/_factory.py` and from `collection.py`, `franchise.py`, `series.py`. | `app/services/domain/remark_field.py` |
| Because the form and the Notes page write the same row, **last write wins** between them; `hideSections` on the detail pages is the mitigation. | see UI |

## Sheets

The Google Sheets backup has a **"Note" tab** (`SheetTab("Note", models.Note, f.parse_note_from_sheet)` in `app/services/pipelines/tabs.py`).

| Aspect | Detail |
| --- | --- |
| Columns | `note` column declaration order: `system_id, owner_type, owner_id, section, locator, kind, status, title, content, links, sort_index, created_at, updated_at` (`format_model_for_sheet`, `app/utils/formatter.py`). `links` is serialised as JSON text. |
| Restore order | Near the end of `SHEET_TABS`: after every owner tab, Quote and Meme, before Seasonal — owners must exist first. |
| Parser | `parse_note_from_sheet` (`app/utils/formatter.py`): `owner_id` becomes None rather than failing if unparseable (no name-resolution step exists for it); the pre-rename `episode` header is still accepted as `locator` so old backups Pull. |
| Id-less row matching | Pull (`app/services/pipelines/pull.py`, "Note" branch) matches on `owner_type + owner_id + section + content` — not guarded on content, so a blank-content row matches `IS NULL` instead of duplicating every pull. |
| Remark rows | A sheet `remark` row whose `system_id` is unknown locally is retargeted at the owner's existing remark row and updated in place, keeping the local id — otherwise the partial unique index would fail the whole tab at commit. |
| Round-trip | Because owner tables no longer have a `remark` column (and `format_model_for_sheet` walks real columns, so the column_property is not exported), **remark round-trips only via the Note tab**. The `remark` still parsed on Watch Order tabs is those tables' own column, unrelated. |

## Related

- History: the original spec's `unread` section is gone. `op`, `ed`, `insert_songs`, `ost` (migration `m1u2s3i4c5t6_music_notes.py`, seeded from the old `anime.op/ed/insert_ost` columns) and the four groups (`reviews`, `analysis_group`, `music`, `quotes_memes`) were added; a `music_track`-shaped `insert` section was folded into `insert_songs` by `i1n2s3e4r5t6_drop_insert_music_section.py`. The table itself came from `note_add_table.py`; `episode` → `locator` by `l1o2c3a4t5o6`.
- `../data-model.md` (Note section) — column-level remarks, partly overlapping this page.
- `docs/api.md`, `../frontend/pages.md`, `../frontend/components.md` — older, partly stale; this page wins where they differ.
- RBAC: `app/services/rbac/field_groups.py`, `field_gate.py`, `enforcement.py`.
- Quotes and memes: `app/models/quote.py`, `app/models/meme.py`, their routers, and `app/utils/media_resolver.py` for owner resolution.
- Tests: `frontend/src/pages/notes/NotesTemplate.test.jsx`, `sections/*.test.jsx`, and the backend note tests under `tests/`.
