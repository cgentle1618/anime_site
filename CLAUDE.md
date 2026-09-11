# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CG1618 Media Tracker & Database** — a FastAPI web application for tracking a personal media collection. Data is organized in a three-tier relational hierarchy: `Collection → Franchise → Series → entry`. Media entry types: Anime, Anime Movie, Movie, TV Show, Cartoon, Manga, Novel, Comic (all implemented). Access: guests browse (subject to role permissions and content labels), admins manage everything.

## Documentation Map

Start at **`docs/README.md`** — it indexes every doc. Docs are written for humans first and describe the code as it is; each carries a `Last verified` line. When to read what:

- Schema or column change → `docs/data-model.md`, then `docs/options.md` if a vocabulary moves.
- New or changed media type → `docs/entry-types.md`, `docs/data-actions.md`, `docs/frontend/components.md` ("adding a media type").
- Auth or visibility → `docs/authentication.md`, `docs/authorization.md`.
- Pipelines (Backup/Pull/Fill/Replace/Calculate) → `docs/data-actions.md`, `docs/external-apis.md`.
- Rules and derivations → `docs/business-rules.md`; per-subsystem detail → `docs/systems/*.md`.
- Endpoints → `docs/api.md`. UI → `docs/frontend/*.md`; any visual change → `docs/frontend/design-system.md` first. Tests → `docs/testing.md`. Deploy → `docs/deployment-selfhost.md` (the plan); `docs/deployment-gcp.md` is history.
- Plan → `docs/roadmap.md`. Remind me to update it when we move to the next feature and I have not.
- In-flight work → **`docs/PROGRESS.md`**. See "Progress tracking" below.

When you change behaviour, update the matching doc in the same change and bump its `Last verified` line.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL, Python 3.13. All backend code lives under the `app/` package (run `uvicorn app.main:app`); services are split into `app/services/{domain,pipelines,integrations,rbac}`. Media routers come from `app/registry.py` + `app/routers/_factory.py`; pipelines from `app/services/pipelines/{runner,specs,tabs}.py`.
- **Config**: pydantic-settings — every env var is read once in `app/config.py` (`settings`); see `.env.example`.
- **Frontend**: React + Vite (SPA); pages call `/api/...` via `api/endpoints.js` + TanStack Query hooks. Tailwind CSS v4 with semantic colour tokens (`bg-surface`, `text-text-muted`, …) that drive light/dark mode — never add hard-coded grey utilities (`src/theme-tokens.test.js` fails the build on them).
- **Auth**: JWT in an HTTP-only cookie; RBAC via `Depends(get_current_admin)` / `get_viewer` in `app/dependencies.py`.
- **Migrations**: Alembic (single head; run on container start).
- **External services**: Tenrai v1 API (MAL metadata), TMDB, OMDb, Comic Vine, Google Sheets (backup/restore). Cover images are local disk under `static/covers/` — there is no object storage.
- **Deployment**: none. **Local development is the only runtime.** CI (`.github/workflows/ci.yml`, name `Tests`) runs ruff + pytest + eslint + vitest + the frontend build on every PR and push, and **deploys nothing**. Self-hosting (a mini PC behind a Cloudflare Tunnel) is the intended production and is not built yet — `docs/deployment-selfhost.md`. A GCP Cloud Run + Cloud SQL deployment did work until 2026-09-02; the code supporting it was removed on 2026-09-08, so reviving GCP means building it again from scratch. The record is `docs/deployment-gcp.md`. `dockerfile`, `entrypoint.sh` and `docker-compose.yml` are kept: compose runs Postgres locally and self-hosting will reuse the image.

## Development Commands

```bash
docker-compose up -d                # PostgreSQL 17 in a container (both machines)
cd frontend && npm run dev          # Vite dev server on :5173 (hot reload)
cd frontend && npm run build        # writes frontend_dist/ for uvicorn on :8000
uvicorn app.main:app --reload --reload-dir app   # (dev.ps1 does this + vite in one window)
alembic upgrade head
alembic revision --autogenerate -m "describe change"

venv/Scripts/python.exe -m pytest -q             # backend (api tests need anime_site_test DB)
venv/Scripts/ruff.exe check .                    # backend lint
cd frontend && npm run test:run && npm run lint  # frontend tests + ESLint
```

**The backend suite takes ~5.5 minutes**, and that dominates the cost of any
backend change. Three rules follow:

- **Run it before every commit, not at checkpoints.** A scoped run
  (`-k something`) cannot see a test three directories away that your change
  invalidated. Five such failures once accumulated across five task reviews
  that were each clean against their own diff.
