# Switching between development environments

Last verified: 2026-09-12

## What this is for

This project is developed on **two machines**: **company** and **home**. Work
often stops halfway on one of them and continues on the other, so both the
**code** and the **database contents** have to be handed over deliberately —
git carries the code, Google Sheets carries the data, and nothing carries the
local secrets.

Read this before you stop work on one machine and before you start work on the
other. Setup of a machine from scratch is [setup-local.md](setup-local.md); the
Backup and Pull actions themselves are [data-actions.md](data-actions.md).

---

## 1. The two environments

| | **Company** | **Home** |
|---|---|---|
| Project path | `C:\Users\q601513\Documents\anime_site` | `C:\Users\cgent\Documents\anime_site` |
| OS | Windows 11 Pro (10.0.26200) | Windows 11 Home (10.0.26200) |
| PostgreSQL | **docker-compose** (`postgres:17`, container `anime_site_postgres_db`, `5432:5432`, volume `postgres_anime_data`), identical on both machines. Start it with `docker-compose up -d`. | **docker-compose**, identical. Native PostgreSQL 17 and 18 are also installed here, with their services set to **Manual** start so they cannot claim 5432 ahead of the container. If the container will not bind the port, check that neither native service has been started by hand. |
| Database | `anime_site_db` as `postgres` on `127.0.0.1:5432` | same — `anime_site_db` as `postgres` on `127.0.0.1:5432` |
| Python | `venv/Scripts/python.exe` — **3.11.9** (the project targets 3.13; this machine runs 3.11) | `venv/Scripts/python.exe` — **3.13.6**, the version the project targets |
| Node / npm | v24.18.0 / 11.16.0 | v24.14.1 / 11.11.0 |
| Google Sheet | `GOOGLE_SHEET_ID=1d-rh8joD3xHhG58KdFyBDQ-g99xDfMnHNiBu7ECFemU` — the same sheet on both machines, and the only channel data travels through | same sheet |
| Remote | `origin` → `https://github.com/cgentle1618/anime_site.git` | same |

> Both columns are recorded from the machine itself. Keep it that way — record
> from the machine rather than from memory, and bump the `Last verified` line.

There is no shared server — local development is the only runtime on either
machine. (A GCP deployment existed once and could be rebuilt; the record is
[deployment-gcp.md](deployment-gcp.md).) Each machine has its **own local
database**, and the two diverge the moment either one is edited.

---

## 2. What travels, and how

