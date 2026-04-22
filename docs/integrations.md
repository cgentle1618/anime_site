# Integrations

---

## Jikan API (MyAnimeList Metadata)

**Service file:** `services/jikan.py`  
**Utils file:** `utils/jikan_utils.py`

Jikan v4 is a public REST API that mirrors MyAnimeList data. It is used to auto-populate anime metadata fields (Fill pipeline) and to refresh existing entries (Replace pipeline).

### HTTP Client

- Library: `requests` (synchronous)
- Timeout: 15 seconds per request
- User-Agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0` — required to avoid MAL-level 403 rejections

### Rate Limiter

Class: `JikanRateLimiter` — sliding window, **30 requests per 60-second window**.

`wait_if_needed()` is called before every request:
1. Remove timestamps older than 60 seconds from the queue.
2. If queue length ≥ 30, calculate `sleep_time = 60 − (now − oldest_timestamp)` and sleep.
3. Append current timestamp to queue and proceed.

### Retry Strategy

Library: `tenacity`

| Setting | Value |
|---|---|
| Max attempts | 5 |
| Backoff | Exponential: min 2s, max 10s, multiplier 1 |
| Retried on | `requests.exceptions.RequestException`, custom `RateLimitExceeded` (HTTP 429) |
| Not retried | HTTP 404 (logged, returns `None`), HTTP 5xx (logged, returns `None`) |

### Endpoint Called

Only one Jikan endpoint is used:

```
GET /v4/anime/{mal_id}/full
```

Returns full anime metadata including images, external links, and episode count.

### MAL ID Resolution

1. Extract MAL ID from the `mal_link` field via regex: `/anime/(\d+)/`
2. Call `fetch_jikan_anime_data(mal_id)`.
3. Map response through `map_jikan_to_anime_data()`.

### Field Mappings (Jikan → Database)

| Jikan field | DB field | Transformation |
|---|---|---|
| `type` | `airing_type` | TV/Movie/ONA/OVA/Special kept as-is; anything else → "Other" |
| `status` | `airing_status` | "currently airing"→Airing, "finished airing"→Finished Airing, "not yet aired"→Not Yet Aired |
| `season` | `release_season` | Lowercase → 3-letter code: winter→WIN, spring→SPR, summer→SUM, fall→FAL |
| `aired.from` | `release_year`, `release_month`, `release_date` | ISO 8601 parsed; month mapped to JAN–DEC abbreviations |
| `rank` | `mal_rank` | Stringified integer |
| `score` | `mal_rating` | Float |
| `episodes` | `ep_total` | Integer |
| `external[*].url` | `official_link`, `twitter_link` | First Twitter/X URL → `twitter_link`; first non-Twitter URL → `official_link` |
| `images.webp.large_image_url` | `cover_image_url` | Falls back to `images.jpg.large_image_url` |

**Fill vs. Replace:** Fill only writes to `None` fields. Replace (`force_replace_ratings=True`) overwrites ratings fields even if already set.

---

## Google Sheets (Backup / Pull)

**Service file:** `services/sheets.py`  
**Utils:** `utils/formatter.py`

Google Sheets is used as a human-readable backup and as a restore source. Data flows in both directions: DB → Sheets (Backup) and Sheets → DB (Pull).

### Library & Authentication

- Library: `gspread` 5.12.0 + `google-auth` 2.23.3
- OAuth scope: `spreadsheets` + `drive`
- Credentials resolution (in order):
  1. `GOOGLE_CREDENTIALS_JSON` env var — JSON-encoded service account key string
  2. Fallback: local `credentials.json` file in project root

### Sheet Structure

Spreadsheet is identified by `GOOGLE_SHEET_ID` env var. One tab per model:

| Tab Name | Model |
|---|---|
| `System Options` | `SystemOption` |
| `Franchise` | `Franchise` |
| `Series` | `Series` |
| `Anime` | `Anime` |

Tabs are auto-created (1000 rows × 50 columns) if missing on first access.

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

**Service file:** `services/image_manager.py`  
**Utils:** `utils/gcp_utils.py`

GCS stores anime cover images. Locally, images are saved to `static/covers/` instead.

### Library

`google-cloud-storage` 2.14.0 — `from google.cloud import storage`

### Authentication Routing

| Environment | Auth method |
|---|---|
| Cloud Run (`K_SERVICE` env var present) | `storage.Client()` — IAM identity auto-discovered from Compute Engine service account |
| Local (`GOOGLE_CREDENTIALS_JSON` set) | `Credentials.from_service_account_info(json.loads(env_var))` |
| Local (fallback) | GCP Application Default Credentials chain |

### Image Upload Flow

1. Check if image already exists in GCS (production) or `static/covers/` (local).
2. If missing: download from source URL via `requests.get()` (15s timeout, same User-Agent as Jikan client).
3. Production: upload bytes to GCS with `Content-Type: image/jpeg`.
4. Local: write bytes to `static/covers/{system_id}.jpg`.
5. No resizing or format conversion — images are stored as downloaded (Jikan provides WebP preferred, JPEG fallback).

### Storage Format

- Bucket name: `GCP_BUCKET_NAME` env var (production). Defaults to `cg1618-anime-covers` when running on Cloud Run.
- Object key: `{system_id}.jpg` — flat structure, no subdirectories.
- Database field: `cover_image_file` stores the filename string `"{system_id}.jpg"`. Full URL is constructed at read time via `getCoverUrl()` in the frontend utils.
- `cover_image_exists(system_id)` checks GCS or local filesystem before downloading to avoid redundant fetches.
