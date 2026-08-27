# Integrations

---

## Tenrai API (MyAnimeList Metadata)

**Service file:** `app/services/integrations/tenrai.py`  
**Utils file:** `app/utils/tenrai_utils.py`

Tenrai v1 is a public REST API that mirrors MyAnimeList data. It is used to auto-populate anime metadata fields (Fill pipeline) and to refresh existing entries (Replace pipeline).

### HTTP Client

- Base URL: `https://api.tenrai.org/v1` (`TENRAI_BASE_URL`)
- Library: `requests` (synchronous)
- Timeout: 15 seconds per request
- User-Agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0` — required to avoid MAL-level 403 rejections

### Rate Limiter

Class: `TenraiRateLimiter` — sliding windows, **4 requests per 1-second window** and **120 requests per 60-second window** (Tenrai enforces both at once). Windows live in `TenraiRateLimiter.DEFAULT_LIMITS` as `(max_requests, time_window_seconds)` pairs and can be overridden via the `limits` constructor argument.

`wait_if_needed()` is called before every request:

1. Remove timestamps older than the widest window (60 seconds) from the queue.
2. For each window, if it already holds its maximum, compute how long until its oldest blocking request expires; sleep for the longest such wait.
3. Re-check every window after sleeping (a short sleep can leave a wider window still full), repeating until all windows have room.
4. Append current timestamp to queue and proceed.

### Retry Strategy

Library: `tenacity`

| Setting      | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Max attempts | 5                                                                             |
| Backoff      | Exponential: min 2s, max 10s, multiplier 1                                    |
| Retried on   | `requests.exceptions.RequestException`, custom `RateLimitExceeded` (HTTP 429) |
| Not retried  | HTTP 404 (logged, returns `None`), HTTP 5xx (logged, returns `None`)          |

### Endpoint Called

Only one Tenrai endpoint is used:

```
GET /v1/anime/{mal_id}/full
```

Returns full anime metadata including images, external links, and episode count.

### MAL ID Resolution

1. Extract MAL ID from the `mal_link` field via regex: `/anime/(\d+)/`
2. Call `fetch_tenrai_anime_data(mal_id)`.
3. Map response through `map_tenrai_to_anime_data()`.

### Field Mappings (Tenrai → Database)

| Tenrai field                   | DB field                                        | Transformation                                                                              |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `type`                        | `airing_type`                                   | TV/Movie/ONA/OVA/Special kept as-is; anything else → "Other"                                |
| `status`                      | `airing_status`                                 | "currently airing"→Airing, "finished airing"→Finished Airing, "not yet aired"→Not Yet Aired |
| `season`                      | `release_season`                                | Lowercase → 3-letter code: winter→WIN, spring→SPR, summer→SUM, fall→FAL                     |
| `aired.prop.from.year`        | `release_year`                                  | Stringified integer                                                                         |
| `aired.prop.from.month` + `aired.string` | `release_month`                      | Mapped to JAN–DEC, but **only when `aired.string` names a month**. Tenrai fills `prop.from.month` with 1 when MAL knows just the year, so a leading `"2026 to ?"` suppresses it rather than recording a false January |
| `aired.from`                  | `release_date`                                  | ISO 8601 parsed to `YYYY-MM-DD`                                                             |
| `rank`                        | `mal_rank`                                      | Stringified integer                                                                         |
| `score`                       | `mal_rating`                                    | Float                                                                                       |
| `episodes`                    | `ep_total`                                      | Integer                                                                                     |
| `external[*].url`             | `official_link`, `twitter_link`                 | First Twitter/X URL → `twitter_link`; first non-Twitter URL → `official_link`               |
| `images.webp.large_image_url` | `cover_image_url`                               | Falls back to `images.jpg.large_image_url`                                                  |

**Fill vs. Replace:** Fill only writes to `None` fields. Replace (`force_replace_ratings=True`) overwrites ratings fields even if already set.

---

## TMDB API (IMDb Metadata via The Movie Database)

**Service file:** `app/services/integrations/tmdb.py`  
**Utils file:** `app/utils/tmdb_utils.py`

TMDB (The Movie Database) is a free community-built movie/TV database with a generous REST API. It is used to auto-populate metadata for movies, TV shows, and cartoons that have an `imdb_id`, using IMDb ID as the lookup key via TMDB's Find endpoint.

### HTTP Client

- Library: `requests` (synchronous)
- Timeout: 15 seconds per request
- Authentication: `TMDB_API_KEY` env var — passed as `api_key` query parameter

### Rate Limiter

Class: `TMDbRateLimiter` — sliding window, **40 requests per 10-second window**.

`wait_if_needed()` is called before every individual HTTP request (both Find and Details calls):

1. Remove timestamps older than 10 seconds from the queue.
2. If queue length ≥ 40, calculate `sleep_time = 10 − (now − oldest_timestamp)` and sleep.
3. Append current timestamp to queue and proceed.

### Retry Strategy

Library: `tenacity`, applied to the top-level `fetch_tmdb_data()` only.

| Setting      | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Max attempts | 5                                                                             |
| Backoff      | Exponential: min 2s, max 10s, multiplier 1                                    |
| Retried on   | `requests.exceptions.RequestException`, custom `RateLimitExceeded` (HTTP 429) |
| Not retried  | HTTP 404 (logged, returns `None`), HTTP 5xx (logged, returns `None`)          |

### Endpoints Called

Two calls are made per `fetch_tmdb_data()` invocation:

```
GET /3/find/{imdb_tt_id}?external_source=imdb_id    → resolves IMDb ID to TMDB ID + type
GET /3/movie/{tmdb_id}?append_to_response=credits   → movie details + crew (for director)
GET /3/tv/{tmdb_id}                                 → TV/cartoon details
```

### IMDb ID Resolution

The `imdb_id` column stores the numeric portion of the IMDb title ID as an integer. It is formatted as the `tt`-prefixed string required by TMDB's Find endpoint:

```python
imdb_tt_id = f"tt{imdb_id:07d}"  # e.g. 468569 -> "tt0468569"
```

The Find response includes `movie_results` and `tv_results` arrays. The first match determines the TMDB ID and media type (`"movie"` or `"tv"`). The resolved `_media_type` key is injected into the returned dict for the utils layer to route correctly.

### Field Mappings (TMDB → Database)

| TMDB field                        | DB field          | Model(s)                   | Transformation                             |
| --------------------------------- | ----------------- | -------------------------- | ------------------------------------------ |
| `poster_path`                     | `cover_image_url` | movies, tv_shows, cartoons | Prepend `https://image.tmdb.org/t/p/w500`  |
| `release_date`                    | `release_date_us` | movies                     | `"2008-07-18"` → `"JUL 2008"`              |
| `first_air_date`                  | `release_date`    | tv_shows, cartoons         | `"2011-04-17"` → `"APR 2011"`              |
| `runtime`                         | `length_min`      | movies                     | Integer (already in minutes)               |
| `credits.crew[job=Director].name` | `director`        | movies                     | First crew member with `job == "Director"` |

