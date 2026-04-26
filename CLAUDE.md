# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CG1618 Media Tracker & Database** — a cloud-native FastAPI web application for tracking a personal anime/media collection. Data is organized in a three-tier relational hierarchy: `Franchise → Series → Single Media Entry`. The app has two access levels: Guest (read-only) and Admin (full management).

## Documentation Map

Reference these files in `/docs` for deep technical context (note that the documents are not completed and may contain outdated information):

- **`database-schema.md`**: All table schemas — columns, types, nullability, relationships, computed fields.
- **`business-logic.md`**: Pipeline logic (Fill, Replace, Pull, Backup, Calculate), derivation rules (watch order, ep_previous, prequel/sequel), checking rules, formatters and parsers.
- **`options.md`**: Valid enum values, options, dropdowns.
- **`api.md`**: All API endpoints by router — method, path, auth requirement, parameters, request body, and response model.
- **`pages.md`**: Frontend pages — what each loads and key components used.
- **`reusable-elements.md`**: Shared React components and JS utilities.
- **`integrations.md`**: Jikan API throttling, Google Sheets sync flow, GCS bucket setup.
- **`architecture.md`**: Request flow, service layer details, auth flow, deployment.
- **`dependencies.md`**: Python and NPM packages and their purpose.
- **`test.md`**: Include testing.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL
- **Frontend**: React + Vite (SPA); pages call `/api/...` endpoints via native `fetch()`
- **CSS**: Tailwind CSS v4
- **Auth**: JWT in HTTP-Only cookie; RBAC via `Depends(get_current_admin)` in `dependencies.py`
- **Migrations**: Alembic
- **External Services**: Jikan v4 API (MAL metadata), Google Sheets (backup/restore), Google Cloud Storage (cover images)
- **Deployment**: Docker → GCP Cloud Run + Cloud SQL (PostgreSQL via Unix socket)

## Development Commands

```bash
# Start PostgreSQL (Docker)
docker-compose up -d

# Watch Tailwind CSS
cd frontend && npm run dev

# Run FastAPI dev server
uvicorn main:app --reload

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "describe change"
alembic downgrade -1
```

## Required Environment Variables

| Variable                                              | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB credentials                                                |
| `JWT_SECRET_KEY`                                      | JWT signing secret                                            |
| `ADMIN_PASSWORD`                                      | Seeded admin password (default: `admin123`)                   |
| `GOOGLE_SHEET_ID`                                     | Target Google Sheets spreadsheet ID                           |
| `GOOGLE_CREDENTIALS_JSON`                             | Service account JSON string (or use local `credentials.json`) |
| `GCP_BUCKET_NAME`                                     | GCS bucket for cover images                                   |
| `INSTANCE_CONNECTION_NAME`                            | Cloud SQL connection name (Cloud Run only)                    |

Cloud Run auto-sets `K_SERVICE`, which the app uses to switch between local and production behaviors (secure cookies, IAM auth for GCS, Cloud SQL socket routing).

## Common Points of Confusion

- Anime Movie is not the same as Anime with airing_type as "movie". Anime Movie has its own database table anime_movie. Anime with airing_type as "movie" belongs to the database table anime. When mentioning Anime Movie, it is more likely to be referring to the entries in anime_movie database table.
