# Manga Implementation Plan

## Overview

Full manga feature implementation: backend CRUD + data pipeline, then frontend pages and admin forms. Follows existing patterns from Cartoon implementation (most recent prior type).

Progress notation: `[ ]` = pending · `[x]` = done · `[-]` = in progress

---

## Step 1 — Backend Core

Files: `models.py`, Alembic migration, `schemas.py`, `routers/manga.py`, `main.py`

- [x] **1.1** Verify `Manga` model exists in `models.py`; add if missing. Fields per `database-schema.md`: `system_id`, `franchise_id`, `series_id`, all name fields, `region`, `is_main`, `serialization_status`, `reading_status`, `vol_total`, `vol_fin`, `vol_fin_page`, `ch_total`, `ch_fin`, `my_rating`, `mal_rating`, `mal_rank`, `anilist_rating`, `author_plot`, `author_draw`, `release_year`, `end_year`, `anime_studio`, `serialization_platform`, `distributor_tw`, `derive_related`, `prequel_id`, `sequel_id`, `watch_order`, `mal_id`, `mal_link`, `anilist_link`, `source_other`, `read_next`, `to_reread`, `remark`, `notes`, `cover_image_file`, `completed_at`, `created_at`, `updated_at`.
- [x] **1.2** Run Alembic autogenerate + `alembic upgrade head` if the `manga` table does not yet exist.
- [x] **1.3** Add `MangaCreate`, `MangaUpdate`, `MangaResponse` schemas to `schemas.py` (mirror Cartoon pattern; `MangaResponse` includes `display_name` computed field).
- [x] **1.4** Create `routers/manga.py` with endpoints:
  - `GET /api/manga/` — list with optional filters: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `to_reread`, `search_query`
  - `GET /api/manga/{manga_id}` — single entry
  - `POST /api/manga/` — create, then call `execute_replace_single_manga(... action_type="Auto", log_action=False)`
  - `PUT /api/manga/{manga_id}` — full update + replace pipeline
  - `PATCH /api/manga/{manga_id}` — partial patch (includes `completed_at` auto-set when `reading_status = "Completed"`)
  - `DELETE /api/manga/{manga_id}` — delete cover image + log to `deleted_record` + delete entry
- [x] **1.5** Register `manga` router in `main.py`.

---

## Step 2 — Backend Utils & Service Helpers

Files: `utils/jikan_utils.py`, `utils/formatter.py`, `services/jikan.py`

- [x] **2.1** Verify `fetch_jikan_manga_data(mal_id)` exists in `services/jikan.py`; add if missing. Calls `GET https://api.jikan.moe/v4/manga/{mal_id}/full`. Uses same `JikanRateLimiter` and retry logic as `fetch_jikan_anime_data`.
- [x] **2.2** Verify `map_jikan_to_manga_data(raw_data)` exists in `utils/jikan_utils.py`; add if missing. Maps: `serialization_status`, `release_year`, `end_year`, `mal_rating`, `mal_rank`, `vol_total`, `ch_total`, `cover_image_url` (per `business-logic.md`).
- [x] **2.3** Verify `parse_manga_from_sheet(row_dict)` exists in `utils/formatter.py`; add if missing. Parses all manga sheet columns with correct types (per `parse_cartoon_from_sheet` pattern).

---

## Step 3 — Backend Services (Logic Layer)

Files: `services/other_logics.py`, `services/calculation.py`, `services/data_control.py`, `routers/data_control.py`

### 3a — other_logics.py additions

- [x] **3a.1** `resolve_manga_parent_hierarchy(db, franchise_id, series_id, names)` — resolves/creates franchise (type=`"ACG"`) and resolves series. Mirror `resolve_cartoon_parent_hierarchy`.
- [x] **3a.2** `extract_mal_id_manga_novel(url)` / `apply_extract_mal_id_manga_novel(entry)` — extract numeric MAL ID from MAL manga URL. Verify exists; add if missing.
- [x] **3a.3** `autofill_manga_from_mal(manga, force_replace_ratings=True)` — enriches one Manga entry via Jikan. Fill-only fields: `serialization_status`, `release_year`, `end_year`; fill `vol_total`/`ch_total` only if `serialization_status == "完結"`; always replace ratings. Fetch cover image if `cover_image_file` is None.
- [x] **3a.4** `find_duplicate_manga(db)` — duplicates keyed on `(franchise_id, series_id, is_main)` + at least one matching name. Include in `find_all_duplicates`.
- [x] **3a.5** `extract_system_options_from_manga(db)` — scans all Manga entries for values in `author_plot`, `author_draw`, `distributor_tw`, `anime_studio`. Adds any missing values to `system_options` under appropriate categories. Verify exists; add if missing.

