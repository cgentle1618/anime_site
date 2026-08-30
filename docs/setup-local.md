# Local Development Setup

Last verified: 2026-08-30 (commit 4339702)

**What this is for.** This page takes a machine with nothing on it to a working
copy of the CG1618 Media Tracker: backend on :8000, Vite dev server on :5173,
PostgreSQL with a dev and a test database, and the test/lint commands passing.
Windows is the primary platform (the launcher scripts are PowerShell); Linux
differences are called out inline. For the production side see
`deployment-gcp.md`; for how the code is organised see `architecture.md`.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Python | 3.13 | Same interpreter as the runtime image (`python:3.13-slim`) and CI. `requirements.txt` is pinned against 3.13. |
| Node.js | 20 | CI and the Docker frontend stage use Node 20. Newer LTS versions (e.g. 24) also work locally. |
| PostgreSQL | 17 native (preferred) or 15 via Docker | See section 3 for why there are two options. |
| Git | any | |
| Docker Desktop | optional | Only needed if you use the docker-compose Postgres or `dev.ps1`. |
| Windows Terminal (`wt.exe`) | optional | `dev.ps1` opens its uvicorn/vite panes with it. |

## 2. Python environment

The venv **must be named `venv`** and live in the project root: `dev.ps1` runs
`venv\Scripts\uvicorn.exe` by path, and every command in these docs uses
`venv/Scripts/python.exe`.

```powershell
# Windows
py -3.13 -m venv venv
venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt     # includes -r requirements.txt
```

```bash
# Linux / macOS
python3.13 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt
```

`requirements-dev.txt` adds pytest, pytest-cov, httpx (TestClient), freezegun,
responses and ruff on top of the runtime packages. `psycopg2-binary` ships
wheels, so no PostgreSQL client headers are needed locally (the Docker image
installs `libpq-dev` because it builds wheels itself).

## 3. PostgreSQL

The app connects to `localhost:5432` with `POSTGRES_USER` / `POSTGRES_PASSWORD`
/ `POSTGRES_DB` from `.env` (see `app/config.py`, `sqlalchemy_database_url`).
Two ways to provide that server exist and they conflict on port 5432, so pick
one and stop the other.

### Option A: native PostgreSQL 17 (the real dev database)

This is what the maintainer's dev data lives in. Install PostgreSQL 17, make
sure the service is running, then create the two databases:

```powershell
# Windows: psql is under C:\Program Files\PostgreSQL\17\bin if not on PATH
psql -U postgres -c "CREATE DATABASE anime_site_db;"
psql -U postgres -c "CREATE DATABASE anime_site_test;"
```

```bash
# Linux
sudo -u postgres createdb anime_site_db
sudo -u postgres createdb anime_site_test
```

`anime_site_db` is the dev database Alembic manages. `anime_site_test` is
wiped and rebuilt (`DROP SCHEMA public CASCADE`) at the start of every API test
session, so never point it at real data.

### Option B: docker-compose (postgres:15)

`docker-compose.yml` defines one service, `db`, from the `postgres:15` image,
container name `anime_site_postgres_db`, published on `5432:5432`, data in the
`postgres_anime_data` volume. It reads `POSTGRES_USER/PASSWORD/DB` from `.env`
and creates only that one database on first start, so you still have to create
the test database inside the container:

```powershell
docker-compose up -d
docker exec anime_site_postgres_db createdb -U postgres anime_site_test
```

`dev.ps1` assumes this option (it runs `docker-compose up -d` and waits for
`pg_isready` in the container). If you run native Postgres, either do not use
`dev.ps1`, or stop the native service first; two servers on 5432 is the usual
cause of "the data I just added is gone" confusion.

## 4. `.env`

Copy `.env.example` to `.env` and fill it in. `.env` is gitignored.
`app/config.py` (`Settings`, pydantic-settings) is the only place environment
variables are read; `.env.example` mirrors it and is the authoritative key
list. Variable names are case-insensitive.

