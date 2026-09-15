# Running this in production

The box is `homelab`, an HP ProDesk 600 G4 Desktop Mini. The checkout lives at
`~/anime_site`, and everything below runs from there.

```bash
docker compose -f docker-compose.prod.yml <command>
```

Deploying is `./deploy/deploy.sh`, which dumps the database before it pulls.
See [What a deploy covers](#what-a-deploy-covers) for the two things it does
not.

The machine itself is [docs/deployment-selfhost.md](../docs/deployment-selfhost.md),
and the reasoning behind this shape is in
[docs/notes/decisions.md](../docs/notes/decisions.md).

**`docker-compose.prod.yml` lives at the repository root, not in this
directory.** Compose takes its project directory from the compose file's own
location and loads `.env` from there, so the same file under `deploy/` would
look for `deploy/.env` and interpolate every `${...}` to an empty string —
while `env_file:` kept working, so the app would still start, with a blank
database password. It does not collide with `docker-compose.yml`, which is the
development file: Compose only picks that name up by default, never this one.

## A deploy happens by itself

**Merging a release pull request to `main` deploys it.** Nobody logs into the
box. A self-hosted GitHub Actions runner lives there and long-polls GitHub
outbound — which is the only shape available, because no service here publishes
a port, the only ingress is an outbound Cloudflare Tunnel, and the box has no
stable address on its hotspot. GitHub cannot reach in, so the box reaches out.

There are two lanes, and which one a merge takes is decided by whether it adds a
file under `alembic/versions/`:

| The merge | What happens |
| --- | --- |
| No new revision | Deploys immediately, unattended. Nothing here can lose data — the database is never modified. |
| Adds a revision | **Waits for your approval** in the `production` GitHub Environment, then deploys. |

The gate exists because a migration is the only class of change that can destroy
data, and because `alembic downgrade` is not a restore: reversing a dropped
column recreates it empty. Approving is one tap; the alternative is a schema
change reaching production while you are asleep.

If the deploy fails, [the ladder](#when-an-automatic-deploy-fails) below runs.

### Running it by hand

Still supported, still correct, and still what you do when the runner is down:

```bash
cd ~/anime_site && ./deploy/deploy.sh
```

**The code has to be on `main` first.** `deploy.sh` pulls whichever branch is
checked out and never names one; the box is on `main`, so work reaches it only
after a release pull request promotes `dev`. Merging to `dev` deploys nothing.
The automatic path passes `--ci`, which additionally **refuses to run unless the
checkout is on `main`** — the by-hand path trusts you to look.

**Do not `git pull` or `git checkout` first.** `deploy.sh` records
`git rev-parse HEAD` beside the dump *after* taking it, as the revision a
rollback returns to. Moving `HEAD` beforehand makes it record the version you
are moving *to*, which is useless as a rollback target — and the mistake is
invisible until the rollback needs it.

What one run does: dumps the database and refuses to continue if the dump is
empty, records the git revision **and the Alembic revision** beside it, tags the
outgoing image `media-app:previous`, pulls, rebuilds and restarts, waits for
`/api/health`, then prunes to the last five dumps. Migrations apply themselves,
because `entrypoint.sh` runs `alembic upgrade head` on every start. The frontend
rebuilds, because that is the first stage of `dockerfile`.

**Two files travel beside every dump, not one.** `.revision` is the git sha and
`.alembic` is what `alembic_version` held at dump time. They are not
interchangeable: a git sha is not an Alembic revision id, and the rollback's
`alembic downgrade` needs the second. It is read from the database rather than
worked out later from the first, because asking an image for its head answers
what that image *knows* rather than what the schema *was* — and those diverge
exactly when a rollback is happening.

## When an automatic deploy fails

The pipeline climbs a ladder and stops at the first rung that works.

| | Situation | What runs | Where it leaves you |
| --- | --- | --- | --- |
| 1 | The build or the deploy **refused to start** — wrong branch, no `.env`, an unapproved migration | Nothing | Production untouched and still serving the previous release |
| 2 | The deploy **ran** and `/api/health` did not come back | `rollback.sh`: reverse the schema if a migration ran, retag `media-app:previous`, restart, re-check health | Site back up on the previous release. **Schema reversed; data NOT restored** |
| 3 | Tier 2 failed, or the revision declares `irreversible = True` | Nothing further | Frozen, with the dump path, both revisions and this procedure printed |

**Tier 2 never restores data, and its message says so.** It reverses schema, not
content. If the migration dropped a column, that data exists only in the
pre-deploy dump — so a tier 2 message reads *"rolled back; verify your data"*,
never *"all good"*. Restoring automatically would discard every write since the
dump in order to recover from a failure that usually did not touch data at all.
That trade is yours to make, which is what tier 3 is for.

**Nothing in this pipeline ever restores the production database
automatically.** Tier 3 stages the restore and stops; the procedure is
[Disaster recovery from R2](#disaster-recovery-from-r2) below.

`rollback.sh` is a script you can run yourself, and running it is exactly what
the workflow does — no separate automated path. A procedure verified by a
different piece of code is verified by nothing, which is how the rollback
documented here was wrong in a way only executing it revealed.

### A merge that never deploys

The one failure GitHub cannot report. If the runner is offline when you merge,
the job queues silently — no failure appears, the site stays up on the previous
release, and nothing says the new code is not running.

A dead-man's switch on the deploy job cannot cover it: Healthchecks fires when a
ping fails to arrive within an expected period, deploys are irregular so there is
no period to configure, and a job that never started cannot ping. So the check is
daily and watches for **drift** instead — `deploy/backup/drift.sh` compares the
box's `HEAD` against `origin/main` and alerts when they have differed for more
than six hours. That also catches a deploy that failed silently, and a checkout
that has wandered off `main`.

### Two things it does not do

**Systemd units are not reinstalled.** `deploy.sh` touches nothing under
`/etc/systemd/system`. A change to any file in `deploy/backup/units/` — a
schedule, an `After=`, a new job — arrives in the checkout and **does not reach
the running timers**. The live units keep the old definition, nothing errors,
and `systemctl cat media-backup.timer` and the file in the repository quietly
disagree. After any change under `deploy/backup/units/`, or to `install.sh`
itself:

```bash
sudo ./deploy/backup/install.sh
```

It is idempotent: the packages are already present, the units are overwritten,
`daemon-reload` runs, and timers already enabled stay enabled.

**New environment variables do not appear.** `deploy.sh` never writes `.env` or
`.env.backup`. A change that requires a new key needs it added by hand first, or
the job or container fails on the next start — `load_backup_env` refuses by
name, which is the loud case; a variable the application reads through
`settings` may simply be `None`, which is the quiet one.

## The three services

| Service | What it is |
| --- | --- |
| `db` | `postgres:17`, data in the named volume `pgdata` |
| `app` | built from the repository's `dockerfile`; FastAPI plus the built SPA |
| `cloudflared` | the outbound tunnel, and the only way in |

**Nothing is published to the host.** No service has a `ports:` entry, so the
database is not on the LAN and the app cannot be reached except through
Cloudflare. To reach PostgreSQL from a laptop, forward it over SSH:

```bash
ssh -L 5433:localhost:5432 homelab   # then psql -h localhost -p 5433
```

## What is on the box and not in git

| Thing | Where | Why not in git |
| --- | --- | --- |
| `.env` | `~/anime_site/.env` | secrets; already gitignored |
| `.env.backup` | `~/anime_site/.env.backup` | R2 write credentials and the Healthchecks ping URLs; kept out of `.env` so `env_file: .env` cannot hand them to the app |
| rclone remote | `~/.config/rclone/rclone.conf` | R2 access keys |
| Tunnel credentials, CLI copy | `~/.cloudflared/<uuid>.json` | secret; used by `cloudflared tunnel ...` as you |
| Tunnel credentials, container copy | `~/.cloudflared/credentials.json` | secret; mounted read-only, **owned by 65532** - see below |
| `cert.pem` | `~/.cloudflared/cert.pem` | only needed to administer the tunnel |
| Dumps | `~/backups/` | the last five, plus the migration dump |

## `.env`

**Write this by hand. Do not copy a development `.env`.** `DATABASE_URL` is
honoured verbatim by `app/config.py`, so a stale `localhost` value copied from a
dev machine silently breaks the container.

```
APP_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generate>
POSTGRES_DB=anime_site_db
DATABASE_URL=postgresql://postgres:<the same password>@db:5432/anime_site_db
PORT=8000

JWT_SECRET_KEY=<generate; not the development one>
ADMIN_PASSWORD=<generate; not the development one>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

TUNNEL_ID=<from `cloudflared tunnel create`>
CLOUDFLARED_CREDENTIALS=/home/<user>/.cloudflared/<uuid>.json

GOOGLE_SHEET_ID=<the App Database sheet; never the development one>
GOOGLE_CREDENTIALS_JSON=<service account JSON, on one line>

COMPOSE_PROJECT_NAME=media
```

**`COMPOSE_PROJECT_NAME` names the volume**, so it decides which database the
stack sees. Compose otherwise derives it from the directory, and a checkout
moved or cloned under another name would come up on a brand-new empty volume
while the real data sat in the old one — which looks exactly like data loss.
It is `media` here, matching `media.cg1618.com`; the development machines pin
`anime_site` for the same reason and must keep it.

**`CLOUDFLARED_CREDENTIALS` must point at a file that exists before
`cloudflared` first starts.** Docker creates a *directory* at a bind-mount
source that does not exist, and Task 7 then cannot write the credentials file
there. Starting only `db` is safe — that mount is never touched.

Plus the third-party API keys, which are account credentials rather than
per-environment secrets and are reused from a dev machine: `TMDB_API_KEY`,
`OMDB_API_KEY`, `COMICVINE_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`,
`STEAM_API_KEY`, `STEAM_ID`.

Generate a secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**`ADMIN_PASSWORD` is not what protects this box today.** `app/main.py` seeds
the admin account only when it is absent, and the account arrived with the
restored dump. The password in use is the one set by the rotation step of the
deployment plan; `ADMIN_PASSWORD` is what would apply to a rebuilt-empty
database.

**`GOOGLE_SHEET_ID` decides which spreadsheet Backup overwrites, and Backup
overwrites every tab.** Production's sheet is named **App Database**. The
development sheet's id must never appear in this file, and production never runs
Pull All.

## Rollback

**This is the full manual procedure, including the data restore.** An automatic
deploy failure runs `./deploy/rollback.sh` instead, which does tiers 1 and 2 of
[the ladder](#when-an-automatic-deploy-fails) — code and schema — and
deliberately stops short of step 2 below. Come here when the ladder froze at tier
3, or when you are rolling back by hand.

Three steps, in this order. **Restoring the data without reverting the code does
not work**: the next start runs `alembic upgrade head` and re-applies the
migration that caused the problem.

1. **Revert the code** to the revision the dump belongs to:

   ```bash
   cd ~/anime_site
   git checkout "$(cat ~/backups/pre-deploy-<stamp>.dump.revision)"
   ```

2. **Restore the data:**

   ```bash
   docker compose -f docker-compose.prod.yml up -d db
   docker compose -f docker-compose.prod.yml exec -T db \
     pg_restore -U postgres -d anime_site_db --clean --if-exists --no-owner \
     < ~/backups/pre-deploy-<stamp>.dump
   ```

3. **Rebuild and start — `--build` is not optional:**

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   **Without `--build` the rollback does not roll anything back.** `git
   checkout` reverts the source on disk, but the application code the container
   runs is baked into `media-app:local`, and plain `up -d` happily reuses that
   image. You get old data running under new code — which is the exact failure
   the warning above describes, arrived at by following the procedure meant to
   avoid it.

   It fails silently: the site stays up, the row counts look right, nothing
   complains. On a rollback that mattered, `alembic upgrade head` would then
   re-apply the migration being escaped.

   **Verify it took**, because "the site is up" proves nothing about which code
   is serving. Compare a file that differs between the two revisions on disk
   and inside the container:

   ```bash
   stat -c %a deploy/deploy.sh
   docker compose -f docker-compose.prod.yml exec -T app stat -c %a /app/deploy/deploy.sh
   ```

   They must agree. If the container still shows the newer value, the rebuild
   did not happen.

**The fast path, when rolling back exactly one deploy:** `deploy.sh` tags the
outgoing image before it builds, so the previous one is still there and no
rebuild is needed:

```bash
docker tag media-app:previous media-app:local
docker compose -f docker-compose.prod.yml up -d
```

`media-app:previous` is a **single slot**, overwritten by every deploy. Rolling
back two deploys means it is the wrong image, and only `--build` is correct.
If only the code is bad and no migration ran, step 2 is unnecessary either
way.

## Disaster recovery from R2

**This is a different operation from rollback.** Rollback reverses a bad
deploy using a local dump that still exists on the box's own disk. This
rebuilds the box from copies that were never on it — the disk itself, or the
dumps in `~/backups/` alongside it, is gone or untrusted.

**Walked end to end**, against a scratch stack on the box: dump fetched from
R2, restored with the script below, application started against the restored
database and served real rows. What it has not been run against is an actual
loss, where the box itself is gone and `.env` is being retyped from a password
manager. Steps 1 and 8 are the parts that rehearsal cannot exercise.

To rehearse it again without touching production, see
[Rehearsing it](#rehearsing-it) below.

1. Get the two files this needs onto the box being recovered onto:

   - `~/.config/rclone/rclone.conf` with the `[r2]` remote (see
     [docs/setup-selfhost.md](../docs/setup-selfhost.md)), plus `rclone`
     itself — this is what reaches the dumps at all.
   - `~/anime_site/.env`, written by hand per [`.env`](#env) above.
     `restore.sh` reads `POSTGRES_USER` and `POSTGRES_DB` from it, and the
     stack cannot start without it.

   **`.env.backup` is not needed for a restore.** `restore.sh` loads only
   `.env`; the R2 credentials for *this* procedure live in `rclone.conf`.
   Recreate `.env.backup` afterwards, when the scheduled jobs are put back —
   they will not run without it, and `install.sh` refuses to run without it.
2. Pick a dump:

   ```bash
   rclone lsf r2:<bucket>/db/daily
   ```

3. Bring it down:

   ```bash
   rclone copyto r2:<bucket>/db/daily/<name>.dump /tmp/<name>.dump
   ```

4. Stop the app so `create_all` at import cannot collide with the restore:

   ```bash
   docker compose -f docker-compose.prod.yml stop app
   ```

5. Restore with the same script the weekly drill runs, not a hand-typed
   `pg_restore`:

   ```bash
   deploy/backup/restore.sh --dump /tmp/<name>.dump --into production --confirm
   ```

6. Bring the images back:

   ```bash
   rclone copy r2:<bucket>/covers static/covers
   rclone copy r2:<bucket>/library static/library
   ```

7. Start everything:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

8. **Rotate both passwords afterwards**, the same as the [`.env`](#env) restore
   notes above require — the restored dump carries whatever credentials were
   live when it was taken.

### What the walk-through turned up

- **Step 4 stops `app` only.** `db` must stay up — it is what `restore.sh`
  executes `pg_restore` inside. Stopping the whole stack leaves nothing to
  restore into.
- **The guard prints what it is about to destroy before it acts**, as row
  counts. On a real recovery that line is how you confirm the target is the
  database you meant. Against an empty scratch database it printed `(0 rows)`,
  which is the shape to expect when recovering onto a fresh box.
- **`/api/system/health` answers 200.** It does not exist — the catch-all route
  serves the SPA for any unmatched path, which is also why no service in
  `docker-compose.prod.yml` has an app healthcheck. Do not use an HTTP 200 on an
  arbitrary path as evidence the application came up. Check `Content-Type`:
  the real API answers `application/json`, the catch-all answers `text/html`.
- **`/openapi.json` is the honest liveness check.** It is served by FastAPI
  itself rather than the catch-all, so a route count coming back proves the
  application loaded rather than that a file was served.

### Rehearsing it

The whole procedure can be run against a scratch stack that is incapable of
touching production, because `lib.sh` honours `REPO_DIR`. Point it at a
directory holding its own compose file and `.env`:

```bash
mkdir -p ~/rehearsal/static/covers ~/rehearsal/static/library
cd ~/rehearsal
cp ~/anime_site/docker-compose.prod.yml ~/anime_site/.env .
sed -i 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=rehearsal/' .env
```

Then edit the copied compose file to **remove the `cloudflared` service** — a
second tunnel would serve `media.cg1618.com` from the scratch stack — and bind
the app to loopback, `127.0.0.1:8001:8000`, so nothing reaches the LAN.

**Verify the project name before creating or destroying anything.** The project
decides which volume Compose uses, so a wrong one aims `down -v` at production's
data:

```bash
docker compose -f docker-compose.prod.yml config --format json   | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])'   # must print: rehearsal
```

Bring up `db` alone, then run the ordinary steps 2, 3 and 5 above with
`REPO_DIR=$HOME/rehearsal` in front of `restore.sh`. Tear down with
`docker compose -f docker-compose.prod.yml down -v` after re-checking the
project name.

Restoring `covers/` is worth skipping in a rehearsal — it is 283 MB over a
metered connection and uses the same `rclone copy` the weekly sync already
proves. `library/` is worth restoring every time: it is small, and it is the
one store nothing can re-fetch.

## What this does not protect against

A migration that is wrong in a way nobody notices for a week. By then every
deploy dump either predates the damage uselessly or postdates it. That is what
the nightly off-box backup — see [Backups](../docs/deployment-selfhost.md#backups)
— is for.

## The tunnel's two credential files

`cloudflared tunnel create` writes one file, named after the tunnel's uuid and
owned by you at mode 600. **The container cannot read it.** Cloudflare's image
runs as the `nonroot` user `65532:65532`, so a 600 file owned by uid 1000 is a
permission error, and `cloudflared` crash-loops with:

    couldn't read tunnel credentials from /etc/cloudflared/credentials.json:
    open /etc/cloudflared/credentials.json: permission denied

So there are two copies of the same secret, each owned by its consumer and each
still mode 600:

    ~/.cloudflared/<uuid>.json      owned by you    - the CLI uses this
    ~/.cloudflared/credentials.json owned by 65532  - the container mounts this

Made with:

```bash
cp ~/.cloudflared/<uuid>.json ~/.cloudflared/credentials.json
sudo chown 65532:65532 ~/.cloudflared/credentials.json
chmod 600 ~/.cloudflared/credentials.json
```

**Rejected: `chmod 644`.** It works, and it makes a tunnel credential readable
by every user on the box - a secret Cloudflare's own output tells you to keep.
**Rejected: `user: "1000:1000"` on the service.** It also works, and it bakes a
host-specific uid into a committed compose file.

If a future image changes that uid, this is the cause: the symptom is
`permission denied` on a file that plainly exists.

## Setting up the automatic deploy

One-time, on the box. Until all of this is done, `deploy.yml` has no runner to
pick up its jobs and merges to `main` queue silently — which is exactly what
`media-drift` alerts on, so expect that alert if the runner is ever removed.

**The repository must stay private.** GitHub warns against self-hosted runners
on public repositories, and the reason is specific: a fork's pull request would
become code execution on this machine.

1. **Register the runner.** GitHub → repository → Settings → Actions → Runners →
   New self-hosted runner (Linux x64) gives a download and a token. Install into
   `~/actions-runner`, and when `config.sh` asks for labels, add **`homelab`** —
   `deploy.yml` targets `[self-hosted, homelab]`.

   ```bash
   cd ~/actions-runner
   ./config.sh --url https://github.com/cgentle1618/anime_site --token <token>
   sudo ./svc.sh install "$USER"   # run as you, not root: it needs your docker group and ~/anime_site
   sudo ./svc.sh start
   ```

   Installing it as a service is what makes it survive a reboot. A runner
   started in a shell dies with the SSH session, and the failure is silent.

2. **Create the `production` environment.** Settings → Environments → New
   environment, named exactly `production`, with **Required reviewers** set to
   yourself. This is the migration gate: `deploy.yml`'s `deploy-migration` job
   names this environment, and without the reviewer the gate exists in name
   only and schema changes deploy unattended.

3. **Add the fifth Healthchecks check.** Name it `media-drift`, period 1 day,
   grace 6 hours. Put its ping URL in `~/anime_site/.env.backup` as
   `HC_DRIFT_URL=...`, then install the new timer:

   ```bash
   sudo ./deploy/backup/install.sh
   sudo systemctl start media-drift.service   # enabling a timer does not run it
   ```

   `drift.sh` refuses to start when `HC_DRIFT_URL` is missing, rather than
   running and reporting nowhere.

4. **Rehearse it, twice.** Merging a working change proves only the happy path.

   - A deliberately broken **commit** — the app fails to start — should deploy,
     fail health, roll back to `media-app:previous`, and come back up.
   - A deliberately broken **migration**. This one is not optional and not
     interchangeable with the first: a deploy that adds no revision leaves the
     image's head and the database's `alembic_version` in agreement, so it
     exercises tier 2's mechanism while never asking the question tier 2 exists
     to answer. Only a deploy that *adds* a revision tests whether the right
     downgrade target was chosen.

   Write whatever the rehearsal turns up into this file **as it actually ran**.
   The rollback procedure here was wrong once in a way only executing it
   revealed, and the backup work found four defects on this box that were
   invisible from a Windows machine.

## Adding another project's hostname

Three lines in `deploy/cloudflared/config.yml`, above the catch-all, then:

```bash
cloudflared tunnel route dns homelab <hostname>
```

**Before adding `journal`, `health` or `money`**, read the sensitivity section
in [docs/deployment-selfhost.md](../docs/deployment-selfhost.md#sensitivity-not-every-app-should-be-publicly-reachable).
Those hold a different class of data, and the decision about whether they sit
behind Cloudflare Access belongs before the ingress rule exists, not after.
`tests/unit/test_prod_compose.py` fails if one of them is routed, which is
there as the reminder rather than as a policy.
