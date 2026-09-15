# Running this in production

The box is `homelab`, an HP ProDesk 600 G4 Desktop Mini. The checkout lives at
`~/anime_site`, and everything below runs from there.

```bash
docker compose -f docker-compose.prod.yml <command>
```

Deploying is `./deploy/deploy.sh`, which dumps the database before it pulls.

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

**Not yet walked end to end.** The steps below follow the code in
`deploy/backup/restore.sh` and `deploy/backup/lib.sh`, but nobody has run this
specific sequence against a real loss. An untested recovery procedure is a
guess.

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
