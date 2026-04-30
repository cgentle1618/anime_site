# TV Show Implementation Plan

## Overview

Full implementation of TV show entries — database model, backend CRUD + pipeline, frontend pages and components, and admin forms. Follows the same architecture as the Movie implementation. Uses TMDB + OMDb (IMDb) as the autofill source.

---

## Phase 1: Database & Backend Foundation

### Step 1 — `models.py`: Add `TVShows` model

Add the `TVShows` SQLAlchemy model mirroring the `tv_shows` schema:

- Identity: `system_id`, `franchise_id` (FK SET NULL), `series_id` (FK SET NULL)
- Names: `tv_name_en`, `tv_name_cn`, `tv_name_alt`
- Classification: `region`, `season_part`, `source_official`, `airing_status`, `watching_status`, `is_main`
- Episodes: `ep_total`, `ep_fin` (default 0)
- Ratings: `my_rating`, `imdb_rating`, `release_date`
- Relational: `derive_related`, `prequel_id`, `sequel_id`, `watch_order`
- External: `imdb_id`, `imdb_link`
- Sources: `source_other`, `source_other_link`
- Misc: `watch_next`, `to_rewatch`, `remark`, `cover_image_file`, `completed_at`, `created_at`, `updated_at`

Use `NameFallbackMixin` (CN → EN → Alt). `release_date` and `is_main` are stored as strings.

- [x] Done

---

### Step 2 — Alembic: Migration for `tv_shows` table

Run `alembic revision --autogenerate -m "add tv_shows table"` after Step 1, then `alembic upgrade head`.

- [x] Done

---

### Step 3 — `schemas.py`: Add TV show schemas

Add:

- `TVShowBase` — all shared fields
- `TVShowCreate(TVShowBase)` — for POST
- `TVShowUpdate(TVShowBase)` — for PUT
- `TVShowResponse(TVShowBase)` — with `display_name` computed property (CN → EN → Alt fallback), `from_attributes = True`

- [x] Done

---

### Step 4 — `routers/tv_show.py`: New TV show CRUD router

Prefix: `/api/tv-shows`

Endpoints:

- `GET /` — list all TV shows; optional query params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `region`, `search_query`; ordered by `created_at` desc
- `GET /{tv_show_id}` — get single TV show by UUID; 404 if not found
- `POST /` — create TV show entry; resolve parent hierarchy; auto-generate `system_id`, `created_at`, `updated_at`; run `execute_replace_single_tv_show` after creation; body: `TVShowCreate`; admin only
- `PUT /{tv_show_id}` — full update; resolve hierarchy; refresh `updated_at`; run `execute_replace_single_tv_show`; admin only
- `PATCH /{tv_show_id}` — partial update (watching status, ep_fin, rating); no pipeline rerun; auto-marks completed if `ep_fin == ep_total`; admin only
- `DELETE /{tv_show_id}` — delete entry; remove cover image from GCS; log to `deleted_record`; admin only
- `POST /{tv_show_id}/autofill` — manual trigger for `execute_replace_single_tv_show`; admin only

Response model: `TVShowResponse`

- [x] Done (execute_replace_single_tv_show stub added to data_control.py; full implementation in Phase 3)

---

### Step 5 — `main.py`: Register TV show router

Include `routers/tv_show.py` router in `main.py`.

- [x] Done

---

## Phase 2: Backend Utils & IMDb Services

### Step 6 — `utils/tmdb_utils.py`: Add season-level helpers

Add:

- `_parse_season_number(season_part: str | None) -> int` — regex `Season\s+(\d+)`, defaults to `1`
- `map_tmdb_to_tv_show_data(raw: dict) -> dict` — maps TMDB season details response:
  - `release_date` from `_convert_tmdb_date(air_date)`
  - `ep_total` from `len(episodes[])`
  - `cover_image_url` from `poster_path` with `TMDB_IMAGE_BASE_URL` prefix
  - `_season_air_date` = raw `air_date` (private, for airing status derivation)
  - `_episodes` = raw `episodes[]` (private, for airing status derivation)

- [x] Done

---

### Step 7 — `utils/imdb_utils.py`: Add `map_imdb_to_tv_show_data`

Add:

- `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw) -> dict` — merges all three sources:
  1. If `tmdb_season_raw` is not None: apply `map_tmdb_to_tv_show_data`
  2. If `cover_image_url` still None and `tmdb_raw` is not None: fall back to show-level `poster_path` via `_build_poster_url`
  3. If `omdb_raw` is not None: apply `map_omdb_to_tv_show_data` (adds `imdb_rating`)

- [x] Done

---

### Step 8 — `utils/formatter.py`: Add `parse_tv_show_from_sheet`

