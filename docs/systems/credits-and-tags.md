# Credits and tags (people, studios, vocabulary links)

Last verified: 2026-09-04 (commit 601ceb8)

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
| `person` | One human credited anywhere, and a public entity: four optional names (`name_en`, `name_cn`, `name_jp`, `name_alt`) with `display_name_field` choosing which is shown, plus `gender`, `my_rating`, `photo_file` (GCS key), `remark`, timestamps. Same name shape as `studio`. `gender` sits on the base table on purpose — it is a fact about the person, not a seiyuu-only attribute. | `uq_person_name (name_en, name_cn, name_jp, name_alt)` **NULLS NOT DISTINCT**; `ck_person_has_a_name` (at least one name) |
| `person_role` | Which dropdowns a person appears in: `person_id` (FK, cascade), `role` (one of `PERSON_ROLES`), `scope` (**NOT NULL**, a hyphenated media-type key, one of `legal_scopes(role)`). Explicit, not derived from credits, so a new director can be offered before their first credit. A person's visibility is the union of their rows; there is no "offered everywhere" state — see [options.md](../options.md) for why this differs from option scope. | `uq_person_role (person_id, role, scope)` (plain — no nullable column left in the key) |
| `studio` | One **anime** production studio only, and a public entity: four optional names (`name_en`, `name_cn`, `name_jp`, `name_alt`) with `display_name_field` choosing which is shown, plus `my_rating`, `logo_file`, `remark`, `founded_date`, `defunct_date`, `country`, `website_url`, `mal_id`, `mal_link`. Publishers/distributors are deliberately not studios — they are the `"Publisher / Distributor TW"` vocabulary. | `uq_studio_name (name_en, name_cn, name_jp, name_alt)` NULLS NOT DISTINCT; `ck_studio_has_a_name` (at least one name); ISO-8601 CHECKs on both dates |
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

| key | label | target | media types |
|---|---|---|---|
| `studio` | Studio | studio | anime, anime-movie |
| `director` | Director | person | anime, anime-movie, movie |
| `producer` | Producer | person | anime |
| `composer` | Music / Composer | person | anime |
| `author` | Author | person | manga, novel, comic |
| `illustrator` | Illustrator | person | manga, novel, comic |

**One vocabulary, not two.** Credit roles and person roles used to be separate
lists — ten credit roles against eight person roles, with `manga_author_plot`
and `manga_author_draw` sharing one `manga_author` dropdown. They are now the
same five person keys (plus `studio`), so `media_credit.role` and
`person_role.role` store the same strings and `PERSON_ROLES` is just
`CREDIT_ROLES` minus `studio`.

**Labels are derived, not stored.** `credit_label(role, media_type)` is the
single owner of the reader-facing word: the same `author` credit reads 原作 on
a manga, Author on a novel and Writer on a comic, and `illustrator` reads 作畫 /
Illustrator / Artist. A small `{(role, media_type): label}` override map falls
back to `CreditRole.label`; nothing else in the codebase — no page, no form —
may hard-code these words.

**Retired keys**, in case you meet them in an old sheet or backup:
`manga_author_plot` and `manga_author_draw` → `author` / `illustrator` on
manga; `novel_author` / `novel_illustrator` → `author` / `illustrator` on
novel; `comic_writer` / `comic_artist` → `author` / `illustrator` on comic. The
person roles `manga_author`, `novel_author`, `novel_illustrator`,
`comic_writer` and `comic_artist` are gone the same way. Revision
`r0l1c2o3l4p5` rewrote the stored values.

**Scope is the media type.** `SCOPED_PERSON_ROLES`,
`DIRECTOR_ANIME_MEDIA_TYPES` and `director_scope_for()` are gone: every role is
scoped, and the scope is a hyphenated media-type key rather than the old
`"anime"` / `"non_anime"` pair. `legal_scopes(role)` returns the media types a
role may be held in, and both `PersonRoleIn` and the admin form read it, so a
form cannot offer — and the API cannot store — a pair like (composer, manga)
that names a credit which does not exist.

### `TAG_FIELDS` (values of `media_tag.field`)