### 3b — calculation.py additions

- [ ] **3b.1** `validate_vol_math(vol_total, vol_fin)` / `apply_validate_vol_math(manga)` — clamp `vol_fin <= vol_total`. Verify exists; add if missing.
- [ ] **3b.2** `validate_ch_math(ch_total, ch_fin)` / `apply_validate_ch_math(manga)` — clamp `ch_fin <= ch_total`. Verify exists; add if missing.
- [ ] **3b.3** `check_is_reading_completed(entry)` — True if `reading_status` is `"完結"` or `"腰斬"`, or `ch_fin == ch_total` (non-null, non-zero), or `vol_fin == vol_total` (non-null, non-zero). Verify exists; add if missing.
- [ ] **3b.4** `mark_reading_completed(entry)` — sets `reading_status = "Completed"`, `serialization_status = "完結"` (unless already `"腰斬"`), `ch_fin = ch_total` (if available), `vol_fin = vol_total` (if available), `vol_fin_page = 0`.
- [ ] **3b.5** `has_missing_values_manga(manga)` — returns True if any of `serialization_status`, `release_year`, `end_year`, `mal_rating`, `mal_rank`, `cover_image_file` is missing. Special case: skip `vol_total`/`ch_total` check if `serialization_status != "完結"`.
- [ ] **3b.6** `manga_post_processing(manga, db)` — runs `apply_validate_vol_math`, `apply_validate_ch_math`; if `check_is_reading_completed()` and `reading_status != "Completed"`: call `mark_reading_completed`.
- [ ] **3b.7** `run_manga_post_processing(db)` — runs `manga_post_processing` on all manga entries.
- [ ] **3b.8** `derive_prequel_sequel_manga(db, franchise_id)` — sets `prequel_id`/`sequel_id` for eligible manga entries sorted by `watch_order`. Fill-only (never overwrites). Verify exists; add if missing.
- [ ] **3b.9** `derive_related_manga(db, franchise_id=None)` — runs `derive_prequel_sequel_manga` per franchise. Verify exists; add if missing.
- [ ] **3b.10** `run_derive_related_manga(db)` — calls `derive_related_manga` for all ACG franchises. Verify exists; add if missing.
- [ ] **3b.11** `run_sync_manga(db)` — calls `extract_system_options_from_manga`. Verify exists; add if missing.

### 3c — data_control.py additions/updates

- [ ] **3c.1** `apply_single_replace_manga(db, manga, bulk)` — core replace logic:
  1. `apply_extract_mal_id_manga_novel`
  2. `autofill_manga_from_mal`
  3. `manga_post_processing`
  4. If `bulk=False`: call `run_derive_related_manga(db)` inline.
- [ ] **3c.2** `execute_replace_single_manga(db, manga_id, action_type, log_action)` — router-level function: lookup, call `apply_single_replace_manga(bulk=False)`, run `run_sync_manga`, commit, log.
- [ ] **3c.3** `execute_replace_manga(db, request, action_specific, action_type, log_action)` (SSE) — bulk replace all manga with `mal_id` or `mal_link`. After loop: `run_derive_related_manga`, `run_sync_manga`.
- [ ] **3c.4** `execute_fill_manga(db, request, action_specific, action_type, log_action)` (SSE) — fill all manga where `has_missing_values_manga()` is True. After loop: `run_manga_post_processing`, `run_derive_related_manga`, `run_sync_manga`.
- [ ] **3c.5** Update `execute_fill_all` — add `execute_fill_manga` call (with `log_action=False`) after Fill Cartoon.
- [ ] **3c.6** Update `execute_replace_all` — add `execute_replace_manga` call (with `log_action=False`) after Replace Cartoon.
- [ ] **3c.7** Update `execute_backup` — include `Manga` model in backup tab order (after Cartoons).
- [ ] **3c.8** Update `execute_pull_specific` — add `"Manga"` tab handler using `parse_manga_from_sheet`, `resolve_manga_parent_hierarchy`.
- [ ] **3c.9** Update `execute_pull_all` — add `"Manga"` to pull sequence (after Cartoons).
- [ ] **3c.10** Update `run_post_processing` — add `run_manga_post_processing` call.
- [ ] **3c.11** Update `run_derive_related` — add `run_derive_related_manga` call.
- [ ] **3c.12** Update `run_sync` — add `run_sync_manga` call.
- [ ] **3c.13** Update `bulk_check_unused_cover_images` / `bulk_check_cover_image` — include `Manga` model.
- [ ] **3c.14** Update `find_all_duplicates` — include `find_duplicate_manga`.

### 3d — data_control router

