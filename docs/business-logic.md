# Business Logic

All backend logic lives in `services/` and `utils/`. Routers are thin — they validate input and delegate.

## Table of Contents

- [Main Data Control Logic](#main-data-control-logic)
- [Composite Logics](#composite-logics)
- [Checking Logics](#checking-logics)
- [Fill Missing Entry Data](#fill-missing-entry-data)
- [Fill from External Sources](#fill-from-external-sources)
- [MAL Data Helpers](#mal-data-helpers)
- [IMDb Data Helpers](#imdb-data-helpers)
- [Sync](#sync)
- [Other Logics](#other-logics)
- [Other Actions](#other-actions)
- [Formatters (DB to Sheet)](#formatters-db-to-sheet)
- [Parsers (Sheet to Python Types)](#parsers-sheet-to-python-types)
- [Other Helpers](#other-helpers)

---

## Main Data Control Logic

All pipeline functions live in `services/data_control.py`. SSE functions are async generators; non-SSE functions return dicts.

---

### Backup — `execute_backup(db, action_type="Manual")`

Overwrites all Google Sheets tabs with the current database state.

**Steps:**

1. Query all entries for each backed-up model.
2. For each model, extract column headers from the SQLAlchemy table schema.
3. Format each row via `format_model_for_sheet()`.
4. Bulk overwrite each tab in this order:
   - System Options → System Configs → Franchise → Series → Anime → Anime Movies → Movies → TV Shows → Cartoons → Manga → Novel → Seasonal
5. Log result to `DataControlLog`.

Tab names match model table names. Column order in the sheet is guaranteed to match DB schema order (see `format_model_for_sheet`).

**Note:** `None`, `bool`, and `datetime` values must be converted to sheet-compatible format before writing.

---

### Fill

#### Fill All — `execute_fill_all(db, request, action_type="Manual")` _(SSE)_

Master orchestrator. Calls Fill Anime (with `log_action=False`), then Fill Anime Movie (with `log_action=False`), then Fill Movie (with `log_action=False`), then Fill TV Show (with `log_action=False`), parses SSE output to accumulate a grand total, runs Backup on completion, then logs a single master entry to `DataControlLog`.

**Note:** More actions are TBD. Shows number of entries in queue, current progress, and the entry being processed by title (with fallback).

#### Fill Anime — `execute_fill_anime(db, request, action_specific, action_type, log_action)` _(SSE)_

Fills missing metadata for all anime entries that need it.

**Steps:**

1. Run `apply_extract_mal_id_anime` on all entries to populate `mal_id` from `mal_link`.
2. Build queue: entries where `has_missing_values_anime()` returns `True`.
3. For each queued entry: call `autofill_anime_from_mal(force_replace_ratings=True)`.
4. Check `request.is_disconnected()` after each entry — if disconnected, rollback and log as "Aborted".
5. After loop: `run_anime_post_processing`, `run_derive_related_anime`, `run_sync_anime`.
6. Yields SSE JSON messages: `{status, current_entry, processed, total}`.

**Note:** Shows entry being processed by anime name (with fallback).

---

#### Fill Anime Movie — `execute_fill_anime_movie(db, request, action_specific, action_type, log_action)` _(SSE)_

Fills missing metadata for all anime movie entries that need it.

**Steps:**

1. Run `apply_extract_mal_id_anime` on all anime movie entries to populate `mal_id` from `mal_link`.
2. Build queue: entries where `has_missing_values_anime_movie()` returns `True`.
3. For each queued entry: call `autofill_anime_movie_from_mal(force_replace_ratings=True)`.
4. Check `request.is_disconnected()` after each entry — if disconnected, rollback and log as "Aborted".
5. After loop: `run_anime_movie_post_processing`, `run_sync_anime_movie`.
6. Yields SSE JSON messages: `{status, current_entry, processed, total}`.

**Note:** Shows entry being processed by anime name (with fallback).

---

#### Fill Movie — `execute_fill_movie(db, request, action_specific, action_type, log_action)` _(SSE)_

Fills missing metadata for all movie entries that need it.

**Steps:**

1. Run `apply_extract_imdb_id` on all movie entries to populate `imdb_id` from `imdb_link`.
2. Build queue: entries where `has_missing_values_movie()` returns `True`.
3. For each queued entry: call `autofill_movie_from_imdb()`.
4. Check `request.is_disconnected()` after each entry — if disconnected, rollback and log as "Aborted".
5. Yields SSE JSON messages: `{status, current_entry, processed, total}`.

**Note:** Shows entry being processed by movie name (with fallback).

---

#### Fill TV Show — `execute_fill_tv_show(db, request, action_specific, action_type, log_action)` _(SSE)_

Fills missing metadata for all TV show entries that need it.

**Steps:**

1. Run `apply_extract_imdb_id` on all TV show entries to populate `imdb_id` from `imdb_link`.
2. Build queue: entries where `has_missing_values_tv_show()` returns `True`.
3. For each queued entry: call `autofill_tv_show_from_imdb()`.
4. Check `request.is_disconnected()` after each entry — if disconnected, rollback and log as "Aborted".
5. After loop: `run_tv_show_post_processing`, `run_derive_related_tv_show`, `run_sync_tv_show`.
6. Yields SSE JSON messages: `{status, current_entry, processed, total}`.

**Note:** Shows entry being processed by TV show name (with fallback).

---

### Replace

#### Replace All — `execute_replace_all(db, request, action_type="Manual")` _(SSE)_

Master orchestrator. Calls Replace Anime (with `log_action=False`), then Replace Anime Movie (with `log_action=False`), then Replace Movie (with `log_action=False`), then Replace TV Show (with `log_action=False`), parses SSE output, runs Backup, logs single master entry.

**Note:** More actions are TBD. Shows number of entries in queue, current progress, and the entry being processed by title (with fallback).

#### Replace Anime — `execute_replace_anime(db, request, action_specific, action_type, log_action)` _(SSE)_

Replaces metadata for all anime entries that have a `mal_id` or `mal_link`.

**Steps:**

1. Query all anime with `mal_id` or `mal_link` set. Return early if queue is empty.
2. For each entry: call `apply_single_replace_anime(bulk=True)` — skips per-entry `derive_related`.
3. After loop: call `run_derive_related_anime(db)` once for all franchises.
4. Call `run_sync_anime(db)`.

**Note:** Shows entry being processed by title (with fallback).

---

#### Replace Anime Movie — `execute_replace_anime_movie(db, request, action_specific, action_type, log_action)` _(SSE)_

Replaces metadata for all anime movie entries that have a `mal_id` or `mal_link`.

**Steps:**

1. Query all anime movie entries with `mal_id` or `mal_link` set. Return early if queue is empty.
2. For each entry: call `apply_single_replace_anime_movie(bulk=True)`.
3. After loop: call `run_sync_anime_movie(db)`.

**Note:** Shows entry being processed by title (with fallback).

---

#### Replace Movie — `execute_replace_movie(db, request, action_specific, action_type, log_action)` _(SSE)_

Replaces metadata for all movie entries that have an `imdb_id` or `imdb_link`.

**Steps:**

1. Query all movies with `imdb_id` or `imdb_link` set. Return early if queue is empty.
2. For each entry: call `apply_single_replace_movie(bulk=True)`.

**Note:** Shows entry being processed by movie name (with fallback).

---

#### Replace TV Show — `execute_replace_tv_show(db, request, action_specific, action_type, log_action)` _(SSE)_

Replaces metadata for all TV show entries that have an `imdb_id` or `imdb_link`.

**Steps:**

1. Query all TV shows with `imdb_id` or `imdb_link` set. Return early if queue is empty.
2. For each entry: call `apply_single_replace_tv_show(bulk=True)`.
3. After loop: call `run_derive_related_tv_show(db)`.
4. Call `run_sync_tv_show(db)`.

**Note:** Shows entry being processed by TV show name (with fallback).

---

#### Replace for Single Anime Entry — `execute_replace_single_anime(db, anime_id, action_type, log_action)` / `apply_single_replace_anime(db, anime, bulk, force_replace_ratings)`

`execute_replace_single_anime` is the router-level function (handles lookup, sync, logging). Used in the anime endpoint for the Autofill & Update button. Calls `apply_single_replace_anime(bulk=False)`, then runs Sync.
`apply_single_replace_anime` is the core logic (used in both single and bulk paths); it is not called by routers directly.

**`apply_single_replace_anime` steps:**

1. `apply_extract_mal_id_anime`
2. `autofill_anime_from_mal`
3. `anime_post_processing`
4. If `bulk=False`: call `run_derive_related_anime(db)` inline. If `bulk=True`: caller handles `run_derive_related_anime` after the loop.

---

#### Replace for Single Anime Movie Entry — `execute_replace_single_anime_movie(db, anime_movie_id, action_type, log_action)` / `apply_single_replace_anime_movie(db, anime_movie, bulk, force_replace_ratings)`

`execute_replace_single_anime_movie` is the router-level function (handles lookup, sync, logging). Used in the anime movie endpoint for the Autofill & Update button. Calls `apply_single_replace_anime_movie()`, then runs Sync.
`apply_single_replace_anime_movie` is the core logic (helper for Replace Anime Movie action); it is not called by routers directly.

**`apply_single_replace_anime_movie` steps:**

1. `apply_extract_mal_id_anime`
2. `autofill_anime_movie_from_mal`
3. `anime_movie_post_processing`

---

#### Replace for Single Movie Entry — `execute_replace_single_movie(db, movie_id, action_type, log_action)` / `apply_single_replace_movie(db, movie, bulk)`

`execute_replace_single_movie` is the router-level function (handles lookup, logging). Used in the movie endpoint for the Autofill & Update button. Calls `apply_single_replace_movie(bulk=False)`.
`apply_single_replace_movie` is the core logic (used in both single and bulk paths); it is not called by routers directly.

**`apply_single_replace_movie` steps:**

1. `apply_extract_imdb_id`
2. `autofill_movie_from_imdb`

---

#### Replace for Single TV Show Entry — `execute_replace_single_tv_show(db, tv_show_id, action_type, log_action)` / `apply_single_replace_tv_show(db, tv_show, bulk)`

`execute_replace_single_tv_show` is the router-level function (handles lookup, sync, logging). Used in the TV show endpoint for the Autofill & Update button. Calls `apply_single_replace_tv_show(bulk=False)`, then runs `run_sync_tv_show`.
`apply_single_replace_tv_show` is the core logic (used in both single and bulk paths); it is not called by routers directly.

**`apply_single_replace_tv_show` steps:**

1. `apply_extract_imdb_id`
2. `autofill_tv_show_from_imdb`
3. `tv_show_post_processing`
4. If `bulk=False`: call `run_derive_related_tv_show(db)` inline. If `bulk=True`: caller handles `run_derive_related_tv_show` after the loop.

---

### Pull from Sheets

#### Pull All — `execute_pull_all(db, action_type="Manual")`

Pulls all tabs in strict dependency order: **System Options → Franchise → Series → Anime → Anime Movie → Movie**. This order is required to satisfy foreign key constraints.

#### Pull Specific — `execute_pull_specific(db, tab_name, action_type, log_action)`

Pulls and upserts one tab. Supported: `"Franchise"`, `"Series"`, `"Anime"`, `"Anime Movie"`, `"Movie"`, `"System Options"`.

**Steps:**

1. Read all rows from sheet via `get_all_raw_rows(tab_name)`. First row is headers.
2. For each data row:
   - Map row to dict via `parse_row_to_dict(headers, row)`.
   - Apply tab-specific parser to get typed dict.
   - Resolve string foreign keys: if `franchise_id` or `series_id` is a string name (not a valid UUID), look up by name fields in DB. Skip row if not found.
   - **Smart PK logic**: if `pk_value` is empty, search by name fields to find an existing record (prevents duplicates on re-import).
   - For Anime: sanitize `watching_status`, `airing_status`, `airing_type` (apply defaults if null).
   - Update existing record if found; otherwise create new.
   - Flush every 50 rows so the DB generates new UUIDs.
3. Commit batch. Reset `system_options` sequence after import.

**Returns:** `{status, processed, rows_added, rows_updated}`

---

## Composite Logics

### Anime Post Processing — `anime_post_processing(anime, db)` / `run_anime_post_processing(db)`

Runs all single-entry checks and repairs for one anime. `run_anime_post_processing` applies it to every entry in the DB.

**Steps (in order):**

1. `apply_validate_episode_math`
2. `apply_check_baha`
3. If `check_is_tv_completed()` and `watching_status != "Completed"`: call `mark_tv_completed`.
4. If `release_season` is None, `release_month` is set, and `airing_type == "TV"`: call `apply_calculate_seasonal_from_month`.
5. If `season_part` is None: try `apply_extract_season_from_title`, then `derive_season_1_anime`.

---

### Anime Movie Post Processing — `anime_movie_post_processing(anime_movie, db)` / `run_anime_movie_post_processing(db)`

Runs all single-entry checks and repairs for one anime movie. `run_anime_movie_post_processing` applies it to every entry in the DB.

**Steps (in order):**

1. `apply_check_baha`

---

### TV Show Post Processing — `tv_show_post_processing(tv_show, db)` / `run_tv_show_post_processing(db)`

Runs all single-entry checks and repairs for one TV show. `run_tv_show_post_processing` applies it to every entry in the DB.

**Steps (in order):**

1. `apply_validate_episode_math`
2. If `check_is_tv_completed()` and `watching_status != "Completed"`: call `mark_tv_completed`.
3. If `season_part` is None: try `apply_extract_season_from_title`, then `derive_season_1_tv_show`.

---

### Post Processing — `run_post_processing(db)`

Master orchestrator. Calls all post-processing functions across every media type.

**Steps:**

1. `run_anime_post_processing`
2. `run_anime_movie_post_processing`
3. `run_tv_show_post_processing`

---

### Derive Related Anime — `derive_related_anime(db, franchise_id)`

Runs watch order, episode previous, and prequel/sequel derivation for every ACG franchise in the DB.

**Per franchise_id:**

1. `derive_watch_order_anime`
2. `derive_ep_previous_anime` (uses `_SERIES_UNSET` sentinel to process all series groups independently)
3. `derive_prequel_sequel_anime`

Commits after all franchises processed.

---

### Derive Related TV Show — `derive_related_tv_show(db, franchise_id)`

Runs watch order and prequel/sequel derivation for every TV or Movie franchise in the DB.

**Per franchise_id:**

1. `derive_watch_order_tv_show`
2. `derive_prequel_sequel_tv_show`

Commits after all franchises processed.

---

### Derive Related Cartoon — `derive_related_cartoon(db, franchise_id)`

Runs watch order and prequel/sequel derivation for every Cartoon franchise in the DB.

**Per franchise_id:**

1. `derive_watch_order_cartoon`
2. `derive_prequel_sequel_cartoon`

Commits after all franchises processed.

---

### Sync — `run_sync(db)`

1. `run_sync_anime(db)`
2. `run_sync_anime_movie(db)`
3. `run_sync_tv_show(db)`
4. `run_sync_cartoon(db)`

---

### Sync — `run_sync_anime(db)`

1. `create_missing_seasonal`
2. `sync_seasonal_counts`
3. `extract_system_options_from_anime`

---

### Sync — `run_sync_anime_movie(db)`

1. `extract_system_options_from_anime_movie`

---

### Sync — `run_sync_tv_show(db)`

1. `extract_system_options_from_tv_show`

---

### Sync — `run_sync_cartoon(db)`

1. `extract_system_options_from_cartoon`

---

### Calculate All — `run_calculate_all(db)`

1. `run_post_processing`
2. `run_derive_related`
3. `run_sync`
4. `bulk_check_cover_image`
5. Log to `DataControlLog` (Success or Failed).

---

## Checking Logics

### Validate Episode Count — `apply_validate_episode_math(anime)` / `validate_episode_math(ep_total, ep_fin)`

`validate_episode_math` in `utils/utils.py` is the core rule; `apply_validate_episode_math` applies it to an Anime/TV Show/Cartoon object and writes changes back if values differ.

**Rules:**

- `ep_total`: convert to int (handles `"1.0"` from Sheets); treat `None`, `""`, `"?"` as `None`. Clamp to >= 0.
- `ep_fin`: convert to int; treat `None`, `""` as `0`. Clamp to >= 0.
- If `ep_fin > ep_total` (and total is known): clamp `ep_fin = ep_total`.

---

### Check Missing Values for Anime — `has_missing_values_anime(anime)`

Returns `True` if any required field is blank.

**Fields checked:** `airing_type`, `airing_status`, `release_month`, `release_season`, `release_year`, `mal_rating`, `mal_rank`, `ep_total`, `official_link`, `twitter_link`, `cover_image_file`.

**Special cases:**

- `airing_status == "Not Yet Aired"`: skip `mal_rating` and `mal_rank` (they don't exist yet on MAL).
- `ep_previous`: only required if `airing_type` is TV or ONA, `ep_special` is None, and `season_part` is set.

---

### Check Missing Values for Anime Movie — `has_missing_values_anime_movie(anime_movie)`

Returns `True` if any required field is blank.

**Fields checked:** `airing_type`, `airing_status`, `release_year_jp`, `mal_rating`, `mal_rank`, `ep_total`, `official_link`, `twitter_link`, `cover_image_file`.

**Special cases:**

- `airing_status == "Not Yet Aired"`: skip `mal_rating` and `mal_rank` (they don't exist yet on MAL).
- `ep_previous`: only required if `airing_type` is TV or ONA, `ep_special` is None, and `season_part` is set.

---

### Check Missing Values for Movie — `has_missing_values_movie(movie)`

Returns `True` if any required field is blank.

**Fields checked:** `length_min`, `director`, `airing_status`, `release_date_usa`, `imdb_rating`, `cover_image_file`.

---

### Check Missing Values for TV Show — `has_missing_values_tv_show(tv_show)`

Returns `True` if any required field is blank.

**Fields checked:** `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file`.

---

### Check Missing Values for Cartoon — `has_missing_values_tv_cartoon(cartoon)`

Returns `True` if any required field is blank.

## **Fields checked:** `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file`.

### Check Completed for TV Type — `check_is_tv_completed(entry)`

Applicable for anime, TV show, and cartoon entries. Returns `True` if:

- `watching_status == "Completed"`, OR
- `ep_total > 0` AND `ep_fin == ep_total`.

---

### Check Completed for Movie Type — `check_is_movie_completed(entry)`

Applicable for anime movie and movie entries. Returns `True` if:

- `watching_status == "Completed"`.

---

### Check Baha — `apply_check_baha(anime)`

Sets `source_baha = True` if all three conditions hold:

- `baha_link` is set.
- `airing_status == "Airing"`.
- `source_baha` is currently `None` (does not overwrite existing `True` or `False`).

---

### Check Cover Image — `bulk_check_cover_image(db, entry_type=None)`

Finds entries whose `cover_image_file` is set but the file is missing from storage. Optionally filtered by `entry_type`. Also includes results from `bulk_check_unused_cover_images` in its output.

---

### Check Cover Image Existence — `cover_image_exists(system_id)`

Returns `True` if the cover file for that `system_id` exists in GCS (Cloud Run) or `static/covers/` (local).

---

### Check Unused Cover Images — `bulk_check_unused_cover_images(db)`

Finds image files in storage not referenced by `cover_image_file` of any media type entry.

- `should_use`: file whose stem matches an existing anime `system_id` but the anime's field is not set — the field just needs to be populated.
- `orphaned`: file with no matching anime — safe to delete.

---

### Find Duplicates — `find_all_duplicates(db)` and per-table variants

All use a **union-find** algorithm with transitive closure (A=B, B=C collapses to one cluster).

| Function                        | Duplicate Key                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `find_duplicate_franchises`     | Same `franchise_type` + at least one matching name (case-insensitive)                                        |
| `find_duplicate_series`         | Same `franchise_id` + at least one matching name                                                             |
| `find_duplicate_anime`          | Same `(franchise_id, series_id, airing_type, season_part, is_main, ep_special)` + at least one matching name |
| `find_duplicate_anime_movie`    | Same `franchise_id` + at least one matching name                                                             |
| `find_duplicate_movie`          | Same `(franchise_id, series_id)` + at least one matching name                                                |
| `find_duplicate_tv_show`        | Same `(franchise_id, series_id, season_part, is_main)` + at least one matching name                          |
| `find_duplicate_cartoon`        | Same `(franchise_id, series_id, season_part, is_main)` + at least one matching name                          |
| `find_duplicate_system_options` | Same `category` + same `option_value` (case-insensitive)                                                     |

`find_all_duplicates` runs all six: returns `{franchise, series, anime, anime_movie, movie, tv_show, system_options}`.

---

## Fill Missing Entry Data

### Extract MAL ID — `apply_extract_mal_id_anime(anime)` / `extract_mal_id_anime(url)`

Extracts numeric MAL ID from a MAL URL using regex `myanimelist\.net/anime/(\d+)`. Writes to `anime.mal_id`. Returns `True` if extracted.

---

### Extract IMDb ID — `apply_extract_imdb_id(movie)` / `extract_imdb_id(url)`

Extracts the IMDb integer ID from an IMDb URL using regex `imdb\.com/title/tt(\d+)`. Writes to `movie.imdb_id`. Returns `True` if extracted.

---

### Extract Season From Title — `apply_extract_season_from_title(anime)` / `extract_season_from_title(title)`

Parses "Season X", "Part X", or "Cour X" from `anime_name_en`, `tv_show_name_en`, or `cartoon_name_en`. Title-cases the result (e.g. `"Season 2 Part 1"`). Writes to corresponding `season_part` of the entry. Returns `True` if set.

---

### Calculate Seasonal From Month — `apply_calculate_seasonal_from_month(anime)` / `calculate_seasonal_from_month(month_str)`

Infers `release_season` from `release_month`. Only applies if `airing_type` is TV or ONA.

| Month                      | Season |
| -------------------------- | ------ |
| JAN / FEB / MAR (or 1-3)   | WIN    |
| APR / MAY / JUN (or 4-6)   | SPR    |
| JUL / AUG / SEP (or 7-9)   | SUM    |
| OCT / NOV / DEC (or 10-12) | FAL    |

Accepts both string abbreviations (`"APR"`) and numeric strings (`"4"`, `"04"`).

---

### Derive Watch Order Anime — `derive_watch_order_anime(db, franchise_id)`

Assigns consecutive `watch_order` floats (starting at 1.0) to eligible entries within a franchise.

**Eligibility:** `airing_type` is not null or `"Other"`, and `season_part` is set.

**Only fills entries where `watch_order` is currently `None`** — never overwrites existing values.

**Sort algorithm per series group:**

1. Season number (from `season_part`)
2. Part number (from `season_part`)
3. Airing type priority: TV(0) → ONA(1) → Special(2) → OVA(3) → OAD(4)

**Final ordering:** Series groups first (sorted by series `display_name`), no-series entries appended last.

---

### Derive Watch Order TV Show — `derive_watch_order_tv_show(db, franchise_id)`

Assigns consecutive `watch_order` floats (starting at 1.0) to eligible TV show entries within a franchise.

**Eligibility:** `season_part` is set.

**Only fills entries where `watch_order` is currently `None`** — never overwrites existing values.

**Sort algorithm per series group:** Season number (from `season_part`), then part number.

**Final ordering:** Series groups first (sorted by series `display_name`), no-series entries appended last.

---

### Derive Watch Order Cartoon — `derive_watch_order_cartoon(db, franchise_id)`

Assigns consecutive `watch_order` floats (starting at 1.0) to eligible Cartoon show entries within a franchise.

**Eligibility:** `season_part` is set.

**Only fills entries where `watch_order` is currently `None`** — never overwrites existing values.

**Sort algorithm per series group:** Season number (from `season_part`), then part number.

**Final ordering:** Series groups first (sorted by series `display_name`), no-series entries appended last.

---

### Derive Watch Order Movie — `derive_watch_order_movie(db, franchise_id)`

TBD.

---

### Derive Prequel Sequel Anime — `derive_prequel_sequel_anime(db, franchise_id)`

Sets `prequel_id` and `sequel_id` for anime entries in an ACG franchise, sorted by `watch_order`.

**Eligibility:** `watch_order` is not null AND `derive_related != False`.

**Only fills entries where the field is currently `None`** — never overwrites.

Each entry's `prequel_id` = the entry before it; `sequel_id` = the entry after it.

---

### Derive Prequel Sequel Movie — `derive_prequel_sequel_movie(db, franchise_id)`

## TBD.

### Derive Prequel Sequel TV Show — `derive_prequel_sequel_tv_show(db, franchise_id)`

Sets `prequel_id` and `sequel_id` for TV show entries in a TV or Movie franchise, sorted by `watch_order`.

**Eligibility:** `watch_order` is not null AND `derive_related != False`. Does not apply to Special Franchises.

**Only fills entries where the field is currently `None`** — never overwrites.

Each entry's `prequel_id` = the entry before it; `sequel_id` = the entry after it.

---

### Derive Prequel Sequel Cartoon — `derive_prequel_sequel_cartoon(db, franchise_id)`

Sets `prequel_id` and `sequel_id` for Cartoon entries in a Cartoon franchise, sorted by `watch_order`.

**Eligibility:** `watch_order` is not null AND `derive_related != False`. Does not apply to Special Franchises.

**Only fills entries where the field is currently `None`** — never overwrites.

Each entry's `prequel_id` = the entry before it; `sequel_id` = the entry after it.

---

### Derive `ep_previous` — `derive_ep_previous_anime(db, franchise_id, series_id=_SERIES_UNSET)`

Sets cumulative `ep_previous` for eligible TV/ONA entries within the same franchise+series group.

**Eligibility:** `airing_type` is TV or ONA, `ep_special` is null, `season_part` is set.

**Only fills entries where `ep_previous` is currently `None`.**

**Rules:**

- "Season 1" or "Season 1 Part 1": set `ep_previous = 0`.
- Otherwise: `ep_previous = previous.ep_previous + previous.ep_total` — only if both values are available.

When called with default `series_id=_SERIES_UNSET`, processes all series groups within the franchise independently.

---

### Derive S1 Anime — `derive_season_1_anime(anime, db)`

Sets `season_part = "Season 1"` if `season_part` is None, `airing_type == "TV"`, `franchise_id` is set, and the franchise has exactly 1 TV entry.

---

### Derive S1 TV Show — `derive_season_1_tv_show(tv_show, db)`

Sets `season_part = "Season 1"` if `season_part` is None, `franchise_id` is set, and the franchise has exactly 1 TV show entry.

---

### Derive S1 Cartoon — `derive_season_1_cartoon(cartoon, db)`

Sets `season_part = "Season 1"` if `season_part` is None, `franchise_id` is set, and the franchise has exactly 1 cartoon entry.

---

### Set Cover Image Fields — `bulk_set_cover_image_fields(db)`

For anime with `cover_image_file = None`, sets it to `"<system_id>.jpg"` if the file actually exists in storage.

---

## Fill from External Sources

### MAL Autofill Anime — `autofill_anime_from_mal(anime, force_replace_ratings=True)`

Enriches a single Anime entry with Jikan API data. Does not commit — caller is responsible.

**Steps:**

1. Resolve `mal_id` from `anime.mal_id`. Return if no ID.
2. Call `fetch_jikan_anime_data(mal_id)`.
3. Map response via `map_jikan_to_anime_data()`.
4. Fill each field **only if currently None**: `airing_type`, `airing_status`, `release_month`, `release_season`, `release_year`, `ep_total`, `official_link`, `twitter_link`.
5. Ratings (`mal_rating`, `mal_rank`): always overwrite if `force_replace_ratings=True`; fill-only if `False`.
6. Cover image: if `cover_image_file` is None and a URL was returned, download and upload to GCS, then set `cover_image_file`.

---

### MAL Autofill Anime Movie — `autofill_anime_movie_from_mal(anime, force_replace_ratings=True)`

Enriches a single Anime Movie entry with Jikan API data. Does not commit — caller is responsible.

**Steps:**

1. Resolve `mal_id` from `anime_movie.mal_id`. Return if no ID.
2. Call `fetch_jikan_anime_data(mal_id)`.
3. Map response via `map_jikan_to_anime_data()`.
4. Fill each field **only if currently None**: `airing_status`, `release_year_jp`, `official_link`, `twitter_link`.
5. Ratings (`mal_rating`, `mal_rank`): always overwrite if `force_replace_ratings=True`; fill-only if `False`.
6. Cover image: if `cover_image_file` is None and a URL was returned, download and upload to GCS, then set `cover_image_file`.

---

### IMDb Autofill Movie — `autofill_movie_from_imdb(movie)`

Enriches a single Movie entry with TMDB + OMDb data. Does not commit — caller is responsible.

**Steps:**

1. Resolve `imdb_id` from `movie.imdb_id`. Return if no ID.
2. Call `fetch_imdb_data(imdb_id)` — returns `{"tmdb_raw": ..., "omdb_raw": ...}`. Either may be `None`.
3. Call `map_imdb_to_movie_data(tmdb_raw, omdb_raw)` — merges both sources into a flat dict.
4. Fill each field **only if currently None**: `length_min`, `director`, `release_date_usa`.
5. `imdb_rating`: always overwrite if fetched value is not None.
6. `airing_status` (fill-only if currently None): read raw `tmdb_raw.get("release_date")` and compare to today — past date → `"Finished Airing"`, future date → `"Not Yet Aired"`. Skip if TMDB returned no date.
7. Cover image: if `cover_image_file` is None and `cover_image_url` is in the mapped data, download and upload to GCS as `{system_id}.jpg`, set `cover_image_file`.

---

### IMDb Autofill TV Show — `autofill_tv_show_from_imdb(tv_show, db)`

Enriches a single TV show entry (one season) with TMDB + OMDb data. Does not commit — caller is responsible.

Each entry represents **one season** of a show. The `imdb_id` field stores the show-level IMDb ID (shared across all seasons). The `season_part` field (e.g., `"Season 1"`, `"Season 2 Part 1"`) determines which season number to query on TMDB for season-specific data.

**Steps:**

1. Return early if `tv_show.imdb_id` is None.
2. Call `fetch_imdb_data(tv_show.imdb_id)` → `{"tmdb_raw": ..., "omdb_raw": ...}` (show-level).
3. If `tmdb_raw` is not None:
   - Extract `tmdb_id = tmdb_raw.get("id")`.
   - Parse season number: `season_number = _parse_season_number(tv_show.season_part)`.
   - Call `fetch_tmdb_tv_season_data(tmdb_id, season_number)` → `tmdb_season_raw`.
4. Call `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)` → flat merged dict.
5. Fill each field **only if currently None**: `release_date`, `ep_total`.
6. `imdb_rating`: always overwrite if fetched value is not None.
7. `airing_status` (fill-only if currently None): derive via `_derive_tv_season_airing_status(season_air_date, episodes)`.
8. Cover image (fill-only): if `cover_image_file` is None and `cover_image_url` is in the mapped data, download and upload to GCS as `{system_id}.jpg`, set `cover_image_file`.

---

### IMDb Autofill Cartoon — `autofill_cartoon_from_imdb(cartoon, db)`

TBD. Follows same architecture as `autofill_tv_show_from_imdb`.

---

## MAL Data Helpers

### MAL Fetch Anime — `fetch_jikan_anime_data(mal_id)` in `services/jikan.py`

Fetches `GET https://api.jikan.moe/v4/anime/{mal_id}/full`.

**Rate limiting:** Global `JikanRateLimiter` singleton — sliding window, default 30 requests / 60 seconds. Blocks before each request until under the limit.

**Retry:** 5 attempts, exponential backoff 2-10s. Retries on `RequestException` or `RateLimitExceeded` (HTTP 429). Returns `None` on 404 or >= 500.

---

### MAL Conversion for Anime — `map_jikan_to_anime_data(raw_data)` in `utils/jikan_utils.py`

Transforms raw Jikan `data` dict to a flat standardized dict.

| Output Field      | Jikan Source                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `airing_type`     | `type` — normalized; `"Other"` if not in allowed set                                                          |
| `airing_status`   | `status` — "Finished..." → `"Finished Airing"`, "Currently..." → `"Airing"`, "Not yet..." → `"Not Yet Aired"` |
| `release_season`  | `season` — winter/spring/summer/fall → WIN/SPR/SUM/FAL                                                        |
| `release_year`    | `aired.from` (ISO date parsed)                                                                                |
| `release_month`   | `aired.from` (month → JAN/FEB/...)                                                                            |
| `release_year_jp` | `aired.from` (ISO date parsed)                                                                                |

| `mal_rating` | `score` |
| `mal_rank` | `rank` (as string) |
| `ep_total` | `episodes` |
| `official_link` | `external[]` — first entry with "official" in name |
| `twitter_link` | `external[]` — first entry with twitter.com or x.com in URL |
| `cover_image_url` | `images.webp.large_image_url` → `images.jpg.large_image_url` → `images.jpg.image_url` |

---

## IMDb Data Helpers

### IMDb Fetch — `fetch_imdb_data(imdb_id)` in `services/tmdb.py`

Orchestrates TMDB and OMDb calls for a given IMDb integer ID. Returns `{"tmdb_raw": ..., "omdb_raw": ...}`. Either value may be `None` if the respective API call fails.

**Steps:**

1. Call `fetch_tmdb_data(imdb_id)` — returns raw TMDB dict with `_media_type` key, or `None`.
2. Call `fetch_omdb_data(imdb_id)` — returns raw OMDb dict, or `None`.
3. Return both results as a dict.

**Note:** Both fetches run regardless of individual failure — a TMDB failure does not skip OMDb.

---

### TMDB Fetch — `fetch_tmdb_data(imdb_id)` in `services/tmdb.py`

Handles movie, tv show, and cartoon entries. Two-step lookup: `/find/{tt_id}?external_source=imdb_id` → TMDB ID + media type, then delegates to `_fetch_movie_details` (movie) or `_fetch_tv_details` (tv show and cartoon).

- **`_find_tmdb_id(imdb_tt_id, api_key)`** — resolves an IMDb `tt` ID to a TMDB integer ID and media type (`"movie"` or `"tv"`). Calls `GET /3/find/{imdb_tt_id}?external_source=imdb_id`.
- **`_fetch_movie_details`** — fetches `/movie/{id}?append_to_response=credits`.
- **`_fetch_tv_details`** — fetches `/tv/{id}`. Used for tv show and cartoon entries.

**Rate limiting:** Global `TMDbRateLimiter` singleton — sliding window, 40 requests / 10 seconds.
**Retry:** 5 attempts, exponential backoff 2–10s. Retries on `RequestException` or `RateLimitExceeded`. Returns `None` on 404 or >= 500.

---

### OMDb Fetch — `fetch_omdb_data(imdb_id)` in `services/omdb.py`

Handles movie, tv show, and cartoon entries. Fetches `GET http://www.omdbapi.com/?i=tt{id}&apikey={key}`.

**Rate limiting:** Global `OMDbRateLimiter` singleton — sliding window daily quota, 1000 requests / 24 hours.
**Retry:** 5 attempts, exponential backoff 2–10s. Returns `None` on `Response: False`, 401, or >= 500.

---

### IMDb Conversion for Movie — `map_imdb_to_movie_data(tmdb_raw, omdb_raw)` in `utils/tmdb_utils.py`

Merges results from both APIs into one flat dict for the Movie model.

1. If `tmdb_raw` is available: call `map_tmdb_to_movie_data(tmdb_raw)`.
2. If `omdb_raw` is available: call `map_omdb_to_movie_data(omdb_raw)`.
3. Merge, with `omdb_raw` values taking precedence for `imdb_rating`.

---

### TMDB Conversion for Movie — `map_tmdb_to_movie_data(raw)` in `utils/tmdb_utils.py`

| Output Field       | TMDB Source                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `length_min`       | `runtime`                                                              |
| `release_date_usa` | `_convert_tmdb_date(release_date)` — parsed to `"MON YYYY"` format     |
| `director`         | `_extract_director(credits.crew)` — first member with job `"Director"` |
| `cover_image_url`  | `poster_path` with `TMDB_IMAGE_BASE_URL` prefix                        |

---

### OMDB Conversion for Movie — `map_omdb_to_movie_data(raw)` in `utils/omdb_utils.py`

| Output Field  | OMDb Source  |
| ------------- | ------------ |
| `imdb_rating` | `imdbRating` |

`"N/A"` → `None`.

---

### Parse Season Number — `_parse_season_number(season_part)` in `utils/tmdb_utils.py`

Extracts the season number from the `season_part` string using regex `Season\s+(\d+)`. Defaults to `1` if `season_part` is None or no match is found.

| `season_part` value | Returns |
| ------------------- | ------- |
| `"Season 1"`        | `1`     |
| `"Season 2"`        | `2`     |
| `"Season 2 Part 1"` | `2`     |
| `None`              | `1`     |
| `"Special"`         | `1`     |

---

### TMDB Season Fetch — `fetch_tmdb_tv_season_data(tmdb_id, season_number)` in `services/tmdb.py`

Fetches `GET /3/tv/{tmdb_id}/season/{season_number}`. Returns raw season JSON or `None`.

Uses the same `TMDbRateLimiter` and `@retry` configuration as `fetch_tmdb_data`.

---

### TMDB Conversion for TV Show — `map_tmdb_to_tv_show_data(raw)` in `utils/tmdb_utils.py`

| Output Field      | TMDB Source                                     |
| ----------------- | ----------------------------------------------- |
| `release_date`    | `_convert_tmdb_date(first_air_date)`            |
| `cover_image_url` | `poster_path` with `TMDB_IMAGE_BASE_URL` prefix |

---

### TMDB Conversion for TV Season — `map_tmdb_to_tv_show_data(raw)` in `utils/tmdb_utils.py`

Maps the TMDB Season Details endpoint response. The `_season_air_date` and `_episodes` keys are private — used only for `airing_status` derivation in the autofill function; not written to the database.

| Output Field       | TMDB Source                                     |
| ------------------ | ----------------------------------------------- |
| `release_date`     | `_convert_tmdb_date(air_date)`                  |
| `ep_total`         | `len(episodes[])`                               |
| `cover_image_url`  | `poster_path` with `TMDB_IMAGE_BASE_URL` prefix |
| `_season_air_date` | `air_date` (raw ISO string)                     |
| `_episodes`        | `episodes[]` (raw list)                         |

---

### IMDb Conversion for TV Show — `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)` in `utils/imdb_utils.py`

Merges show-level and season-level TMDB data with OMDb data into one flat dict.

1. If `tmdb_season_raw` is not None: apply `map_tmdb_to_tv_show_data(tmdb_season_raw)`.
2. If `cover_image_url` is still None and `tmdb_raw` is not None: fall back to show-level `poster_path` via `_build_poster_url`.
3. If `omdb_raw` is not None: apply `map_omdb_to_tv_show_data(omdb_raw)` (adds `imdb_rating`).

---

### TV Season Airing Status Derivation — `_derive_tv_season_airing_status(season_air_date, episodes)`

| Condition                                                             | Result              |
| --------------------------------------------------------------------- | ------------------- |
| `season_air_date` is None or unparseable                              | `None` (skip)       |
| `season_air_date` > today                                             | `"Not Yet Aired"`   |
| `season_air_date` ≤ today AND all episodes have `air_date` ≤ today    | `"Finished Airing"` |
| `season_air_date` ≤ today AND not all episodes have a past `air_date` | `"Airing"`          |

---

### OMDB Conversion for TV Show — `map_omdb_to_tv_show_data(raw)` in `utils/omdb_utils.py`

| Output Field  | OMDb Source  |
| ------------- | ------------ |
| `imdb_rating` | `imdbRating` |

`"N/A"` → `None`.

---

### TMDB Conversion for Cartoon — `map_tmdb_to_cartoon_data(raw)` in `utils/tmdb_utils.py`

| Output Field      | TMDB Source                                     |
| ----------------- | ----------------------------------------------- |
| `release_date`    | `_convert_tmdb_date(first_air_date)`            |
| `cover_image_url` | `poster_path` with `TMDB_IMAGE_BASE_URL` prefix |

---

### OMDB Conversion for Cartoon — `map_omdb_to_cartoon_data(raw)` in `utils/omdb_utils.py`

| Output Field  | OMDb Source  |
| ------------- | ------------ |
| `imdb_rating` | `imdbRating` |

`"N/A"` → `None`.

---

## Sync

### Create Missing Seasonal — `create_missing_seasonal(db)`

Queries distinct `(release_season, release_year)` pairs from `anime`. Creates a `Seasonal` row keyed `"YYYY SSS"` (e.g. `"2025 SPR"`) for each pair that doesn't already exist.

---

### Sync Seasonal Counts — `sync_seasonal_counts(db)`

Recomputes `entry_planned`, `entry_completed`, `entry_watching`, `entry_dropped` for all `Seasonal` rows.

**Eligible anime:** `release_season` and `release_year` are set, `airing_type` in `{TV, ONA, Movie, Special}`.

| watching_status                             | Counter incremented |
| ------------------------------------------- | ------------------- |
| Plan to Watch / Watch When Airs             | `entry_planned`     |
| `"Completed"`                               | `entry_completed`   |
| Active Watching / Passive Watching / Paused | `entry_watching`    |
| Temp Dropped / Dropped                      | `entry_dropped`     |

---

### Extract System Options from Anime — `extract_system_options_from_anime(db)`

Scans all Anime entries for values in: `genre_main`, `genre_sub`, `studio`, `distributor_tw`, `director`, `producer`, `music`. Values are comma-split. Any value not already in `system_options` for that category is added automatically.

---

### Extract System Options from Anime Movie — `extract_system_options_from_anime_movie(db)`

Scans all Anime Movie entries for values in: `studio` and `director`. Values are comma-split. Any value not already in `system_options` for that category is added automatically.

---

### Extract System Options from TV Show — `extract_system_options_from_tv_show(db)`

Scans all TV Show entries for values in: `source_official`. Any value not already in `system_options` for that category is added automatically.

---

## Other Logics

### Calculate Cumulative Episode _(computed field, not a function)_

Computed in `AnimeResponse` (Pydantic schema), never stored in the DB:

- `cum_ep_fin = (ep_previous or 0) + (ep_fin or 0)`
- `cum_ep_total = (ep_previous or 0) + ep_total` — returns `None` if `ep_total` is null.

---

## Other Actions

### Mark Completed — `mark_tv_completed(entry)`

Sets automatically: `watching_status = "Completed"`, `airing_status = "Finished Airing"`, `ep_fin = ep_total`.

---

### Mark Completed — `mark_movie_completed(entry)`

Sets automatically: `watching_status = "Completed"`, `airing_status = "Finished Airing"`.

---

### Set Current Season _(router: `POST /api/system/config/current_season`)_

Upserts `current_season` key in `system_configs`. Value format: `"YYYY SSS"` (e.g. `"2025 SPR"`). Drives current-season highlighting and defaults in the UI.

---

### List All Covers — `list_all_cover_images()` in `services/image_manager.py`

Returns all cover image filenames from GCS (Cloud Run) or `static/covers/` (local dev).

---

### Download Missing Covers — `bulk_download_missing_covers(db, system_ids=None)`

Re-downloads cover images for entries whose `cover_image_file` is set but the file is missing. Method: clears `cover_image_file`, calls `autofill_anime_from_mal(force_replace_ratings=False)` to trigger a fresh Jikan fetch and download without overwriting ratings. Skips entries with `airing_type` not in `ALLOWED_AIRING_TYPES = {TV, Movie, ONA, OVA, Special}`.

---

### Delete Orphaned Covers — `bulk_delete_orphaned_cover_images(db)` / `delete_cover_image(system_id)`

`bulk_delete_orphaned_cover_images`: calls `bulk_check_unused_cover_images` to get the orphaned list, then calls `delete_cover_image` for each file.

`delete_cover_image`: removes the file from GCS (Cloud Run) or `static/covers/` (local dev).

---

## Formatters (DB to Sheet)

Located in `utils/formatter.py`.

### `format_for_sheet(val, expected_type=str)`

Converts Python/SQLAlchemy values to Sheets-compatible strings:

| Input           | Output                             |
| --------------- | ---------------------------------- |
| `None`          | `""`                               |
| `bool`          | `"TRUE"` / `"FALSE"`               |
| `datetime`      | ISO 8601 + `"Z"`                   |
| `dict` / `list` | JSON string (`ensure_ascii=False`) |
| anything else   | `str(val)`                         |

---

### `format_model_for_sheet(instance)`

Iterates `instance.__class__.__table__.columns` in exact DB schema order and calls `format_for_sheet` on each. Guarantees sheet column order permanently matches DB column order — prevents column-shifting bugs on schema changes.

---

## Parsers (Sheet to Python Types)

Located in `utils/formatter.py`.

### `parse_row_to_dict(headers, row)`

Maps a sheet row list to a dict using headers. Substitutes `""` for missing trailing columns (sheet rows often omit empty trailing cells).

---

### `parse_from_sheet(val_str, expected_type)`

Core type converter. Returns `None` for empty/whitespace strings.

| expected_type | Conversion                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `int`         | `int(float(val_str))` — handles `"1.0"` exported by Sheets                                                                   |
| `float`       | `float(val_str)`                                                                                                             |
| `bool`        | `"true"/"1"/"yes"/"y"/"t"` → `True`; `"false"/"0"/"no"/"n"/"f"` → `False`; else `None`                                       |
| `datetime`    | `datetime.fromisoformat(val.replace("Z", "+00:00"))`                                                                         |
| `UUID`        | `UUID(val_str)` if valid; **returns raw string on failure** so service layer can resolve string names to UUIDs via DB lookup |
| `str`         | Returns as-is                                                                                                                |

---

### Tab-specific parsers

`parse_franchise_from_sheet`, `parse_series_from_sheet`, `parse_anime_from_sheet`, `parse_anime_movie_from_sheet`, `parse_movie_from_sheet`, `parse_tv_show_from_sheet`, `parse_cartoon_from_sheet`, `parse_manga_from_sheet`, `parse_novel_from_sheet`, `parse_system_option_from_sheet` — each calls `parse_from_sheet` for every expected field with the correct type.

**`parse_movie_from_sheet`**: Foreign keys (`franchise_id`, `series_id`, `prequel_id`, `sequel_id`) parsed as `UUID` — string names are resolved to UUIDs by `execute_pull_specific`. `imdb_id` parsed as `int`.

**`parse_tv_show_from_sheet`**: Parses a raw dictionary from the TV Shows sheet into typed data ready for the database. Foreign keys parsed as `UUID`. `imdb_id` parsed as `str`.

**Notable:**

- `parse_anime_from_sheet`: `notes` field parsed via `json.loads` directly (JSONB). `source_netflix` defaults to `False` if null (unlike `source_baha` which stays `None`).
- Foreign keys (`franchise_id`, `series_id`, `prequel_id`, `sequel_id`): parsed as `UUID` — if the sheet contains a string name, `parse_from_sheet` returns the string and `execute_pull_specific` resolves it to a real UUID.

---

## Other Helpers

### Resolve Parent for Series — `resolve_series_parent_hierarchy(db, franchise_id, names)`

Ensures a valid `franchise_id` UUID for a Series during Pull.

- Valid UUID provided: return it.
- Null or string: search all franchise name fields (case-insensitive `ilike`).
- Found: return existing UUID.
- Not found: **auto-create** a new Franchise with `uuid4()`, flush, return new UUID.

---

### Resolve Parent for Anime — `resolve_anime_parent_hierarchy(db, franchise_id, series_id, names)`

- Resolves `franchise_id` the same way as Series (with auto-create if missing).
- Resolves `series_id`: returns the provided value only — **does not auto-create** a Series.
- Returns `(final_franchise_id, final_series_id)`.

---

### Resolve Parent for Anime Movie — `resolve_anime_movie_parent_hierarchy(db, franchise_id, names)`

Ensures a valid `franchise_id` UUID for an Anime Movie during Pull.

- Valid UUID provided: return it.
- Null or string: search all franchise name fields (case-insensitive `ilike`).
- Found: return existing UUID.
- Not found: **auto-create** a new Franchise with `uuid4()`, flush, return new UUID.

---

### Resolve Parent for Movie — `resolve_movie_parent_hierarchy(db, franchise_id, series_id, names)`

Ensures valid `franchise_id` and `series_id` UUIDs for a Movie. Used by the Pull pipeline and Create/Update endpoints.

**Franchise resolution** (same as Anime Movie):

- Valid UUID object provided: use it as-is.
- Null or string: search all franchise name fields (`ilike` on `en`, `cn`, `alt`).
- Found: return existing UUID.
- Not found: **auto-create** a new Franchise with `franchise_type="TV or Movie"`, flush, return new UUID.

**Series resolution:**

- Non-string (UUID object or null): pass through unchanged.
- Non-empty string: search Series by name (`ilike` on `series_name_en`, `series_name_cn`, `series_name_alt`).
  - Found: return existing UUID.
  - Not found: set to `null` and log a warning. **Does not auto-create** a Series.

Returns `(final_franchise_id, final_series_id)`.

---

### Resolve Parent for TV Show — `resolve_tv_show_parent_hierarchy(db, franchise_id, series_id, names)`

Ensures valid `franchise_id` and `series_id` UUIDs for a TV Show. Used by the Pull pipeline and Create/Update endpoints.

**Franchise resolution:**

- Valid UUID object provided: use it as-is.
- Null or string: search all franchise name fields (`ilike` on `en`, `cn`, `alt`).
- Found: return existing UUID.
- Not found: **auto-create** a new Franchise with `franchise_type="TV or Movie"`, flush, return new UUID.

**Series resolution:**

- Non-string (UUID object or null): pass through unchanged.
- Non-empty string: search Series by name (`ilike` on `series_name_en`, `series_name_cn`, `series_name_alt`).
  - Found: return existing UUID.
  - Not found: set to `null` and log a warning. **Does not auto-create** a Series.

Returns `(final_franchise_id, final_series_id)`.