---

## OMDb API (IMDb Rating)

**Service file:** `app/services/integrations/omdb.py`  
**Utils file:** `app/utils/omdb_utils.py`

OMDb (Open Movie Database) is used solely to fetch `imdb_rating` for movies and TV shows, since TMDB does not expose IMDb ratings. It is always called alongside a TMDB fetch — 3 API calls total per entry.

### HTTP Client

- Library: `requests` (synchronous)
- Timeout: 15 seconds per request
- Authentication: `OMDB_API_KEY` env var — passed as `apikey` query parameter

### Rate Limiter

Class: `OMDbRateLimiter` — sliding window, **1000 requests per 24-hour window** (free tier daily limit).

### Retry Strategy

Library: `tenacity`

| Setting      | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Max attempts | 5                                                                             |
| Backoff      | Exponential: min 2s, max 10s, multiplier 1                                    |
| Retried on   | `requests.exceptions.RequestException`, custom `RateLimitExceeded` (HTTP 429) |
| Not retried  | HTTP 401 (bad key, returns `None`), HTTP 5xx (logged, returns `None`)         |

### Endpoint Called

```
GET http://www.omdbapi.com/?i={imdb_tt_id}&apikey={api_key}
```

When `Response` is `"False"`, the function logs a warning and returns `None`.

### IMDb ID Resolution

Same as TMDB: `imdb_tt_id = f"tt{imdb_id:07d}"`

### Field Mappings (OMDb → Database)

| OMDb field   | DB field      | Model(s)                   | Transformation                 |
| ------------ | ------------- | -------------------------- | ------------------------------ |
| `imdbRating` | `imdb_rating` | movies, tv_shows, cartoons | String as-is; `"N/A"` → `None` |

---

## Comic Vine API (Comic Runs + Covers)

**Service file:** `app/services/integrations/comicvine.py`
**Utils file:** `app/utils/comicvine_utils.py`

Comic Vine is the only external source for the `comic` table. A Comic Vine
"volume" is one numbered run, which is exactly what one comic row represents,
and it carries the cover on the same object as the run metadata — so one request
fills the row and the image together.