Add `parse_tv_show_from_sheet(row_dict)` — calls `parse_from_sheet` for every TV show field with correct types. Foreign keys (`franchise_id`, `series_id`, `prequel_id`, `sequel_id`) parsed as `UUID`. `imdb_id` parsed as `str`.

- [x] Done

---

### Step 9 — `services/tmdb.py`: Add `fetch_tmdb_tv_season_data`

Add:

- `fetch_tmdb_tv_season_data(tmdb_id: int, season_number: int) -> dict | None`
  - Fetches `GET /3/tv/{tmdb_id}/season/{season_number}`
  - Uses same `TMDbRateLimiter` and `@retry` config as `fetch_tmdb_data`
  - Returns raw season JSON or `None`

- [x] Done

---

### Step 10 — `services/imdb.py`: Add `autofill_tv_show_from_imdb`

Add `autofill_tv_show_from_imdb(tv_show, db)`:

1. Return early if `tv_show.imdb_id` is None
2. `fetch_imdb_data(tv_show.imdb_id)` → `{tmdb_raw, omdb_raw}`
3. If `tmdb_raw` is not None: extract `tmdb_id`, parse season number via `_parse_season_number(tv_show.season_part)`, call `fetch_tmdb_tv_season_data(tmdb_id, season_number)` → `tmdb_season_raw`
4. `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)` → flat dict
5. Fill only if currently None: `release_date`, `ep_total`
6. `imdb_rating`: always overwrite if fetched value is not None
7. `airing_status` (fill-only): derive via `_derive_tv_season_airing_status(season_air_date, episodes)`
8. Cover image (fill-only): if `cover_image_file` is None and `cover_image_url` in data, download, upload to GCS as `{system_id}.jpg`, set field

Does not commit — caller is responsible.

- [x] Done

---

## Phase 3: Backend Services (Logic)

### Step 11 — `services/other_logics.py`: TV show logic functions

Add:

- `has_missing_values_tv_show(tv_show) -> bool` — returns `True` if any of: `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` is blank/None
- `resolve_tv_show_parent_hierarchy(db, franchise_id, series_id, names) -> (UUID, UUID | None)` — franchise: valid UUID pass-through; null/string → search by name (ilike on en/cn/alt); not found → auto-create with `franchise_type="TV or Movie"`. Series: non-string pass-through; non-empty string → search by name; not found → set null (no auto-create)
- `derive_season_1_tv_show(tv_show, db)` — sets `season_part = "Season 1"` if None, `franchise_id` is set, and franchise has exactly 1 TV show entry
- `find_duplicate_tv_show(db) -> list` — union-find on same `(franchise_id, series_id, season_part, is_main)` + at least one matching name
- `extract_system_options_from_tv_show(db)` — scans all `TVShows` for `source_official`; auto-adds new values to `system_options`

Note: `mark_tv_completed` already shared across Anime, TV show, Cartoon — confirm it works generically on any entry with `watching_status`, `airing_status`, `ep_fin`, `ep_total`.

Update `find_all_duplicates` to include `tv_show` in its returned dict.
Update `bulk_check_cover_image` and `bulk_check_unused_cover_images` to include TV shows.
Update `apply_validate_episode_math` if needed to accept TV show entries (likely already works generically).

- [x] Done

---

### Step 12 — `services/calculation.py`: TV show calculation functions

Add:

- `tv_show_post_processing(tv_show, db)` — single-entry composite:
  1. `apply_validate_episode_math(tv_show)`
  2. If `check_is_tv_completed(tv_show)` and `tv_show.watching_status != "Completed"`: call `mark_tv_completed(tv_show)`
  3. If `season_part` is None: try `apply_extract_season_from_title(tv_show)`, then `derive_season_1_tv_show(tv_show, db)`
- `run_tv_show_post_processing(db)` — applies `tv_show_post_processing` to every `TVShows` entry
- `derive_watch_order_tv_show(db, franchise_id)` — assigns consecutive `watch_order` floats to eligible TV show entries in franchise (eligible: `season_part` is set); fill-only; sort by season number then part number; series groups first, no-series entries last
- `derive_prequel_sequel_tv_show(db, franchise_id)` — sets `prequel_id`/`sequel_id` sorted by `watch_order`; eligible: `watch_order` not null and `derive_related != False`; not for Special Franchises; fill-only
- `derive_related_tv_show(db, franchise_id)` — per franchise_id: `derive_watch_order_tv_show`, then `derive_prequel_sequel_tv_show`; commits after all franchises processed
- `run_derive_related_tv_show(db)` — applies `derive_related_tv_show` to every TV or Movie franchise
- `run_sync_tv_show(db)` — calls `extract_system_options_from_tv_show(db)`

