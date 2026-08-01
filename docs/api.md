# API Reference

All endpoints are prefixed under `/api/`. The app is a SPA — all non-API routes are caught by a FastAPI catch-all that serves `index.html`.

## Authentication

- **Public endpoints** — accessible by any visitor (guest or admin).
- **Admin-only endpoints** — require a valid JWT in the `access_token` HTTP-Only cookie, enforced via `Depends(get_current_admin)` in `app/dependencies.py`.
- Login flow: `POST /api/auth/login` → sets cookie → all subsequent admin requests carry it automatically.

---

## Table of Contents

- [Auth — `/api/auth`](#auth--apiauth)
- [Franchise — `/api/franchise`](#franchise--apifranchise)
- [Series — `/api/series`](#series--apiseries)
- [Anime — `/api/anime`](#anime--apianime)
- [Anime Movie — `/api/anime-movie`](#anime-movie--apianime-movie)
- [Movie — `/api/movies`](#movie--apimovies)
- [TV Show — `/api/tv-shows`](#tv-show--apitv-shows)
- [Cartoon — `/api/cartoon`](#cartoon--apicartoon)
- [Manga — `/api/manga`](#manga--apimanga)
- [Novel — `/api/novel`](#novel--apinovel)
- [Seasonal — `/api/seasonal`](#seasonal--apiseasonal)
- [Options — `/api/options`](#options--apioptions)
- [Announcements — `/api/announcements`](#announcements--apiannouncements)
- [Form Defaults — `/api/form-defaults`](#form-defaults--apiform-defaults)
- [Data Control — `/api/data-control`](#data-control--apidata-control)
- [System — `/api/system`](#system--apisystem)

---

## Auth — `/api/auth`

| Method | Path      | Auth   | Description                                                                                              |
| ------ | --------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `POST` | `/login`  | Public | Authenticate with username + password (form data). Sets HTTP-Only JWT cookie. Returns `{message, role}`. |
| `GET`  | `/me`     | Public | Returns `{is_admin: bool, username}` from the current cookie. Used by `AuthContext` on app boot.         |
| `POST` | `/logout` | Public | Clears the `access_token` cookie.                                                                        |

**Login request:** `OAuth2PasswordRequestForm` — `username` and `password` fields.

---

## Franchise — `/api/franchise`

| Method   | Path           | Auth   | Description                                                                                                                                                                   |
| -------- | -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all franchises. Optional query param `search_query` searches across all name fields.                                                                                     |
| `GET`    | `/{system_id}` | Public | Get a single franchise by UUID.                                                                                                                                               |
| `POST`   | `/`            | Admin  | Create a franchise. Body: `FranchiseCreate`.                                                                                                                                  |
| `PUT`    | `/{system_id}` | Admin  | Full update of a franchise. Body: `FranchiseUpdate`.                                                                                                                          |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (e.g. inline rating edit). Body: raw JSON dict.                                                                                                                |
| `DELETE` | `/{system_id}` | Admin  | Delete a franchise. Linked series, anime, movies, TV shows, cartoons, manga, and novels `franchise_id` are set to `NULL` via DB constraint cascade. Logs to `deleted_record`. |

**Response model:** `FranchiseResponse`

---

## Series — `/api/series`

| Method   | Path           | Auth   | Description                                                                        |
| -------- | -------------- | ------ | ---------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all series. Optional params: `franchise_id` (UUID), `search_query`.           |
| `GET`    | `/{system_id}` | Public | Get a single series by UUID.                                                       |
| `POST`   | `/`            | Admin  | Create a series. Resolves or auto-creates parent franchise. Body: `SeriesCreate`.  |
| `PUT`    | `/{system_id}` | Admin  | Full update. Resolves hierarchy changes. Body: `SeriesUpdate`.                     |
| `PATCH`  | `/{system_id}` | Admin  | Partial update. Body: raw JSON dict.                                               |
| `DELETE` | `/{system_id}` | Admin  | Delete a series. Linked `anime.series_id` set to `NULL`. Logs to `deleted_record`. |

**Response model:** `SeriesResponse`

---

> **Media entry routers.** `movie`, `tv-shows`, `cartoon`, `manga`, and `novel` share a generated router (`make_media_router` + `MEDIA_REGISTRY`, see `app/routers/_factory.py`) and use `/{entry_id}` for single-entry paths. `anime` and `anime-movie` are hand-written and use `/{system_id}`. All seven expose the same CRUD + `/{…}/complete` shape.

## Anime — `/api/anime`

| Method   | Path           | Auth   | Description                                                                                                    |
| -------- | -------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List anime. Optional params: `franchise_id`, `series_id`, `search_query`, `airing_season` (e.g. `"WIN 2026"`). |
| `GET`    | `/{system_id}` | Public | Get a single anime entry by UUID.                                                                              |
| `POST`   | `/`            | Admin  | Create an anime entry. Runs episode math and domain rules. Body: `AnimeCreate`.                                |
| `PUT`    | `/{system_id}` | Admin  | Full update. Runs episode math and domain rules. Body: `AnimeUpdate`.                                          |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (e.g. +1 episode). Auto-marks completed if `ep_fin` reaches `ep_total`. Body: raw JSON dict.    |
| `POST`   | `/{system_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).             |
| `DELETE` | `/{system_id}` | Admin  | Delete an anime entry. Cleans up local cover image. Logs to `deleted_record`.                                  |

**Response model:** `AnimeResponse` (includes computed fields `cum_ep_fin`, `cum_ep_total`)

---

## Anime Movie — `/api/anime-movie`

| Method   | Path           | Auth   | Description                                                                                |
| -------- | -------------- | ------ | ------------------------------------------------------------------------------------------ |
| `GET`    | `/`            | Public | List all anime movies. Optional params: `franchise_id`, `watching_status`, `search_query`. |
| `GET`    | `/{system_id}` | Public | Get a single anime movie entry by UUID.                                                    |
| `POST`   | `/`            | Admin  | Create an anime movie entry. Body: `AnimeMovieCreate`.                                     |
| `PUT`    | `/{system_id}` | Admin  | Full update. Body: `AnimeMovieUpdate`.                                                     |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (e.g. watching status, rating). Body: raw JSON dict.                        |
| `POST`   | `/{system_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", timestamps).                    |
| `DELETE` | `/{system_id}` | Admin  | Delete an anime movie entry. Cleans up local cover image. Logs to `deleted_record`.        |

**Response model:** `AnimeMovieResponse`

---

## Movie — `/api/movies`

| Method   | Path                   | Auth   | Description                                                                                                             |
| -------- | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                    | Public | List all movie entries. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `movie_type`. |
| `GET`    | `/{entry_id}`          | Public | Get a single movie entry by UUID.                                                                                       |
| `POST`   | `/`                    | Admin  | Create a movie entry. Auto-runs `execute_replace_single_movie` after creation. Body: `MovieCreate`.                     |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a movie entry. Auto-runs `execute_replace_single_movie` after update. Body: `MovieUpdate`.               |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update (e.g. watching status, rating). Does not re-run pipeline. Body: raw JSON dict.                           |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a movie entry. Removes cover image from GCS if present. Logs to `deleted_record`.                                |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", timestamps).                                                    |

**Response model:** `MovieResponse`

**IMDb pipeline:** `POST /` and `PUT /{entry_id}` both automatically trigger `execute_replace_single_movie`, which extracts the IMDb ID from `imdb_link`, calls TMDB and OMDb, and fills missing fields (length, director, release dates, imdb_rating, cover image).

---

## TV Show — `/api/tv-shows`

| Method   | Path                    | Auth   | Description                                                                                                                    |
| -------- | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/`                     | Public | List all TV shows. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `region`, `search_query`. |
| `GET`    | `/{entry_id}`         | Public | Get a single TV show entry by UUID.                                                                                            |
| `POST`   | `/`                     | Admin  | Create a TV show entry. Auto-runs `execute_replace_single_tv_show` after creation. Body: `TVShowCreate`.                       |
| `PUT`    | `/{entry_id}`         | Admin  | Full update of a TV show entry. Auto-runs `execute_replace_single_tv_show` after update. Body: `TVShowUpdate`.                 |
| `PATCH`  | `/{entry_id}`         | Admin  | Partial update (e.g. inline ratings). Does not re-run pipeline. Body: raw JSON dict.                                           |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).                                        |
| `DELETE` | `/{entry_id}`         | Admin  | Delete a TV show entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                        |

**Response model:** `TVShowResponse`

---

## Cartoon — `/api/cartoon`

| Method   | Path                    | Auth   | Description                                                                                                                        |
| -------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                     | Public | List all cartoons. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `to_rewatch`, `search_query`. |
| `GET`    | `/{entry_id}`         | Public | Get a single cartoon entry by UUID.                                                                                                |
| `POST`   | `/`                     | Admin  | Create a cartoon entry. Auto-runs `execute_replace_single_cartoon` after creation. Body: `CartoonCreate`.                          |
| `PUT`    | `/{entry_id}`         | Admin  | Full update of a cartoon entry. Auto-runs `execute_replace_single_cartoon` after update. Body: `CartoonUpdate`.                    |
| `PATCH`  | `/{entry_id}`         | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                     |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).                                            |
| `DELETE` | `/{entry_id}`         | Admin  | Delete a cartoon entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                            |

**Response model:** `CartoonResponse`

---

## Manga — `/api/manga`

| Method   | Path                   | Auth   | Description                                                                                                                          |
| -------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/`                    | Public | List all manga. Optional params: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `to_reread`, `search_query`. |
| `GET`    | `/{entry_id}`          | Public | Get a single manga entry by UUID.                                                                                                    |
| `POST`   | `/`                    | Admin  | Create a manga entry. Auto-runs `execute_replace_single_manga` after creation. Body: `MangaCreate`.                                  |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a manga entry. Auto-runs `execute_replace_single_manga` after update. Body: `MangaUpdate`.                            |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                       |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (reading status to "Completed", volumes/chapters finished, serialization status).                             |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a manga entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                                |

**Response model:** `MangaResponse`

---

## Novel — `/api/novel`

| Method   | Path                   | Auth   | Description                                                                                                                           |
| -------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                    | Public | List all novels. Optional params: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `to_reread`, `search_query`. |
| `GET`    | `/{entry_id}`          | Public | Get a single novel entry by UUID.                                                                                                     |
| `POST`   | `/`                    | Admin  | Create a novel entry. Auto-runs `execute_replace_single_novel` after creation. Body: `NovelCreate`.                                   |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a novel entry. Auto-runs `execute_replace_single_novel` after update. Body: `NovelUpdate`.                             |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                        |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (reading status to "Completed", volumes finished, serialization status).                                       |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a novel entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                                 |

**Response model:** `NovelResponse`

---

## Seasonal — `/api/seasonal`

| Method  | Path              | Auth   | Description                                                                                         |
| ------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `GET`   | `/current-season` | Public | Returns `{current_season}` from `system_configs`. Used by frontend to highlight the current season. |
| `GET`   | `/`               | Public | List all seasonal records, ordered by `seasonal` descending.                                        |
| `GET`   | `/{seasonal_id}`  | Public | Get a single seasonal record by its string key (e.g. `"WIN 2026"`).                                 |
| `PATCH` | `/{seasonal_id}`  | Admin  | Update `my_rating` for a seasonal record. Body: `SeasonalUpdate`.                                   |

**Response model:** `SeasonalResponse`

---

## Options — `/api/options`

| Method   | Path           | Auth   | Description                                                                |
| -------- | -------------- | ------ | -------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all system options across all categories.                             |
| `GET`    | `/{category}`  | Public | List options for a specific category (e.g. `"Studio"`, `"Genre Main"`).    |
| `POST`   | `/`            | Admin  | Add a new option. Body: `SystemOptionCreate` (`{category, option_value}`). |
| `PUT`    | `/{option_id}` | Admin  | Update an existing option by integer ID. Body: `SystemOptionCreate`.       |
| `DELETE` | `/{option_id}` | Admin  | Delete an option by integer ID. Logs to `deleted_record`.                  |

**Response model:** `SystemOptionResponse`

---

## Announcements — `/api/announcements`

Dashboard "Announcement & Notes" board. Each note is one `system_configs` row keyed
`announcement:<title>`, with the note body as `config_value` — no dedicated table.

| Method   | Path | Auth   | Description                                                                                     |
| -------- | ---- | ------ | ----------------------------------------------------------------------------------------------- |
| `GET`    | `/`  | Public | List all announcements in creation order (`system_configs.id`).                                 |
| `POST`   | `/`  | Admin  | Add a note. Body: `AnnouncementCreate` (`{title, body}`). 409 if the title exists.               |
| `PUT`    | `/`  | Admin  | Update / rename. Body: `AnnouncementUpdate` (`{original_title, title, body}`). 404 / 409.        |
| `DELETE` | `/`  | Admin  | Delete by `?title=` query param. 404 if missing.                                                 |

Titles travel in the body or query string, never the path — free-text titles may contain `/`.
Empty titles/bodies and titles over 120 chars are rejected with 400.

---

## Form Defaults — `/api/form-defaults`

Backs the admin **Form Defaults** page (`/defaults`). Per media type it stores the
initial value of each Add-form field and which fields auto-fill copies. Like
announcements, it reuses `system_configs` — one row per media type, keyed
`form_defaults:<media_type>`, with a JSON blob as `config_value`. No dedicated table.

`media_type` is one of the nine `MEDIA_CONFIG` slugs (`anime`, `anime-movie`, `movie`,
`tv-show`, `cartoon`, `manga`, `novel`, `franchise`, `series`); anything else is 400.

| Method   | Path            | Auth  | Description                                                                     |
| -------- | --------------- | ----- | ------------------------------------------------------------------------------- |
| `GET`    | `/`             | Admin | All configured types, keyed by media type. Unconfigured types are omitted.       |
| `GET`    | `/{media_type}` | Admin | One type. Unconfigured returns **200 with an empty payload**, never 404.         |
| `PUT`    | `/{media_type}` | Admin | Full-replacement upsert. Body: `FormDefaultsPayload`.                            |
| `DELETE` | `/{media_type}` | Admin | Reset to built-in values (deletes the row). Idempotent — missing row still 200.  |

**Response model:** `FormDefaultsResponse` (`FormDefaultsPayload` + `media_type`)

**Payload shape:**

```json
{
  "version": 1,
  "defaults": { "watching_status": "Plan to Watch", "ep_total": "12" },
  "autofill": ["anime_name_en", "franchise_id", "studio"]
}
```

- `defaults` is **sparse** — only fields the admin overrode. An absent key means "use the
  frontend's built-in factory value", which is what makes per-field revert a key deletion.
- `autofill` is **null-or-complete**. `null`/omitted → use the built-in field set; `[]`
  genuinely means "copy nothing". The two are not interchangeable.
- Values mirror **frontend form-state** types, not DB column types — numbers are stored as
  strings, checkboxes as booleans.

**Validation.** Shape and size only: value types limited to string/number/bool/null/string-list,
≤200 keys, keys matching `^[a-z0-9_]+$` and ≤64 chars, serialized JSON ≤32 KB. The router
deliberately does **not** mirror the ~280 form field names — that list lives in
`frontend/src/config/formFactories.js`, and duplicating it in Python would guarantee drift.
The frontend's `resolveDefaults()` drops stored keys it no longer recognizes on read.

Unlike announcements, reads are admin-only: there is no guest surface for form config.
A row whose JSON fails to parse is logged and treated as unconfigured, never a 500.

**Response model:** `AnnouncementResponse` (`{title, body}`)

---

## Data Control — `/api/data-control`

All endpoints in this router require admin authentication.

### Fill

| Method | Path                | Description                                                                  |
| ------ | ------------------- | ---------------------------------------------------------------------------- |
| `POST` | `/fill/anime`       | Fill missing metadata for all anime from Jikan. Streams SSE progress.        |
| `POST` | `/fill/anime-movie` | Fill missing metadata for all anime movies from Jikan. Streams SSE progress. |
| `POST` | `/fill/movie`       | Fill missing metadata for all movies from TMDB/OMDb. Streams SSE progress.   |
| `POST` | `/fill/tv-show`     | Fill missing metadata for all TV shows from TMDB/OMDb. Streams SSE progress. |
| `POST` | `/fill/cartoon`     | Fill missing metadata for all cartoons from TMDB/OMDb. Streams SSE progress. |
| `POST` | `/fill/manga`       | Fill missing metadata for all manga from Jikan. Streams SSE progress.        |
| `POST` | `/fill/novel`       | Fill missing metadata for all novels from Jikan. Streams SSE progress.       |
| `POST` | `/fill/all`         | Fill all + auto-backup on completion. Streams SSE progress.                  |

### Replace

| Method | Path                                    | Description                                                                          |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST` | `/replace/anime`                        | Replace (overwrite) metadata for all anime that have a MAL ID. Streams SSE progress. |
| `POST` | `/replace/anime/{anime_id}`             | Replace metadata for a single anime entry by UUID. Returns JSON.                     |
| `POST` | `/replace/anime-movie`                  | Replace metadata for all anime movies that have a MAL ID. Streams SSE progress.      |
| `POST` | `/replace/anime-movie/{anime_movie_id}` | Replace metadata for a single anime movie entry by UUID. Returns JSON.               |
| `POST` | `/replace/movie`                        | Replace metadata for all movies that have an IMDb ID. Streams SSE progress.          |
| `POST` | `/replace/movie/{movie_id}`             | Replace metadata for a single movie entry by UUID. Returns JSON.                     |
| `POST` | `/replace/tv-show`                      | Replace metadata for all TV shows that have an IMDb ID. Streams SSE progress.        |
| `POST` | `/replace/tv-show/{tv_show_id}`         | Replace metadata for a single TV show entry by UUID. Returns JSON.                   |
| `POST` | `/replace/cartoon`                      | Replace metadata for all cartoons that have an IMDb ID. Streams SSE progress.        |
| `POST` | `/replace/cartoon/{cartoon_id}`         | Replace metadata for a single cartoon entry by UUID. Returns JSON.                   |
| `POST` | `/replace/manga`                        | Replace metadata for all manga that have a MAL ID. Streams SSE progress.             |
| `POST` | `/replace/manga/{manga_id}`             | Replace metadata for a single manga entry by UUID. Returns JSON.                     |
| `POST` | `/replace/novel`                        | Replace metadata for all novels that have a MAL ID. Streams SSE progress.            |
| `POST` | `/replace/novel/{novel_id}`             | Replace metadata for a single novel entry by UUID. Returns JSON.                     |
| `POST` | `/replace/all`                          | Replace all + auto-backup on completion. Streams SSE progress.                       |

### Backup & Pull

| Method | Path               | Description                                                                                   |
| ------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `POST` | `/backup`          | Backup entire DB to Google Sheets. Synchronous, returns JSON.                                 |
| `POST` | `/pull`            | Pull all tabs from Google Sheets (System Options → Franchise → Series → Anime). Returns JSON. |
| `POST` | `/pull/manga`      | Pull Manga tab from Google Sheets. Returns JSON.                                              |
| `POST` | `/pull/novel`      | Pull Novel tab from Google Sheets. Returns JSON.                                              |
| `POST` | `/pull/cartoon`    | Pull Cartoon tab from Google Sheets. Returns JSON.                                            |
| `POST` | `/pull/{tab_name}` | Pull a single tab by name. Returns JSON.                                                      |

### Calculate

| Method   | Path                                 | Description                                                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `POST`   | `/calculate/all`                     | Run full Calculate All pipeline (post-processing, derive, sync, cover check). Returns JSON. |
| `GET`    | `/calculate/check-cover-image`       | Report on missing and orphaned cover images. Optional query param `entry_type`.             |
| `POST`   | `/calculate/set-cover-image-fields`  | Populate `cover_image_file` fields for entries whose file already exists in storage.        |
| `POST`   | `/calculate/download-missing-covers` | Re-download missing cover images. Body: `{system_ids?: string[]}`.                          |
| `DELETE` | `/calculate/delete-orphaned-covers`  | Delete orphaned cover image files from storage. Returns `{deleted_count}`.                  |
| `GET`    | `/check/duplicates`                  | Find and report all duplicate entries across all tables. Returns grouped clusters.          |
| `GET`    | `/check/remarks`                     | Check all comments and remark fields, acting as the Comments/Remarks Review Queue.          |

**SSE response format** (streaming endpoints): `text/event-stream` — each event is a JSON string with `{status, current_entry, processed, total}`.

---

## System — `/api/system`

All endpoints in this router require admin authentication.

### Configuration

| Method | Path                     | Description                                                                       |
| ------ | ------------------------ | --------------------------------------------------------------------------------- |
| `GET`  | `/config/current_season` | Get the current season setting from `system_configs`. Returns `{current_season}`. |
| `POST` | `/config/current_season` | Set the current season. Body: `{current_season: "YYYY SSS"}`.                     |

### Data Control Logs

| Method   | Path             | Description                                                                 |
| -------- | ---------------- | --------------------------------------------------------------------------- |
| `GET`    | `/logs`          | Get the 50 most recent `DataControlLog` entries.                            |
| `DELETE` | `/logs`          | Delete all log entries except the 10 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/logs/{log_id}` | Delete a single log entry by integer ID.                                    |

### Deleted Records

| Method   | Path                   | Description                                                                           |
| -------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/deleted`             | Get the 50 most recent `DeletedRecord` entries.                                       |
| `DELETE` | `/deleted`             | Delete all deleted record entries except the 5 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/deleted/{record_id}` | Delete a single deleted record entry by integer ID.                                   |

### Diagnostics

| Method | Path           | Description                                                                                          |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| `POST` | `/test-bucket` | Test GCS write permissions by uploading a diagnostic image. Returns `{status, message, public_url}`. |