Chosen over the Marvel Comics API, which Marvel shut down around November 2025,
and over Metron, whose `series` resource has no image field (covers live on
issues, costing a second request per cover).

### HTTP Client

- Library: `requests` (synchronous)
- Timeout: 15 seconds per request
- Authentication: `COMICVINE_API_KEY` env var — passed as the `api_key` query parameter
- `User-Agent` is mandatory: Comic Vine rejects default client agents outright.
  Sent as `CG1618-Media-Tracker/1.0`.
- `field_list` is always sent so responses stay small

### Rate Limiter

Class: `ComicVineRateLimiter` — sliding window, **200 requests per hour**. Far
tighter than TMDB's 40/10s, so it also exposes `has_capacity()`: `execute_fill_comic`
checks it before each entry and stops the run when the budget is exhausted rather
than blocking for the remainder of the hour. The SSE success message reports how
many entries were left for the next run.

### Retry Strategy

Library: `tenacity`

| Setting      | Value                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| Max attempts | 5                                                                                  |
| Backoff      | Exponential: min 2s, max 10s, multiplier 1                                         |
| Retried on   | `requests.exceptions.RequestException`, `RateLimitExceeded` (HTTP 420 and 429)     |
| Not retried  | HTTP 401 (bad key), HTTP 5xx, body `status_code != 1` — all logged, return `None`  |

HTTP 420 is Comic Vine's non-standard rate-limit code. Application errors are
reported in the body with HTTP 200, so `status_code` is checked on every response.

### Endpoints Called

```
GET https://comicvine.gamespot.com/api/volume/4050-{volume_id}/   # fetch_comicvine_volume
GET https://comicvine.gamespot.com/api/search/?resources=volume   # search_comicvine_volumes
```

`4050` is Comic Vine's volume resource prefix. `extract_comicvine_id` matches it
literally when parsing a pasted URL, so an issue URL (`4000-…`) is rejected rather
than silently stored as a volume.

### Field Mappings (Comic Vine → Database)

| Comic Vine field                     | DB field           | Transformation                              |
| ------------------------------------ | ------------------ | ------------------------------------------- |
| `name`                               | `comic_name_en`    | Mapped, but never written — see below       |
| `start_year`                         | `release_year`     | String → Integer                            |
| `start_year`                         | `volume_label`     | `2018` → `"(2018)"`                         |
| `publisher.name`                     | `publisher`        | As-is                                       |
| `count_of_issues`                    | `issue_total`      | As-is                                       |
| `person_credits` role `writer`       | `writer`           | Comma-joined names, deduplicated            |
| `person_credits` role penciler/artist| `artist`           | Comma-joined names, deduplicated            |
| `image.original_url`                 | `cover_image_file` | Downloaded via `download_cover_image()`     |

Roles match on whole comma-separated tokens, so `inker` never satisfies a search
for a penciler.

`end_year` is deliberately unmapped: the volume's `last_issue` carries no cover
date, so deriving it would cost a second request per entry. `imprint`,
`continuity`, `era`, `events`, `comic_type` and `publisher_tw` are collection-specific
classifications Comic Vine does not model. All stay manual, and none appear in
`COMIC_FIELDS_TO_FILL` — listing them would leave every entry permanently "needs
filling".

### Fill Semantics

`autofill_comic_from_comicvine` is fill-only: it never replaces a value the admin
has already set. `comic_name_en` is never written at all — it is the entry's
identity and often a deliberate shorthand.

Comic Vine serves a stock placeholder image rather than omitting `image`, so
`_pick_cover_url` rejects URLs containing `blank.png` or `image_not_available` —
otherwise every unmatched entry would share the same grey square.

---

## Google Sheets (Backup / Pull)

**Service file:** `app/services/integrations/sheets.py`  
**Utils:** `app/utils/formatter.py`

Google Sheets is used as a human-readable backup and as a restore source. Data flows in both directions: DB → Sheets (Backup) and Sheets → DB (Pull).

### Library & Authentication

- Library: `gspread` 5.12.0 + `google-auth` 2.23.3
- OAuth scope: `spreadsheets` + `drive`
- Credentials resolution (in order):
  1. `GOOGLE_CREDENTIALS_JSON` env var — JSON-encoded service account key string
  2. Fallback: local `credentials.json` file in project root

### Sheet Structure

Spreadsheet is identified by `GOOGLE_SHEET_ID` env var. One tab per model:

| Tab Name         | Model          |
| ---------------- | -------------- |
| `System Options` | `SystemOption` |
| `Franchise`      | `Franchise`    |
| `Series`         | `Series`       |
| `Anime`          | `Anime`        |
| `Anime Movies`   | `Anime Movie`  |
| `Movies`         | `Movies`       |
| `TV Shows`       | `TVShows`      |
| `Cartoons`       | `Cartoons`     |
| `Manga`          | `Manga`        |
| `Novel`          | `Novel`        |
| `Seasonal`       | `Seasonal`     |
| `Media Relation` | `MediaRelation` |