Update `run_post_processing` to include `run_tv_show_post_processing`.
Update `run_sync` to include `run_sync_tv_show`.
Update `run_calculate_all` to include `run_derive_related_tv_show`.

- [x] Done

---

### Step 13 — `services/data_control.py`: TV show data control functions

Add:

- `execute_fill_tv_show(db, request, action_specific, action_type, log_action)` _(SSE)_
  1. `apply_extract_imdb_id` on all TV show entries
  2. Queue: entries where `has_missing_values_tv_show()` is True
  3. For each: call `autofill_tv_show_from_imdb(tv_show, db)`, check `request.is_disconnected()` → rollback + log "Aborted" if disconnected
  4. After loop: `run_tv_show_post_processing`, `run_derive_related_tv_show`, `run_sync_tv_show`
  5. Yields SSE: `{status, current_entry, processed, total}`
- `apply_single_replace_tv_show(db, tv_show, bulk)` — core logic:
  1. `apply_extract_imdb_id(tv_show)`
  2. `autofill_tv_show_from_imdb(tv_show, db)`
  3. `tv_show_post_processing(tv_show, db)`
  4. If `bulk=False`: call `run_derive_related_tv_show(db)`; if `bulk=True`: caller handles
- `execute_replace_single_tv_show(db, tv_show_id, action_type, log_action)` — router-level function: lookup entry, call `apply_single_replace_tv_show(bulk=False)`, run `run_sync_tv_show`, commit, log
- `execute_replace_tv_show(db, request, action_specific, action_type, log_action)` _(SSE)_
  1. Queue: TV shows with `imdb_id` or `imdb_link` set
  2. For each: `apply_single_replace_tv_show(bulk=True)`
  3. After loop: `run_derive_related_tv_show`, `run_sync_tv_show`

Update existing functions:

- `execute_fill_all` — add call to `execute_fill_tv_show` (with `log_action=False`) after Fill Movie
- `execute_replace_all` — add call to `execute_replace_tv_show` (with `log_action=False`) after Replace Movie
- `execute_backup` — add `TVShows` to the tab write order (after Movies, before Cartoons)
- `execute_pull_all` — add `"TV Show"` tab pull in dependency order (after Movie)
- `execute_pull_specific` — add `"TV Show"` case: parse via `parse_tv_show_from_sheet`, resolve hierarchy via `resolve_tv_show_parent_hierarchy`

- [x] Done

---

### Step 14 — `routers/data_control.py`: TV show data control endpoints

Add endpoints:

- `POST /fill/tv-show` — trigger `execute_fill_tv_show` (SSE); admin only
- `POST /replace/tv-show` — trigger `execute_replace_tv_show` (SSE); admin only

Update existing:

- `POST /pull/specific` — verify `"TV Show"` tab name is handled in `execute_pull_specific`
- Pull All and Fill All and Replace All endpoints already call the updated orchestrators

- [x] Done

---

## Phase 4: Frontend New Components & Pages

### Step 15 — `components/TVNamingCard.jsx`: TV show naming card

Naming/identity card for TV show detail page. Shows: `tv_name_cn`, `tv_name_en`, `tv_name_alt`, `region`, `season_part`, `source_official`, `is_main`. Follows same layout as `MovieNamingCard.jsx`.

- [x] Done

---

### Step 16 — `components/TVCard.jsx`: TV show entry card

Entry card for use in TV Library, Reality Franchise Hub, Search. Shows: cover image, `display_name` (CN primary), `region`, `season_part`, `airing_status`, `watching_status`, `imdb_rating`, `ep_fin`/`ep_total`. Clicking navigates to `/tv-show/:system_id`. Follows same pattern as `MovieCard.jsx`.

- [x] Done

---

### Step 17 — `components/TVCardFuture.jsx`: TV show future release card

Card for TV shows with `airing_status = "Not Yet Aired"` or `"Airing"` in FutureReleases. Shows: cover image, `display_name`, `region`, `release_date`, `airing_status`. Follows `MovieCardFuture.jsx` pattern.

- [x] Done

---

### Step 18 — `TV.jsx`: TV show detail page

Route: `/tv-show/:system_id`

Loads: `GET /api/tv-shows/:id`, `GET /api/franchise/`, `GET /api/series/`

Displays:

- Cover image
- `TVNamingCard` — names, region, season, is_main, source
- `SourcesCard` — imdb_link, source_other/source_other_link
- Ratings block — `imdb_rating`, `my_rating`
- Status block — `airing_status`, `watching_status`, `release_date`
- Episode block — `ep_fin` / `ep_total`
- Prequel/Sequel links (to other TV show detail pages)
- Franchise and Series breadcrumb links
- Admin quick-edit button → `/modify?id=:uuid&type=tv-show`

