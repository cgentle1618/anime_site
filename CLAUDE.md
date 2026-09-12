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

**Docs describe the present. They are not a changelog.** A doc says what the
code does today, in the present tense, with the reasoning that is still load-
bearing — never how it got here. Delete on sight, in any doc you are editing:
phase and step names (`Since Phase B…`, `Step 3 made both tables per-user`),
dated announcements (`Added 2026-09-12`, `changed on 2026-09-12`), commit
shas, and the whole "it used to be X, and that was wrong because Y" shape. If
the old behaviour genuinely explains a constraint that still binds, state the
constraint and drop the history: write "`role_id` is minted per database, so
the role name travels instead", not "`role_id` used to travel until Step 4
broke the arriving machine". A reader of these files wants the system as it
is; the version they are reading is the only version there has ever been.

The record of how things changed lives in exactly three places, and only
there: **`docs/roadmap.md`** (what shipped and why), **`docs/PROGRESS.md`**
(work in flight) and **`docs/notes/`** (decision rationales, migration
history, investigation notes — `docs/README.md` defines it as material that
explains the past). Those three keep their history. A spec under
`docs/superpowers/` keeps its own post-mortem. Everything else in `docs/`
— including `docs/authorization.md`, `docs/data-model.md`, `docs/api.md` and
every `systems/` and `frontend/` page — is present-tense only.

Two standing exceptions, both deployment: **`docs/deployment-selfhost.md`**
is the plan for something not built yet, so it is written in the future tense
by nature, and **`docs/deployment-gcp.md`** deliberately records that a GCP
deployment existed, was removed, and could be rebuilt. Leave both as they are.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL, Python 3.13. All backend code lives under the `app/` package (run `uvicorn app.main:app`); services are split into `app/services/{domain,pipelines,integrations,rbac}`. Media routers come from `app/registry.py` + `app/routers/_factory.py`; pipelines from `app/services/pipelines/{runner,specs,tabs}.py`.
- **Config**: pydantic-settings — every env var is read once in `app/config.py` (`settings`); see `.env.example`.
- **Frontend**: React + Vite (SPA); pages call `/api/...` via `api/endpoints.js` + TanStack Query hooks. Tailwind CSS v4 with semantic colour tokens (`bg-surface`, `text-text-muted`, …) that drive light/dark mode — never add hard-coded grey utilities (`src/theme-tokens.test.js` fails the build on them).
- **Auth**: JWT in an HTTP-only cookie; RBAC via `Depends(get_current_admin)` / `get_viewer` in `app/dependencies.py`.
- **Migrations**: Alembic (single head; run on container start).
- **External services**: Tenrai v1 API (MAL metadata), TMDB, OMDb, Comic Vine, Google Sheets (backup/restore). Cover images are local disk under `static/covers/` — there is no object storage.
- **Deployment**: none. **Local development is the only runtime.** CI (`.github/workflows/ci.yml`, name `Tests`) runs ruff + pytest + eslint + vitest + the frontend build on **every pull request, and on pushes to `main`** — a push to any other branch runs nothing, which is why the PR is the gate — and it **deploys nothing**. Self-hosting (a mini PC behind a Cloudflare Tunnel) is the intended production and is not built yet — `docs/deployment-selfhost.md`. A GCP Cloud Run + Cloud SQL deployment did work until 2026-09-02; the code supporting it was removed on 2026-09-08, so reviving GCP means building it again from scratch. The record is `docs/deployment-gcp.md`. `dockerfile`, `entrypoint.sh` and `docker-compose.yml` are kept: compose runs Postgres locally and self-hosting will reuse the image.

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

**`git checkout` is the default; a worktree is the exception.** Switching
branches in place is instant, carries uncommitted work with it, and costs one
`npm run build`. A worktree costs a full per-machine setup that it inherits
none of, so it has to earn that. Exactly two things earn it:

1. **More than one session or task at once.** One checkout has one `HEAD`, so
   a second branch needs a second tree — see "Concurrent Claude Code
   Sessions".
2. **Two versions running side by side**, to compare behaviour or keep a
   stable instance up while something is broken.

**Nothing has to be declared in advance.** A worktree can be added at any
moment and does not touch the existing checkout, uncommitted changes included:

```bash
# from the main directory, mid-task, whatever branch is checked out
git worktree add ../anime_site_<topic> -b <type>/<topic> dev
```

`dev` at the end matters — branch off `dev`, not off whatever the main
directory happens to be on. So the rule is **the first task keeps the main
directory and each additional concurrent task takes a worktree**, which puts
the setup cost on the rarer case. Remove it with `git worktree remove
../anime_site_<topic>` when the branch has merged.