Tabs are auto-created (1000 rows × 50 columns) if missing on first Backup or Pull operation.

`Media Relation` is written after every media tab, for the same reason `Quote`
and the watch-order tabs are: both of its endpoints are FK-less
`(media_type, entry_id)` pairs, so on restore the rows they point at must
already exist.

### Backup Flow (DB → Sheets)

1. Query all records for each model from PostgreSQL.
2. For each model, serialize rows via `format_model_for_sheet()` in column-declaration order.
3. Call `bulk_overwrite_sheet(tab_name, matrix)` — completely replaces the tab with `[headers] + [rows]`.
4. Value conversions: `UUID → str`, `bool → "TRUE"/"FALSE"`, `datetime → ISO 8601 + "Z"`, `None → ""`, `dict/list → json.dumps(ensure_ascii=False)`.

### Pull Flow (Sheets → DB)

`execute_pull_specific(db, tab_name)`:

1. Read all rows via `get_all_raw_rows(tab_name)`.
2. Parse header row → extract data rows.
3. Each row: `parse_row_to_dict()` → model-specific parser (`parse_anime_from_sheet()`, etc.).
4. Resolve string foreign keys (franchise name string → UUID via name-lookup or auto-create).
5. Upsert logic: if PK present, match by UUID; if missing, search by name; insert if not found.
6. Data sanitization: ensure required fields (`watching_status`, `airing_status`) have valid defaults.

### Error Handling

`_execute_with_retry()` classifies by HTTP status (`_status_code()` reads gspread's
`APIError.code`, falling back to the `[503]`-style code in the rendered message when
a proxy-level error body was not JSON):

- Quota errors (HTTP 429): backoff, wait `60 × (attempt + 1)` seconds, max 3 attempts.
- Transient errors (HTTP 500 / 502 / 503 / 504): exponential backoff, wait `2 ^ (attempt + 1)`
  seconds, max 3 attempts. No sleep after the final attempt.
- Other errors: raised immediately.
- Retries exhausted: raises `SheetsUnavailableError`.

`get_all_raw_rows()` raises `SheetsUnavailableError` for a tab it could not read, and
returns `[]` only for a tab that is genuinely empty. Pull relies on that distinction:

- `execute_pull_specific()` returns `{"status": "error", "reason": "sheet_unavailable"}`
  and logs the tab as **Failed**, instead of logging "no data found" as a Success.
- `execute_pull_all()` skips an unreadable tab, finishes the remaining tabs, then logs
  Pull All as **Failed** naming the tabs that were not pulled and raises
  `SheetsUnavailableError`. Any other per-tab error still stops the run where it stands,
  since it points at the data or the DB rather than at Google.

---

## Google Cloud Storage (Cover Images)

**Service file:** `app/services/integrations/image_manager.py`  
**Utils:** `app/utils/gcp_utils.py`

GCS stores media entry cover images. Locally, images are saved to `static/covers/` instead.

### Library

`google-cloud-storage` 2.14.0 — `from google.cloud import storage`

### Authentication Routing

| Environment                             | Auth method                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Cloud Run (`K_SERVICE` env var present) | `storage.Client()` — IAM identity auto-discovered from Compute Engine service account |
| Local (`GOOGLE_CREDENTIALS_JSON` set)   | `Credentials.from_service_account_info(json.loads(env_var))`                          |
| Local (fallback)                        | GCP Application Default Credentials chain                                             |

### Image Upload Flow

1. Check if image already exists in GCS (production) or `static/covers/` (local).
2. If missing: download from source URL via `requests.get()` (15s timeout, same User-Agent as Tenrai client).
3. Production: upload bytes to GCS with `Content-Type: image/jpeg`.
4. Local: write bytes to `static/covers/{system_id}.jpg`.
5. No resizing or format conversion — images are stored as downloaded (Tenrai provides WebP preferred, JPEG fallback).

### Storage Format

- Bucket name: `GCP_BUCKET_NAME` env var (production). Defaults to `cg1618-anime-covers` when running on Cloud Run.
- Object key: `{system_id}.jpg` — flat structure, no subdirectories.
- Database field: `cover_image_file` stores the filename string `"{system_id}.jpg"`. Full URL is constructed at read time via `getCoverUrl()` in the frontend utils.
- `cover_image_exists(system_id)` checks GCS or local filesystem before downloading to avoid redundant fetches.