- [ ] **3d.1** Add `POST /api/data-control/replace/manga/{manga_id}` endpoint calling `execute_replace_single_manga`.
- [ ] **3d.2** Add SSE endpoints for `Fill Manga` (`/fill/manga`) and `Replace Manga` (`/replace/manga`).
- [ ] **3d.3** Update `Pull Specific` endpoint to accept `"manga"` as a valid `tab_name`.

---

## Step 4 — Frontend New Files

Files: `components/MangaCard.jsx`, `pages/Manga.jsx`, `pages/MangaNotes.jsx`, `pages/LibraryManga.jsx`

- [ ] **4.1** Create `components/MangaCard.jsx` — **Manga Entry Card 2** (see `reusable-elements.md`):
  - Poster (aspect 3:4)
  - My Rating badge top-left (hidden if null)
  - Manga Region badge top-right (hidden if null)
  - Name CN (fallback: EN → Roman → JP → Alt)
  - MAL Rating (hidden if null)
  - Release Year & End Year inline
  - Ch Fin / Ch Total (with toggle to Vol Fin + Pages Read / Vol Total)
  - `+` button (admin only) — cycles reading status via `PATCH /api/manga/:id`
  - Status badge (guest) showing reading_status
  - Clicking card navigates to `/manga/:system_id`

- [ ] **4.2** Create `pages/Manga.jsx` — full detail page for single manga entry:
  - Data: `GET /api/manga/:id`, `GET /api/franchise/`, `GET /api/series/`, `GET /api/manga/` (for prequel/sequel)
  - Admin Controls: Edit button → `/modify?id=:id&type=manga`, Mark Completed button (PATCH `reading_status: "Completed"`), Autofill & Update → `POST /api/data-control/replace/manga/:id`
  - Left column: poster, **Manga Sources Card** (serialization platform, Twitter, MAL, AniList, other), related entries card (prequel/sequel), System Info block (admin)
  - Right column: Tags (Region, Serialization Status), main title (Name CN fallback), sub title (Name EN, hidden if CN used fallback), From Franchise, From Series (SeriesModal), **Score Block** (MAL score, MAL rank, AniList score, last updated)
  - **Manga My Tracker Block**: Ch Fin/Total with +/-/edit controls (admin), Vol Fin + Pages/Vol Total with +/-/edit controls (admin), Reading Status dropdown (admin), My Rating dropdown (admin)
  - Detail cards: **Naming Card** (CN, EN, JP, Roman, Alt), **Information Card** (region, is_main, serialization status, release year, end year, vol_total, ch_total, anime studio, serialization platform, distributor TW), Remarks (shown when not null, admin editable on blur), `MangaNotes`
  - Admin writes: `PATCH /api/manga/:id`

- [ ] **4.3** Create `pages/MangaNotes.jsx` — structured notes editor with 15 sections (mirror `CartoonNotes.jsx` pattern); saves via `PATCH /api/manga/:id` with `notes` field.

- [ ] **4.4** Create `pages/LibraryManga.jsx` — manga library page:
  - Data: `GET /api/manga/`, `GET /api/franchise/`, `GET /api/series/`
  - Library bar: filter search (Franchise, Series, Manga Title, Release Year); sort by Title / My Rating / MAL Rating / Release Date / Ending Date; advanced filters: Serialization Status, Reading Status, Region; grid/table toggle
  - Grid: each entry is **MangaCard**
  - Table columns: Franchise Name CN (fallback), Manga Name CN, Manga Name EN (fallback: Roman), Serialization Status, Ch Fin/Total, Vol Fin/Total, My Rating, MAL Rating, Anime Studio, `+` button (admin)
  - Admin inline status toggle via `PATCH /api/manga/:id`

---

## Step 5 — Frontend Admin (Add / Modify / Delete tabs)

Files: `pages/Add.jsx`, `pages/Modify.jsx`, `pages/Delete.jsx`

- [ ] **5.1** Add **Add Manga Entry Tab** to `Add.jsx`:
  - Prefill from existing entry search (prefills: Franchise, Series, all Manga Name fields, Region, Main/Spinoff)
  - Franchise: ACG franchises; required; Franchise Generation modal (type=ACG, names from manga name fields)
  - Series: optional; Series Generation modal (names from manga name fields)
  - Form defaults: Reading Status = Might Read, Main/Spinoff = 本傳
  - Fields per `admin-forms.md` Add Manga tab spec
  - On submit: Franchise Generation modal → Series Generation modal → `POST /api/manga/` → triggers `execute_replace_single_manga` auto

- [ ] **5.2** Add **Modify Manga Entry Tab** to `Modify.jsx`:
  - Search bar (Franchise + Series + Entry names); search suggestion style
  - Recently Modified entries: Entry Name CN fallback, Franchise Name CN fallback
  - After selecting: sibling ribbon (other manga in franchise, grouped by series), then full edit form (mirrors Add fields)
  - Includes System ID (immutable), Entry Name CN fallback (immutable), `MangaNotes`
  - On submit: Franchise + Series Generation modals → `PATCH /api/manga/:id` → `POST /api/data-control/replace/manga/:id`
  - Deep-link: `?id=:uuid&type=manga`

