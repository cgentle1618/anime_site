# CG1618 Media Tracker & Database

A personal, cloud-hosted tracker for a media collection — anime, anime movies,
movies, TV shows, cartoons, manga, novels and comics — organised as
**Collection → Franchise → Series → entry**, with watch orders, relations,
notes, quotes/memes, a plan-next board and per-season statistics. Guests can
browse; an admin manages everything, enriches entries from Tenrai (MAL), TMDB,
OMDb and Comic Vine, and backs the whole database up to Google Sheets.

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI · SQLAlchemy 2 · PostgreSQL · Alembic · Python 3.13 |
| Frontend | React 18 · Vite 6 · Tailwind CSS v4 (light/dark) · TanStack Query · React Router |
| Auth | JWT in an HttpOnly cookie; role-based permissions and content labels |
| Integrations | Tenrai v1 (MAL), TMDB, OMDb, Comic Vine, Google Sheets, Google Cloud Storage |
| Deployment | Docker → GitHub Actions (tests gate deploy) → Cloud Run + Cloud SQL |

## Quick start

```bash
# 1. Python and Node
python -m venv venv && venv/Scripts/activate      # Windows; source venv/bin/activate on Linux
pip install -r requirements-dev.txt
cd frontend && npm install && npm run build && cd ..

# 2. Database and config
createdb anime_site_db && createdb anime_site_test # native PostgreSQL 17, or docker-compose up -d
cp .env.example .env                               # fill in keys, see docs/setup-local.md
alembic upgrade head

# 3. Run
uvicorn app.main:app --reload --reload-dir app     # http://localhost:8000
cd frontend && npm run dev                         # http://localhost:5173 (hot reload)

# 4. Check
venv/Scripts/python.exe -m pytest -q && ruff check .
cd frontend && npm run test:run && npm run lint
```

The full walkthrough — including Windows scripts (`dev.ps1`, `stop.cmd`),
API keys, Google credentials and the "port 8000 serves the built bundle" rule
— is in [docs/setup-local.md](docs/setup-local.md).

## Documentation

Everything is under [`docs/`](docs/README.md): architecture, data model,
every API endpoint, business rules, the data-control pipelines, each
subsystem (watch orders, relations, plan-next, notes, quotes/memes, credits),
authentication and authorization, the frontend pages and components, testing,
deployment and the roadmap.

## Repository layout

```
app/            FastAPI application (routers, models, schemas, services, utils)
alembic/        migrations (single head; runs on every container start)
frontend/       React SPA (src/), built into frontend_dist/ for uvicorn to serve
tests/          pytest: unit (no DB) and api (PostgreSQL anime_site_test)
docs/           documentation (start at docs/README.md)
scripts/        one-off maintenance scripts
```

## Licence

Personal project; not currently published under an open-source licence.
