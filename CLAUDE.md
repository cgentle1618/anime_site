# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CG1618 Media Tracker & Database** — a cloud-native FastAPI web application for tracking a personal anime/media collection. Data is organized in a three-tier relational hierarchy: `Franchise → Series → Anime`. The app has two access levels: Guest (read-only) and Admin (full management).

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy (sync) + PostgreSQL
- **Templates**: Jinja2 (server-side HTML), with frontend JS calling `/api/...` endpoints
- **CSS**: Tailwind CSS v4 (compiled from `static/css/input.css` → `static/css/main.css`)
- **Auth**: PyJWT stored in HTTP-Only cookies; RBAC enforced via `dependencies.get_current_admin()`
- **Migrations**: Alembic
- **External Services**: Jikan v4 API (MAL metadata), Google Sheets (bi-directional sync/backup), Google Cloud Storage (cover images)
- **Deployment**: Docker → GCP Cloud Run + Cloud SQL (PostgreSQL via Unix socket)

## Development Commands

### Local Server

```bash
# Start PostgreSQL (Docker)
docker-compose up -d

# Watch Tailwind CSS (recompile on save)
npm run watch:css
# or via Docker: docker-compose up tailwind-watcher

# Run FastAPI dev server
uvicorn main:app --reload
```

### CSS Build (production)

```bash
npm run build:css
```

### Database Migrations (Alembic)

```bash
# Apply all pending migrations
alembic upgrade head

# Generate a new migration from model changes
alembic revision --autogenerate -m "describe change"

# Downgrade one step
alembic downgrade -1
```

## Required Environment Variables

For local development, create a `.env` file:

| Variable                                              | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB credentials                                                |
| `JWT_SECRET_KEY`                                      | JWT signing secret                                            |
| `ADMIN_PASSWORD`                                      | Seeded admin account password (default: `admin123`)           |
| `GOOGLE_SHEET_ID`                                     | Target Google Sheets spreadsheet ID                           |
| `GOOGLE_CREDENTIALS_JSON`                             | Service account JSON string (or use local `credentials.json`) |
| `GCP_BUCKET_NAME`                                     | GCS bucket for cover images                                   |
| `INSTANCE_CONNECTION_NAME`                            | Cloud SQL connection name (Cloud Run only)                    |

Cloud Run auto-sets `K_SERVICE`, which the app uses to switch between local and production behaviors (secure cookies, IAM auth for GCS, Cloud SQL socket routing).

## Architecture

### Request Flow

```
Browser → FastAPI Router → Service Layer → DB / External API
                ↓
         Jinja2 Template (page load)
         or JSON API response (JS fetch)
```

**Page routers** (`routers/pages.py`) are thin — they only render templates with `is_admin` context. All data fetching happens client-side via JS calling the API routers.

**API routers** (`routers/anime.py`, `franchise.py`, etc.) handle CRUD operations and delegate business logic to the `services/` layer.

### Key Architectural Patterns

- **Thin routers**: Routers validate input and delegate; no business logic lives in routers.
- **Services layer** (`services/`): All domain logic lives here:
  - `data_control.py` — master orchestrator for data pipelines (Backup, Pull, Fill, Replace, Calculate)
  - `jikan.py` — Jikan API HTTP client with sliding-window rate limiting and tenacity retry
  - `sheets.py` — Google Sheets read/write (treated as read-only backup/pull source)
  - `security.py` — bcrypt password hashing and JWT creation/verification
  - `image_manager.py` — GCS cover image upload/management
  - `other_logics.py` — domain business logic (MAL autofill, episode tracking, seasonal creation)
- **Utils layer** (`utils/`): Stateless helper functions for parsing, formatting, GCP client init.
- **`dependencies.py`**: Shared FastAPI dependencies — `get_db()` (DB session) and `get_current_admin()` (RBAC guard). Inject these into protected routes.

### Data Model

```
Franchise (top-level)
  └── Series (optional grouping layer)
        └── Anime (granular entry with full metadata)
```

All three models use `UUID` primary keys and include a `NameFallbackMixin` that provides `display_name` with CN → EN → Alt → Romanji → JP fallback priority.

### Database Connection Routing (`database.py`)

1. If `INSTANCE_CONNECTION_NAME` is set → Cloud SQL Unix socket (Cloud Run)
2. If `DATABASE_URL` is set (non-localhost) → direct TCP
3. Otherwise → `localhost:5432` (local development)

### Authentication Flow

1. Login POSTs to `/api/auth/login` → JWT set as HTTP-Only cookie (`access_token`)
2. Page renders call `check_admin_status(request)` in `routers/pages.py` to pass `is_admin` to templates
3. Protected API routes use `Depends(get_current_admin)` from `dependencies.py`
4. Cookie is `Secure=True` only on Cloud Run (`K_SERVICE` env var present)

### Data Pipelines (`services/data_control.py`)

The admin dashboard triggers these pipelines:

- **Backup**: PostgreSQL → Google Sheets (full table overwrite per model)
- **Pull**: Google Sheets → PostgreSQL (upsert based on sheet rows)
- **Fill**: Uses Jikan API to auto-populate missing anime metadata fields
- **Replace**: Refreshes existing metadata from Jikan API
- **Calculate**: Computes derived fields (seasonal aggregates, episode counts, watch order)

All pipeline runs are logged to the `DataControlLog` table.

### Deployment (Cloud Run)

The `entrypoint.sh` runs `alembic upgrade head` before starting uvicorn. The `dockerfile` builds the image; CI/CD deploys to Cloud Run.
