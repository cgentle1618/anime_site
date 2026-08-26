# Comic Media Entry — Design

**Date:** 2026-08-26
**Status:** Approved, pending implementation

## Purpose

Add `comic` as the eighth media entry type, covering Western comics with a
Marvel emphasis. Comics are tracked as **runs**: one entry is a numbered run of
a title, measured in issues read out of issues total. Marvel events, storylines
and eras are labels carried by a run, never entries of their own.

`Comic` already exists as a franchise type (shipped in commit `1bf8b89`), so
franchise auto-creation has a type to write.

## Scope

**In scope:** the `comic` table and migration, schemas, the registry entry and
its generated `/api/comic` router, hierarchy resolution, the Fill and Replace
pipelines, Google Sheets backup and pull, notes and remarks, and the frontend
CRUD/detail/library/nav surface.

**Out of scope for this pass**, deferred by explicit decision: statistics
pages, Plan to Read / Read Next, the review queue, find-duplicates, the
with-remarks check, public Completions and the Index dashboard. An external
metadata API is deferred too, and will only be adopted if a free tier exists.
Comics are manual-entry until then.

## Data Model

New table `comic`, modeled on `Novel` rather than `Manga` — Novel uses the
current conventions (`is_main_entry`, `read_order`). Western-shaped: no romaji
or JP name fields, issues instead of volumes and chapters, and no MAL or
AniList columns, because nothing would populate them.

### Identity and hierarchy

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | UUID, PK | `default=uuid.uuid4`, indexed |
| `franchise_id` | UUID FK to `franchise.system_id`, nullable | `ON DELETE SET NULL` |
| `series_id` | UUID FK to `series.system_id`, nullable | `ON DELETE SET NULL` |
| `comic_name_en` | String, nullable | primary name |
| `comic_name_cn` | String, nullable | TW/CN translated title |
| `comic_name_alt` | String, nullable | |
| `volume_label` | String, nullable | run designator: `Vol. 5`, `(2018)`, `Legacy` |

`display_name` falls back **EN then CN then Alt**, reversed from Manga and
Novel, which lead with CN. Western titles are known by their English names.
`_name_fields` lists the three name columns for `NameFallbackMixin`.

### Classification

| Column | Type | Notes |
| --- | --- | --- |
| `comic_type` | String, nullable | Ongoing / Limited / One-Shot / Annual |
| `publisher` | String, nullable | new `system_options` category **Comic Publisher** |
| `imprint` | String, nullable | new category **Comic Imprint** |
| `continuity` | String, nullable | new category **Comic Continuity** (Earth-616, Ultimate) |
| `era` | String, nullable | new category **Comic Era** |
| `events` | String, nullable | comma-joined multi-select, new category **Comic Event** |
| `is_main_entry` | Boolean, nullable | main line vs spinoff |

`events` uses the comma-joined-string idiom already used by
`franchise.franchise_type`, with a MultiSelect control that auto-creates unseen
values in `system_options` on submit — the behavior Novel's author, illustrator
and publisher fields use.

### Creators and dates