| key | label | `system_option.category` | media types |
|---|---|---|---|
| `genre_main` | Genre Main | Genre Main | anime |
| `genre_sub` | Genre Sub | Genre Sub | anime |
| `label` | 標籤 Label | Label | anime |
| `quality` | Quality 品質 | Quality | anime |
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
`composer → music`, manga's `author → author_plot` and `illustrator →
author_draw`, novel's `author → author` and `illustrator → illustrator`,
comic's `author → writer` and `illustrator → artist`, `comic_* → publisher /
imprint / continuity / era / events`. Because the map was already keyed by
`(media_type, key)`, the role collapse only renamed its keys: **every sheet
header is byte-identical to what it was before**, which `tests/unit/
test_credit_roles.py` asserts against a hand-written table. A pair absent from the map (movie
`source_official`, anime `label`) uses the key itself as header.
`sheet_column_for(media_type, key)` is the single accessor; the same names are
used as the entry payload attributes (below), so the API edge, the form state
and the sheets share one vocabulary.

## Name matching: `app/utils/name_normalize.py`

`name_slot_for(name, role=, scope=, novel_type=None)` decides **which** of a
person's four name columns an automatically created name lands in: `"en"` for a
name with no CJK, `"cn"` for anime staff and Chinese-rendered literary
novelists, `"jp"` otherwise. It never returns `"alt"` — that slot means "a name
that is none of these three", which only a human can assert. The rule lives in
one place because the reshape migration is not its only caller: `resolve_person`
mints a person whenever Fill/Pull, the Sheets restore or a typed dropdown value
names somebody unknown, and a name must not land in one column during the
migration and another the next day. Resolution and display do not depend on the
choice — `_find_by_name` matches on all four columns and `display_name` falls
back through all four — so only the label is at stake.

`normalize_name(raw)` = NFKC fold (full-width Latin → half-width), strip **all**
whitespace, `casefold()`. It is a comparison key only — the original spelling is
what gets stored. `split_names(raw)` splits a comma-joined cell, drops empty
fragments and de-duplicates on the normalized key, keeping the first spelling.

## Service layer: `app/services/domain/credits.py`

Every writer goes through this module — migration, `/api/credits`, Fill/Pull,
Sheets restore — so a Tenrai name and a hand-typed name land on the same row.

| Function | What it does |
|---|---|
| `find_person` / `find_studio` | Linear scan matching `normalize_name` against any of the model's `_name_fields` — all four names, for a person as for a studio; returns the row or None, and raises `AmbiguousNameError` when several rows match. Python-side because the fold is not expressible in portable SQL and the tables are small. |
| `resolve_person(db, name, role=, scope=)` | Find-or-create, then ensure the `(role, scope)` `person_role` row exists. A newly created person's name goes into the column `name_slot_for` picks, not a fixed one. |
| `resolve_studio(db, name)` | Find-or-create. |
| `resolve_option(db, category, value, scope=None)` | Find-or-create the `system_option`; adds a scope row only when `scope` is passed explicitly (backfill seeding, admin edits) — never derived from the caller's media type. |
| `replace_credits(db, media_type, entry_id, role, names)` | Whole-set replace for one role, preserving order in `position`. The person role is scoped to the entry's own media type. |
| `replace_tags(...)` | Whole-set replace for one field. Deliberately does **not** auto-scope the option to the media type: doing so once silently narrowed an unscoped "Disney+" to TV-only after one TV use. |
| `delete_links_for` | Removes all credit + tag rows of a deleted entry; returns the count. |
| `credit_names` / `tag_values` | One entry, one role/field, stored order. |
| `credits_to_sheet_value` / `tags_to_sheet_value` | `", ".join(...)` of the above. |
| `link_values_for_entries(db, media_type, ids)` | Batch read: `{entry_id: {key: [names]}}` in a **fixed five queries** regardless of entry count (the N+1 avoider). |
| `legacy_link_fields(media_type)` | `(payload_attr, "credit"/"tag", key)` triples using the legacy names. |
| `attach_link_fields(db, media_type, entries)` | Sets the legacy-named, comma-joined attributes (`studio`, `director`, `music`, `distributor_tw`, `era` …) on ORM entries in place, like `attach_plan_flag`, plus the two linkable shapes: `credit_refs` (`{role: [{system_id, display_name, label}]}`, every type) and `studio_refs` (anime and anime-movie). Both come out of the same batched fetch, so they cost no extra query. Called from `_factory.py` on detail (one entry) and list (many) so public pages keep reading one response. These live on `*Response` schemas only, never on Create/Update bases — a write naming them is rejected, not silently stored. |
| `sheet_link_headers(media_type)` / `sheet_link_values` / `sheet_link_rows` | Sheets export: headers via `sheet_column_for`, appended at the **end** of each entry tab (restore matches by header name, not position). `sheet_link_rows` is the batched form Backup uses. |
| `names_from_sheet_value` | `split_names` alias for Pull. |
| `backfill_credits(db)` | One-time, idempotent migration body over `BACKFILL_MAP` (26 legacy columns). Reads each legacy column through `information_schema` + raw SQL, not the ORM — the models no longer define these columns, so an attribute read makes the whole backfill a silent no-op. Reports counts and an `unplaced` list rather than guessing; then runs `extract_system_options`. `manga.anime_studio` is deliberately excluded (it names the adaptation's studio — belongs in relations). |
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
| `GET /api/person/?role=&scope=` | public | Sorted by resolved `display_name`; both filters are exact, and a query without `scope` means "holds this role in any media type". `credit_count` counts only entries the viewer may see (`filter_visible_pairs`). Each row carries every `(role, scope)` the person holds, so the admin form can load the whole set in one request. |
| `GET /api/person/role-counts` | public | `{person_role: distinct people}` incl. zeros; declared before `/{system_id}`. |
| `GET /api/person/role-scopes` | public | `{role: [legal media types]}`, derived from the same `CreditRole.media_types` that validates writes, so the admin form and the validator cannot drift. Declared before `/{system_id}`. |
| `GET /api/person/{id}/entries` | public | The entries this person is credited on, grouped by `(media_type, role)` with the derived label, filtered through the same `filter_visible_pairs` as `credit_count`. Empty groups, not 404, when every credit is hidden — the person is not the secret, their credits are. |
| `GET /api/person/{id}` | public | 404 if absent. |
| `POST /api/person/` | admin | **Find-or-create** on normalized name (matches `resolve_person`), then adds any missing roles; metadata of an existing person is untouched. Find-or-create because `ensureSourceValues.js` POSTs whenever a typed name is absent from a *role-filtered* list. The body carries either the four labelled name columns (the admin form) or one unslotted `name` (every other writer), which the endpoint places through `name_slot_for` — a caller holding one typed string cannot know its column, and copying the rule into the frontend would give one name two homes. |
| `PUT /api/person/{id}` | admin | Full metadata update; replaces the role set. |
| `DELETE /api/person/{id}?credits=N` | admin | Credits cascade away — wrong fix for a duplicate. `credits` is **required** and is the count the confirmation dialog showed; a mismatch is a 409, because an admin who agreed to destroy three credits did not agree to destroy the five that exist now. |
| `POST /api/person/{id}/merge` `{source_id}` | admin | Repoints every credit from source onto target (drops ones that would collide on `(media_type, entry_id, role)`), unions `person_role` rows, deletes the source. 400 on self-merge. Returns `credits_moved`. |
| `GET /api/studio/`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/merge` | as person | Same shape minus roles, and `POST /` is find-or-create for the same reason. The list is sorted by resolved `display_name`, and both reads carry it. Renaming a studio changes what every credited entry shows — no propagation step. |
| `GET /api/studio/{id}/entries` | public | The reverse of `GET /api/credits/...`: the entries this studio is credited on, grouped by media type, filtered through the same `filter_visible_pairs` as `credit_count` so the two can never disagree. Empty groups, not 404, when every credit is hidden. |
| `GET/POST/PUT/DELETE /api/options/...` | read public, write admin | The Tier 2 vocabulary `media_tag` points at; see [options.md](../options.md). |

