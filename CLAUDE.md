# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CG1618 Media Tracker & Database** — a cloud-native FastAPI web application for tracking a personal media collection. Data is organized in a three-tier relational hierarchy: `Franchise → Series → Single Media Entry`. Media entry types include Anime, Anime Movie, Movie, TV Show, Cartoon, Manga, and Novel (not implemented yet). The app has two access levels: Guest (read-only) and Admin (full management).

## Documentation Map

Reference these files in `/docs` for deep technical context (note that the documents are not completed and may contain outdated information):

- **`current-plan.md`**: Current rough plan for implementation and modification. Remind me to update if we're moving to next media type implementation and I didn't update the plan.
- **`database-schema.md`**: All table schemas — columns, types, nullability, relationships, computed fields.
- **`business-logic.md`**: Pipeline logic (Fill, Replace, Pull, Backup, Calculate), derivation rules (watch order, ep_previous, prequel/sequel), checking rules, formatters and parsers.
- **`options.md`**: Valid enum values, options, dropdowns.
- **`api.md`**: All API endpoints by router — method, path, auth requirement, parameters, request body, and response model.
- **`pages.md`**: Frontend pages — what each loads and key components used.
- **`admin-forms.md`**: Frontend form interaction logic for Add, Modify, and Delete admin pages — prefill behavior, franchise/series modal flows, form defaults, and post-submit pipeline triggers.
- **`reusable-elements.md`**: Shared React components and JS utilities.
- **`integrations.md`**: Jikan API throttling, OMDb API fetch, Google Sheets sync flow, GCS bucket setup.
- **`architecture.md`**: Request flow, service layer details, auth flow, deployment.
- **`dependencies.md`**: Python and NPM packages and their purpose.
- **`test.md`**: Include testing.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL. All backend code lives under the `app/` package (run `uvicorn app.main:app`); services are split into `app/services/{domain,pipelines,integrations}`.
- **Config**: pydantic-settings — every env var is read once in `app/config.py` (`settings`); see `.env.example`.
- **Frontend**: React + Vite (SPA); pages call `/api/...` endpoints via native `fetch()`
- **CSS**: Tailwind CSS v4
- **Auth**: JWT in HTTP-Only cookie; RBAC via `Depends(get_current_admin)` in `app/dependencies.py`
- **Migrations**: Alembic
- **External Services**: Jikan v4 API (MAL metadata), TMDB API (cover/release/director via themoviedb.org), OMDb API (IMDb rating via omdbapi.com), Google Sheets (backup/restore), Google Cloud Storage (cover images)
- **Deployment**: Docker → GCP Cloud Run + Cloud SQL (PostgreSQL via Unix socket)

## Development Commands

```bash
# Start PostgreSQL (Docker)
docker-compose up -d

# Vite dev server on :5173 (also watches Tailwind CSS)
cd frontend && npm run dev

# Build the bundle uvicorn serves on :8000 (writes frontend_dist/)
cd frontend && npm run build

# Run FastAPI dev server (backend code lives in the app/ package)
uvicorn app.main:app --reload

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "describe change"
alembic downgrade -1
```

## Frontend Ports and Rebuilds

The frontend is reachable on two ports and they do not stay in sync on their own:

- **:5173** — the Vite dev server. Serves `frontend/src/` directly and hot-reloads, so source edits show up immediately.
- **:8000** — uvicorn. Serves the prebuilt bundle in `frontend_dist/` (see `outDir` in `frontend/vite.config.js`), which only changes when `npm run build` runs.

**After any frontend change, run `cd frontend && npm run build` so the change works on both ports.** Skipping it makes :8000 keep serving the old bundle — the classic "it works on 5173 but not on 8000" symptom. Do this before claiming a frontend change is done, and before asking me to verify it.

If a frontend change appears missing on one port only, suspect a stale build before suspecting the code. Note that `frontend_dist/` is gitignored and never committed.

## Required Environment Variables

| Variable                                              | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB credentials                                                |
| `JWT_SECRET_KEY`                                      | JWT signing secret                                            |
| `ADMIN_PASSWORD`                                      | Seeded admin password (default: `admin123`)                   |
| `GOOGLE_SHEET_ID`                                     | Target Google Sheets spreadsheet ID                           |
| `GOOGLE_CREDENTIALS_JSON`                             | Service account JSON string (or use local `credentials.json`) |
| `GCP_BUCKET_NAME`                                     | GCS bucket for cover images                                   |
| `TMDB_API_KEY`                                        | TMDB API key for IMDb metadata fetch (free at themoviedb.org) |
| `OMDB_API_KEY`                                        | OMDb API key for IMDb rating fetch (free at omdbapi.com)      |
| `INSTANCE_CONNECTION_NAME`                            | Cloud SQL connection name (Cloud Run only)                    |

Cloud Run auto-sets `K_SERVICE`, which the app uses to switch between local and production behaviors (secure cookies, IAM auth for GCS, Cloud SQL socket routing).

## Common Points of Confusion

- Anime Movie is not the same as Anime with airing_type as "movie". Anime Movie has its own database table anime_movie. Anime with airing_type as "movie" belongs to the database table anime. When mentioning Anime Movie, it is more likely to be referring to the entries in anime_movie database table.
- Reality franchise is referring to franchise with type as "TV or Movie".
- "Group" usually refers to the grouping tiers collectively: collection, franchise, and series (as opposed to the individual media entries).

## Concurrent Claude Code Sessions

- Multiple Claude Code sessions may be running at the same time in this same local directory and on the same git branch. Assume you are not the only agent editing the working tree.
- Two sessions can touch the same file for different features. Example: session 1 works on feature A and edits `file1`; session 2 works on feature B and also edits `file1`. `git status`/`git diff` for `file1` then contains a mix of both features' changes — what looks like one change set is really "2 commits" worth of work.
- Consequences to respect:
  - Never assume uncommitted changes in a file were made by you. Unfamiliar edits are probably another session's in-progress work, not a bug or leftover cruft.
  - Do not revert, clean up, or "fix" changes you did not make, and do not run `git checkout --`, `git restore`, `git stash`, or `git reset` on shared files.
  - Do not use `git add -A` / `git commit -a`. Stage only the specific files (ideally the specific hunks) belonging to the task you were asked to do.
  - Before committing, re-read the diff of the files you intend to stage and confirm every hunk belongs to your feature. If a file contains mixed changes, say so and ask how to proceed rather than committing the mix.
  - A file may change under you between reads. If an edit fails to match, re-read the file instead of forcing the change.

## Rule

- Ask to proceed if the task is token-intensive.
- Other Claude Code sessions may be editing the same files on the same branch at the same time — see "Concurrent Claude Code Sessions" before staging or committing anything.
- Never commit or push automatically right after finishing a task. Ask for permission and show one line version of the commit. Only commit (and push) after I approve. Note that it's possible that we only commit once after multiple modifications.
- If we're implementing or modifying based on current-plan.md, pause and ask for permission to proceed whenever you finish a step or a set of steps. Update current-plan.md for our progress in an individual section. Do not modify the plan itself. Provide git commit message for the changes.