| Variable | Default when unset | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | DB user |
| `POSTGRES_PASSWORD` | `password` | DB password. Tests read it from here too (section 9). |
| `POSTGRES_DB` | `anime_site_db` | Dev database name |
| `DATABASE_URL` | unset | Optional full TCP URL override. Ignored if it contains `localhost`. |
| `INSTANCE_CONNECTION_NAME` | unset | Cloud SQL socket; **leave unset locally** |
| `JWT_SECRET_KEY` | insecure dev default | JWT signing secret |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Cookie/JWT lifetime |
| `ADMIN_PASSWORD` | `admin123` | Password of the `admin` user seeded on first boot |
| `TMDB_API_KEY` | unset | TMDB: movie/TV cover, release date, director |
| `OMDB_API_KEY` | unset | OMDb: IMDb rating |
| `COMICVINE_API_KEY` | unset | Comic Vine: comic run metadata and covers |
| `GOOGLE_CREDENTIALS_JSON` | unset | Service-account JSON as one line (alternative to `credentials.json`) |
| `GOOGLE_SHEET_ID` | unset | Spreadsheet used by Backup / Pull |
| `GCP_BUCKET_NAME` | unset locally | GCS bucket for cover images. Unset means covers are written to `static/covers/` on disk. |
| `K_SERVICE` | unset | Set by Cloud Run only. **Never set locally** (it turns on secure cookies, IAM GCS auth and the production config check). |

Minimum for a working local app: the three `POSTGRES_*` values. Everything
else can stay empty; the Fill pipelines and Backup/Pull will just log errors
for the integrations you have not configured.

### API keys

- **TMDB**: free key from themoviedb.org (Settings > API).
- **OMDb**: free key from omdbapi.com (1,000 requests/day on the free tier).
- **Comic Vine**: sign in to a GameSpot account, then the key is shown at
  comicvine.gamespot.com/api/.
- **Tenrai** (MAL metadata) needs no key.

### Google service account (`credentials.json`)

Sheets Backup/Pull (`app/services/integrations/sheets.py`) and, locally, GCS
uploads (`app/utils/gcp_utils.py`) both load credentials in this order:

1. `GOOGLE_CREDENTIALS_JSON` from the environment (whole JSON on one line).
2. A `credentials.json` file in the project root (gitignored).

Create a service account in the GCP project, download its JSON key, save it as
`credentials.json`, and share the target spreadsheet with the service account's
email as an editor. `GOOGLE_SHEET_ID` is the long ID in the spreadsheet URL.

## 5. Database schema

With Postgres running and `.env` in place:

```powershell
venv\Scripts\alembic upgrade head
```

This creates all tables plus `alembic_version` and runs the data migrations
(role seeding etc.). There are 75 revisions under `alembic/versions/`.

### What `app/schema_guard.py` does if you skip this

`app/main.py` calls `ensure_schema(engine)` at import time. It classifies the
database:

| State | Condition | Action |
| --- | --- | --- |
| `migrated` | `alembic_version` table exists | Nothing. Alembic owns the schema. |
| `empty` | no tables at all | `Base.metadata.create_all()` so the app can start, with a WARNING that this is not a migration and you must run `alembic upgrade head` (fresh DB) or `alembic stamp head`. |
| `unmanaged` | tables exist, no `alembic_version` | Nothing is created; a WARNING says the schema may be stale or a rebuild of a dropped DB. |

So starting uvicorn against an empty database "works", but you will then hit
`alembic upgrade head` failing on tables that already exist. Run Alembic
first on a new database; if you already started the server, `alembic stamp
head` reconciles it (only correct if the models and head migration agree).

## 6. Frontend

```powershell
cd frontend
npm install        # or npm ci for an exact lockfile install
npm run build      # writes ../frontend_dist/ (gitignored)
```

`npm run build` matters even for backend-only work: uvicorn serves
`frontend_dist/index.html` for every non-API path, and without it :8000
returns `{"detail": "Frontend not built. Run: cd frontend && npm run build"}`.

## 7. Running the app

### By hand (works with native Postgres)

```powershell
# terminal 1 (project root)
venv\Scripts\uvicorn app.main:app --reload --reload-dir app

# terminal 2
cd frontend
npm run dev
```

`--reload-dir app` keeps the file watcher off `tests/` and `alembic/`; without
it every test-file edit restarts the server.

On the first boot the lifespan hook seeds the RBAC roles and the `admin` user
with `ADMIN_PASSWORD` (see `architecture.md`, boot sequence). Log in at
`/login` with `admin` / that password.

### Launcher scripts (Docker Postgres only)

