# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CG1618 Media Tracker & Database** — a cloud-native FastAPI web application for tracking a personal media collection. Data is organized in a three-tier relational hierarchy: `Collection → Franchise → Series → entry`. Media entry types: Anime, Anime Movie, Movie, TV Show, Cartoon, Manga, Novel, Comic (all implemented). Access: guests browse (subject to role permissions and content labels), admins manage everything.

## Documentation Map

Start at **`docs/README.md`** — it indexes every doc. Docs are written for humans first and describe the code as it is; each carries a `Last verified` line. When to read what:

- Schema or column change → `docs/data-model.md`, then `docs/options.md` if a vocabulary moves.
- New or changed media type → `docs/entry-types.md`, `docs/data-actions.md`, `docs/frontend/components.md` ("adding a media type").
- Auth or visibility → `docs/authentication.md`, `docs/authorization.md`.
- Pipelines (Backup/Pull/Fill/Replace/Calculate) → `docs/data-actions.md`, `docs/external-apis.md`.
- Rules and derivations → `docs/business-rules.md`; per-subsystem detail → `docs/systems/*.md`.
- Endpoints → `docs/api.md`. UI → `docs/frontend/*.md`; any visual change → `docs/frontend/design-system.md` first. Tests → `docs/testing.md`. Deploy → `docs/deployment-gcp.md`.
- Plan → `docs/roadmap.md`. Remind me to update it when we move to the next feature and I have not.

When you change behaviour, update the matching doc in the same change and bump its `Last verified` line.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL, Python 3.13. All backend code lives under the `app/` package (run `uvicorn app.main:app`); services are split into `app/services/{domain,pipelines,integrations,rbac}`. Media routers come from `app/registry.py` + `app/routers/_factory.py`; pipelines from `app/services/pipelines/{runner,specs,tabs}.py`.
- **Config**: pydantic-settings — every env var is read once in `app/config.py` (`settings`); see `.env.example`.
- **Frontend**: React + Vite (SPA); pages call `/api/...` via `api/endpoints.js` + TanStack Query hooks. Tailwind CSS v4 with semantic colour tokens (`bg-surface`, `text-text-muted`, …) that drive light/dark mode — never add hard-coded grey utilities (`src/theme-tokens.test.js` fails the build on them).
- **Auth**: JWT in an HTTP-only cookie; RBAC via `Depends(get_current_admin)` / `get_viewer` in `app/dependencies.py`.
- **Migrations**: Alembic (single head; run on container start).
- **External services**: Tenrai v1 API (MAL metadata), TMDB, OMDb, Comic Vine, Google Sheets (backup/restore), Google Cloud Storage (cover images).
- **Deployment**: Docker → GitHub Actions (tests gate deploy) → GCP Cloud Run + Cloud SQL.

## Development Commands

```bash
# PostgreSQL: native 17 is the real dev DB; docker-compose up -d is the alternative
cd frontend && npm run dev          # Vite dev server on :5173 (hot reload)
cd frontend && npm run build        # writes frontend_dist/ for uvicorn on :8000
uvicorn app.main:app --reload --reload-dir app   # (dev.ps1 does this + vite in one window)
alembic upgrade head
alembic revision --autogenerate -m "describe change"

venv/Scripts/python.exe -m pytest -q             # backend (api tests need anime_site_test DB)
venv/Scripts/ruff.exe check .                    # backend lint
cd frontend && npm run test:run && npm run lint  # frontend tests + ESLint
```

## Frontend Ports and Rebuilds

- **:5173** — the Vite dev server; source edits show up immediately.
- **:8000** — uvicorn serves the prebuilt bundle in `frontend_dist/`, which only changes when `npm run build` runs.

**After any frontend change, run `cd frontend && npm run build`** so the change works on both ports. Do this before claiming a frontend change is done. If a change appears missing on one port only, suspect a stale build first. `frontend_dist/` is gitignored.

## Required Environment Variables

