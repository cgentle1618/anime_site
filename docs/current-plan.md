# Movie Entry Implementation Plan

## Overview

Implement full Movie entry support (live-action and animated films from the `movies` table). Uses TMDB + OMDb instead of MAL/Jikan for external metadata. TMDB and OMDb service layers already exist — this plan builds on them.

---

## Step 1 — Backend: Models, Migrations, Schemas ✅ COMPLETED

**Files:** `models.py`, Alembic, `schemas.py`

- Verify `Movie` SQLAlchemy model matches the `movies` table schema exactly (all columns, FK constraints, defaults).
- Run `alembic upgrade head` if any pending migrations exist.
- Add Pydantic schemas in `schemas.py`:
  - `MovieCreate` — all writable fields, `franchise_id` required
  - `MovieUpdate` — all fields optional
  - `MovieResponse` — all fields + computed `display_name` (CN → EN → Alt fallback)
- Confirm `Movie` model has `display_name` property via `NameFallbackMixin` or equivalent.

**Pause and ask for permission before Step 2.**

---

## Step 2 — IMDb Service: `fetch_imdb_data` Orchestrator ✅ COMPLETED

**Files:** `services/tmdb.py`, `utils/tmdb_utils.py`

In `services/tmdb.py`:

- Add `fetch_imdb_data(imdb_id: int) -> dict` below `fetch_tmdb_data`. Calls both `fetch_tmdb_data(imdb_id)` and `fetch_omdb_data(imdb_id)` and returns `{"tmdb_raw": ..., "omdb_raw": ...}`. Both calls run regardless of individual failure — do not short-circuit on TMDB failure.

In `utils/tmdb_utils.py`:

- Add `map_imdb_to_movie_data(tmdb_raw, omdb_raw) -> dict` below `map_tmdb_to_movie_data`. Calls `map_tmdb_to_movie_data(tmdb_raw)` if not None, then `map_omdb_to_movie_data(omdb_raw)` if not None, merges with `dict.update()` (OMDb overwrites on key conflict — only `imdb_rating` overlaps).
- **Key rename required:** In `map_tmdb_to_movie_data` (line 86), rename the output key `"release_date_us"` → `"release_date_usa"` to match the DB column name.

**Pause and ask for permission before Step 3.**

---

## Step 3 — Business Logic ✅ COMPLETED

**Files:** `utils/utils.py`, `services/other_logics.py`, `services/calculation.py`

### 3a — Extract IMDb ID

In `utils/utils.py`:

- `extract_imdb_id(url: str) -> Optional[int]` — regex `imdb\.com/title/tt(\d+)`, returns integer ID.
- `apply_extract_imdb_id(movie) -> bool` — calls `extract_imdb_id(movie.imdb_link)`, writes to `movie.imdb_id`, returns `True` if set.

### 3b — Check Missing Values

In `utils/utils.py`:

- `has_missing_values_movie(movie) -> bool` — returns `True` if any of `length_min`, `director`, `airing_status`, `release_date_usa`, `imdb_rating`, `cover_image_file` is None.

### 3c — Find Duplicates

In `services/other_logics.py`:

- `find_duplicate_movie(db) -> list` — union-find on movies with same `(franchise_id, series_id)` + at least one matching name (case-insensitive).
- Update `find_all_duplicates(db)` to include `"movie": find_duplicate_movie(db)` in returned dict.

### 3d — IMDb Autofill

In `services/other_logics.py`:

- `autofill_movie_from_imdb(movie, db)`:
  1. Return if `movie.imdb_id` is None.
  2. Call `fetch_imdb_data(movie.imdb_id)` → `{"tmdb_raw": ..., "omdb_raw": ...}`.
  3. Call `map_imdb_to_movie_data(tmdb_raw, omdb_raw)` → flat merged dict.
  4. Fill-only (None check): `length_min`, `director`, `release_date_usa`.
  5. Always overwrite: `imdb_rating` (if fetched value is not None).
  6. `airing_status` (fill-only if currently None): read `tmdb_raw.get("release_date")` string and compare to `date.today()` — past → `"Finished Airing"`, future → `"Not Yet Aired"`. Skip if no date returned.
  7. Cover image: if `cover_image_file` is None and `cover_image_url` is in the mapped dict, download and upload to GCS, set `cover_image_file = f"{movie.system_id}.jpg"`.

