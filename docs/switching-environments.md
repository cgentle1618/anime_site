# Switching between development environments

Last verified: 2026-09-04

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
| Project path | `C:\Users\q601513\Documents\anime_site` | _TODO — record when working there_ |
| OS | Windows 11 Pro (10.0.26200) | _TODO_ |
| PostgreSQL | **docker-compose only** (`postgres:15`, container `anime_site_postgres_db`, `5432:5432`, volume `postgres_anime_data`). No native PostgreSQL service is installed on this machine. | _TODO_ |
| Database | `anime_site_db` as `postgres` on `127.0.0.1:5432` | _TODO_ |
| Python | `venv/Scripts/python.exe` — **3.11.9** (the project targets 3.13; this machine runs 3.11) | _TODO_ |
| Node / npm | v24.18.0 / 11.16.0 | _TODO_ |
| Google Sheet | `GOOGLE_SHEET_ID=1d-rh8joD3xHhG58KdFyBDQ-g99xDfMnHNiBu7ECFemU` — the same sheet on both machines, and the only channel data travels through | same sheet |
| Remote | `origin` → `https://github.com/cgentle1618/anime_site.git` | same |

> The home column is deliberately unfilled. Fill it in from that machine rather
> than from memory, and bump the `Last verified` line when you do.

Since the [GCP deployment went down on 2026-09-02](deployment-gcp.md), there is
no shared server. Each machine has its **own local database**, and they diverge
the moment either one is edited.

---

## 2. What travels, and how

| Thing | Channel | Notes |
|---|---|---|
| Code, migrations, docs, roadmap | git (`origin`) | commit + push before leaving; pull on arrival |
| Database contents | Google Sheets | **Backup** writes local DB → sheet; **Pull All** writes sheet → local DB |
| `.env`, `credentials.json` | **nothing** | per-machine, gitignored; never commit them |
| `venv/`, `node_modules/`, `frontend_dist/` | **nothing** | rebuilt locally on each machine |
| Cover images (GCS) | **nothing** | GCS is unavailable while the GCP deployment is down |

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
2. **Leave a trail for the next session.** Anything half-done goes into the
   relevant `docs/` file or `docs/roadmap.md` — the other machine starts with an
   empty conversation and only sees what is written down.
3. **Back up the database** if you changed any data: admin page `/system` →
   **Backup** (or `POST /api/data-control/backup`). Wait for the success log row;
   a failed write leaves the previous backup intact, so a failure means the sheet
   is still *old* and must not be pulled.
4. **Note in the commit or roadmap that a backup was taken**, so the next
   environment knows the sheet is fresh.

## 4. Arriving in an environment (handoff in)

1. `git pull` on the branch you were working on.
2. Start PostgreSQL for that machine (company: `docker-compose up -d`).
3. Re-install dependencies **if they changed**: `pip install -r requirements.txt`,
   `cd frontend && npm install`.
4. `alembic upgrade head` — always, before any Pull. The sheet's columns follow
   the newest schema, and Pull matches columns by header name.
5. **Pull All** from `/system` if the data changed on the other machine, then
   run **Calculate All** if derivations matter for what you are about to do.
6. `cd frontend && npm run build` before checking anything on `:8000`.
7. Re-read `docs/roadmap.md` and the doc for the area you were in.

## 5. Quick checklist

**Before switching away**

- [ ] committed and pushed (only my files)
- [ ] WIP state written into `docs/` or `docs/roadmap.md`
- [ ] Backup run and succeeded (only if data changed)

**After switching to**

- [ ] `git pull`
- [ ] database up
- [ ] deps installed if `requirements.txt` / `package.json` moved
- [ ] `alembic upgrade head`
- [ ] Pull All (only if data changed elsewhere), then Calculate All if needed
- [ ] `npm run build`