## Duplicate entity check

`find_duplicate_entities` (`app/services/domain/checking.py`) is part of
`find_all_duplicates` under the `"entities"` key. It clusters people and
studios (each table separately) by union-find over the normalized keys of all
four name columns, since `_find_by_name` matches on any of them.
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

The "System Options" nav entry has **two** sub-tabs on all three admin pages
(Add / Modify / Delete), rendered by the shared `OptionSubTabBar`: **Options**
and **Tags**. Both are the same form over the same rows — vocabulary value plus
`ScopePicker`, one endpoint — split only so the category list is shorter;
`TAG_CATEGORIES` decides which side a category falls on, see
[../options.md](../options.md). Each page filters its category `<select>`
through `categoriesForSubTab` (`frontend/src/lib/optionCategoryGroups.js`),
clearing the selected category when the half changes; Delete lists only
categories that actually hold values.

People and studios were once sub-tabs here. Both moved out to the **Entity**
tab group on Add / Modify / Delete when each became a public entity rather than
a closed vocabulary — see
[../frontend/admin-pages.md](../frontend/admin-pages.md). The Person tab adds a
`PersonSubTabBar` of the five types, which filters the list and preselects the
type for a new person but never narrows what the form edits: a person is one
row that may hold several types, so `PersonFields` always shows the full
role × scope matrix, with each type's legal media types read from
`GET /api/person/role-scopes`.

