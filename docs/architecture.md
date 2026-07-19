# Architecture

---

## Request Flow

```
Initial Page Load:
  Browser → FastAPI catch-all (/{full_path:path}) → frontend_dist/index.html → React app boot

Data & Interaction:
  User Action → React Component → fetch() in useEffect → FastAPI API Router
                                                              ↓
                                                       Service Layer
                                                              ↓
                                                        SQLAlchemy ORM
                                                              ↓
                                                         PostgreSQL
                                                              ↓
                                                       JSON Response
                                                              ↓
                                                    React state update → re-render
```

API responses are plain JSON. TanStack Query is wired up (`staleTime: 30s`, `retry: 1`) but not actively used for queries — all data fetching uses native `fetch()` in `useEffect` hooks.

Long-running pipelines (Fill, Replace) stream progress back as **Server-Sent Events (SSE)** — the router returns a `StreamingResponse` and the frontend reads it via the `EventSource` API.

---

## Application Entry Point (`app/main.py`)

```
FastAPI app created with:
  - title, version metadata
  - lifespan event manager (startup seeding)

On startup (lifespan):
  1. models.Base.metadata.create_all(bind=engine)  — create tables if not exist
  2. Query for "admin" user
  3. If missing: hash ADMIN_PASSWORD, insert User record

Static file mounts:
  - /static/covers  →  static/covers/  (local cover images)
  - /assets         →  frontend_dist/assets/  (Vite build output)

Router registration order:
  auth → options → franchise → series → anime → anime_movie → cartoon → movie → tv_show → manga → novel → seasonal → data_control → system

Catch-all route (must be last):
  GET /{full_path:path} → serves frontend_dist/index.html
```

No CORS middleware is configured — the Vite dev server proxy handles cross-origin requests during development; in production, the SPA and API share the same origin.

---

## Database Layer (`app/database.py`)

### Connection Routing

The database URL is selected at startup based on environment variables:

```
1. INSTANCE_CONNECTION_NAME set?
   → postgresql+psycopg2://{USER}:{PASSWORD}@/{DB}?host=/cloudsql/{INSTANCE_CONNECTION_NAME}
   (Cloud SQL Unix socket for Cloud Run)

2. DATABASE_URL set AND does not contain "localhost"?
   → Use DATABASE_URL as-is
   (External cloud database via TCP)

3. Otherwise:
   → postgresql://{USER}:{PASSWORD}@localhost:5432/{DB}
   (Local development)
```

### SQLAlchemy Engine Config

| Setting         | Value | Purpose                                                      |
| --------------- | ----- | ------------------------------------------------------------ |
| `pool_size`     | 10    | Connections kept alive in the pool                           |
| `max_overflow`  | 20    | Additional connections allowed above pool_size               |
| `pool_pre_ping` | True  | Test connection before use (detects dropped connections)     |
| `pool_recycle`  | 1800  | Recycle connections after 30 minutes (prevents idle timeout) |
| `autocommit`    | False | Manual commit required                                       |
| `autoflush`     | False | Manual flush required                                        |

### Timezone Utility

`get_taipei_now()` — returns a naive `datetime` in Asia/Taipei timezone. Used as the default for all `created_at` / `updated_at` / `deleted_at` timestamps.

---

## Dependency Injection (`app/dependencies.py`)

Two shared FastAPI dependencies injected via `Depends()`:

**`get_db()`** — yields a `SessionLocal` for the lifetime of one request, then closes it.

**`get_current_admin(request)`** — RBAC guard for admin-only endpoints:

1. Read `access_token` cookie from the request.
2. Strip `"Bearer "` prefix if present.
3. Decode JWT with `JWT_SECRET_KEY` + `HS256`.
4. Verify `role == "admin"` claim.
5. Return payload dict, or raise `HTTP 401`.

### JWT Configuration

| Setting     | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Algorithm   | HS256                                                                  |
| Expiry      | 1440 minutes (24 hours), set via `ACCESS_TOKEN_EXPIRE_MINUTES` env var |
| Secret      | `JWT_SECRET_KEY` env var                                               |
| Cookie name | `access_token` (HTTP-Only, `Secure=True` only on Cloud Run)            |

---

## Services Layer (`services/`)

### `data_control.py` — Data Pipeline Orchestrator

Entry points for the five admin-triggered pipelines, supporting all media types (Anime, Anime Movie, Movie, TV Show, Cartoon, Manga, Novel):

