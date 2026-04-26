# Anime Movie Implementation Plan

## Progress

- We have finished Phase 1, 2, 3, 4, 5, meaning we have finished backend implementation.

## Implementation Plan

### Phase 1 — Database & Schema Foundation

#### Step 1.1 — Alembic Migration

- Run `alembic revision --autogenerate -m "add anime_movie table"` to generate a real migration from the finished model
- Run `alembic upgrade head` and verify the table structure in psql
- Confirm all columns, FK to `franchise`, and defaults are correct

#### Step 1.2 — `schemas.py`

Add the following Pydantic schemas (modeled after the anime schemas, adjusted for anime movie fields):

- `AnimeMovieBase` — shared fields
- `AnimeMovieCreate(AnimeMovieBase)` — for POST
- `AnimeMovieUpdate(AnimeMovieBase)` — all fields optional, for PATCH
- `AnimeMovieResponse(AnimeMovieBase)` — includes `system_id`, `display_name`, computed `release_year_jp` (derived from `release_date_jp`)

---

### Phase 2 — CRUD API Layer

#### Step 2.1 — `routers/anime_movie.py`

Create a new router with these endpoints (auth pattern mirrors `routers/anime.py`):

- `GET /api/anime-movie/` — list all, with optional filters (`watching_status`, `franchise_id`)
- `GET /api/anime-movie/{system_id}` — get single entry
- `POST /api/anime-movie/` — create (admin only)
- `PATCH /api/anime-movie/{system_id}` — partial update (admin only)
- `DELETE /api/anime-movie/{system_id}` — delete (admin only)

#### Step 2.2 — Register in `main.py`

Add import and `app.include_router(anime_movie.router, prefix="/api")`.

---

### Phase 3 — Utility & Helper Functions

#### Step 3.1 — `utils/jikan_utils.py`

- Add **`map_jikan_to_anime_movie_data(raw_data)`** — maps Jikan response to anime movie fields:
  - `airing_status` (same mapping as anime)
  - `release_date_jp` (parse from `aired.from` as a date, not just year/month)
  - `ep_total` (used as `length_min` is not from Jikan — check if duration field is available)
  - `mal_rating`, `mal_rank`, `official_link`, `twitter_link`, `cover_image_url`
- Review **`map_jikan_to_anime_data`** — confirm no changes needed (or update if shared logic can be extracted)
- Review **`fetch_jikan_anime_data`** — likely reusable as-is since MAL API path is identical

#### Step 3.2 — `utils/formatter.py`

- Add **`parse_anime_movie_from_sheet(row_dict)`** — parses a sheet row dict into typed Python fields for `AnimeMovies`; handle `release_date_jp`/`release_date_tw` as date strings

#### Step 3.3 — `services/other_logics.py`

Add these functions (in logical order):

| Function                                                                 | Notes                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `has_missing_values_anime_movie(anime_movie)`                            | Required fields: `airing_status`, `release_date_jp`, `mal_rating`, `mal_rank`, `official_link`, `twitter_link`, `cover_image_file`. Skip ratings if `airing_status == "Not Yet Aired"`. |
| `check_is_watching_completed(entry)`                                     | Rename `check_is_watching_completed` → `check_is_watching_completed`; update all callers                                                                                                |
| `mark_movie_completed(entry)`                                            | Sets `watching_status = "Completed"`, `airing_status = "Finished Airing"`. If `ep_fin` is 0 or null, set to 1.                                                                          |
| `apply_check_baha_anime_movie(anime_movie)`                              | Anime movie variant of `apply_check_baha`; same logic (set `source_baha = True` if `baha_link` set + `airing_status == "Airing"` + `source_baha is None`)                               |
| `autofill_anime_movie_from_mal(anime_movie, force_replace_ratings=True)` | Like `autofill_anime_from_mal` but uses `map_jikan_to_anime_movie_data`; fills `airing_status`, `release_date_jp`, `official_link`, `twitter_link`; handles cover image download        |
| `find_duplicate_anime_movie(db)`                                         | Same union-find approach as `find_duplicate_anime`; key: `franchise_id` + matching name                                                                                                 |
| Update `find_all_duplicates(db)`                                         | Add `find_duplicate_anime_movie` call; include `anime_movie` key in result dict                                                                                                         |
| `extract_system_options_from_anime_movie(db)`                            | Scans `AnimeMovies` for `studio` and `director` values; inserts missing `system_options` entries                                                                                        |
| Update `extract_system_options(db)`                                      | Call `extract_system_options_from_anime_movie` as well (if this wrapper exists)                                                                                                         |
| `resolve_anime_movie_parent_hierarchy(db, franchise_id, names)`          | Like `resolve_series_parent_hierarchy` but for anime movie → franchise; auto-creates franchise if not found                                                                             |
| Update `run_calculate_all(db)`                                           | Add `run_anime_movie_post_processing` and `run_sync_anime_movie` calls                                                                                                                  |

---

### Phase 4 — Composite Logic

#### Step 4.1 — `services/other_logics.py` (composite section)

