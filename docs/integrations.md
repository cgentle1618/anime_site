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

Class: `TenraiRateLimiter` — sliding window, **30 requests per 60-second window**.

`wait_if_needed()` is called before every request:

1. Remove timestamps older than 60 seconds from the queue.
2. If queue length ≥ 30, calculate `sleep_time = 60 − (now − oldest_timestamp)` and sleep.
3. Append current timestamp to queue and proceed.

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
| `aired.from`                  | `release_year`, `release_month`, `release_date` | ISO 8601 parsed; month mapped to JAN–DEC abbreviations                                      |
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

- Quota errors (HTTP 429): exponential backoff, wait `60 × (attempt + 1)` seconds, max 3 retries.
- Other errors: raised immediately.

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
