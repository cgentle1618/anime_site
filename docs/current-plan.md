# Cartoon Implementation Plan

## Overview

Implement the `cartoons` media type end-to-end: database → backend services → API → frontend pages/components.

Cartoon is architecturally close to TV Show. Key differences:

- Name prefix `cartoon_` instead of `tv_`
- Has `airing_type` field (`"TV"`, `"TV重製版"`, `"TV重啟版"`, `"Movie"`, `"Special"`, `"Other"`)
- Has `length_ep_min` field; no `region` field
- Franchise type is `"Cartoon"` (not `"TV or Movie"`)
- System options category `"Official Source (Cartoon)"` (not `"Official Source (TV)"`)
- Has its own Franchise Hub page (`FranchiseCartoon.jsx`)
- No `ep_previous` / cumulative episode tracking (no derive_ep_previous)
- `imdb_rating` is absent from the database schema doc but required by business logic and UI — add it via migration

Reference implementation: TV Show (`routers/tv_show.py`, `services/other_logics.py`, etc.)

---

## Step 1 — Backend Foundation

**Files:** `models.py`, `schemas.py`, `routers/cartoon.py`, `main.py`, Alembic migration

### 1.1 — Verify / Add `Cartoon` SQLAlchemy model

- Check `models.py` for existing `Cartoon` model.
- If missing, add it with all columns from `database-schema.md`:
  - Identity: `system_id` (UUID PK), `franchise_id` (FK → franchise SET NULL), `series_id` (FK → series SET NULL)
  - Names: `cartoon_name_en`, `cartoon_name_cn`, `cartoon_name_alt`
  - Classification: `season_part`, `source_official`, `airing_type`, `airing_status`, `watching_status`, `is_main`
  - Episode tracking: `ep_total`, `ep_fin` (default 0), `length_ep_min`
  - Ratings & release: `my_rating`, `imdb_rating` _(add if not in schema — required by business logic)_, `release_date`
  - Relational: `derive_related`, `prequel_id`, `sequel_id`, `watch_order`
  - External links: `imdb_id`, `imdb_link`
  - Sources: `source_other` (JSONB)
  - Misc: `watch_next`, `to_rewatch` (default False), `remark`, `notes` (JSONB), `cover_image_file`, `completed_at`, `created_at`, `updated_at`
- Add name constraint (at least one name field non-null).
- Add `NameFallbackMixin` with fallback order: CN → EN → Alt.

### 1.2 — Alembic migration

- Run `alembic revision --autogenerate -m "add cartoons table with imdb_rating"`.
- Verify migration creates/updates `cartoons` table correctly.
- Run `alembic upgrade head`.

### 1.3 — Pydantic schemas

In `schemas.py`, add:

- `CartoonBase` — all optional fields
- `CartoonCreate(CartoonBase)` — requires at least one name field
- `CartoonUpdate(CartoonBase)` — all optional for PATCH
- `CartoonResponse(CartoonBase)` — adds `system_id`, `created_at`, `updated_at`

### 1.4 — Router `routers/cartoon.py`

Thin router delegating to services. Endpoints:

- `GET /api/cartoon/` — list all cartoons (optional query params: `franchise_id`, `series_id`, `airing_status`, `watching_status`)
- `GET /api/cartoon/{cartoon_id}` — get single cartoon
- `POST /api/cartoon/` — create cartoon (calls `resolve_cartoon_parent_hierarchy`, then `execute_replace_single_cartoon` after creation)
- `PATCH /api/cartoon/{cartoon_id}` — update cartoon fields
- `DELETE /api/cartoon/{cartoon_id}` — delete cartoon (logs to `deleted_record`)
- `POST /api/cartoon/{cartoon_id}/autofill` — Autofill & Update button; calls `execute_replace_single_cartoon`

### 1.5 — Register router in `main.py`

Add `from routers.cartoon import router as cartoon_router` and `app.include_router(cartoon_router)`.

**Checkpoint — pause and ask for permission before proceeding to Step 2.**

---

## Step 2 — Backend Utils

