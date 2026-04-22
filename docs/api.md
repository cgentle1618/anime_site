# API Reference

All endpoints are prefixed under `/api/`. The app is a SPA — all non-API routes are caught by a FastAPI catch-all that serves `index.html`.

## Authentication

- **Public endpoints** — accessible by any visitor (guest or admin).
- **Admin-only endpoints** — require a valid JWT in the `access_token` HTTP-Only cookie, enforced via `Depends(get_current_admin)` in `dependencies.py`.
- Login flow: `POST /api/auth/login` → sets cookie → all subsequent admin requests carry it automatically.

---

## Table of Contents

- [Auth — `/api/auth`](#auth--apiauth)
- [Franchise — `/api/franchise`](#franchise--apifranchise)
- [Series — `/api/series`](#series--apiseries)
- [Anime — `/api/anime`](#anime--apianime)
- [Seasonal — `/api/seasonal`](#seasonal--apiseasonal)
- [Options — `/api/options`](#options--apioptions)
- [Data Control — `/api/data-control`](#data-control--apidata-control)
- [System — `/api/system`](#system--apisystem)

---

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | Public | Authenticate with username + password (form data). Sets HTTP-Only JWT cookie. Returns `{message, role}`. |
| `GET` | `/me` | Public | Returns `{is_admin: bool, username}` from the current cookie. Used by `AuthContext` on app boot. |
| `POST` | `/logout` | Public | Clears the `access_token` cookie. |

**Login request:** `OAuth2PasswordRequestForm` — `username` and `password` fields.

---

## Franchise — `/api/franchise`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | List all franchises. Optional query param `search_query` searches across all name fields. |
| `GET` | `/{system_id}` | Public | Get a single franchise by UUID. |
| `POST` | `/` | Admin | Create a franchise. Body: `FranchiseCreate`. |
| `PUT` | `/{system_id}` | Admin | Full update of a franchise. Body: `FranchiseUpdate`. |
| `PATCH` | `/{system_id}` | Admin | Partial update (e.g. inline rating edit). Body: raw JSON dict. |
| `DELETE` | `/{system_id}` | Admin | Delete a franchise. Linked `series.franchise_id` and `anime.franchise_id` are set to `NULL`. Logs to `deleted_record`. |

**Response model:** `FranchiseResponse`

---

## Series — `/api/series`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | List all series. Optional params: `franchise_id` (UUID), `search_query`. |
| `GET` | `/{system_id}` | Public | Get a single series by UUID. |
| `POST` | `/` | Admin | Create a series. Resolves or auto-creates parent franchise. Body: `SeriesCreate`. |
| `PUT` | `/{system_id}` | Admin | Full update. Resolves hierarchy changes. Body: `SeriesUpdate`. |
| `PATCH` | `/{system_id}` | Admin | Partial update. Body: raw JSON dict. |
| `DELETE` | `/{system_id}` | Admin | Delete a series. Linked `anime.series_id` set to `NULL`. Logs to `deleted_record`. |

**Response model:** `SeriesResponse`

---

## Anime — `/api/anime`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | List anime. Optional params: `franchise_id`, `series_id`, `search_query`, `airing_season` (e.g. `"WIN 2026"`). |
| `GET` | `/{system_id}` | Public | Get a single anime entry by UUID. |
| `POST` | `/` | Admin | Create an anime entry. Runs episode math and domain rules. Body: `AnimeCreate`. |
| `PUT` | `/{system_id}` | Admin | Full update. Runs episode math and domain rules. Body: `AnimeUpdate`. |
| `PATCH` | `/{system_id}` | Admin | Partial update (e.g. +1 episode). Auto-marks completed if `ep_fin` reaches `ep_total`. Body: raw JSON dict. |
| `DELETE` | `/{system_id}` | Admin | Delete an anime entry. Cleans up local cover image. Logs to `deleted_record`. |

**Response model:** `AnimeResponse` (includes computed fields `cum_ep_fin`, `cum_ep_total`)

---

## Seasonal — `/api/seasonal`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/current-season` | Public | Returns `{current_season}` from `system_configs`. Used by frontend to highlight the current season. |
| `GET` | `/` | Public | List all seasonal records, ordered by `seasonal` descending. |
| `GET` | `/{seasonal_id}` | Public | Get a single seasonal record by its string key (e.g. `"WIN 2026"`). |
| `PATCH` | `/{seasonal_id}` | Admin | Update `my_rating` for a seasonal record. Body: `SeasonalUpdate`. |

**Response model:** `SeasonalResponse`

---

## Options — `/api/options`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | List all system options across all categories. |
| `GET` | `/{category}` | Public | List options for a specific category (e.g. `"Studio"`, `"Genre Main"`). |
| `POST` | `/` | Admin | Add a new option. Body: `SystemOptionCreate` (`{category, option_value}`). |
| `PUT` | `/{option_id}` | Admin | Update an existing option by integer ID. Body: `SystemOptionCreate`. |
| `DELETE` | `/{option_id}` | Admin | Delete an option by integer ID. Logs to `deleted_record`. |

**Response model:** `SystemOptionResponse`

---

## Data Control — `/api/data-control`

All endpoints in this router require admin authentication.

### Fill

| Method | Path | Description |
|---|---|---|
| `POST` | `/fill/anime` | Fill missing metadata for all anime from Jikan. Streams SSE progress. |
| `POST` | `/fill/all` | Fill all + auto-backup on completion. Streams SSE progress. |

### Replace

| Method | Path | Description |
|---|---|---|
| `POST` | `/replace/anime` | Replace (overwrite) metadata for all anime that have a MAL ID. Streams SSE progress. |
| `POST` | `/replace/anime/{anime_id}` | Replace metadata for a single anime entry by UUID. Returns JSON. |
| `POST` | `/replace/all` | Replace all + auto-backup on completion. Streams SSE progress. |

### Backup & Pull

| Method | Path | Description |
|---|---|---|
| `POST` | `/backup` | Backup entire DB to Google Sheets. Synchronous, returns JSON. |
| `POST` | `/pull` | Pull all tabs from Google Sheets (System Options → Franchise → Series → Anime). Returns JSON. |
| `POST` | `/pull/{tab_name}` | Pull a single tab by name. Returns JSON. |

### Calculate

| Method | Path | Description |
|---|---|---|
| `POST` | `/calculate/all` | Run full Calculate All pipeline (post-processing, derive, sync, cover check). Returns JSON. |
| `GET` | `/calculate/check-cover-image` | Report on missing and orphaned cover images. Optional query param `entry_type`. |
| `POST` | `/calculate/set-cover-image-fields` | Populate `cover_image_file` fields for entries whose file already exists in storage. |
| `POST` | `/calculate/download-missing-covers` | Re-download missing cover images via Jikan. Body: `{system_ids?: string[]}`. |
| `DELETE` | `/calculate/delete-orphaned-covers` | Delete orphaned cover image files from storage. Returns `{deleted_count}`. |
| `GET` | `/check/duplicates` | Find and report all duplicate entries across all tables. Returns grouped clusters. |

**SSE response format** (streaming endpoints): `text/event-stream` — each event is a JSON string with `{status, current_entry, processed, total}`.

---

## System — `/api/system`

All endpoints in this router require admin authentication.

### Configuration

| Method | Path | Description |
|---|---|---|
| `GET` | `/config/current_season` | Get the current season setting from `system_configs`. Returns `{current_season}`. |
| `POST` | `/config/current_season` | Set the current season. Body: `{current_season: "YYYY SSS"}`. |

### Data Control Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/logs` | Get the 50 most recent `DataControlLog` entries. |
| `DELETE` | `/logs` | Delete all log entries except the 10 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/logs/{log_id}` | Delete a single log entry by integer ID. |

### Deleted Records

| Method | Path | Description |
|---|---|---|
| `GET` | `/deleted` | Get the 50 most recent `DeletedRecord` entries. |
| `DELETE` | `/deleted` | Delete all deleted record entries except the 5 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/deleted/{record_id}` | Delete a single deleted record entry by integer ID. |

### Diagnostics

| Method | Path | Description |
|---|---|---|
| `POST` | `/test-bucket` | Test GCS write permissions by uploading a diagnostic image. Returns `{status, message, public_url}`. |