| Function Prefix / Name                        | Pipeline             | Target Type(s)                                            | Returns          |
| --------------------------------------------- | -------------------- | --------------------------------------------------------- | ---------------- |
| `execute_backup(db)`                          | Backup (DB → Sheets) | System Options, Franchise, Series, Anime                  | dict with counts |
| `execute_fill_{type}(db, request)`            | Fill missing data    | anime, anime_movie, movie, tv_show, cartoon, manga, novel | SSE generator    |
| `execute_fill_all(db, request)`               | Fill → Backup        | All media types                                           | SSE generator    |
| `execute_replace_single_{type}(db, entry_id)` | Replace one entry    | anime, anime_movie, movie, tv_show, cartoon, manga, novel | dict             |
| `execute_replace_{type}(db, request)`         | Replace metadata     | anime, anime_movie, movie, tv_show, cartoon, manga, novel | SSE generator    |
| `execute_replace_all(db, request)`            | Replace → Backup     | All media types                                           | SSE generator    |
| `execute_pull_specific(db, tab_name)`         | Pull one Sheets tab  | System Options, Franchise, Series, Anime                  | dict with counts |
| `execute_pull_all(db)`                        | Pull all Sheets tabs | System Options, Franchise, Series, Anime                  | dict with counts |

SSE generators yield `data: {json}\n\n` messages and check `request.is_disconnected()` for graceful client abort. All pipelines log to `DataControlLog` via `log_data_control()`.

### `domain/` — Domain Business Logic

Split by concern into `app/services/domain/`: `hierarchy.py`, `checking.py`,
`completion.py`, `derivation.py`, `autofill.py`, `duplicates.py`, `remarks.py`,
`seasonal.py`, `options_extraction.py`, and `post_processing.py` (orchestration).
The package `__init__` re-exports every public function, so callers can
`from app.services.domain import <function>` regardless of its module.

Key functions:

**Episode & Reading math:**

- `apply_validate_episode_math(entry)` — sanitizes `ep_total`/`ep_fin`; ensures `ep_fin ≤ ep_total` (supports Anime, TVShows, Cartoon)
- `apply_validate_vol_math(manga)` / `apply_validate_ch_math(manga)` — validates manga volumes and chapters
- `derive_ep_previous_anime(db, franchise_id)` — computes cumulative episode offset for sequential TV/ONA entries within a series

**Watch order & relations:**

- `derive_watch_order_anime(db, franchise_id)` — assigns `watch_order` to eligible anime entries; groups by series, orders within group by season/part then airing type (TV→ONA→Special→OVA→OAD); only fills `None` fields
- `derive_watch_order_tv_show(db, franchise_id)` / `derive_watch_order_cartoon(db, franchise_id)` — assigns watch order for TV shows and cartoons
- `derive_prequel_sequel_{anime|tv_show|cartoon|manga}(db, franchise_id)` — links adjacent entries by `watch_order`; sets `prequel_id` / `sequel_id`; only fills `None` fields

**Master derive:** `derive_related_{anime|tv_show|cartoon|manga}(db)` — calls corresponding watch order, prequel/sequel, and episode previous derivation functions.

**External API fill:**

- `autofill_{anime|anime_movie|manga|novel}_from_mal(...)` — fetch MAL data via Jikan, fill missing fields, and download cover images.
- `autofill_{movie|tv_show|cartoon}_from_imdb(...)` — fetch IMDb details via TMDB/OMDb, fill missing fields, and download cover images.

**Season inference:**

- `apply_calculate_seasonal_from_month()` — map `release_month` → `release_season`
- `derive_season_1_{anime|tv_show|cartoon}()` — if a franchise has exactly one TV entry of this type with no `season_part`, set "Season 1"

**Source flags:** `apply_check_baha()` — sets `source_baha=True` if `baha_link` is present (supports Anime, AnimeMovies).

**Duplicate detection:** `find_duplicate_{franchises|series|anime|anime_movie|movie|tv_show|cartoon|manga|novel|system_options}(db)` — union-find clustering by name similarity.

**Post-processing:** `{type}_post_processing(entry, db)` — applies specific validation math, baha check, and season/status derivations.

**Hierarchy resolution:** `resolve_{type}_parent_hierarchy(...)` — find or create parent Franchise (and optionally Series) by name during Pull.

### `calculation.py` — Bulk Maintenance

Called by `run_calculate_all(db)` (triggered from Admin page):

1. `run_post_processing(db)` — post-process all media entries (Anime, TV Shows, Cartoons, Manga, Novels, etc.)
2. `run_derive_related(db)` — derive watch order, prequel/sequel, ep_previous for all applicable media types across all franchises
3. `run_sync(db)` — triggers type-specific sync functions (`run_sync_anime`, `run_sync_anime_movie`, `run_sync_cartoon`, `run_sync_tv_show`, `run_sync_manga`, `run_sync_novel`) to build seasonal configs, counts, and extract system options
4. Cover image utilities: `bulk_check_cover_image`, `bulk_set_cover_image_fields`, `bulk_delete_orphaned_cover_images`, and `bulk_download_missing_covers`

### `security.py` — Auth Utilities

- `get_password_hash(password)` — bcrypt hash; input truncated to 72 bytes (bcrypt hard limit); salt via `bcrypt.gensalt()` (default rounds ≈ 12)
- `verify_password(plain, hashed)` — constant-time comparison via `bcrypt.checkpw()`
- `create_access_token(data, expires_delta)` — encodes JWT with `exp` claim; signs with `JWT_SECRET_KEY` + HS256