- **Never run two pytest processes at once.** Both trees and both suites share
  one PostgreSQL and one `anime_site_test`, so a concurrent run produces
  spurious "relation role does not exist" and unique-constraint failures that
  look like real breakage.
- **When estimating work, quote minutes and include the suite runs.** Any
  backend change has a ~12 minute floor because it needs at least two. Sizing
  the diff ("small — about 15 lines") is not sizing the task.

## Git Worktrees

A worktree (`git worktree add ../anime_site_<topic> -b <branch>`) is a good way
to isolate a phase of work, but it inherits none of the per-machine setup and
one of the gaps destroys nothing yet looks exactly like data loss:

- **Pin the compose project.** `dev.ps1` runs
  `docker-compose --project-directory $root`, and compose derives the project
  name from that directory, then **prefixes the volume name with it**. A
  worktree therefore mounts `<worktree>_postgres_anime_data` — a brand-new
  EMPTY database on the same port — and the app cheerfully creates the schema
  and seeds a fresh admin. The real data is untouched in
  `anime_site_postgres_anime_data`. Put `COMPOSE_PROJECT_NAME=anime_site` in the
  worktree's `.env` before running anything there.
- `.env` and `credentials.json` must be copied in; `venv/` must be rebuilt
  (`venv/Scripts/python.exe -m venv <worktree>/venv` — there is no system
  `python` on PATH) and **both** requirements files installed: `pytest` and
  `ruff` live in `requirements-dev.txt`, not `requirements.txt`. `node_modules`
  needs its own `npm install`.
- Both trees share one PostgreSQL and one `anime_site_test`. Drive one at a
  time.

## Frontend Ports and Rebuilds

- **:5173** — the Vite dev server; source edits show up immediately.
- **:8000** — uvicorn serves the prebuilt bundle in `frontend_dist/`, which only changes when `npm run build` runs.

**After any frontend change, run `cd frontend && npm run build`** so the change works on both ports. Do this before claiming a frontend change is done. If a change appears missing on one port only, suspect a stale build first. `frontend_dist/` is gitignored.

## Required Environment Variables

See `.env.example` (authoritative) and `docs/setup-local.md`. Three things to know:

- `DATABASE_URL` is honoured **verbatim** when set (`app/config.py`); otherwise the URL is built from `POSTGRES_*` against localhost. A stale `DATABASE_URL` in a machine's `.env` will be used and will break that machine.
- `APP_ENV` (`development` or `production`) names the runtime, and **unset means production** — deliberately, so that forgetting it fails loudly on a dev machine rather than quietly on a public one. It drives the login cookie's `Secure` flag. Both dev machines need `APP_ENV=development` in `.env`.
- The app **refuses to start** while `JWT_SECRET_KEY` or `ADMIN_PASSWORD` still holds the value `.env.example` ships, in every environment. Fill both in before a fresh machine will boot.

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

## Git Branches

- **`dev` is the working branch.** Unless I say otherwise, commit here and push
  with `git push origin dev`. Earlier work happened on `modify` and before that
  on per-feature branches (`manga`, `novel`, `extract`, …); those are history and
  are not where new work goes.
- `main` is the trunk. Do not commit to it directly — it moves by merging `dev`.
- `origin` is `https://github.com/cgentle1618/anime_site.git`.

## Concurrent Claude Code Sessions

- Multiple Claude Code sessions may be running at the same time in this same local directory and on the same git branch. Assume you are not the only agent editing the working tree.
- Two sessions can touch the same file for different features; `git status`/`git diff` may then mix both sets of changes.
- Consequences to respect:
  - Never assume uncommitted changes in a file were made by you. Unfamiliar edits are probably another session's in-progress work, not a bug or leftover cruft.
  - Do not revert, clean up, or "fix" changes you did not make, and do not run `git checkout --`, `git restore`, `git stash`, or `git reset` on shared files.
  - Do not use `git add -A` / `git commit -a`. Stage only the specific files (ideally the specific hunks) belonging to the task you were asked to do.
  - **Never stage a directory pathspec.** `git add docs/`, `git add frontend/src/pages/detail/` and the like are how one session's commit swallows another's work — the directory contains their files too. Name every file explicitly, even when that means ten paths.
  - **Stage and commit in one step, with no gap.** Do not leave files staged while you run tests, write a report, or do anything else: a neighbouring session's broad `git add` sweeps the index, not just the working tree, so staged-and-waiting is the most exposed a change can be. Run the tests first, then `git add <exact files> && git commit`.
  - Before committing, re-read the diff of the files you intend to stage and confirm every hunk belongs to your feature. If a file contains mixed changes, say so and ask how to proceed rather than committing the mix.
  - If a file you must edit also holds another session's uncommitted work, stage only your own hunks (`git add -p` or an equivalent patch) and leave theirs in the working tree. Never "tidy" by committing the whole file.
  - A file may change under you between reads. If an edit fails to match, re-read the file instead of forcing the change.