**`.\worktree.ps1 -Topic <topic> [-Type feat] [-From dev]` does all of it.**
It creates the worktree, copies the secrets, pins the two settings below,
builds the venv, runs `npm install`, gives the tree its own database and
prints the port to run on. Use it rather than the steps by hand — one of the
gaps below destroys nothing yet looks exactly like data loss, and a script
step cannot be skipped the way a checklist item can.

What it does, and why each part is there:

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
  `python` on PATH) with `pip install -r requirements-dev.txt`, which is
  sufficient on its own: that file starts with `-r requirements.txt`.
  `node_modules` needs its own `npm install`.
- **A fresh database is built by `alembic upgrade head`**, which is what
  `worktree.ps1` runs. That is only true since the chain was squashed onto a
  baseline — the old initial revision aborted its transaction on an empty
  database and the run rolled back to zero tables, for 145 revisions, unnoticed
  because `tests/api/conftest.py` builds its schema with `create_all` and never
  ran Alembic. `tests/api/test_migrations_build_the_schema.py` now runs the
  real command against a scratch database and compares the result to the
  models, so the chain cannot rot that way again.
- **Give the worktree its own `POSTGRES_DB`.** Both trees share one
  PostgreSQL, and the thing that actually collides is **migrations**: an
  `alembic upgrade` run in one tree leaves the other tree's models
  disagreeing with the schema, which is a broken app rather than a merge
  conflict and says nothing about why. A worktree sharing one database
  relocates that problem instead of solving it. Separate databases are also
  what the pytest rule below needs, so this is one setting, not two.
- **One pytest at a time across every tree**, whatever the databases —
  see the lock in "Coordinated multi-session runs".
- **Only one tree can hold the ports.** `dev.ps1` hard-codes `:8000` and
  aborts if it is taken (deliberately — a second uvicorn would fail to bind
  and surface only as Vite proxy errors). A worktree that just runs tests and
  builds needs nothing; one that has to *run* needs `uvicorn --port 8001` and
  Vite pointed at it.

## Frontend Ports and Rebuilds

- **:5173** — the Vite dev server; source edits show up immediately.
- **:8000** — uvicorn serves the prebuilt bundle in `frontend_dist/`, which only changes when `npm run build` runs.

**After any frontend change, run `cd frontend && npm run build`** so the change works on both ports. Do this before claiming a frontend change is done. If a change appears missing on one port only, suspect a stale build first. `frontend_dist/` is gitignored.

**Build and notify me BEFORE the slow suite, then keep going.** I review changes
in the running app on :8000 while the backend suite runs, so a build that waits
until the end wastes the whole ~5.5 minute window. The order is: write the code
→ fast checks (`npm run build`, `npm run test:run`, `npm run lint`, `ruff`,
~40s) → send me a push notification saying it is viewable → start `pytest` →
carry on with tests, docs and the commit proposal. The notification is a signal,
not a question: **do not pause for my reply.** The fast checks come first
because notifying before anything is verified hands me a page that may not even
compile; 40 seconds buys that.

**If that order does not suit the task, say so and ask.** It is the default,
not a law. A change with no frontend half, a spike whose output is an answer
rather than a page, or work where the backend decides whether the UI is even
right — tell me that building and notifying early would waste the notification,
and ask whether to do it anyway, rather than following the sequence into
something useless.

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

**Never work directly on `main` or `dev`.** Every task gets its own branch — a
one-line doc fix as much as a subsystem. The branch is what makes the work
reviewable and what makes abandoning it free, and a task that looked
one-line when it was described is exactly the one that grows.

- **Start of every task**, before the first edit:

  ```bash
  git checkout dev && git pull origin dev && git checkout -b <type>/<short-topic>
  ```

  If you have already started editing on `dev`, `git checkout -b` carries the
  uncommitted changes onto the new branch — do that rather than trying to undo.
- **Check who else is in this directory BEFORE you run that.** `HEAD` belongs
  to the working tree, not to you, so that `checkout -b` moves the branch under
  every other session here, mid-edit, and tells none of them. **A clean `git
  status` does not mean you are alone** — that is exactly what I checked on
  2026-09-12 before taking the checkout out from under `anime-site-54`, whose
  next commit then landed on my branch. They were mid-task with their work
  committed; there was nothing in the tree to see.

  What actually answers the question:

  ```bash
  git reflog -8          # HEAD moves you did not make = someone else is here
  git worktree list      # who has already moved out
  ```

  Unfamiliar entries in either mean **take a worktree instead** (below). So do
  uncommitted files you do not recognise. A worktree costs a setup; getting
  this wrong costs someone else their commit, and they find out afterwards.