The person/studio pickers on entry forms are the standard "tags" fields whose
`source.kind` is `person` / `studio`. Both entities now have public pages —
`/library/person` and `/person/:system_id`, `/library/studio` and
`/studio/:system_id` — and every credit on a detail page links to them:
`credit_refs` through `PersonLinks.jsx`, `studio_refs` through
`StudioLinks.jsx`, each falling back to the legacy comma-joined string when the
entry carries no refs or the viewer lacks the Credits permission.

## Migrations (chain order)

| Revision | Did |
|---|---|
| `p1e2r3s4o5n6` | Created `person`, `person_role`, `studio`. |
| `c1r2e3d4i5t6` | Created `media_credit`, `media_tag`. |
| `m1i2g3r4a5t6` | Ran `backfill_credits`; logged unplaced values. |
| `d1r2o3p4c5o6l` | Ran `verify_backfill_lossless`, then dropped the 26 legacy string columns and `system_option.id`. Aborts on any mismatch. |
| `n1u2l3l4s5n6d` | Merged duplicate people/studios in SQL (repointing credits first), then recreated `uq_person_name`, `uq_studio_name`, `uq_person_role` with NULLS NOT DISTINCT. |
| `s1t2u3d4i5o6` | Reshaped `studio`: `name_native` → `name_en` (lossless over the 77 production rows), added `name_jp`, `name_alt`, `display_name_field` and the profile columns, and recreated `uq_studio_name` over all four names plus the three CHECKs. |
| `r0l1c2o3l4p5` | Collapsed the role vocabulary: rewrote `media_credit.role` (372 rows), rebuilt `person_role` onto the five keys with a media-type `scope`, and made that column NOT NULL. A Sheets backup taken **before** this revision can no longer be restored directly — its `Person Role` tab has empty scopes and retired role names; `alembic downgrade s1t2u3d4i5o6`, Pull, then `alembic upgrade head`. |
| `p7n8a9m10e11` | Reshaped `person` to match `studio`: added `name_jp`, `name_alt`, `display_name_field`, distributed the 554 `name_native` values through `name_slot_for` (218 en / 165 cn / 171 jp), dropped `name_native` and recreated `uq_person_name` over all four names plus `ck_person_has_a_name`. |

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
`test_person_router.py`, `test_person_entries.py`, `test_studio_router.py`,
`test_options_router.py`, `test_entry_link_fields.py` (including the
query-count guard on `credit_refs`), `test_field_gating.py`;
`tests/unit/test_person_role_collapse.py`, `test_person_name_slots.py`;
`frontend/src/lib/ensureSourceValues.test.js`,
`src/lib/naming.test.js`, `src/components/forms/PersonSubTabBar.test.jsx`,
`src/pages/library/PersonLibrary.test.jsx`.