**Files:** `utils/tmdb_utils.py`, `utils/omdb_utils.py`, `utils/imdb_utils.py`, `utils/formatter.py`, `utils/utils.py`

### 2.1 — `utils/tmdb_utils.py`

Add `map_tmdb_to_cartoon_data(raw)`:

- Same structure as `map_tmdb_to_tv_show_data` but field names for cartoon:
  - `release_date` ← `_convert_tmdb_date(first_air_date)`
  - `cover_image_url` ← `poster_path` + `TMDB_IMAGE_BASE_URL`

_(Note: `map_tmdb_to_tv_show_data` is already reused for season-level data in the autofill; a separate cartoon mapper is needed for show-level data to allow future divergence.)_

### 2.2 — `utils/omdb_utils.py`

Add `map_omdb_to_tv_data(raw)`:

- `imdb_rating` ← `imdbRating`; `"N/A"` → `None`

### 2.3 — `utils/imdb_utils.py`

Add `map_imdb_to_cartoon_data(tmdb_raw, tmdb_season_raw, omdb_raw)`:

- Mirrors `map_imdb_to_tv_show_data`:
  1. If `tmdb_season_raw`: apply `map_tmdb_to_tv_show_data(tmdb_season_raw)` (reuse — returns release_date, ep_total, cover_image_url, \_season_air_date, \_episodes)
  2. If `cover_image_url` still None and `tmdb_raw`: fall back to show-level poster via `_build_poster_url`
  3. If `omdb_raw`: apply `map_omdb_to_tv_data(omdb_raw)` (adds `imdb_rating`)

### 2.4 — `utils/formatter.py`

Add `parse_cartoon_from_sheet(row_dict)`:

- Mirrors `parse_tv_show_from_sheet` but for cartoon columns.
- Foreign keys (`franchise_id`, `series_id`, `prequel_id`, `sequel_id`) parsed as `UUID`.
- `imdb_id` parsed as `str` (same as TV show).
- `notes` field parsed via `json.loads`.

### 2.5 — `utils/utils.py`

Update / verify the following functions handle Cartoon objects:

- `apply_validate_episode_math(entry)` — already generic if it reads `ep_total`/`ep_fin` by attribute name; verify and confirm.
- `check_is_tv_completed(entry)` — already generic if it reads `watching_status`, `ep_total`, `ep_fin`; verify.
- `mark_tv_completed(entry)` — already generic; verify it works for Cartoon.
- `bulk_check_cover_image(db, entry_type=None)` — add `"cartoon"` to the list of handled entry types; query `Cartoon` table.
- `bulk_check_unused_cover_images(db)` — add `Cartoon` system_ids to the "in-use" set.
- `find_all_duplicates(db)` — add call to `find_duplicate_cartoon`; include in returned dict under key `"cartoon"`.

**Checkpoint — pause and ask for permission before proceeding to Step 3.**

---

## Step 3 — Backend Services

**Files:** `services/other_logics.py`, `services/calculation.py`, `services/data_control.py`, `routers/data_control.py`

### 3.1 — `services/other_logics.py`

Add cartoon-specific functions (mirror TV show equivalents):

**Checking:**

- `has_missing_values_cartoon(cartoon)` — returns `True` if any of `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` is blank.

**Duplicates:**

- `find_duplicate_cartoon(db)` — same `(franchise_id, series_id, season_part, is_main)` + name match logic as `find_duplicate_tv_show`.

**Sync:**

- `extract_system_options_from_cartoon(db)` — scans `source_official` values; upserts into `system_options` under `"Official Source (Cartoon)"` category.

**Derive:**

- `derive_watch_order_cartoon(db, franchise_id)` — mirrors `derive_watch_order_tv_show`; eligibility: `season_part` is set.
- `derive_prequel_sequel_cartoon(db, franchise_id)` — mirrors `derive_prequel_sequel_tv_show`; eligibility: `watch_order` not null and `derive_related != False`; does not apply to Special Franchises.
- `derive_season_1_cartoon(cartoon, db)` — sets `season_part = "Season 1"` if `season_part` is None, `franchise_id` is set, and the franchise has exactly 1 cartoon entry.