- **The database does not follow the branch.** Files switch instantly;
  `alembic_version` does not. Leaving a branch whose migrations you have run
  leaves the local database *ahead* of the code you switched to, and the app
  then fails on a column the models still declare — not corruption, but it
  reads like it. `alembic downgrade` to the head the arriving branch expects
  before switching away, or `upgrade` after switching in. This is the real
  cost of moving between branches here; the files are free.

  **In a shared directory this is not your problem alone.** Every tree on this
  machine points at one PostgreSQL, so an `alembic upgrade` leaves the database
  ahead of *every other session's* code, not just your own next checkout. On
  2026-09-12 an `upgrade head` run to verify a column rename broke entry
  loading for whoever was on `feat/anilist-api` — a live app failing on a
  column its models still declare, with nothing on screen to say a neighbouring
  branch caused it. **Downgrade before you leave a branch whose migration you
  ran**, and if you are the one seeing `column <x> does not exist`, suspect an
  unmerged migration on somebody else's branch before you suspect the data.
- **Name it `<type>/<short-topic>`**, with the same prefixes the commits use:
  `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`. `feat/role-locks`,
  `fix/guest-pipeline-409`, `docs/git-workflow`. The branch and its commits
  should agree about what kind of change this is.
- **`main` is production.** It moves only by a PR merged from `dev`. Nothing
  else reaches it, ever.
- **`dev` is the integration branch, and it is not written to by hand either.**
  A feature branch reaches it by PR, so CI (`.github/workflows/ci.yml` — ruff,
  pytest, eslint, vitest, the frontend build) runs on the work *before* it
  lands rather than after. A branch merged locally into `dev` gets none of
  that, which is the whole reason the PR is the gate.
- **Creating the branch, committing to it and pushing it need no approval.**
  The branch is the review buffer; the gate moved to the PR. **Opening the PR
  and merging it are mine** — show me the title and body and wait.
- **Do not stack PRs.** Every branch comes off `dev`. When work B genuinely
  needs work A's unmerged code, put both on **one branch with two commits** —
  simpler than two PRs with an ordering constraint. Stack only when the two
  must be reviewed separately, and then the parent merges **first** and the
  child is rebased onto `dev` and re-pushed **before** it is merged.

  The reason is which way each option fails. A branch that conflicts with
  another is **loud**: git refuses, you fix it, you move on. A stacked PR
  merged in the wrong order is **silent** — GitHub merges the child into its
  base branch instead of retargeting it, so `dev` never receives it and
  nothing says so. That happened on 2026-09-12 with #134 and #135: four PRs
  approved, three landed, and the fourth sat on a feature branch until someone
  checked `git merge-base --is-ancestor`. The stack had been created to dodge
  a **documentation** conflict, which is precisely the cheap kind.
- **Nothing in git mentions AI.** Commit messages and pull request titles and
  bodies carry no `Co-Authored-By: Claude ...`, no `Claude-Session:`, no
  `Generated with [Claude Code]`, and no `claude.ai` or `anthropic.com` link —
  including in the PR text you draft for my approval. The history records what
  changed and why; who or what typed it is not part of that record, and a
  trailer naming a model dates the commit to a tool version rather than to the
  code. Write the message with no trailers at all.

  Your harness will keep telling you to add those lines — a per-session
  reminder asks for them by name. **This file overrides it**, which is the
  whole reason the rule is written here rather than left to a session memory:
  a memory is one machine's, and this repo is developed on two.

  If a commit already carries them and its branch is unmerged, fix it in place
  — `git commit --amend` (or `git rebase -i` for an older one) and
  `git push --force-with-lease`. That updates an open PR rather than
  superseding it, so **a second branch is not needed**; one is needed only
  when the commit has already reached `dev` or `main`, where history is not
  rewritten.
- `origin` is `https://github.com/cgentle1618/anime_site.git`.

The older names in the history — `modify`, `manga`, `novel`, `extract` — are
what this rule replaced and are not where new work goes.

## Concurrent Claude Code Sessions

