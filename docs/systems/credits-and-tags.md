# Credits and tags (people, studios, vocabulary links)

Last verified: 2026-08-30 (commit 4339702)

## What this is for

An anime used to carry its studio, director and genres as comma-joined strings
in plain columns (`anime.studio = "MAPPA, Studio 4°C"`). Two spellings of one
studio were two studios, renaming meant editing every row, and nothing could
ever hold a profile. This system replaces those columns with three entity
tables (`person`, `person_role`, `studio`) and two FK-less link tables
(`media_credit`, `media_tag`) — while keeping every public page, the Add/Modify
forms and the Google Sheets tabs reading the **same legacy column names** they
always did. If you need to know where a name on an entry comes from, how it is
matched to an existing row, or why the sheet header is `music` but the role is
`composer`, this is the file.

Related: [options.md](../options.md) (the Tier 2 `system_option` vocabulary
`media_tag` points at), [data-model.md](../data-model.md),
[data-actions.md](../data-actions.md) (Backup/Pull carry the links),
[authorization.md](../authorization.md) (credit counts are viewer-filtered).

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `person` | One human credited anywhere. `name_native` (required), `name_en`, `name_cn`, `gender`, `my_rating`, `photo_file` (GCS key), `remark`, timestamps. `gender` sits on the base table on purpose — it is a fact about the person, not a seiyuu-only attribute. | `uq_person_name (name_native, name_en)` **NULLS NOT DISTINCT** |
| `person_role` | Which dropdowns a person appears in: `person_id` (FK, cascade), `role` (one of `PERSON_ROLES`), `scope` (`"anime"` / `"non_anime"` for `director`, NULL for every other role). Explicit, not derived from credits, so a new director can be offered before their first credit. | `uq_person_role (person_id, role, scope)` NULLS NOT DISTINCT |
| `studio` | One **anime** production studio only: `name_native`, `name_en`, `name_cn`, `my_rating`, `logo_file`, `remark`. Publishers/distributors are deliberately not studios — they are the `"Publisher / Distributor TW"` vocabulary. | `uq_studio_name (name_native, name_en)` NULLS NOT DISTINCT |
| `media_credit` | One person **or** studio on one entry: FK-less `(media_type, entry_id)` pair, `role` (one of `CREDIT_ROLE_KEYS`), `person_id` / `studio_id` (both FK, cascade on delete), `position` (order of the original comma list), `remark`. | `CHECK num_nonnulls(person_id, studio_id) = 1`; `uq_media_credit_row (media_type, entry_id, role, person_id, studio_id)` NULLS NOT DISTINCT; index on `(media_type, entry_id)` |
| `media_tag` | One vocabulary value on one entry: `(media_type, entry_id)`, `field` (one of `TAG_FIELD_KEYS`), `option_id` → `system_option` (cascade), `position`. Column is `field`, not `category`: one category can back several fields, one field maps to exactly one category. | `uq_media_tag_row (media_type, entry_id, field, option_id)`; index on `(media_type, entry_id)` |

**Why NULLS NOT DISTINCT everywhere.** Postgres treats two NULLs as distinct
inside a UNIQUE constraint. `name_en` is NULL on essentially every backfilled
row, so the original `uq_person_name` was inert and duplicate people committed
cleanly (revision `n1u2l3l4s5n6d` collapsed those duplicates by repointing
credits, then recreated the constraints). Requires PostgreSQL 15+.

**FK-less entries.** No single foreign key can span eight media tables, so
nothing cascades when an entry is deleted. Every entry delete endpoint calls
`delete_links_for(db, media_type, entry_id)` (via `app/routers/_factory.py`)
to remove the entry's credit and tag rows; otherwise orphans would feed
`extract_system_options` and the duplicate checks forever.

## The vocabulary: `app/utils/credit_roles.py`

Shaped like `relation_kinds.py` — a frozen dataclass per entry, a dict keyed by
the stored value, tuple of keys for validation.

### `CREDIT_ROLES` (values of `media_credit.role`)