**Autofill:**

- `autofill_cartoon_from_imdb(cartoon, db)` — mirrors `autofill_tv_show_from_imdb`:
  1. Return early if `cartoon.imdb_id` is None.
  2. Call `fetch_imdb_data(cartoon.imdb_id)` → `{tmdb_raw, omdb_raw}`.
  3. If `tmdb_raw`: extract `tmdb_id`; parse season number via `_parse_season_number(cartoon.season_part)`; call `fetch_tmdb_tv_season_data(tmdb_id, season_number)` → `tmdb_season_raw`.
  4. Call `map_imdb_to_cartoon_data(tmdb_raw, tmdb_season_raw, omdb_raw)`.
  5. Fill-only if currently None: `release_date`, `ep_total`.
  6. Always overwrite `imdb_rating` if fetched value is not None.
  7. Fill-only `airing_status` via `_derive_tv_season_airing_status(season_air_date, episodes)`.
  8. Fill-only cover image.

**Parent hierarchy:**

- `resolve_cartoon_parent_hierarchy(db, franchise_id, series_id, names)` — mirrors `resolve_tv_show_parent_hierarchy` but auto-creates franchise with `franchise_type="Cartoon"`.

### 3.2 — `services/calculation.py`

Add cartoon functions; update composite orchestrators:

**Post-processing:**

- `cartoon_post_processing(cartoon, db)`:
  1. `apply_validate_episode_math(cartoon)`
  2. If `check_is_tv_completed(cartoon)` and `watching_status != "Completed"`: `mark_tv_completed(cartoon)`
  3. If `season_part` is None: try `apply_extract_season_from_title(cartoon)`, then `derive_season_1_cartoon(cartoon, db)`
- `run_cartoon_post_processing(db)` — applies `cartoon_post_processing` to every Cartoon entry.
- Update `run_post_processing(db)` to also call `run_cartoon_post_processing`.

**Derive related:**

- `derive_related_cartoon(db, franchise_id)`:
  1. `derive_watch_order_cartoon`
  2. `derive_prequel_sequel_cartoon`
- `run_derive_related_cartoon(db)` — runs `derive_related_cartoon` for every Cartoon franchise.
- Update `run_derive_related(db)` to also call `run_derive_related_cartoon`.

**Sync:**

- `run_sync_cartoon(db)`:
  1. `extract_system_options_from_cartoon`
- Update `run_sync(db)` to also call `run_sync_cartoon` (already documented in business-logic.md).

**Calculate all:**

- Update `run_calculate_all(db)` — no changes needed if it calls `run_post_processing`, `run_derive_related`, `run_sync` (all now include cartoon).

### 3.3 — `services/data_control.py`

**Backup:**

- Update `execute_backup` to include `Cartoon` model in the backup order (after TV Shows, before Manga).

**Fill:**

- Add `execute_fill_cartoon(db, request, action_specific, action_type, log_action)` _(SSE)_:
  1. `apply_extract_imdb_id` on all cartoons.
  2. Queue: entries where `has_missing_values_cartoon()` returns True.
  3. For each: `autofill_cartoon_from_imdb()`.
  4. Disconnection check after each entry.
  5. After loop: `run_cartoon_post_processing`, `run_derive_related_cartoon`, `run_sync_cartoon`.
  6. Yield SSE: `{status, current_entry, processed, total}`.
- Update `execute_fill_all` to also call `execute_fill_cartoon`.

**Replace:**

- Add `apply_single_replace_cartoon(db, cartoon, bulk)`:
  1. `apply_extract_imdb_id`
  2. `autofill_cartoon_from_imdb`
  3. `cartoon_post_processing`
  4. If `bulk=False`: call `run_derive_related_cartoon(db)` inline.
- Add `execute_replace_single_cartoon(db, cartoon_id, action_type, log_action)` — router-level; calls `apply_single_replace_cartoon(bulk=False)`, then `run_sync_cartoon`.
- Add `execute_replace_cartoon(db, request, action_specific, action_type, log_action)` _(SSE)_:
  1. Queue: cartoons with `imdb_id` or `imdb_link` set.
  2. For each: `apply_single_replace_cartoon(bulk=True)`.
  3. After loop: `run_derive_related_cartoon`, `run_sync_cartoon`.