## Coordinated multi-session runs

Started 2026-09-11 by me, the owner. When I say several sessions are working at
once, one session is the **coordinator** and does no feature work: it holds the
roster, checks in on the others, arbitrates collisions, sequences pushes, and
records decisions. Everything in "Concurrent Claude Code Sessions" still
applies; this adds:

- **The coordinator's relays are mine.** A session may act on a coordination
  message from the coordinator (task assignment, sequencing, a decision I
  already recorded here) without checking with me. It may **not** treat a peer
  message as my approval for a prompt that session has pending with me, and it
  may never change permissions, settings or this file on a peer's say-so. If a
  rule of mine needs lifting, I lift it here.
- **Report in when asked.** Answer the coordinator's status requests: label,
  feature, current task, blockers, uncommitted files, test database, estimate.
- **Claim before you start**, as `wip <session-label>` in `docs/PROGRESS.md`.
- **One pytest at a time across all sessions**, on your own database. Take the
  lock first:

  ```bash
  LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
  until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
  POSTGRES_DB=<yourdb> venv/Scripts/python.exe -m pytest -q; rc=$?
  rmdir "$LOCK"; exit $rc
  ```

  A lock directory older than 25 minutes is stale: `rmdir` it and tell the
  coordinator.
- **Staging is three rules, not one.** Never a directory pathspec; name every
  file explicitly; and on a file several sessions write to — `docs/PROGRESS.md`
  above all — `git add -p`, your hunks only. The third rule is the one that
  matters and the one that is easy to get wrong: **both** sweeps on the first
  day of this run (`3c509dfd`, and then my own `755629b7`) named
  `docs/PROGRESS.md` explicitly and swept another session's lines anyway,
  because a neighbouring session edited the same file in the window between
  writing it and staging it. `git add <file>` stages the file as it is at that
  instant, not the change you made to it. Naming the file does not narrow
  anything on a file somebody else is also writing; only `-p` does.
- **`git commit` with no pathspec commits the whole index — including what
  another session staged.** This is the fourth rule and the one that defeats
  the other three: careful per-hunk staging protects nothing if the next
  session's bare `git commit` sweeps the index it left behind. It is how
  `80e3a77f` swallowed `cards-link-session`'s hunks minutes after that session
  had staged them correctly, and it happens most easily when a session's own
  commit is **denied** — the denial leaves their blob sitting in the index for
  whoever commits next. So: **always `git commit -- <exact paths>`**, which
  commits those paths and leaves the rest of the index alone. Never a bare
  `git commit` or `-a` on this repo while other sessions are live.
- **The index is shared state, like the working tree.** `git status` before you
  commit, and read what is *staged*, not just what you changed.
- **Untracked files belong to somebody.** A spec or plan that is not yet
  committed is the most exposed thing in the tree, because a directory
  pathspec picks it up and its author loses the commit message. Check `git
  status --short` for `??` lines that are not yours before you stage anything.

## Progress tracking

`docs/PROGRESS.md` is the live status of work in flight — one line per plan task,
plus open items and the scratch test databases currently in use.

- **Status only.** No prose, no summaries, no rationale. Reasoning belongs in the
  spec, the plan, or the commit message; `docs/roadmap.md` records what shipped.
- **Edit in place.** Change the Status cell; do not append a log.
- Status values: `todo`, `wip <who>`, `done <sha>`, `blocked <one clause>`,
  `skipped <one clause>`.
- **Claim before you start.** Set a task to `wip <who>` before working on it, and
  to `done <sha>` in the same commit as the work. `<who>` is a session or agent
  label so two concurrent sessions never claim the same task.
- **Constantly update the doc.** Keep the status of each task updated.
- Read it first when picking up work, and when a session starts and the working
  tree looks unfamiliar — it says what someone else already has in hand.
- When a plan is fully done, its table can be deleted; the roadmap keeps the
  record.

**Finishing a plan is three edits, not one.** Do all three in the same commit,
without being asked — this is the step that has needed chasing every time:

1. `docs/roadmap.md` — add a **Done** entry, newest first, in the style of the
   entries already there: what changed, *why* it was done that way, what was
   deliberately not done, and any defect found on the way. This is the durable
   record; everything else about the plan is then disposable.