| key | label | target | implied `person_role` | media types |
|---|---|---|---|---|
| `studio` | Studio | studio | — | anime, anime-movie |
| `director` | Director | person | `director` | anime, anime-movie, movie |
| `producer` | Producer | person | `producer` | anime |
| `composer` | Music / Composer | person | `composer` | anime |
| `manga_author_plot` | 原作 | person | `manga_author` | manga |
| `manga_author_draw` | 作画 | person | `manga_author` | manga |
| `novel_author` | Author | person | `novel_author` | novel |
| `novel_illustrator` | Illustrator | person | `novel_illustrator` | novel |
| `comic_writer` | Writer | person | `comic_writer` | comic |
| `comic_artist` | Artist | person | `comic_artist` | comic |

Credit roles and person roles are two vocabularies on purpose: 原作 and 作画
are distinct credits that share one `manga_author` dropdown. `PERSON_ROLES` is
derived from the table (`director, producer, composer, manga_author,
novel_author, novel_illustrator, comic_writer, comic_artist`).
`SCOPED_PERSON_ROLES = {"director"}`; `director_scope_for(media_type)` returns
`"anime"` for anime / anime-movie and `"non_anime"` otherwise. Scope is
recorded on `person_role`, never on the credit.

### `TAG_FIELDS` (values of `media_tag.field`)

| key | label | `system_option.category` | media types |
|---|---|---|---|
| `genre_main` | Genre Main | Genre Main | anime |
| `genre_sub` | Genre Sub | Genre Sub | anime |
| `label` | 標籤 Label | Label | anime |
| `source_official` | Official Source | Official Source | tv-show, cartoon, movie |
| `publisher_tw` | Publisher / Distributor TW | Publisher / Distributor TW | anime, manga, novel, comic |
| `comic_publisher` | Publisher | Comic Publisher | comic |
| `comic_imprint` | Imprint | Comic Imprint | comic |
| `comic_continuity` | Continuity | Comic Continuity | comic |
| `comic_era` | Era | Comic Era | comic |
| `comic_event` | Events | Comic Event | comic |

`FILTER_ONLY_CATEGORIES = ("Franchise for Filter",)` exists as a vocabulary but
backs no field. `OPTION_CATEGORIES` = every TagField category + filter-only ones.
Helpers: `credit_roles_for(media_type)`, `tag_fields_for(media_type)`.

### `LEGACY_SHEET_COLUMN` — the header trap

Keyed by `(media_type, key)`, **not** by key alone, because the same key can
have a different legacy header per type: anime's `publisher_tw` writes under
`distributor_tw`, manga/novel/comic under `publisher_tw`. Other renames:
`composer → music`, `manga_author_plot → author_plot`, `manga_author_draw →
author_draw`, `novel_author → author`, `novel_illustrator → illustrator`,
`comic_writer → writer`, `comic_artist → artist`, `comic_* → publisher /
imprint / continuity / era / events`. A pair absent from the map (movie
`source_official`, anime `label`) uses the key itself as header.
`sheet_column_for(media_type, key)` is the single accessor; the same names are
used as the entry payload attributes (below), so the API edge, the form state
and the sheets share one vocabulary.

## Name matching: `app/utils/name_normalize.py`

`normalize_name(raw)` = NFKC fold (full-width Latin → half-width), strip **all**
whitespace, `casefold()`. It is a comparison key only — the original spelling is
what gets stored. `split_names(raw)` splits a comma-joined cell, drops empty
fragments and de-duplicates on the normalized key, keeping the first spelling.

## Service layer: `app/services/domain/credits.py`

Every writer goes through this module — migration, `/api/credits`, Fill/Pull,
Sheets restore — so a Tenrai name and a hand-typed name land on the same row.