- [ ] **5.3** Add **Delete Manga Entry Tab** to `Delete.jsx`:
  - Data: load `GET /api/manga/` (alongside existing loads)
  - Search bar → Search Suggestion for Deletion (Name CN fallback · Franchise Name CN fallback · Region)
  - After selecting: Entry Info for Deletion (Name CN/EN/JP/Alt, Franchise, Series, Region, Reading Status, Remark-in-notes, System ID) + Delete button
  - Cascading delete offer: if only entry in series → offer delete series; if only entry in franchise → offer delete franchise
  - Deletes: `DELETE /api/manga/:id`

---

## Step 6 — Frontend Updates (Existing Files)

Files: `App.jsx`, `Nav.jsx`, `Index.jsx`, `DashboardCard.jsx`, `SourcesCard.jsx`, `Admin.jsx`, `Search.jsx`, `FranchiseAcg.jsx`, `Statistics.jsx`, `FranchiseLibrary.jsx`

- [ ] **6.1** `App.jsx` — add routes:
  - `/manga/:system_id` → `Manga`
  - `/library/manga` → `LibraryManga`

- [ ] **6.2** `Nav.jsx` — add "Manga Library" link to ACG dropdown (points to `/library/manga`; no longer a `(dev)` placeholder once implemented).

- [ ] **6.3** `Index.jsx` — activate Reading division for Manga:
  - Fetch `GET /api/manga/`
  - Filter to `reading_status` in (Active Reading, Passive Reading, Paused)
  - Render using **Manga Entry Card 1** (DashboardCard pattern, or placeholder if Card 1 is still TBD); grouped by Active/Passive/Paused

- [ ] **6.4** `DashboardCard.jsx` — add manga `_ui_type` handling (render manga progress fields: Ch Fin/Total, Vol Fin+Pages/Vol Total, Reading Status).

- [ ] **6.5** `SourcesCard.jsx` — add manga variant:
  - Serialization Platform (text label)
  - Official Twitter Link button
  - MAL Link button
  - AniList Link button
  - Other Source buttons

- [ ] **6.6** `Admin.jsx` — add manga to data control panels:
  - Fill section: "Fill Manga" button → SSE `/api/data-control/fill/manga`
  - Replace section: "Replace Manga" button → SSE `/api/data-control/replace/manga`
  - Pull section: "Pull Manga" option

- [ ] **6.7** `Search.jsx` — add manga:
  - Add `manga` scope to data loading map (fetches `GET /api/manga/`, `GET /api/franchise/`, `GET /api/series/`)
  - Add Manga Entry Section to results layout; each entry uses **MangaCard**
  - Add `manga` to universal search scope selector

- [ ] **6.8** `FranchiseAcg.jsx` — add Manga Entry Section:
  - Data: `GET /api/manga/?franchise_id=:id`
  - Sort By: Title (default) / My Rating / MAL Rating / Release Date / Ending Date
  - Filter: Serialization Status / Reading Status / Region
  - Group by Series toggle
  - Each entry: **MangaCard**

- [ ] **6.9** `Statistics.jsx` — add manga:
  - **Watch Next tab**: add Manga tab (group by Serialization Status: 完結 / 連載中 / 腰斬 / 停更 / null; show poster + Manga Name CN fallback)
  - **To Rewatch tab**: add Manga tab (sorted by Manga Name EN; show poster + Manga Name CN fallback + My Rating)
  - **Recent Completions tab**: add Manga tab (TBD per pages.md — mark as TBD placeholder for now)

- [ ] **6.10** `FranchiseLibrary.jsx` — update cover image derivation to also consider manga entries (alongside anime, anime_movie, movies, tv_shows, cartoon). Load `GET /api/manga/`.

---

## Notes

- Reading Status in `manga` uses the same set as in `options.md` (Might Read, Plan to Read, Active Reading, Passive Reading, Paused, Completed, Temp Dropped, Dropped, Won't Read).
- `reading_status` (default "Might Read") is analogous to `watching_status` for anime.
- `watch_order` on manga is the read order, analogous to anime.
- Manga has no `series_id` note in `database-schema.md` but the schema table shows `series_id` IS present — use it.
- `mark_reading_completed` sets `completed_at` analogous to `mark_tv_completed`/`mark_movie_completed`.
- The `+` button cycles: `+` (Might Read) → `…` (Plan to Read) → `+` on `~`/`✓`/`✕` click → Might Read.