**Pause and ask for permission before Step 4.**

---

## Step 4 — Data Control Updates

**Files:** `services/data_control.py`, `utils/formatter.py`

### 4a — Parser

In `utils/formatter.py`:

- `parse_movie_from_sheet(row_dict) -> dict` — calls `parse_from_sheet` for every Movie field with correct types. `imdb_id` as `int`. FK fields as `UUID` (string names resolved later by `execute_pull_specific`).

### 4b — Pull Specific + Pull All

In `services/data_control.py`:

- `execute_pull_specific`: add `"Movie"` branch that uses `parse_movie_from_sheet` and `resolve_movie_parent_hierarchy`.
- `execute_pull_all`: add `"Movie"` call after `"Anime Movie"` in the tab order.

### 4c — Fill Movie

In `services/data_control.py`:

- `execute_fill_movie(db, request, action_specific, action_type, log_action)` _(SSE)_:
  1. Run `apply_extract_imdb_id` on all movies.
  2. Build queue: entries where `has_missing_values_movie()` is True.
  3. For each: call `autofill_movie_from_imdb`. Check disconnect after each entry.
  4. Yield SSE `{status, current_entry, processed, total}`.
- Update `execute_fill_all` to call `execute_fill_movie` (with `log_action=False`) after Fill Anime Movie.

### 4d — Replace Movie

In `services/data_control.py`:

- `apply_single_replace_movie(db, movie, bulk: bool)`:
  1. `apply_extract_imdb_id(movie)`
  2. `autofill_movie_from_imdb(movie, db)`
- `execute_replace_single_movie(db, movie_id, action_type, log_action)` — router-level: lookup, call `apply_single_replace_movie(bulk=False)`, log.
- `execute_replace_movie(db, request, action_specific, action_type, log_action)` _(SSE)_:
  1. Query all movies with `imdb_id` or `imdb_link` set.
  2. For each: call `apply_single_replace_movie(bulk=True)`. Check disconnect.
- Update `execute_replace_all` to call `execute_replace_movie` (with `log_action=False`) after Replace Anime Movie.

**Pause and ask for permission before Step 5.**

---

## Step 5 — Router

**Files:** `routers/movie.py`, `main.py`, `routers/data_control.py`

### 5a — Movie Router

Create `routers/movie.py` with:

