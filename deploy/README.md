# Running this in production

The box is `homelab`, an HP ProDesk 600 G4 Desktop Mini. The checkout lives at
`~/anime_site`, and everything below runs from there.

```bash
docker compose -f deploy/docker-compose.prod.yml <command>
```

Deploying is `./deploy/deploy.sh`, which dumps the database before it pulls.

The design behind all of this — why the box builds its own image, why the
ingress is in git, why the data arrives by `pg_dump` — is
[docs/superpowers/specs/2026-09-13-production-deployment-design.md](../docs/superpowers/specs/2026-09-13-production-deployment-design.md).
The machine itself is [docs/deployment-selfhost.md](../docs/deployment-selfhost.md).

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
| Tunnel credentials | `~/.cloudflared/<uuid>.json` | secret; mounted read-only |
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

COMPOSE_PROJECT_NAME=anime_site
```

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
   docker compose -f deploy/docker-compose.prod.yml up -d db
   docker compose -f deploy/docker-compose.prod.yml exec -T db \
     pg_restore -U postgres -d anime_site_db --clean --if-exists --no-owner \
     < ~/backups/pre-deploy-<stamp>.dump
   ```

3. **Start:**

   ```bash
   docker compose -f deploy/docker-compose.prod.yml up -d
   ```

**If only the code is bad and no migration ran**, step 2 is unnecessary and the
previous image avoids a rebuild:

```bash
docker tag anime-site-app:previous anime-site-app:local
docker compose -f deploy/docker-compose.prod.yml up -d
```

## What this does not protect against

A migration that is wrong in a way nobody notices for a week. By then every
deploy dump either predates the damage uselessly or postdates it. That is what
the nightly off-box backup — build-order step 7 in
[docs/deployment-selfhost.md](../docs/deployment-selfhost.md#build-order) — is
for, and it is the argument for doing that step early rather than last.

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