| Thing | Channel | Notes |
|---|---|---|
| Code, migrations, docs, roadmap | git (`origin`) | commit + push before leaving; pull on arrival |
| Database contents | Google Sheets | **Backup** writes local DB → sheet; **Pull All** writes sheet → local DB |
| `.env`, `credentials.json` | **nothing** | per-machine, gitignored; never commit them. Deliberately different per machine: **company** sets `STEAM_ENABLED=false` and leaves `STEAM_API_KEY` / `STEAM_ID` unset, because the company network inspects TLS to Steam's hosts and would log the key from the Web API's URL; **home** omits the line entirely (the default is `true`) so prices, Metacritic and playtime all fill. Nothing else about the two files should diverge — see [external-apis.md](external-apis.md#turning-steam-off-entirely) |
| `venv/`, `node_modules/`, `frontend_dist/` | **nothing** | rebuilt locally on each machine |
| Cover images (`static/covers/`) | **nothing** | Local disk is the only cover storage there is, and the folder is gitignored, so each machine holds its own copy (a few hundred MB). They are not in the sheet either. Rebuild them where they are missing with `/system` → Calculate → **download missing covers**, which re-runs the autofills for every row whose file is gone |
| Accounts and everybody's list rows | Google Sheets | the `Users` and `User Media List` tabs. **Passwords do not travel** — an account restored here needs a password set at `/users` before it can be logged into |
| Roles and their grants | **nothing** | `ensure_rbac_seed` recreates guest, user and admin anywhere; a role added or a grant removed by hand is per-machine. Content *labels* do travel — see [data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy) |

### The one hard rule

**Google Sheets holds exactly one version of the data.** Backup overwrites every
tab; Pull All overwrites every table. So:

- Back up **from** the machine whose database is newer, *before* touching the
  other machine's database.
- Never run Pull All on a machine that holds unsaved data changes — it replaces
  them with the sheet.
- If both databases were edited since the last backup, stop and reconcile by
  hand. There is no merge.

---

## 3. Leaving an environment (handoff out)

1. **Finish or park the code.** Stage only the files belonging to your task (see
   the concurrent-sessions rule in `CLAUDE.md`), commit, and push the branch.
2. **Leave a trail for the next session, starting with the branch name.**
   Anything half-done goes into the relevant `docs/` file or
   `docs/roadmap.md` — the other machine starts with an empty conversation and
   only sees what is written down, and now that every task has its own branch,
   *which branch* is the first thing it cannot guess.
3. **Back up the database** if you changed any data: admin page `/system` →
   **Backup** (or `POST /api/data-control/backup`). Wait for the success log row;
   a failed write leaves the previous backup intact, so a failure means the sheet
   is still *old* and must not be pulled.
4. **Note in the commit or roadmap that a backup was taken**, so the next
   environment knows the sheet is fresh.

## 4. Arriving in an environment (handoff in)

> ### One-time on the company machine: the Postgres 15 -> 17 volume
>
> `docker-compose.yml` pins `postgres:17`. **A `postgres:17` container refuses
> to start on a `postgres_anime_data` volume holding an older data directory**
> — the log says *"database files are incompatible with server"* and the
> container exits. The volume has to be recreated once, which means the
> database in it is destroyed, so take the data out first:
>
> 1. On the machine with the newer data, run **Backup**.
> 2. `docker-compose down -v` — this **deletes** the local database volume.
> 3. `docker-compose up -d`, then `alembic upgrade head`.
> 4. **Pull All** from `/system` to refill from the sheet, then **Calculate All**.
>
> To avoid the sheet, dump first instead: with the image temporarily set back
> to the older major version, run `pg_dump -U postgres -h 127.0.0.1
> anime_site_db -f dump.sql`, then do steps 2-3 and `psql -U postgres -h
> 127.0.0.1 -d anime_site_db -f dump.sql` in place of the Pull.


1. `git fetch origin`, then `git checkout <branch>` — the branch you left work
   on exists only on `origin` and on the other machine, so a plain `git pull`
   on whatever this machine last had checked out silently leaves you on the
   wrong branch with the right-looking history. Every task has its own branch
   (`CLAUDE.md`, "Git Branches"), so the branch name is part of the handover:
   write it down before leaving.
2. Start PostgreSQL: `docker-compose up -d`.
   **Check that `DATABASE_URL` is commented out in this machine's `.env`.**
   `app/config.py` uses `DATABASE_URL` verbatim whenever it is set, so a
   leftover line wins over the `POSTGRES_*` parts and the app dies with
   `password authentication failed`. `venv\Scripts\python.exe -c "from
   app.config import settings; print(settings.sqlalchemy_database_url)"`
   prints the URL actually in use.
3. Re-install dependencies **if they changed**: `pip install -r requirements.txt`,
   `cd frontend && npm install`.
4. `alembic upgrade head` — always, before any Pull. The sheet's columns follow
   the newest schema, and Pull matches columns by header name.
5. **Pull All** from `/system` if the data changed on the other machine, then
   run **Calculate All** if derivations matter for what you are about to do.

   > **Passwords do not travel.** The `Users` tab carries who exists and what
   > role they hold, and the `User Media List` tab carries
   > everybody's statuses, ratings and progress - but **not** the password
   > hash. It is credential material, and the sheet leaves this database's
   > trust boundary on every Backup. An account Pull created on this machine
   > cannot be logged into until an admin sets a password on it at `/users`.
   > Your own admin account is unaffected: Pull matches by `username` and
   > never overwrites an existing account's password.
   >
   > Check the `Pull All` row in the admin log afterwards. A red row saying
   > *"completed with N unresolved reference(s)"* means those rows did **not**
   > restore - a role, a username or an entry the sheet named that this
   > database does not have. See
   > [data-actions.md](data-actions.md#32-pull-all--execute_pull_alldb-action_type).
6. If `static/covers/` still holds loose `<uuid>.jpg` files rather than
   owner-typed folders, run
   `venv/Scripts/python.exe -m scripts.migrate_cover_layout` and then the same
   with `--apply`. `static/covers/` is gitignored, so each machine holds its own
   copy of the images and each has to be moved once; the column values arrive
   already migrated through Pull All, so the script only moves files here.
7. `cd frontend && npm run build` before checking anything on `:8000`.
8. Re-read `docs/roadmap.md` and the doc for the area you were in.

## 5. Quick checklist

**Before switching away**

- [ ] committed and pushed (only my files) on the task branch
- [ ] WIP state written into `docs/` or `docs/roadmap.md`, **branch name first**
- [ ] Backup run and succeeded (only if data changed)

**After switching to**

- [ ] `git fetch origin` and `git checkout <branch>` — not a bare `git pull`
- [ ] database up, and `DATABASE_URL` commented out in `.env`
- [ ] deps installed if `requirements.txt` / `package.json` moved
- [ ] `alembic upgrade head`
- [ ] Pull All (only if data changed elsewhere), then Calculate All if needed
- [ ] admin log checked: the `Pull All` row names no unresolved references
- [ ] a password set at `/users` for any account Pull restored here
- [ ] `scripts/migrate_cover_layout.py --apply` if the covers are still flat here
- [ ] `npm run build`
