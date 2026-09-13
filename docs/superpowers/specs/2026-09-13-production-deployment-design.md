# Production deployment — design

Last verified: 2026-09-13
Status: **DESIGNED, NOT BUILT.** Approved by the owner in four sections
(compose topology, data load, tunnel, self-healing) on 2026-09-13. Branch
`feat/production-deployment`. Covers build-order steps 4, 5 and 6 of
[deployment-selfhost.md](../../deployment-selfhost.md#build-order).

## The problem

The application has never run anywhere but a development machine. A GCP
deployment existed until 2026-09-02 and its code was removed on 2026-09-08, so
there is no production configuration in the repository at all: no production
compose file, no ingress, no secrets story, and no way to get the data onto a
server.

The target is now a specific machine. `homelab` — an HP ProDesk 600 G4 Desktop
Mini running Ubuntu 26.04.1 LTS with Docker 29.8.0 — was brought up on
2026-09-13 and does nothing yet. This design is what turns it into the thing
that serves `media.cg1618.com`.

## What this is not

- **Not a CI/CD pipeline.** The box builds its own image from a git checkout.
  Moving to a registry is deliberately left as a later, cheap change — see
  Decision 1.
- **Not a backup system.** Build-order step 7 covers nightly `pg_dump` and the
  off-box copy. This design produces one dump, as a migration artifact.
- **Not a monitoring setup.** No metrics, no alerting, and deliberately no app
  healthcheck — see Decision 6.
- **Not multi-app.** Six more hostnames are planned; this routes one. The
  ingress file is structured so the others are additive.

## The shape

Three services in one Compose project, from a git checkout at `~/anime_site` on
the box, defined in `deploy/docker-compose.prod.yml`:

| Service | Image | Role |
| --- | --- | --- |
| `db` | `postgres:17` | named volume, no published port |
| `app` | built from `./dockerfile`, tagged `anime-site-app:local` | FastAPI + the built SPA |
| `cloudflared` | `cloudflare/cloudflared:latest` | outbound tunnel, the only ingress |

**Nothing is published to the host.** The app has no port mapping and neither
does the database. The only route in is the tunnel, so there is no open port to
misconfigure. `psql` from a laptop goes over an SSH tunnel.

`entrypoint.sh` is unchanged: it already runs `alembic upgrade head` and then
uvicorn with `--proxy-headers --forwarded-allow-ips='*'`, which is correct
behind Cloudflare. Migrations therefore run on every `up`.

`static/covers/` and `static/library/` are **bind mounts into the checkout**,
not named volumes, so `rsync` and the future backup see ordinary files.

A second compose file at the repository root would collide with the development
one, which exists only to run Postgres. Hence `deploy/`.

## Decisions

### 1. The box builds its own image

`git clone` (the repository is public, so no deploy key) and
`docker compose up -d --build`. Deploying an update is `git pull` and the same
command.

**Rejected: build on a dev machine and `docker save | ssh docker load`.** It
pushes roughly a gigabyte per deploy over the box's worst link and leaves the
box unable to rebuild itself.

**Deferred: build in CI, push to GHCR, pull on the box.** This is the
conventional answer and it stays available. Three constraints keep the switch
to roughly a two-line change, and they are requirements of this design rather
than accidents:

- no environment-specific values baked into the image — everything
  configurable arrives as `environment:` from `.env`;
- no build args, so nothing host-specific is needed to produce the image;
- the app service carries an explicit `image:` name alongside `build:`, so
  switching means changing what that name points at.

It is deferred because CI would then build a multi-stage image — `npm ci`, Vite,
pip wheels — on every merge, slowing every pull request to serve a box that one
person deploys by hand.

### 2. A locally-managed tunnel, with the ingress in git

`cloudflared tunnel create` produces a credentials JSON that stays off git. The
routing lives in a committed `deploy/cloudflared/config.yml`.

**Rejected: a remotely-managed tunnel with a dashboard token.** Simpler to set
up, and it is what Cloudflare's own documentation recommends. Rejected because
the ingress map is a security-relevant decision with written reasoning —
[deployment-selfhost.md](../../deployment-selfhost.md#sensitivity-not-every-app-should-be-publicly-reachable)
already records which of the seven planned projects should be publicly
reachable and why. In a dashboard, that decision is separated from its
reasoning; in git, the diff carries both.

The tunnel UUID is written into the committed config. It is a DNS target, not a
secret. The credentials JSON is the secret, and its path comes from `.env` as
`CLOUDFLARED_CREDENTIALS` so the committed compose file stays host-agnostic.

`cloudflared tunnel login` needs a browser, which the box does not have. The
login runs on a dev machine and the resulting `cert.pem` is copied across once.

### 3. Data arrives by `pg_dump`, not through Google Sheets

Both ends are `postgres:17`, so a custom-format dump restores exactly.

**Rejected: Pull All from the development sheet.** The Sheets pipeline is built
for moving data between the two dev machines, and it is lossy by design where
that is safe: it re-resolves database-local identifiers (`option_id` becomes a
`(category, value)` pair — see `app/services/pipelines/tabs.py`) and it *skips*
authorization tabs for anyone without `admin.authz`. A dump has none of those
seams. More importantly, `CLAUDE.md` states that the sheet holds exactly one
version of the data; making production a third participant turns a two-way
handover into a three-way sync with no merge.

### 4. Production gets its own Google Sheet, and never reads the dev one

`get_google_sheet_tab` creates a tab when it does not find one
(`app/services/integrations/sheets.py:199`), so a **new empty spreadsheet**
works: production's first Backup builds every tab itself. The service account
needs Editor access on it.

Production therefore never runs Pull All, and is never configured with the dev
sheet's id. That matters because Backup overwrites every tab: the configuration
where production knows the dev sheet's id is the one that could later destroy
dev's backup, so it should not exist.

**The hazard this creates** is that `GOOGLE_SHEET_ID` now decides which sheet
gets overwritten, silently. Both ids and which is which belong in the docs, and
the production `.env` is written by hand rather than copied from a dev machine.

### 5. Restore before the app ever starts, then rotate the passwords

`app/main.py` calls `models.Base.metadata.create_all(bind=engine)` at import.
An app container started against an empty database creates every table, and
`pg_restore` then collides with tables that already exist. So the order is
`docker compose up -d db`, restore, and only then `docker compose up -d`.

A correct restore also makes `alembic upgrade head` a no-op, because the dump
carries `alembic_version`. If the first start *runs* migrations, the restore
did not work.

**The dump carries both users with their development password hashes**, and
`app/main.py:142` seeds the admin account only `if not admin_user`. Production's
`ADMIN_PASSWORD` is therefore never consulted, and the box would run on
development credentials while appearing to have been given fresh ones. After the
restore, both `admin` and `cg1618` have their hashes rewritten with
`get_password_hash` from `app/services/security.py`. `ADMIN_PASSWORD` stays in
`.env` as the value that would apply to a rebuilt-empty database.

`JWT_SECRET_KEY` differs from development deliberately. The only effect is that
cookies issued by a dev instance are not valid against production.

### 6. `restart: unless-stopped`, a database healthcheck, and no app healthcheck

The box runs on a phone hotspot that comes and goes, so recovery without a human
is a requirement rather than a nicety. The chain: BIOS `After Power Loss → Power
On`, `docker` enabled at boot, `wpa_supplicant` reassociating,
`restart: unless-stopped` on every service, and `cloudflared` retrying its
outbound connection indefinitely.

`unless-stopped` rather than `always`, so a deliberate `docker compose stop`
survives a daemon restart.

`db` gets a `pg_isready` healthcheck and `app` waits on
`condition: service_healthy`. Without it, a boot where Postgres is slower than
the app makes the app crash-loop through `alembic upgrade head` until it wins.

**`app` gets no healthcheck.** There is no health endpoint, and the catch-all
route at `app/main.py:263` returns the SPA for any path — so a check against `/`
would pass with the database completely down. A healthcheck that lies is worse
than none. A real `/healthz` belongs with monitoring, which this design does not
cover.

## Verification

The self-healing claim is the one that cannot be verified by reading, so it is
tested rather than asserted: stop the hotspot, confirm the box drops, start it
again, and confirm **without touching the box** that WiFi reassociates, the
tunnel re-establishes and the site serves. If `wpa_supplicant` does not
reassociate unaided, that is a finding to fix before this is done.

The rest:

- `docker compose ps` shows three services up, `db` healthy.
- `alembic upgrade head` on first start reports nothing to do.
- Row counts on the box match the source: 2081 media, 2 users, 2096 list rows.
- `media.cg1618.com` serves the SPA and an authenticated admin route works.
- Logging in with the development admin password **fails**.
- A production Backup populates the new sheet, and the dev sheet is untouched.

## Sequencing

1. `deploy/docker-compose.prod.yml` and `deploy/cloudflared/config.yml`, plus
   documentation. Reviewable without the box.
2. On the box: clone, write `.env`, `docker compose up -d db`.
3. Dump here, copy the dump and `static/covers/` across, restore.
4. First full `up`, then rotate the passwords.
5. Tunnel: login here, create on the box, route DNS, start `cloudflared`.
6. New production sheet, first Backup.
7. The hotspot test.

Steps 2-7 happen on the box and cannot be covered by the repository's test
suite. Step 1 is the only part CI sees, and what it checks is that nothing else
broke.