- Update `execute_replace_all` to also call `execute_replace_cartoon`.

**Pull:**

- Update `execute_pull_specific` to handle `tab_name="Cartoon"`:
  - Read rows, parse via `parse_cartoon_from_sheet`.
  - Resolve FK via `resolve_cartoon_parent_hierarchy`.
  - Sanitize `watching_status`, `airing_status`, `airing_type`.
  - Smart PK logic (search by name if PK empty).
  - Upsert.
- Update `execute_pull_all` to include `"Cartoon"` tab in dependency order (after TV Show, before Manga).

### 3.4 — `routers/data_control.py`

Add endpoints (pattern: same as TV show):

- `POST /api/data-control/fill/cartoon` — streams `execute_fill_cartoon`
- `POST /api/data-control/replace/cartoon` — streams `execute_replace_cartoon`
- `POST /api/data-control/replace/cartoon/{cartoon_id}` — calls `execute_replace_single_cartoon`
- `POST /api/data-control/pull/cartoon` — calls `execute_pull_specific("Cartoon")`
- Update `POST /api/data-control/fill/all` and `POST /api/data-control/replace/all` (no new route needed — orchestrators updated).

**Checkpoint — pause and ask for permission before proceeding to Step 4.**

---

## Step 4 — Frontend New Components

**Files:** `frontend/src/components/CartoonNamingCard.jsx`, `frontend/src/components/CartoonCard.jsx`, `frontend/src/components/CartoonCardFuture.jsx`

### 4.1 — `CartoonNamingCard.jsx`

Naming card for the Cartoon detail page. Shows: Cartoon Name EN, CN, Alt. Mirror `MovieNamingCard.jsx` (3-field variant without JP/Roman).

### 4.2 — `CartoonCard.jsx` (Cartoon Entry Card 2)

Grid card for Library and Franchise Hub views. Shows:

- Cover image (with My Rating badge top-left)
- Airing Status badge
- Airing Type badge
- Cartoon Name CN with fallback (primary title)
- Cartoon Name EN (hidden if CN used fallback)
- Season/Part label
- Episode progress: `ep_fin / ep_total`
- Official Source label (if set)
- Release Date
- IMDB Rating

Mirror `MovieCard.jsx` / `AnimeCard.jsx` as reference.

### 4.3 — `CartoonCardFuture.jsx` (Cartoon Entry Card 3)

Future release card for the FutureReleases page Cartoon tab. Shows:

- Cover image
- Cartoon Name CN with fallback
- Release Date
- Airing Status badge
- Watching Status label
- Admin: inline watching-status selector, "Mark as Airing" button (PATCHes `airing_status`; entry removed from list immediately)

**Checkpoint — pause and ask for permission before proceeding to Step 5.**

---

## Step 5 — Frontend New Pages

**Files:** `frontend/src/pages/Cartoon.jsx`, `frontend/src/pages/CartoonNotes.jsx`, `frontend/src/pages/LibraryCartoon.jsx`, `frontend/src/pages/FranchiseCartoon.jsx`

### 5.1 — `Cartoon.jsx` (Cartoon Detail Page — `/cartoon/:system_id`)

**Data loaded:**

- `GET /api/cartoon/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/cartoon/` (for prequel/sequel linking)

**Admin Controls Block:**

- Edit button → `/modify?id=:system_id&type=cartoon`
- Mark Completed button — PATCHes `watching_status: "Completed"` and `airing_status: "Finished Airing"`
- Autofill & Update button → `POST /api/cartoon/:system_id/autofill`

**Layout (left column):**

- Cartoon poster
- **Sources Card** (reusable) — `source_other` (JSONB) only; `imdb_link` block when set
- Watch Order
- **Related Entries Card** (reusable) — Watch Order, Prequel, Sequel as mini cards
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status, Airing Type
- Main Title: Cartoon Name CN with fallback
- Sub Title: Cartoon Name EN (hidden if CN used fallback)
- From Franchise (navigates to `/franchise/cartoon/:id`)
- From Series (uses **Series Information Pop Up Entry** reusable)
- **Score Block** (reusable): IMDB Rating, Last Updated Time