| Column | Type | Notes |
| --- | --- | --- |
| `writer` | String, nullable | new category **Comic Writer** (Manga's `author_plot` analog) |
| `artist` | String, nullable | new category **Comic Artist** (Manga's `author_draw` analog) |
| `release_year` | Integer, nullable | |
| `end_year` | Integer, nullable | |
| `publisher_tw` | String, nullable | reuses the existing TW distributor category |

### Progress and status

| Column | Type | Notes |
| --- | --- | --- |
| `issue_total` | Integer, nullable | null means unknown or ongoing |
| `issue_fin` | Integer, not null, default 0 | |
| `progress_display` | String, nullable | derived, e.g. `74/93 issues` |
| `serialization_status` | String, nullable | reuses the existing option list |
| `reading_status` | String, not null, default `Might Read` | reuses the existing Reading Status list |
| `read_order` | Float, nullable | reading order within the franchise |
| `my_rating` | String, nullable | S / A+ / A / B / C |

### Parity columns

`read_next` (Boolean), `to_reread` (Boolean, default false), `source_other`
(JSONB), `cover_image_file` (String), `created_at`, `updated_at`,
`completed_at`.

`read_next` and `to_reread` get no UI in this pass, since the plan pages are
out of scope. The columns are created now anyway so that adding those pages
later needs no migration. `to_reread` is also a registry list filter, matching
Manga and Novel.

## Backend

Comic is a *uniform* type: it rides `app/routers/_factory.py` through a
registry entry rather than getting a hand-written router.

- **`app/models/comic.py`** — the ORM model above, exported from
  `app/models/__init__.py`.
- **Alembic migration** — creates `comic` with both foreign keys and the
  `system_id` index.
- **`app/schemas/comic.py`** — `ComicCreate`, `ComicUpdate`, `ComicResponse`,
  exported from `app/schemas/__init__.py`.
- **`app/registry.py`** — one `MediaTypeSpec`:
  - `key="comic"`, `owner_type="comic"`, `label="Comic"`, `route="comic"`
  - `status_field="reading_status"`
  - `list_filters=("franchise_id", "series_id", "reading_status", "serialization_status", "to_reread")`
  - `hierarchy_names={"en": "comic_name_en", "cn": "comic_name_cn", "alt": "comic_name_alt"}`
  - `search_fields=("comic_name_en", "comic_name_cn", "comic_name_alt")`
  - This alone yields the full `/api/comic` CRUD surface.
- **`services/domain/hierarchy.py`** — `resolve_comic_parent_hierarchy`,
  auto-creating a franchise with `franchise_type="Comic"` when none is found.
- **`services/domain/completion.py`** — `mark_comic_completed`, following the
  reading-completion shape (`reading_status="Completed"`, `completed_at`,
  `issue_fin` snapped to `issue_total`).
- **`services/pipelines/replace.py`** — `execute_replace_single_comic`, the
  registry's `write_hook`.
- **`services/pipelines/fill.py`** — a comic path that computes derived fields
  only: `progress_display`, completion state, remarks. No external API call.
- **`utils/media_resolver.py`** — `MEDIA_TABLES` gains
  `MediaRef("comic", "Comic", models.Comic, "/comic")`, which is what lets
  notes, remarks, quotes and memes point at comic entries.
- **`app/main.py`** — register the generated router.

### Google Sheets

- `pipelines/backup.py` — a `Comic` tab written from the model's columns,
  placed with the other media tabs before watch orders.
- `utils/formatter.py` — `parse_comic_from_sheet`.
- `pipelines/pull.py` — the `Comic` tab entry in the model and parser maps,
  plus the hierarchy branch, so pull resolves the parent franchise the same way
  Novel does.

## Frontend

### Config registration (one line each)

`mediaRegistry.js` (`comic: reading_status, /api/comic, /comic, read`),
`mediaTypeColors.js`, `namingConfigs.js`, `adminTabs.js`, `formFactories.js`,
and `lib/status.js` (comic joins the reading-button branch).
`config/formFields/fieldMeta.js` gains the comic field metadata — labels,
controls and groups — which is what drives the generic form rendering.

### New files

- `pages/detail/Comic.jsx`
- `pages/detail/ComicNotes.jsx`
- `pages/library/LibraryComic.jsx`
- `pages/add-tabs/ComicAddTab.jsx`
- `pages/modify-tabs/ComicModifyTab.jsx`
- `getComicProgress` in `lib/formatters.js`, rendering `74 / 93 ISSUES`

### Existing files needing a comic branch

`App.jsx` (routes `/comic/:system_id` and `/library/comic`), `Nav.jsx` (nav
links, universal-search fetch list, badge, name resolution, click-through),
`useGlobalMediaSearch.js`, `Add.jsx`, `Modify.jsx`, `Delete.jsx`, `Admin.jsx`
(Fill and Replace buttons), `MediaCard.jsx`, `GroupedEntryPage.jsx`,
`MemeOwnerPicker.jsx`, `QuoteEntryPicker.jsx`, and the tier pages
`FranchisePage.jsx`, `SeriesPage.jsx`, `CollectionPage.jsx`.

`FranchisePage.jsx` gains the comic media tab that was deliberately omitted
from commit `1bf8b89`, gated on `hasComic && comicList.length`.
`FranchiseModifyTab.jsx`'s `TYPE_TO_ENTRY_TYPES` gains `Comic: ["comic"]`, so
its per-type 3x3 cover picker stops falling back to all franchise entries.

## Testing

Backend, run with `venv/Scripts/python.exe -m pytest`:

- comic cases in `tests/api/test_media_crud.py`, the registry-driven CRUD suite
- a hierarchy-resolver test covering franchise auto-creation with
  `franchise_type="Comic"`
- a `parse_comic_from_sheet` round-trip in `tests/unit/`

Frontend: a `mediaRegistry`/endpoints assertion. Page components stay
uncovered, matching how Novel shipped.

Note that `frontend/src/utils/anime.test.js` fails on `main` for an unrelated
reason — it imports a `./anime.js` that does not exist. It is not caused by
this work.

## Implementation Sequence

Four independently reviewable commits:

1. Model, migration, schemas, registry entry, hierarchy resolver — `/api/comic`
   live and testable.
2. Pipelines (fill, replace) and Google Sheets backup/pull.
3. Frontend config registration and the Add/Modify/Delete admin surface.
4. Detail page, notes, library, nav and the tier pages.

## Open Questions

None blocking. The external metadata API stays deferred; adopting one later is
an additive migration plus an integration module, with no rework of this model.