- [x] Done

---

### Step 19 — `LibraryTV.jsx`: TV show library page

Route: `/library/tv-show`

Loads: `GET /api/tv-shows/` with optional filters

Filters: Region, Airing Status, Watching Status

Displays: Grid of `TVCard` components, ordered by `created_at` desc

- [x] Done

---

## Phase 5: Frontend Updates

### Step 20 — `App.jsx`: Add routes

Add:

- `/tv-show/:system_id` → `TV`
- `/library/tv-show` → `LibraryTV`
- `/franchise/reality/:system_id` (if not already present) → `FranchiseReality`

- [x] Done

---

### Step 21 — `Nav.jsx`: Add TV show navigation

- Reality dropdown: add "TV Show" link → `/library/tv-show`
- Universal search bar: add TV show to the "All" scope search; show TV show results grouped as "TV Show"

- [x] Done

---

### Step 22 — `SourcesCard.jsx`: Add TV show support

Ensure `SourcesCard` renders `imdb_link`, `source_other`, `source_other_link` for TV show entries (may already be generic; verify and extend if needed).

- [x] Done (already generic, no changes needed)

---

### Step 23 — `Admin.jsx` (System Page): Add TV show section

Add TV show count / quick stats to the system admin overview page (alongside Movie and Anime Movie sections).

- [x] Done

---

### Step 24 — `Add.jsx`: Add TV Show tab

New "Add TV Show" tab following the spec in `admin-forms.md`:

- Prefill from existing TV show entry (search box → fills: Franchise, Series, all TV Show Name fields, is_main, region)
- Franchise: search TV or Movie franchises or type new name; required
- Series: search or type new name; optional
- Defaults: Airing Status = "Not Yet Aired", Watching Status = "Might Watch", is_main = "本傳"
- On submit: Franchise Generation modal if no existing franchise; Series Generation modal if typed series; `POST /api/tv-shows/`
- Franchise modal: uses TV show name fields; `franchise_type = "TV or Movie"`; Expectation default = Low
- Series modal: uses TV show name fields

- [x] Done

---

### Step 25 — `Modify.jsx`: Modify TV Show tab

New "Modify TV Show" tab following `admin-forms.md`:

- Search to find existing TV show entry to edit
- Franchise: search TV or Movie franchises; sibling ribbon shows other TV shows in that franchise
- Series: search or type new name
- On submit: Franchise Generation modal if needed; Series Generation modal if needed; `PUT /api/tv-shows/:id`
- Deep-link: TV show detail page Quick Edit → `/modify?id=:uuid&type=tv-show`

- [x] Done

---

### Step 26 — `Delete.jsx`: Delete TV Show tab

New "Delete TV Show" tab:

- Search by TV show name (CN/EN/Alt)
- Select shows cover thumbnail, TV Name CN/EN, Airing Status, Watching Status, Franchise Name, System ID, Delete button
- Confirmation modal: if deleted TV show is the only entry in its franchise, offer to also delete orphaned Franchise Hub
- Deletes: `DELETE /api/tv-shows/:id`

- [x] Done

---

### Step 27 — `Search.jsx`: Add TV show results

Add TV show results section to Search page. Loads TV shows when search query matches TV show names. Displays `TVCard` components in "TV Show" group. Also update the Nav universal search bar to include TV shows in "All" scope.

- [x] Done

---

### Step 28 — `FutureReleases.jsx`: TV Show future release tab

Add "TV Show" tab to FutureReleases page showing TV shows with `airing_status` in `["Not Yet Aired", "Airing"]`, ordered by `release_date`. Displays `TVCardFuture` components.

- [x] Done

---

## Phase 6: Reality Franchise Page

### Step 29 — `FranchiseReality.jsx`: Show TV shows

Update the Reality Franchise Hub to fetch and display TV shows belonging to the franchise via `GET /api/tv-shows/?franchise_id=:id`. Display using `TVCard` components, grouped by series.

- [x] Done

---

## Notes

- The spec note says IMDB-related features are not exhaustive in the spec — `autofill_tv_show_from_imdb` and all supporting helpers (`fetch_tmdb_tv_season_data`, `_parse_season_number`, `map_tmdb_to_tv_show_data`, `map_imdb_to_tv_show_data`, `_derive_tv_season_airing_status`) are planned based on `business-logic.md`.
- Steps should be implemented and committed in phase order. Pause and confirm before starting each new phase.
- After Phase 3 is complete, backend should be fully functional and testable via API before frontend work begins.