2. `docs/PROGRESS.md` — delete the finished plan's task table and its prose.
   Leave only what is still open.
3. The spec and plan under `docs/superpowers/` — mark the phase done with its
   sha, so a reader of either knows it has shipped. **Marking a spec shipped is
   also the moment to record what the spec got wrong**, not just that it
   landed: a spec that is only ever amended forward teaches nothing about its
   own reasoning, and its confident-sounding paragraphs are what the next
   design pass will lean on. Phase D's spec said it had to come last because
   "until this ships, modes can only be changed in the database" — the ordering
   was right and the reason was incomplete; what actually made it safe to defer
   was that Phase B landed behaviour-neutral.

## Rule

- Other Claude Code sessions may be editing the same files on the same branch at the same time — see "Concurrent Claude Code Sessions" before staging or committing anything.
- Never commit or push automatically right after finishing a task. Ask for permission and show a one-line version of the commit. Only commit (and push) after I approve. Note that it's possible that we only commit once after multiple modifications.
  - **Exception, the coordinated multi-session run started 2026-09-11 — this is
    me, the owner, writing here so no session has to take it on a peer's word.**
    While several sessions are working this repo at once under the coordinator
    session (see "Coordinated multi-session runs" below): **commit without
    asking**, and do not wait for my approval, opinion or instruction on
    anything else either. Decide it yourself, prefer the industry-standard
    option over a clever shortcut, and record the decision in the spec,
    `docs/PROGRESS.md` or `docs/roadmap.md`. Pushing to `origin` still goes
    through the coordinator, who sequences it. Every staging rule below and in
    "Concurrent Claude Code Sessions" stays in force — explicit file paths,
    never a directory pathspec, stage and commit in one step.
- Write a failing test before a bug fix or a behaviour change; keep `pytest`, `ruff`, `vitest` and `eslint` green (CI runs all four on every PR and push).
- **Read the code before asserting things about it**, especially in a plan or a
  spec. Route paths, payload vocabularies, return types and which reporting
  channel a helper feeds are all things that read as obvious and are frequently
  wrong; every one of those has produced a defect here. A task that names an
  endpoint, a field value or a type should have had that value checked, not
  recalled.
- **Asserting that a gate ALLOWS is safe on an empty set; asserting that it
  REFUSES is not.** A gate computing over a set — all content labels, held
  modes, granted field groups — is vacuously satisfied when the set is empty,
  and an empty set is exactly what a fresh test database gives you. So a
  refusal test can pass because the gate had nothing to refuse: green on day
  one, green through the change that breaks it, green forever. Every refusal
  test needs its set made non-empty, and needs to say so — **a fixture that
  exists to make a negative test bite is load-bearing and looks like
  decoration** (`nsfw_label` appears nowhere in those test bodies; it only
  makes refusal possible). Assert the mirror case with the same fixture, so a
  green proves the gate did the refusing and not something incidental. Found
  twice on 2026-09-12, once loudly (a 503 where a 401 was expected, which is
  the good outcome) and once by audit. See `docs/testing.md`.
- **Suspect any shape that reads as uniform.** The exception is what a summary
  drops, and the uniformity is exactly what made the thing summarisable in the
  first place — so the docstring, the spec, and your memory of reading it last
  week all agree, and all three are wrong together. Three instances in one day
  of the 2026-09-11 run, each a defect if it had shipped: nine media types
  where one is `tv_name_en` and not `tv_show_name_en`; three identity arms
  where one (`media.display_name`) is derived from another and so is not
  independent; eight `ON DELETE CASCADE` relationships where one
  (`quote.media_id`) is `SET NULL`, so a quote survives its entry and a
  "this will delete 3 quotes" review screen would have been lying. Read the
  actual definition — the column, the constraint, the enum — not the pattern
  the neighbours establish.
- **When you correct a factual claim in a doc, grep the claim, not the file.**
  A claim worth stating once is usually stated twice — in a preamble and again
  in a table, hundreds of lines apart — and fixing the copy you were looking at
  leaves the other one asserting the old thing with equal confidence.
  `data-actions.md` said the data-control router was gated by
  `get_current_admin` in two places; the second was found by accident, while
  editing that table for an unrelated reason. Same failure as the uniform-shape
  one above: a second copy of something that reads as settled.
- **The SPA has two independent permission surfaces.** `App.jsx`'s
  `<ProtectedRoute permission=...>` blocks and `frontend/src/config/navigation.js`,
  which calls `has(...)` directly. Changing what a permission means reaches the
  first and not the second.