### `jikan.py` — Jikan API Client

See [integrations.md](integrations.md).

### `sheets.py` — Google Sheets Client

See [integrations.md](integrations.md).

### `image_manager.py` — Cover Image Manager

See [integrations.md](integrations.md).

---

## Utils Layer (`utils/`)

| File                    | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `jikan_utils.py`        | Parse Jikan JSON → DB field dict; date/season/link extraction logic                          |
| `gcp_utils.py`          | Initialize GCS client; branch between Cloud Run IAM and local service account credentials    |
| `utils.py`              | Regex patterns, episode math helpers, MAL ID extraction, season/month inference              |
| `data_control_utils.py` | Write `DataControlLog` entries; stage `deleted_record` entries                               |
| `formatter.py`          | Serialize SQLAlchemy models → Sheets matrix rows; parse Sheets rows → typed dicts for upsert |

---

## Routers (`routers/`)

All routers follow the **thin router** pattern: validate input, call a service or ORM operation, return the result. No business logic lives in routers.

| Router file       | Prefix              | Notes                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------ |
| `auth.py`         | `/api/auth`         | Login, logout, `/me` status check                            |
| `options.py`      | `/api/options`      | System option CRUD                                           |
| `franchise.py`    | `/api/franchise`    | CRUD; `DELETE` cascades FK nulls and writes `deleted_record` |
| `series.py`       | `/api/series`       | CRUD                                                         |
| `anime.py`        | `/api/anime`        | CRUD; supports `franchise_id` query param for filtered list  |
| `anime_movie.py`  | `/api/anime-movie`  | CRUD                                                         |
| `cartoon.py`      | `/api/cartoon`      | CRUD                                                         |
| `movie.py`        | `/api/movies`       | CRUD                                                         |
| `tv_show.py`      | `/api/tv-shows`     | CRUD                                                         |
| `manga.py`        | `/api/manga`        | CRUD                                                         |
| `novel.py`        | `/api/novel`        | CRUD                                                         |
| `seasonal.py`     | `/api/seasonal`     | Read + partial update; `/current-season` shortcut            |
| `data_control.py` | `/api/data-control` | Pipeline triggers; SSE streaming routes                      |
| `system.py`       | `/api/system`       | Config, logs, deleted records                                |

---

## Deployment

### Docker Multi-Stage Build

**Stage 1 — Frontend builder (Node 20):**

1. `npm install` (from `frontend/package.json`)
2. `npm run build` → outputs to `frontend_dist/`

**Stage 2 — Python wheels builder (Python 3.11):**

1. Install build tools: gcc, libpq-dev, python3-dev, libffi-dev
2. `pip wheel -r requirements.txt` → `/app/wheels/`

**Stage 3 — Final runtime (Python 3.11-slim):**

1. Install runtime system deps: libpq-dev
2. Install Python packages from local wheels (no network access at runtime)
3. Copy application source
4. Copy `frontend_dist/` from Stage 1
5. `ENTRYPOINT ["/app/entrypoint.sh"]`

### Startup Sequence (`entrypoint.sh`)

```sh
set -e
alembic upgrade head     # apply all pending migrations
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port ${PORT:-8080} \
  --proxy-headers \
  --forwarded-allow-ips='*'
```

`exec` replaces the shell process so uvicorn receives SIGTERM directly from the container runtime. `--proxy-headers` is required for correct client IP handling behind Cloud Run's load balancer.

### Cloud Run Configuration

| Env var                    | Set by           | Used for                                                                |
| -------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `K_SERVICE`                | Cloud Run (auto) | Signals production mode: secure cookies, IAM GCS auth, Cloud SQL socket |
| `INSTANCE_CONNECTION_NAME` | GCP config       | Cloud SQL Unix socket path                                              |
| `PORT`                     | Cloud Run (auto) | uvicorn listen port (default 8080)                                      |
| `GCP_BUCKET_NAME`          | GCP config       | GCS bucket for cover images                                             |

### Local Development

```
docker-compose up -d       # PostgreSQL on port 5432
cd frontend && npm run dev  # Vite dev server on port 5173 (proxies /api → :8000)
uvicorn app.main:app --reload   # FastAPI on port 8000
```

`docker-compose.yml` defines a single `postgres:15` service with a named volume (`postgres_anime_data`). The FastAPI server runs outside Docker locally.

---

## Database Migrations (Alembic)

- Config: `alembic.ini` — `script_location = alembic/`
- `alembic/env.py` reads the SQLAlchemy engine from `app/database.py` and supports both online (connected) and offline (SQL file) migration modes.
- Migrations run automatically at container startup via `entrypoint.sh`.
- To generate a migration: `alembic revision --autogenerate -m "description"`