**My Tracker section:**

- Ep Watched / Ep Total
- +/- buttons and direct edit input (admin only)
- Watching Status dropdown (admin editable) — `PATCH /api/cartoon/:id`
- My Rating dropdown (admin editable)

**Detail sections:**

- `CartoonNamingCard`: CN, EN, Alt
- **Information Card** (reusable): Season/Part, Airing Type, Airing Status, Length Per Ep, Official Source, Release Date, Total Ep
- Remarks — shown when not null
- `CartoonNotes` (always rendered at bottom)

Writes: `PATCH /api/cartoon/:system_id`

### 5.2 — `CartoonNotes.jsx`

Structured notes editor (12 sections). Always rendered at the bottom of the Cartoon detail page and Modify Cartoon form. Saves via `PATCH /api/cartoon/:id` with `notes` field. Mirror `TVShowNotes.jsx` (same 12 sections unless otherwise specified).

### 5.3 — `LibraryCartoon.jsx` (Cartoon Library — `/library/cartoon`)

**Data loaded:**

- `GET /api/cartoon/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar:**

- Filter search: by Franchise Title, Series Title, Cartoon Title, Release Year. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDb Rating / Release Date (new to old; TBD first)
- Advanced filters (collapsible): Official Source, Airing Status, Airing Type, Watching Status
- Grid/Table view toggle

**Grid view:** each entry — `CartoonCard.jsx`

**Table view columns:** Franchise Name CN (fallback), Cartoon Name CN, Cartoon Name EN, Airing Type, Season Part, Airing Status, Ep Finished / Ep Total, Official Source, My Rating, IMDb Rating, + button (admin only)

Admin: inline quick-status toggle via `PATCH /api/cartoon/:system_id`

### 5.4 — `FranchiseCartoon.jsx` (Cartoon Franchise Hub — `/franchise/cartoon/:system_id`)

**Data loaded:**

- `GET /api/franchise/:system_id`
- `GET /api/series/?franchise_id=:system_id`
- `GET /api/cartoon/?franchise_id=:system_id`

**Layout:**

- Edit button (admin only) → Modify page
- **Franchise Information Block** (reusable)
- **Belonging Series Block** (reusable)
- **Notes and Remarks Block** (reusable, admin editable)

**Cartoon Entry Section:**

- Sort By: Release Date (default) / Title / My Rating / IMDb Rating
- Filter: Airing Status / Watching Status
- **Group by Series Button** (reusable)
- Each entry: `CartoonCard.jsx`, grouped by Series

Admin: `PATCH /api/franchise/:system_id`

**Checkpoint — pause and ask for permission before proceeding to Step 6.**

---

## Step 6 — Frontend Updates (Routing & Navigation)

**Files:** `frontend/src/App.jsx`, `frontend/src/components/Nav.jsx`

### 6.1 — `App.jsx`

Add routes:

- `/cartoon/:system_id` → `<Cartoon />`
- `/library/cartoon` → `<LibraryCartoon />`
- `/franchise/cartoon/:system_id` → `<FranchiseCartoon />`

### 6.2 — `Nav.jsx`

- Change Cartoon link in Reality dropdown from `/under-development` to `/library/cartoon` (or whichever route is canonical).
- Update universal search scope to include Cartoon (data fetch from `GET /api/cartoon/`; results shown as Cartoon suggestions navigating to `/cartoon/:id`).

**Checkpoint — pause and ask for permission before proceeding to Step 7.**

---

## Step 7 — Frontend Updates (Shared Pages)

**Files:** `frontend/src/pages/Index.jsx`, `frontend/src/pages/Admin.jsx`, `frontend/src/pages/Add.jsx`, `frontend/src/pages/Modify.jsx`, `frontend/src/pages/Delete.jsx`, `frontend/src/pages/Search.jsx`, `frontend/src/pages/FutureReleases.jsx`, `frontend/src/pages/FranchiseLibrary.jsx`, `frontend/src/pages/FranchiseReality.jsx`, `frontend/src/components/DashboardCard.jsx`, `frontend/src/components/SourcesCard.jsx`

### 7.1 — `Index.jsx` (Dashboard)

- Load `GET /api/cartoon/` alongside existing fetches.
- Add Cartoon to the Watching division (Active Watching / Passive Watching / Paused sub-sections).
- Each cartoon entry: **Cartoon Entry Card 1** (TBD — use `DashboardCard.jsx` if compatible, or inline card).
- Admin: inline episode progress editing via `PATCH /api/cartoon/:system_id`.
- Add Cartoon to the filter chips (Anime / Manga / Novel / TV Show / Cartoon).

### 7.2 — `DashboardCard.jsx`

- Verify whether the card is generic enough to display Cartoon Entry Card 1 for the dashboard watching division. If it assumes anime-specific fields, create a cartoon variant inline in `Index.jsx` or extend `DashboardCard` to accept a `mediaType` prop.

### 7.3 — `SourcesCard.jsx`

- Verify whether Sources Card already handles `source_other` JSONB + `imdb_link` for non-anime types. Cartoon detail page uses: `source_other` + `imdb_link`. No Bahamut / Netflix / MAL / AniList. Adjust if needed.

### 7.4 — `Admin.jsx` (System Page)

**Main Data Control Action Block:**

- Fill section: add "Fill Cartoon" button → SSE stream `/api/data-control/fill/cartoon`
- Replace section: add "Replace Cartoon" button → SSE stream `/api/data-control/replace/cartoon`
- Pull from Sheets section: add "Pull Cartoon" button → `POST /api/data-control/pull/cartoon`
- Update Fill All and Replace All SSE handlers to include cartoon in the progress display.

### 7.5 — `Add.jsx`

Add **Add New Cartoon Entry Tab**:

**Titles & Naming:**

- Franchise (ComboBox, filtered to `franchise_type = "Cartoon"` or new)
- Series (ComboBox + auto-create modal, filtered by selected franchise)
- Cartoon Name EN / CN / Alt
- Season dropdown / Part dropdown

**Status & Progress:**

- Airing Status dropdown (default: Not Yet Aired)
- Watching Status dropdown (default: Might Watch)
- Total Episode, Episode Finished
- Length Per Ep (min)
- My Rating dropdown
- Watch Next checkbox
- To Rewatch checkbox
- IMDB Rating

**Classification & Production:**

- Cartoon Official Source (system_options `"Official Source (Cartoon)"`)
- Cartoon Airing Type dropdown (`"TV"`, `"TV重製版"`, `"TV重啟版"`, `"Movie"`, `"Special"`, `"Other"`)
- Main/Spinoff dropdown (`"Main / Spinoff"` system option category)
- Release Date (month + year or year-only)

**Relational & Timeline:**

- Prequel ID, Sequel ID, Watch Order, Derive Related dropdown

**Source & Links:**

- IMDB ID, IMDB Link, Other Sources (name → URL pairs)

**Notes & Other:**

- Cover Image File, Remark, Notes (`CartoonNotes`)

**On submit:**

- If no existing franchise → Franchise Generation modal (sets `franchise_type = "Cartoon"`).
- If no existing series and field non-blank → Series Generation modal.
- Create via `POST /api/cartoon/`.
- Autofill triggered automatically by router (calls `execute_replace_single_cartoon` internally).

### 7.6 — `Modify.jsx`

Add **Modify Cartoon Entry Tab**:

- Search bar (Franchise + Series + Cartoon name); results grouped by franchise/series.
- Recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback.
- After selecting: Other Entries in franchise block (grouped by series); System ID (immutable); Entry Name CN with fallback (immutable); then full edit form (mirrors Add Cartoon tab).
- `CartoonNotes` always rendered at bottom.
- Save Changes button.

Writes: `PATCH /api/cartoon/:id`

### 7.7 — `Delete.jsx`

Add **Delete Cartoon Entry Tab**:

- Search bar → Search Suggestion for Deletion.
- After selecting: cover thumbnail, Cartoon Name CN/EN, Airing Status, Watching Status, Franchise name, System ID, Delete button.
- If only entry in series: offer to delete series or keep it.
- If only entry in franchise: offer to delete franchise or keep it.

Deletes: `DELETE /api/cartoon/:id`

Also load `GET /api/cartoon/` in the page's data fetch.

### 7.8 — `Search.jsx`

- Add `"cartoon"` scope to data loading: fetch `GET /api/cartoon/` when scope is `all` or `cartoon`.
- Add **Cartoon Entry Section** to search results — each entry: `CartoonCard.jsx`.
- Add `"cartoon"` to scope selector.

### 7.9 — `FutureReleases.jsx`

Add **Cartoon Future Release Tab**:

- Load `GET /api/cartoon/?airing_status=Not+Yet+Aired` lazily on first tab open.
- Filter: entries with `release_date` set.
- Group by release year, sorted by release date (old to new); TBD last.
- Each entry: `CartoonCardFuture.jsx`.

### 7.10 — `FranchiseLibrary.jsx`

- Ensure Cartoon franchise type (`"Cartoon"`) is included in the advanced filter options (already listed as an option in pages.md).
- Franchise entries of type `"Cartoon"` should navigate to `/franchise/cartoon/:system_id` (not `/franchise/:system_id` which goes to FranchiseAcg). Update navigation logic based on `franchise_type`.

### 7.11 — `FranchiseReality.jsx`

- Confirm Cartoon franchises are NOT shown here. This page is for `franchise_type = "TV or Movie"` (movies + TV shows).
- No changes needed if routing is already type-based.

**Checkpoint — pause and ask for permission before proceeding to Step 8.**

---

## Step 8 — Statistics & Final Integration

**Files:** `frontend/src/pages/Statistics.jsx` (partial), verification

### 8.1 — `Statistics.jsx` — To Rewatch tab

- Add Cartoon tab to **To Rewatch** section:
  - Load `GET /api/cartoon/?to_rewatch=true` (or filter client-side).
  - Sorted by Cartoon Name EN; shows poster, Cartoon Name CN with fallback, My Rating.

### 8.2 — `Statistics.jsx` — Watch Next tab

- Add Cartoon tab to **Watch Next** section (TBD per pages.md — mark as TBD, wire up placeholder).

### 8.3 — `Statistics.jsx` — Recent Completions

- Add Cartoon tab to **Recent Completions** section:
  - Grouped by Official Source (Cartoon Network / Disney / Nickelodeon / Adult Swim / FOX / HBO / Others).
  - Shows Cartoon Name CN with fallback, Name EN (hidden if CN used fallback), My Rating, Completed Date.

### 8.4 — End-to-end verification

- Add a cartoon entry via Add page → verify autofill runs.
- Verify cartoon appears in Library, dashboard watching division, and franchise hub.
- Verify Pull/Backup round-trip (backup to sheet → pull back).
- Verify Calculate All updates cartoon derive/sync.
- Verify Search returns cartoons.
- Verify Future Releases tab shows not-yet-aired cartoons.

---

## Progress Tracker

| Step | Description                                                                                                   | Status      |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | Backend Foundation (model, schema, router, main.py, migration)                                                | Done        |
| 2    | Backend Utils (map functions, parsers, check functions)                                                       | Done        |
| 3    | Backend Services (autofill, post-processing, derive, sync, data control)                                      | In Progress |
| 4    | Frontend New Components (CartoonNamingCard, CartoonCard, CartoonCardFuture)                                   | Not Started |
| 5    | Frontend New Pages (Cartoon, CartoonNotes, LibraryCartoon, FranchiseCartoon)                                  | Not Started |
| 6    | Frontend Updates — Routing & Navigation (App.jsx, Nav.jsx)                                                    | Not Started |
| 7    | Frontend Updates — Shared Pages (Index, Admin, Add, Modify, Delete, Search, FutureReleases, FranchiseLibrary) | Not Started |
| 8    | Statistics & Final Integration                                                                                | Not Started |