| Method   | Path                              | Auth  | Action                                                                                                          |
| -------- | --------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/movies`                     | Guest | List all movies; support filters: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `movie_type` |
| `GET`    | `/api/movies/{movie_id}`          | Guest | Get single movie                                                                                                |
| `POST`   | `/api/movies`                     | Admin | Create movie; auto-set `system_id`, `created_at`, `updated_at`; run `execute_replace_single_movie` after create |
| `PUT`    | `/api/movies/{movie_id}`          | Admin | Update movie fields; update `updated_at`; run `execute_replace_single_movie`                                    |
| `DELETE` | `/api/movies/{movie_id}`          | Admin | Delete movie; delete cover image if `cover_image_file` is set                                                   |
| `POST`   | `/api/movies/{movie_id}/autofill` | Admin | Run `execute_replace_single_movie`; return updated movie                                                        |

### 5b — Register Router and Data Control Endpoints

- In `main.py`: include `movie_router` with prefix `/api/movies`.
- In `routers/data_control.py`: add SSE endpoints for `fill_movie`, `replace_movie` that call the new data control functions.

**Pause and ask for permission before Step 6.**

---

## Step 6 — Frontend: New Pages

**Files:** `frontend/src/components/MovieCard.jsx`, `frontend/src/Movie.jsx`, `frontend/src/LibraryMovie.jsx`

### 6a — MovieCard.jsx

Card component for movie grid display. Shows:

- Cover image (or placeholder)
- `display_name` (CN → EN → Alt)
- `release_date_usa`
- `watching_status` badge
- `imdb_rating`

### 6b — Movie.jsx (Detail Page)

Detail page for a single movie entry (`/movie/:id`).

- Fetch `GET /api/movies/{id}`.
- Display all fields including franchise/series, all names, release dates, director, length, ratings, source links, remark.
- Show Autofill & Update button (admin only) → `POST /api/movies/{id}/autofill`.
- Show remark block only if `remark` is not null.

### 6c — LibraryMovie.jsx (Library Page)

Movie library page (`/library/movie`).

- Fetch all movies, render `MovieCard` grid.
- Filters: `watching_status` (grouped), `airing_status`, `movie_type`, franchise filter (from `Movie Franchise for Filter` system options).
- Sort options: by `display_name`, `release_date_usa`, `my_rating`.

**Pause and ask for permission before Step 7.**

---

## Step 7 — Frontend: Update Existing Pages

**Files:** `App.jsx`, `Nav.jsx`, `Admin.jsx`, `Add.jsx`, `Modify.jsx`, `Delete.jsx`, `Search.jsx`, `FutureReleases.jsx`, `SourcesCard.jsx`

### 7a — Routing and Navigation

- `App.jsx`: add routes for `/movie/:id` → `Movie.jsx`, `/library/movie` → `LibraryMovie.jsx`.
- `Nav.jsx`: add movie link in navigation.

### 7b — Admin Forms

- `Admin.jsx`: add Fill Movie, Replace Movie buttons/controls in the data control section.
- `Add.jsx`: add "Add Movie" tab with form. Fields match `movies` table. Default: `airing_status = "Not Yet Aired"`, `watching_status = "Might Watch"`. Franchise search restricted to `franchise_type = "TV or Movie"`. Series optional. Franchise/Series generation logic per logic doc. After submit: run `POST /api/movies` (which triggers autofill).
- `Modify.jsx`: add "Modify Movie" tab. Prefill from selected movie. Same franchise/series flow as Add. Show franchise members grouped by series (skip if franchise is 獨立電影 / 影集, Disney, Marvel). After submit: run `PUT /api/movies/{id}`.
- `Delete.jsx`: add "Delete Movie" tab. After confirm: run `DELETE /api/movies/{id}`.

### 7c — Cross-Page Features

- `Search.jsx`: include movies in search results alongside existing types.
- `FutureReleases.jsx`: add movie future releases tab — movies with `airing_status = "Not Yet Aired"` and `release_date_usa` set.
- `SourcesCard.jsx`: handle movie source display — movies have `source_other` (JSONB) only; no `source_baha`, no `source_netflix`.

**Pause and ask for permission before Step 8.**

---

## Step 8 — Documentation Cleanup

- Update `docs/api.md`: add all Movie endpoints from Step 5.
- Update `docs/pages.md`: add Movie detail page and LibraryMovie page.
- Update `docs/admin-forms.md`: add Add/Modify/Delete Movie tab logic.
- Update `docs/reusable-elements.md`: add `MovieCard` component.

---

## TBD / Future

- **Derive Related for Movie**: The `movies` table has `watch_order`, `prequel_id`, `sequel_id`, `derive_related`. A `derive_related_movie` function following the same pattern as the anime variant should be added in a future step once movie data is populated.
- **Map Cartoon from OMDb**: `map_omdb_to_cartoon_data` not yet implemented — needed for cartoon IMDb autofill.
- **TV Show IMDb Autofill**: `autofill_tv_show_from_imdb` and `autofill_cartoon_from_imdb` are TBD — same architecture, different mappers and field targets.