| Script | What it does |
| --- | --- |
| `dev.ps1` | Refuses to start if :8000 is already listening; `docker-compose up -d`; waits for `pg_isready` in the container (30 s); opens a Windows Terminal tab split into a uvicorn pane and an `npm run dev` pane; polls `http://127.0.0.1:8000/api/announcements/` until the backend answers (60 s); prints `Ready: http://localhost:5173/`. |
| `dev.cmd` | `powershell -ExecutionPolicy Bypass -File dev.ps1` wrapper for double-clicking / cmd. |
| `stop.cmd` | `docker-compose down` (stops the Postgres container; does not close the uvicorn/vite panes). |

There is no Linux equivalent; run the two commands by hand.

### :5173 versus :8000

- **:5173** is Vite. It serves `frontend/src/` with hot reload and proxies
  `/api` and `/static` to `http://127.0.0.1:8000` (`frontend/vite.config.js`;
  `127.0.0.1` rather than `localhost` because Node resolves `localhost` to
  `::1` first on Windows while uvicorn binds IPv4 only).
- **:8000** is uvicorn. It serves the **prebuilt** bundle in `frontend_dist/`.

After any frontend change run `cd frontend && npm run build`, otherwise :8000
keeps serving the old bundle. "Works on 5173 but not on 8000" is a stale build
until proven otherwise.

## 8. Lint and format

```powershell
venv\Scripts\ruff check .            # backend lint (ruff.toml: E, F, I, B; py313)
venv\Scripts\ruff format --check .   # backend formatting
cd frontend; npm run lint            # eslint src
cd frontend; npm run format:check    # prettier
```

CI runs `ruff check .` and `npm run lint`; both must pass before deploy.

## 9. Tests

```powershell
# backend: unit (no DB) + api (needs anime_site_test)
venv\Scripts\python.exe -m pytest
venv\Scripts\python.exe -m pytest tests/unit            # DB-free subset
venv\Scripts\python.exe -m pytest tests/api -q

# frontend
cd frontend
npm run test:run      # vitest, single run
npm run test          # watch mode
```

How the backend tests find the database: `tests/conftest.py` runs before any
`app` module is imported and does `os.environ.setdefault(...)` for
`POSTGRES_DB=anime_site_test`, `POSTGRES_USER=postgres`, a test
`JWT_SECRET_KEY` and `ADMIN_PASSWORD`. It deliberately does **not** default
`POSTGRES_PASSWORD`; pydantic-settings reads that from your `.env` (or from the
CI job environment). If `.env` has a wrong password the API tests fail at
`test_engine` setup with an authentication error. `tests/api/conftest.py`
refuses to run unless the database name contains `test`.

Details of the tiers and fixtures are in `testing.md`.

## 10. Quick verification checklist

1. `venv\Scripts\python.exe -c "from app.config import settings; print(settings.sqlalchemy_database_url)"` prints a `localhost:5432/anime_site_db` URL.
2. `alembic upgrade head` finishes without error; `alembic current` shows a head revision.
3. `uvicorn app.main:app --reload --reload-dir app` logs `Admin account verified` or `Admin user 'admin' created`.
4. `http://127.0.0.1:8000/docs` lists the routers; `http://localhost:5173/` shows the site.
5. `pytest` and `npm run test:run` are green.

## Common problems

| Symptom | Cause / fix |
| --- | --- |
| Vite shows `ECONNREFUSED 127.0.0.1:8000` | Backend not up, or a stale uvicorn holds :8000 (`dev.ps1` detects this and prints the PID to kill). |
| `WinError 10048` from uvicorn | Same: port 8000 already in use. |
| Data disappears between runs | Two Postgres servers on :5432 (native + Docker). Stop one. |
| `alembic upgrade head` says a table already exists | The server was started on an empty DB first (schema guard `create_all`). Use `alembic stamp head` or drop and recreate the DB. |
| API tests fail with `password authentication failed` | `POSTGRES_PASSWORD` in `.env` does not match the server. |
| `/` on :8000 returns "Frontend not built" | Run `cd frontend && npm run build`. |
| Covers not showing locally | With `GCP_BUCKET_NAME` unset covers are files in `static/covers/`, served at `/static/covers/<id>.jpg`; make sure the pipeline has downloaded them. |