See `.env.example` (authoritative) and `docs/setup-local.md`. Cloud Run auto-sets `K_SERVICE`, which switches secure cookies, IAM auth for GCS and Cloud SQL socket routing.

## Common Points of Confusion

- Anime Movie (table `anime_movies`, route `/api/anime-movie`) is not the same as an Anime with `airing_type = "Movie"` (table `anime`).
- "Reality" refers to franchises of type `TV` or `Movie`.
- "Group" refers to the grouping tiers collectively: collection, franchise, series.
- The Google Sheets tab for anime movies is named **"Anime Movie"** (singular); every tab name lives in `app/services/pipelines/tabs.py`.
- Media-type keys: the registry uses underscores (`anime_movie`, `tv_show`) for router files; the data layer uses hyphens (`anime-movie`, `tv-show`, see `app/utils/media_resolver.py`). Use `spec.owner_type` when in doubt.

## Two Development Environments (company / home)

This project is developed on two machines — **company** and **home** — and work
is often stopped halfway on one and continued on the other. Full procedure and
per-machine details: **`docs/switching-environments.md`**.

- Code travels by **git** (`origin`); database contents travel by **Google Sheets**
  (admin `/system` → **Backup** writes local DB → sheet, **Pull All** writes sheet
  → local DB). `.env`, `credentials.json`, `venv/`, `node_modules/` and
  `frontend_dist/` travel nowhere — they are per-machine.
- The sheet holds exactly **one** version of the data: Backup overwrites every tab,
  Pull All overwrites every table. Back up from the machine with the newer data
  *before* touching the other one, and never Pull All over unsaved local changes.
  If both databases moved since the last backup, stop and ask — there is no merge.
- **Before I switch away**: push my commits, write any half-done state into
  `docs/` or `docs/roadmap.md` (the next session starts blank), and run Backup if
  data changed.
- **After switching in**: `git pull` → start Postgres → install deps if they moved
  → `alembic upgrade head` (always, before any Pull) → Pull All if data changed
  elsewhere → `cd frontend && npm run build`.
- When I say I am about to switch environments, walk me through the leaving
  checklist; when a session starts and the working tree looks stale, suspect a
  handover and check the arriving checklist first.

## Concurrent Claude Code Sessions

- Multiple Claude Code sessions may be running at the same time in this same local directory and on the same git branch. Assume you are not the only agent editing the working tree.
- Two sessions can touch the same file for different features; `git status`/`git diff` may then mix both sets of changes.
- Consequences to respect:
  - Never assume uncommitted changes in a file were made by you. Unfamiliar edits are probably another session's in-progress work, not a bug or leftover cruft.
  - Do not revert, clean up, or "fix" changes you did not make, and do not run `git checkout --`, `git restore`, `git stash`, or `git reset` on shared files.
  - Do not use `git add -A` / `git commit -a`. Stage only the specific files (ideally the specific hunks) belonging to the task you were asked to do.
  - Before committing, re-read the diff of the files you intend to stage and confirm every hunk belongs to your feature. If a file contains mixed changes, say so and ask how to proceed rather than committing the mix.
  - A file may change under you between reads. If an edit fails to match, re-read the file instead of forcing the change.

## Rule

- Other Claude Code sessions may be editing the same files on the same branch at the same time — see "Concurrent Claude Code Sessions" before staging or committing anything.
- Never commit or push automatically right after finishing a task. Ask for permission and show a one-line version of the commit. Only commit (and push) after I approve. Note that it's possible that we only commit once after multiple modifications.
- If we're implementing or modifying based on `docs/roadmap.md`, pause and ask for permission to proceed whenever you finish a step or a set of steps. Update the roadmap's progress in its own section. Do not modify the plan itself. Provide a git commit message for the changes.
- Write a failing test before a bug fix or a behaviour change; keep `pytest`, `ruff`, `vitest` and `eslint` green (CI runs all four before deploying).