- **`anime_movie_post_processing(anime_movie, db)`** — runs for a single entry:
  1. `apply_check_baha_anime_movie`
  2. If `check_is_movie_completed()` and `watching_status != "Completed"`: call `mark_movie_completed`
- **`run_anime_movie_post_processing(db)`** — applies `anime_movie_post_processing` to every `AnimeMovies` entry

#### Step 4.2 — `services/data_control.py` (sync section)

- **`run_sync_anime_movie(db)`**:
  1. `extract_system_options_from_anime_movie`
- Update **`run_sync(db)`** to also call `run_sync_anime_movie`

---

### Phase 5 — Data Control Pipeline

Work through these in dependency order (helpers first, orchestrators last):

| Function                                                                         | File              | Notes                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apply_single_replace_anime_movie(db, anime_movie, bulk, force_replace_ratings)` | `data_control.py` | Steps: `apply_extract_mal_id_anime`, `autofill_anime_movie_from_mal`, `anime_movie_post_processing`                                                    |
| `execute_replace_single_anime_movie(db, anime_movie_id, ...)`                    | `data_control.py` | Router-level wrapper; calls `apply_single_replace_anime_movie`, then `run_sync_anime_movie`                                                            |
| `execute_fill_anime_movie(db, request, ...)` _(SSE)_                             | `data_control.py` | Steps: extract MAL IDs → check missing → autofill → post-process → sync anime movie                                                                    |
| `execute_replace_anime_movie(db, request, ...)` _(SSE)_                          | `data_control.py` | Steps: query all with mal_id/mal_link → apply_single_replace → sync anime movie                                                                        |
| Update `execute_fill_all`                                                        | `data_control.py` | Add `execute_fill_anime_movie` call after `execute_fill_anime`                                                                                         |
| Update `execute_replace_all`                                                     | `data_control.py` | Add `execute_replace_anime_movie` call after `execute_replace_anime`                                                                                   |
| Update `execute_backup`                                                          | `data_control.py` | Add `AnimeMovies` tab (and other missing tables: Movies, TV Shows, Cartoons, Manga, Novel, System Configs); convert `None`/`bool`/`datetime` correctly |
| Update `execute_pull_specific`                                                   | `data_control.py` | Handle `"Anime Movie"` tab: use `parse_anime_movie_from_sheet`, `resolve_anime_movie_parent_hierarchy`                                                 |
| Update `execute_pull_all`                                                        | `data_control.py` | Add `"Anime Movie"` to the tab order after `"Anime"`                                                                                                   |

---

### Phase 6 — Frontend

#### Step 6.1 — `App.jsx` Route Registration

Add routes:

- `/anime-movie/:system_id` → `AnimeMoviePage`
- `/library/anime-movie` → `AnimeMovieLibraryPage`
- `/future-releases` update or add tab for anime movies (confirm if this is a tab or separate route)

#### Step 6.2 — Anime Movie Page (`pages/AnimeMoviePage.jsx`)

Detail page for a single anime movie entry. Loads `GET /api/anime-movie/:system_id`. Includes:

- Cover image, all name fields, ratings, links, source badges
- Admin: inline edit or link to Modify tab

#### Step 6.3 — Anime Movie Library Page (`pages/AnimeMovieLibraryPage.jsx`)

Grid/list of all anime movie entries. Reuses `AnimeMovieCard`. Supports filter by `watching_status`.

#### Step 6.4 — Anime Movie Future Release Tab

Show anime movies with `airing_status == "Not Yet Aired"` or `watching_status == "Plan to Watch"`. Likely a tab within the existing Future Releases page.

#### Step 6.5 — Search Result Page (update `pages/Search.jsx`)

Include `AnimeMovies` in search results. Display with `AnimeMovieCard` or inline row.

#### Step 6.6 — ACG Franchise Page (update `pages/FranchiseAcg.jsx`)

Show anime movies within the franchise detail. Add a section/tab alongside anime entries.

#### Step 6.7 — Add / Modify / Delete Tabs

- **Add Anime Movie Tab** — form for `POST /api/anime-movie/`; fields: franchise, all name fields, `airing_status`, `watching_status`, `mal_link`, `release_date_jp`, `length_min`, `studio`, `director`, links, sources, `remark`
- **Modify Anime Movie Tab** — pre-filled form for `PATCH /api/anime-movie/:system_id`; identical fields to Add
- **Delete Anime Movie Tab** — confirmation UI for `DELETE /api/anime-movie/:system_id`; likely a tab within the existing Add/Modify/Delete page pattern

---

## Implementation Order Summary

```
Phase 1:  Alembic → schemas.py
Phase 2:  routers/anime_movie.py → main.py
Phase 3:  jikan_utils.py → formatter.py → other_logics.py helpers
Phase 4:  anime_movie_post_processing → run_sync_anime_movie → run_sync update
Phase 5:  apply_single_replace → execute_replace_single → fill/replace pipelines → backup/pull updates
Phase 6:  App.jsx → AnimeMoviePage → LibraryPage → FutureRelease → Search → Franchise → Add/Modify/Delete
```

Each phase is a PR-able chunk. Phases 1–5 are fully testable before touching the frontend.