| Function | What it does |
|---|---|
| `find_person` / `find_studio` | Linear scan matching `normalize_name` against `name_native` **or** `name_en`; returns the row or None. Python-side because the fold is not expressible in portable SQL and the tables are small. |
| `resolve_person(db, name, role=, scope=)` | Find-or-create, then ensure the `(role, scope)` `person_role` row exists. |
| `resolve_studio(db, name)` | Find-or-create. |
| `resolve_option(db, category, value, scope=None)` | Find-or-create the `system_option`; adds a scope row only when `scope` is passed explicitly (backfill seeding, admin edits) — never derived from the caller's media type. |
| `replace_credits(db, media_type, entry_id, role, names)` | Whole-set replace for one role, preserving order in `position`. Director credits get `director_scope_for(media_type)` on the person role. |
| `replace_tags(...)` | Whole-set replace for one field. Deliberately does **not** auto-scope the option to the media type: doing so once silently narrowed an unscoped "Disney+" to TV-only after one TV use. |
| `delete_links_for` | Removes all credit + tag rows of a deleted entry; returns the count. |
| `credit_names` / `tag_values` | One entry, one role/field, stored order. |
| `credits_to_sheet_value` / `tags_to_sheet_value` | `", ".join(...)` of the above. |
| `link_values_for_entries(db, media_type, ids)` | Batch read: `{entry_id: {key: [names]}}` in a **fixed five queries** regardless of entry count (the N+1 avoider). |
| `legacy_link_fields(media_type)` | `(payload_attr, "credit"/"tag", key)` triples using the legacy names. |
| `attach_link_fields(db, media_type, entries)` | Sets the legacy-named, comma-joined attributes (`studio`, `director`, `music`, `distributor_tw`, `era` …) on ORM entries in place, like `attach_plan_flag`. Called from `_factory.py` on detail (one entry) and list (many) so public pages keep reading one response. These live on `*Response` schemas only, never on Create/Update bases — a write naming them is rejected, not silently stored. |
| `sheet_link_headers(media_type)` / `sheet_link_values` / `sheet_link_rows` | Sheets export: headers via `sheet_column_for`, appended at the **end** of each entry tab (restore matches by header name, not position). `sheet_link_rows` is the batched form Backup uses. |
| `names_from_sheet_value` | `split_names` alias for Pull. |
| `backfill_credits(db)` | One-time, idempotent migration body over `BACKFILL_MAP` (26 legacy columns). Reports counts and an `unplaced` list rather than guessing; then runs `extract_system_options`. `manga.anime_studio` is deliberately excluded (it names the adaptation's studio — belongs in relations). |
| `verify_backfill_lossless(db)` | Compares legacy raw columns (via `information_schema`, not the ORM) against link tables as normalized sets; only names *missing* on the link side count as mismatches. The drop migration aborts on any. |

### `extract_system_options` (`app/services/domain/options_extraction.py`)

Purely additive reconcile: for every `media_tag` whose field is in `TAG_FIELDS`,
ensure a `system_option_scope (option_id, media_type)` row exists. Never removes
a scope. Reads existing pairs once into a set (a stale relationship collection
used to add duplicates and 500 the first Calculate after a restore). Called by
the backfill and by Calculate All.

## Endpoints

| Method / path | Auth | Notes |
|---|---|---|
| `GET /api/credits/{media_type}/{entry_id}` | public (viewer) | `{"credits": {role: [names]}, "tags": {field: [values]}}`, only keys with rows. Unknown type → 400; missing **or hidden** entry → 404 (`entry_visible`). |
| `PUT /api/credits/{media_type}/{entry_id}` | admin | Body `{credits: {role: [..]}, tags: {field: [..]}}`. Touches only the named roles/fields; an absent key is left alone, an empty list clears. Role/field not valid for the type → 400. |
| `GET /api/person/?role=&scope=` | public | Sorted by `name_native`; filter joins `person_role`. `credit_count` counts only entries the viewer may see (`filter_visible_pairs`). |
| `GET /api/person/role-counts` | public | `{person_role: distinct people}` incl. zeros; declared before `/{system_id}`. |
| `GET /api/person/{id}` | public | 404 if absent. |
| `POST /api/person/` | admin | **Find-or-create** on normalized name (matches `resolve_person`), then adds any missing roles; metadata of an existing person is untouched. Find-or-create because `ensureSourceValues.js` POSTs whenever a typed name is absent from a *role-filtered* list. |
| `PUT /api/person/{id}` | admin | Full metadata update; replaces the role set. |
| `DELETE /api/person/{id}` | admin | Credits cascade away — wrong fix for a duplicate. |
| `POST /api/person/{id}/merge` `{source_id}` | admin | Repoints every credit from source onto target (drops ones that would collide on `(media_type, entry_id, role)`), unions `person_role` rows, deletes the source. 400 on self-merge. Returns `credits_moved`. |
| `GET /api/studio/`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/merge` | as person | Same shape minus roles. Renaming a studio changes what every credited entry shows — no propagation step. |
| `GET/POST/PUT/DELETE /api/options/...` | read public, write admin | The Tier 2 vocabulary `media_tag` points at; see [options.md](../options.md). |

## Duplicate entity check

`find_duplicate_entities` (`app/services/domain/checking.py`) is part of
`find_all_duplicates` under the `"entities"` key. It clusters people and
studios (each table separately) by union-find over the normalized keys of
**both** `name_native` and `name_en`, since `_find_by_name` matches on either.
The fix it points at is the merge endpoint, never delete.

## Where credits are written

| Writer | Path |
|---|---|
| Add / Modify forms | `ensureSourceValues.js` first POSTs any typed-but-unknown value (dispatched on `source.kind`: person → `/api/person/` with the field's role **and** scope, studio → `/api/studio/`, option → `/api/options/`), then the form saves the entry and `PUT /api/credits/...`. |
| Fill (autofill, `app/services/domain/autofill.py`) | Movie director from TMDB, comic writer/artist from Comic Vine — only when the role has no credits yet (`credit_names` empty). Anime studio/director/producer/composer via the Tenrai fill path. |
| Pull (`app/services/pipelines/pull.py`) | Legacy headers are popped from the parsed row into `pending_credits` / `pending_tags` and applied via `replace_credits` / `replace_tags` after the entry row is upserted. |
| Backup (`app/services/pipelines/backup.py`) | Appends `sheet_link_headers` + `sheet_link_rows` to every entry tab. |
| Sheets tabs (`app/services/pipelines/tabs.py`) | Dedicated `Person`, `Person Role`, `Studio` tabs restored **before** any media tab so credits can resolve against them. |

## Admin UI

The "System Options" nav entry on the **Add** page (`OptionsAddTab.jsx`) has
three sub-tabs: **Options** (vocabulary value + `ScopePicker`), **People**
(`PersonForm`: names, gender, rating, remark, a role dropdown fed by
`PERSON_ROLES` from `GET /api/constants` via `fieldOptions.js` — labels derived
from keys so a role added in Python needs no frontend edit), and **Studios**
(`StudioForm`). The person/studio pickers on entry forms are the standard
"tags" fields whose `source.kind` is `person` / `studio`; there is no public
person or studio page yet.

## Migrations (chain order)

| Revision | Did |
|---|---|
| `p1e2r3s4o5n6` | Created `person`, `person_role`, `studio`. |
| `c1r2e3d4i5t6` | Created `media_credit`, `media_tag`. |
| `m1i2g3r4a5t6` | Ran `backfill_credits`; logged unplaced values. |
| `d1r2o3p4c5o6l` | Ran `verify_backfill_lossless`, then dropped the 26 legacy string columns and `system_option.id`. Aborts on any mismatch. |
| `n1u2l3l4s5n6d` | Merged duplicate people/studios in SQL (repointing credits first), then recreated `uq_person_name`, `uq_studio_name`, `uq_person_role` with NULLS NOT DISTINCT. |

## Deferred: `character` / `character_voice`

Designed in the system-options redesign (2026-08-29) but not built. A
`character` belongs to a **franchise** (nullable `franchise_id`, NULL =
standalone) with the same profile columns as `person`; `character_voice` links
a character to a `person` (seiyuu) with a `language` and an optional
`(media_type, entry_id)` for recasts. No table, model or endpoint exists today —
grep for `character` in `app/models` returns nothing.

## Tests

`tests/unit/test_credit_roles.py`, `test_name_normalize.py`;
`tests/services/test_credits_service.py`, `test_credits_sheets.py`,
`test_fill_credit_resolution.py`, `test_movie_autofill_credits.py`,
`test_options_extraction.py`, `test_media_credit_model.py`,
`test_person_model.py`, `test_studio_model.py`,
`test_person_studio_uniqueness.py`; `tests/api/test_credits_router.py`,
`test_person_router.py`, `test_studio_router.py`, `test_options_router.py`;
`frontend/src/lib/ensureSourceValues.test.js`.