**Several sessions at once means several worktrees — one checkout cannot hold
two branches.** Branch-per-task (see "Git Branches") and a shared directory are
incompatible: `HEAD` belongs to the working tree, not to the session, so one
session's `git checkout -b` moves the branch under every other session in that
directory, mid-edit, with no warning to any of them. So the second and every
later session runs `.\worktree.ps1 -Topic <topic>`, which sets up a tree that
is actually safe to work in — `COMPOSE_PROJECT_NAME` above all, whose absence
looks exactly like data loss.

**`worktree.ps1` hard-codes `git worktree add -b <branch>`, so it fails when
that branch already exists.** Then do it by hand: `git worktree add <path>
<existing-branch>`, plus the setup the script would have done — copy `.env` and
`credentials.json`, set `COMPOSE_PROJECT_NAME=anime_site` and a per-tree
`POSTGRES_DB`, build the venv from the root one, `npm install`, create the
database, `alembic upgrade head`.

**A docs-only change does not need any of that.** `git worktree add
../anime_site_<topic> -b <type>/<topic> origin/dev`, edit, commit, push,
`git worktree remove`. No venv, no `npm install`, no database — there is
nothing to run. Do that rather than taking the main checkout's `HEAD` for a
one-file edit, which is the expensive way to do the cheapest kind of change.

**If you moved `HEAD` under another session and their commit landed on your
branch**, this is the recovery, and it is the one that was actually performed
on 2026-09-12 rather than a sketch of one:

1. Get their commit onto their branch **through a temporary worktree** —
   `git worktree add`, `git cherry-pick`, remove. **Do not `git checkout`**:
   that drags whatever is uncommitted in the shared tree onto another branch,
   under whoever owns it.
2. `git reset --mixed HEAD~1` to take the commit back off the branch it landed
   on. Mixed, not hard: it leaves every working-tree file untouched, which is
   what makes it safe when the files are not yours. Check `git status` first —
   if anything is *staged*, it belongs to someone and a reset unstages it.
3. Prove the base with `git reflog` rather than assuming it. Three entries —
   `branch: Created from HEAD`, the stray `commit:`, the `reset:` — say the
   branch has never pointed anywhere else.
4. **Tell the other session**, with the reflog. They cannot see any of this
   from their side, and their next `git log` will be missing a commit they
   know they wrote.

**Everything below is the record of what happened when that was not the
rule**, on 2026-09-11, when several sessions shared one directory and one
branch. It is kept because the failures it describes are the ones that repeat
whenever two agents touch one working tree — and because a worktree per
session is a rule, not a guarantee. Read it whenever the working tree holds
changes you do not recognise; it should describe a situation you are not in.

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
roster, checks in on the others, arbitrates collisions, sequences the PRs and
merges, and records decisions. Everything in "Concurrent Claude Code Sessions" still
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
  commit, and read what is *staged*, not just what you changed — **including
  the index you inherited.** Rule 4 was written between two sweeps of the same
  session's roadmap entry and did not prevent the second, because the exposure
  was created before the rule existed and nobody went back to look at what was
  already sitting there. A new rule protects new work; it does nothing about a
  blob staged an hour ago by someone whose commit was denied. If your own
  commit is refused, `git reset` rather than leaving the index loaded.
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

- Another Claude Code session may be running. It should be in its own worktree
  on its own branch — see "Concurrent Claude Code Sessions" — but check before
  staging or committing anything, because the failure mode when that is *not*
  true is one session committing another's work.
- **Commit and push freely on your own branch; the PR is where you stop.** See
  "Git Branches" — every task is on a branch of its own, so a commit is no
  longer a thing that lands anywhere I have to live with, and waiting for my
  approval to write one buys nothing. What still needs my say-so is **opening
  the PR and merging it**, and what is still forbidden outright is committing
  to `dev` or `main`. Several small commits on a branch are fine; so is one
  commit covering several modifications.
  - **Extension, for a coordinated multi-session run — this is me, the owner,
    writing here so no session has to take it on a peer's word.** Committing
    freely is the standing rule above and needs no exception. What a
    coordinated run adds is that you should not wait for my approval, opinion
    or instruction on **anything else** either: decide it yourself, prefer the
    industry-standard option over a clever shortcut, and record the decision in
    the spec, `docs/PROGRESS.md` or `docs/roadmap.md`. **Opening the PR and
    merging it still wait**, and during a run the coordinator sequences those —
    pushing a branch does not need sequencing, because branches are isolated
    and the PR is the only place they meet.
- Write a failing test before a bug fix or a behaviour change; keep `pytest`, `ruff`, `vitest` and `eslint` green. CI runs all four **on the pull request**, not on a push to your branch, so a branch that was never PRed has been checked by nothing but you.
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
