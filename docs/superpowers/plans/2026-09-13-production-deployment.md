# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the media tracker into production on `homelab`, serving
`media.cg1618.com` through a Cloudflare Tunnel, with its real data and a deploy
path that can be rolled back.

**Architecture:** Three containers in one Compose project (`postgres:17`, the
app built from the repo's existing `dockerfile`, and `cloudflared`) running from
a git checkout on the box. Nothing is published to the host; the tunnel is the
only ingress. Data arrives once by `pg_dump`/`pg_restore`, and every subsequent
deploy dumps before it pulls.

**Tech Stack:** Docker Compose, PostgreSQL 17, FastAPI/uvicorn, Cloudflare
Tunnel, Ubuntu 26.04.1 LTS.

**Spec:** `docs/superpowers/specs/2026-09-13-production-deployment-design.md`

## Global Constraints

- Branch is `feat/production-deployment`, worktree `../anime_site_prodesk_specs`.
- **Nothing in git mentions AI.** No `Co-Authored-By`, no `Claude-Session`, no
  generated-with trailer, in commits or in the PR body. See `CLAUDE.md`.
- **Postgres is pinned to 17** on both ends. The dump only restores cleanly
  because of this.
- **The app container must never start against an empty database.**
  `app/main.py` calls `create_all` at import; a start before the restore creates
  every table and makes `pg_restore` collide.
- **Nothing is published to the host** — no `ports:` on any service.
- `restart: unless-stopped` on every service, never `always`.
- **Secrets never enter git:** `.env`, the cloudflared credentials JSON, and
  `cert.pem` live on the box only. `.gitignore` already covers `.env`.
- The box is `homelab`, reachable as `ssh homelab`. Its address is DHCP and
  unreserved; if SSH fails, the address moved.
- Source row counts to match after the restore: **2081 media, 2 users,
  2096 user_media_list**. Source alembic revision: **`s1e2asonalix`**.
- Tasks 1-3 are repository work and are covered by CI. **Tasks 4-9 happen on the
  box and cannot be**; each states how it is verified instead.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `deploy/docker-compose.prod.yml` | The three-service production topology. Create. |
| `deploy/cloudflared/config.yml` | Tunnel ingress map — which hostname routes where. Create. |
| `deploy/deploy.sh` | Dump, tag the outgoing image, pull, build, up. Create. |
| `deploy/README.md` | What lives on the box, what is in `.env`, how to roll back. Create. |
| `tests/unit/test_prod_compose.py` | Guards the compose invariants that are easy to break silently. Create. |
| `requirements-dev.txt` | Declare `pyyaml`, which the test needs and which is currently only present transitively. Modify. |
| `docs/deployment-selfhost.md` | Build-order steps 4-6 become the real procedure. Modify. |
| `docs/PROGRESS.md` | Task status. Modify. |

**One refinement of the spec, decided while planning.** Decision 2 said the
tunnel UUID goes in the committed `config.yml`. It goes in `.env` as `TUNNEL_ID`
instead, passed on the `cloudflared` command line. Same secrecy properties (the
UUID is not a secret either way), but it means `config.yml` is fully static and
committable in Task 1, before the tunnel exists. Without this, Task 1 could not
be finished until Task 7.

---

### Task 1: The production compose file, with a test that guards it

**Files:**
- Create: `deploy/docker-compose.prod.yml`
- Create: `deploy/cloudflared/config.yml`
- Create: `tests/unit/test_prod_compose.py`
- Modify: `requirements-dev.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: service names `db`, `app`, `cloudflared`; the app is reachable
  in-network as `http://app:8000`; `.env` keys consumed by the compose file are
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `CLOUDFLARED_CREDENTIALS`,
  `TUNNEL_ID`.

- [ ] **Step 1: Declare pyyaml**

`pyyaml` is importable today only because something else pulls it in. The test
below imports it directly, so it must be declared. Add to `requirements-dev.txt`:

```
pyyaml>=6.0
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/test_prod_compose.py`:

```python
"""The production compose file's invariants.

These are the properties that are easy to break by accident and expensive to
notice: a published port exposes the database to the LAN, a missing restart
policy means the box comes back from a power cut without the app, and a missing
healthcheck condition makes the app crash-loop through alembic on a slow boot.
"""

from pathlib import Path

import pytest
import yaml

COMPOSE = Path(__file__).resolve().parents[2] / "deploy" / "docker-compose.prod.yml"


@pytest.fixture(scope="module")
def compose():
    return yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))


def test_compose_file_exists():
    assert COMPOSE.is_file(), f"{COMPOSE} is missing"


def test_the_three_services_are_present(compose):
    assert set(compose["services"]) == {"db", "app", "cloudflared"}


@pytest.mark.parametrize("service", ["db", "app", "cloudflared"])
def test_no_service_publishes_a_port(compose, service):
    # The tunnel is the only ingress. A published port on db would put
    # PostgreSQL on the LAN; on app it would bypass Cloudflare entirely.
    assert "ports" not in compose["services"][service]


@pytest.mark.parametrize("service", ["db", "app", "cloudflared"])
def test_every_service_restarts_unless_stopped(compose, service):
    # Not "always": a deliberate `docker compose stop` must survive a daemon
    # restart, or debugging on the box fights the restart policy.
    assert compose["services"][service]["restart"] == "unless-stopped"


def test_db_has_a_readiness_healthcheck(compose):
    assert "healthcheck" in compose["services"]["db"]


def test_app_waits_for_a_healthy_db(compose):
    assert compose["services"]["app"]["depends_on"]["db"]["condition"] == (
        "service_healthy"
    )


def test_app_has_no_healthcheck(compose):
    # Deliberate. The catch-all route at app/main.py:263 serves the SPA for any
    # path, so a check against "/" passes with the database down. A healthcheck
    # that lies is worse than none.
    assert "healthcheck" not in compose["services"]["app"]


def test_app_carries_an_image_name_alongside_build(compose):
    # Keeps the move to a registry a one-line change: the service already
    # refers to an image by name, so only what that name points at changes.
    app = compose["services"]["app"]
    assert app["build"]["context"] == ".."
    assert app["image"] == "anime-site-app:local"


def test_covers_and_library_are_bind_mounts(compose):
    volumes = compose["services"]["app"]["volumes"]
    assert any(v.startswith("../static/covers:") for v in volumes)
    assert any(v.startswith("../static/library:") for v in volumes)


def test_cloudflared_mounts_its_config_read_only(compose):
    volumes = compose["services"]["cloudflared"]["volumes"]
    assert any(v.endswith("/etc/cloudflared/config.yml:ro") for v in volumes)
    assert any(v.endswith("/etc/cloudflared/credentials.json:ro") for v in volumes)


def test_ingress_ends_with_a_catch_all():
    # cloudflared refuses to start without a catch-all as the final rule.
    config = COMPOSE.parent / "cloudflared" / "config.yml"
    rules = yaml.safe_load(config.read_text(encoding="utf-8"))["ingress"]
    assert "hostname" not in rules[-1]
    assert rules[-1]["service"] == "http_status:404"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_prod_compose.py -v`
Expected: every test FAILS or ERRORs — `deploy/docker-compose.prod.yml` does not
exist, so the fixture raises `FileNotFoundError`.

- [ ] **Step 4: Write the ingress config**

Create `deploy/cloudflared/config.yml`:

```yaml
# The tunnel's id is NOT here - it is passed on the command line from
# TUNNEL_ID in the box's .env, so this file is static and committable.
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Adding a project is three lines here plus one `cloudflared tunnel route
  # dns`. Which hostnames exist, and which should be behind Cloudflare Access,
  # is argued in docs/deployment-selfhost.md.
  - hostname: media.cg1618.com
    service: http://app:8000

  # Required catch-all. cloudflared refuses to start without it, and it must be
  # last.
  - service: http_status:404
```

- [ ] **Step 5: Write the compose file**

Create `deploy/docker-compose.prod.yml`. Note `context: ..` — the build context
is the repository root, one level up from `deploy/`, and every relative volume
path is likewise relative to `deploy/`.

```yaml
# Production, on the homelab box. Run from the repository root with:
#   docker compose -f deploy/docker-compose.prod.yml --env-file .env <cmd>
# or through deploy/deploy.sh, which also takes a dump first.
#
# The development docker-compose.yml at the repository root is a different
# thing: it runs a bare PostgreSQL for local work and nothing else.

services:
  db:
    image: postgres:17
    container_name: anime_site_prod_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      # $$ escapes compose's own interpolation so the shell inside the
      # container expands these, not compose.
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  app:
    build:
      context: ..
      dockerfile: dockerfile
    image: anime-site-app:local
    container_name: anime_site_prod_app
    restart: unless-stopped
    env_file:
      - ../.env
    environment:
      PORT: 8000
    volumes:
      - ../static/covers:/app/static/covers
      - ../static/library:/app/static/library
    depends_on:
      db:
        condition: service_healthy

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: anime_site_prod_cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run ${TUNNEL_ID}
    volumes:
      - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
      - ${CLOUDFLARED_CREDENTIALS}:/etc/cloudflared/credentials.json:ro
    depends_on:
      - app

volumes:
  pgdata:
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_prod_compose.py -v`
Expected: all PASS.

- [ ] **Step 7: Run the full backend suite and ruff**

The suite takes ~5.5 minutes and must be run before every commit, not at
checkpoints — a scoped run cannot see a test elsewhere that this change broke.

Run: `venv/Scripts/python.exe -m pytest -q`
Run: `venv/Scripts/ruff.exe check .`
Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add deploy/docker-compose.prod.yml deploy/cloudflared/config.yml tests/unit/test_prod_compose.py requirements-dev.txt
git commit -m "feat(deploy): production compose topology and its guard test

Three services, nothing published to the host, the tunnel as the only
ingress. The test pins the properties that are easy to break silently: a
published port, a missing restart policy, the app not waiting on a healthy
database, and the deliberate absence of an app healthcheck.

pyyaml was only present transitively; the test imports it, so declare it."
```

---

### Task 2: The deploy script

**Files:**
- Create: `deploy/deploy.sh`

**Interfaces:**
- Consumes: `deploy/docker-compose.prod.yml` from Task 1; `.env` on the box.
- Produces: dumps at `~/backups/pre-deploy-<timestamp>.dump`; the image tag
  `anime-site-app:previous`.

- [ ] **Step 1: Write the script**

Create `deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
# Deploy the current branch to this box, reversibly.
#
# The dump is the point. entrypoint.sh runs `alembic upgrade head` on every
# start, so by the time a bad migration is visible it has already run, and
# `alembic downgrade` is not a restore: reversing a dropped column recreates it
# empty. Dumping before the pull is what makes a migration reversible at all.
#
# Rollback is in deploy/README.md and is three steps, not two.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
BACKUP_DIR="${HOME}/backups"
KEEP=5

mkdir -p "${BACKUP_DIR}"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

stamp="$(date +%Y%m%d-%H%M%S)"
dump="${BACKUP_DIR}/pre-deploy-${stamp}.dump"

echo "==> Dumping to ${dump}"
${COMPOSE} exec -T db pg_dump -U "${POSTGRES_USER}" -Fc -d "${POSTGRES_DB}" > "${dump}"
test -s "${dump}" || { echo "Dump is empty; refusing to deploy." >&2; exit 1; }

echo "==> Recording the revision this dump belongs to"
git rev-parse HEAD > "${dump}.revision"

echo "==> Tagging the outgoing image"
docker image inspect anime-site-app:local >/dev/null 2>&1 \
  && docker tag anime-site-app:local anime-site-app:previous \
  || echo "    (no current image yet - first deploy)"

echo "==> Pulling"
git pull --ff-only

echo "==> Building and starting"
${COMPOSE} up -d --build

echo "==> Pruning old dumps, keeping ${KEEP}"
ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) \
  | while read -r old; do rm -f "${old}" "${old}.revision"; done

${COMPOSE} ps
echo "==> Done. Rollback instructions: deploy/README.md"
```

- [ ] **Step 2: Make it executable and check it parses**

```bash
chmod +x deploy/deploy.sh
bash -n deploy/deploy.sh
```

Expected: no output. `bash -n` parses without executing, which is the only check
available for this script off the box — it cannot be run anywhere else.

- [ ] **Step 3: Commit**

```bash
git add deploy/deploy.sh
git commit -m "feat(deploy): dump before every deploy, and tag the outgoing image

A bad migration is the one deploy failure with nothing to recover from,
because entrypoint.sh runs alembic on every start and downgrade does not
restore data. The dump is taken before the pull, and the revision it belongs
to is recorded beside it so a rollback can revert the code with the data."
```

---

### Task 3: Documentation

**Files:**
- Create: `deploy/README.md`
- Modify: `docs/deployment-selfhost.md` (build-order steps 4-6)
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: the `.env` template that Task 4 fills in.

- [ ] **Step 1: Write `deploy/README.md`**

```markdown
# Running this in production

The box is `homelab`. The checkout lives at `~/anime_site`, and everything below
runs from there.

    docker compose -f deploy/docker-compose.prod.yml <command>

Deploying is `./deploy/deploy.sh`, which dumps the database before it pulls.

## What is on the box and not in git

| Thing | Where | Why |
| --- | --- | --- |
| `.env` | `~/anime_site/.env` | secrets; gitignored |
| Tunnel credentials | `~/.cloudflared/<uuid>.json` | secret; mounted read-only |
| `cert.pem` | `~/.cloudflared/cert.pem` | only needed to administer the tunnel |
| Dumps | `~/backups/` | the last five, plus the migration dump |

## `.env`

Production's `.env` is written by hand. It is not a copy of a development one —
`DATABASE_URL` is honoured verbatim, so a stale localhost value silently breaks
the container.

    APP_ENV=production
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=<generate>
    POSTGRES_DB=anime_site_db
    DATABASE_URL=postgresql://postgres:<same password>@db:5432/anime_site_db
    PORT=8000

    JWT_SECRET_KEY=<generate, not the dev one>
    ADMIN_PASSWORD=<generate, not the dev one>
    ALGORITHM=HS256
    ACCESS_TOKEN_EXPIRE_MINUTES=1440

    TUNNEL_ID=<from `cloudflared tunnel create`>
    CLOUDFLARED_CREDENTIALS=/home/<user>/.cloudflared/<uuid>.json

    GOOGLE_SHEET_ID=<the PRODUCTION sheet, never the dev one>
    GOOGLE_CREDENTIALS_JSON=<service account JSON, one line>

    # plus the third-party API keys, reused from a dev machine:
    # TMDB_API_KEY, OMDB_API_KEY, COMICVINE_API_KEY, IGDB_CLIENT_ID,
    # IGDB_CLIENT_SECRET, STEAM_API_KEY, STEAM_ID

Generate secrets with:

    python -c "import secrets; print(secrets.token_urlsafe(64))"

**`GOOGLE_SHEET_ID` decides which sheet Backup overwrites, and Backup overwrites
every tab.** Production has its own sheet. The development sheet's id must never
appear here.

## Rollback

Three steps, in this order. Restoring the data without reverting the code does
not work: the next start runs `alembic upgrade head` and re-applies the
migration that caused the problem.

1. **Revert the code** to the revision the dump belongs to:

       cd ~/anime_site
       git checkout "$(cat ~/backups/pre-deploy-<stamp>.dump.revision)"

2. **Restore the data:**

       docker compose -f deploy/docker-compose.prod.yml up -d db
       docker compose -f deploy/docker-compose.prod.yml exec -T db \
         pg_restore -U postgres -d anime_site_db --clean --if-exists --no-owner \
         < ~/backups/pre-deploy-<stamp>.dump

3. **Start:**

       docker compose -f deploy/docker-compose.prod.yml up -d

If only the code is bad and no migration ran, step 2 is unnecessary and
`docker tag anime-site-app:previous anime-site-app:local` followed by `up -d`
avoids a rebuild.

## What this does not protect against

A migration that is wrong in a way nobody notices for a week. Every deploy dump
by then either predates the damage uselessly or postdates it. That is what the
nightly off-box backup — build-order step 7 — is for.

## Adding another project's hostname

Three lines in `deploy/cloudflared/config.yml`, above the catch-all, then
`cloudflared tunnel route dns <tunnel> <hostname>`. Before adding `journal`,
`health` or `money`, read the sensitivity section in
`docs/deployment-selfhost.md`: they hold a different class of data and the
decision about Cloudflare Access belongs before the ingress rule, not after.
```

- [ ] **Step 2: Rewrite build-order steps 4-6 in `docs/deployment-selfhost.md`**

Replace the three sketch lines with pointers to what now exists, keeping the
file present-tense and free of history. Step 4 becomes "the production compose
file is `deploy/docker-compose.prod.yml`; `deploy/README.md` is how it is run".
Step 5 becomes the dump/restore ordering and the password rotation. Step 6
becomes the tunnel procedure. Bump `Last verified`.

- [ ] **Step 3: Add the plan's tasks to `docs/PROGRESS.md`**

One row per task in this plan, all `todo`.

- [ ] **Step 4: Run the suite, ruff, and commit**

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
git add deploy/README.md docs/deployment-selfhost.md docs/PROGRESS.md
git commit -m "docs(deploy): how production runs, and how to roll it back"
```

- [ ] **Step 5: Open the PR and stop**

Show the owner the title and body and wait. Opening and merging are theirs.
Tasks 4-9 happen on the box and need this merged first, because the box clones
`dev`.

---

## Tasks 4-9 run on the box

**None of these are testable by the repository's suite**, and pretending
otherwise would be dishonest. Each states what is checked and how. Run them in
order; several are destructive in ways the next task depends on.

---

### Task 4: Bring the stack up empty

**Files:** none in git. On the box: `~/anime_site/.env`.

**Interfaces:**
- Consumes: the merged Task 1-3 work.
- Produces: a running `db` service with an empty `anime_site_db`; no app.

- [ ] **Step 1: Clone**

```bash
ssh homelab
git clone https://github.com/cgentle1618/anime_site.git ~/anime_site
cd ~/anime_site
```

- [ ] **Step 2: Write `.env`**

Use the template in `deploy/README.md`. Generate `POSTGRES_PASSWORD`,
`JWT_SECRET_KEY` and `ADMIN_PASSWORD` fresh. Copy the third-party API keys from
a dev machine's `.env`. Leave `TUNNEL_ID`, `CLOUDFLARED_CREDENTIALS` and
`GOOGLE_SHEET_ID` blank for now — Tasks 7 and 8 fill them.

- [ ] **Step 3: Start ONLY the database**

```bash
docker compose -f deploy/docker-compose.prod.yml up -d db
```

**Not `up -d`.** Starting the app now would create every table via `create_all`
and make Task 5's restore collide.

- [ ] **Step 4: Verify**

```bash
docker compose -f deploy/docker-compose.prod.yml ps
```

Expected: `db` only, state `running (healthy)` within ~30 seconds. If it never
becomes healthy, the healthcheck's `POSTGRES_USER`/`POSTGRES_DB` do not match
`.env`.

---

### Task 5: Load the data

**Interfaces:**
- Consumes: a healthy empty `db` from Task 4.
- Produces: `anime_site_db` on the box holding 2081 media, 2 users, 2096
  user_media_list rows, at revision `s1e2asonalix`.

- [ ] **Step 1: Dump, on the dev machine**

```bash
docker exec anime_site_postgres_db pg_dump -U postgres -Fc -d anime_site_db \
  > /c/Users/cgent/AppData/Local/Temp/anime_site_prod_seed.dump
```

- [ ] **Step 2: Copy the dump and the covers across**

```bash
scp /c/Users/cgent/AppData/Local/Temp/anime_site_prod_seed.dump homelab:~/backups/
rsync -av --progress static/covers/ homelab:~/anime_site/static/covers/
```

`~/backups` may not exist yet — `ssh homelab mkdir -p ~/backups` first.
`static/library/` is empty on this machine and the clone already supplies
`.gitkeep` and `thumbs/`, so it is not copied.

- [ ] **Step 3: Restore, on the box**

```bash
cd ~/anime_site
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  pg_restore -U postgres -d anime_site_db --no-owner --clean --if-exists \
  < ~/backups/anime_site_prod_seed.dump
```

- [ ] **Step 4: Verify the row counts**

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  psql -U postgres -d anime_site_db -tAc \
  "select (select count(*) from media), (select count(*) from users), (select count(*) from user_media_list), (select version_num from alembic_version);"
```

Expected exactly: `2081|2|2096|s1e2asonalix`. Anything else means stop — the
restore is wrong and Task 6 would build on it.

---

### Task 6: First full start, then rotate the passwords

**Interfaces:**
- Consumes: the restored database from Task 5.
- Produces: a running `app` serving on the compose network as `app:8000`, with
  production-only credentials.

- [ ] **Step 1: Build and start everything except the tunnel**

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build db app
```

The build takes 5-15 minutes — `npm ci`, Vite, and pip wheels.

- [ ] **Step 2: Verify alembic had nothing to do**

```bash
docker compose -f deploy/docker-compose.prod.yml logs app | head -30
```

Expected: the entrypoint's migration line runs and applies **no** revisions. If
it runs migrations, the restore did not carry `alembic_version` and Task 5 needs
redoing.

- [ ] **Step 3: Verify the app serves, from inside the network**

```bash
docker compose -f deploy/docker-compose.prod.yml exec app \
  python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/').status)"
```

Expected: `200`.

- [ ] **Step 4: Rotate both users' passwords**

The dump carried development hashes, and `app/main.py:142` seeds the admin
account only when it is absent — so production is currently running on
development credentials.

```bash
docker compose -f deploy/docker-compose.prod.yml exec app python - <<'PY'
import getpass
from app.database import SessionLocal
from app.services.security import get_password_hash
from app import models

db = SessionLocal()
for name in ("admin", "cg1618"):
    user = db.query(models.User).filter(models.User.username == name).first()
    if user is None:
        print(f"{name}: not present, skipped")
        continue
    user.hashed_password = get_password_hash(getpass.getpass(f"New password for {name}: "))
    print(f"{name}: updated")
db.commit()
db.close()
PY
```

- [ ] **Step 5: Verify the old password no longer works**

```bash
docker compose -f deploy/docker-compose.prod.yml exec app python - <<'PY'
from app.database import SessionLocal
from app.services.security import verify_password
from app import models

db = SessionLocal()
u = db.query(models.User).filter(models.User.username == "admin").first()
print("dev password still works:", verify_password("<the dev admin password>", u.hashed_password))
db.close()
PY
```

Expected: `False`. This is the assertion that matters — a rotation that silently
did nothing looks identical to one that worked.

---

### Task 7: The tunnel

**Interfaces:**
- Consumes: a running `app` from Task 6.
- Produces: `media.cg1618.com` resolving to the tunnel and serving the SPA;
  `TUNNEL_ID` and `CLOUDFLARED_CREDENTIALS` filled in on the box.

- [ ] **Step 1: Authenticate, on the dev machine** (the box has no browser)

```bash
cloudflared tunnel login
```

Pick the `cg1618.com` zone. This writes `~/.cloudflared/cert.pem`.

- [ ] **Step 2: Copy the certificate to the box**

```bash
ssh homelab mkdir -p ~/.cloudflared
scp ~/.cloudflared/cert.pem homelab:~/.cloudflared/
```

- [ ] **Step 3: Install cloudflared on the box and create the tunnel**

The binary is for administering the tunnel; the container runs it.

```bash
ssh homelab
sudo apt install -y cloudflared || {
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
  sudo dpkg -i /tmp/cf.deb
}
cloudflared tunnel create homelab
```

Note the UUID and the credentials path it prints.

- [ ] **Step 4: Fill in `.env`**

```
TUNNEL_ID=<the uuid>
CLOUDFLARED_CREDENTIALS=/home/<user>/.cloudflared/<uuid>.json
```

- [ ] **Step 5: Route the hostname**

```bash
cloudflared tunnel route dns homelab media.cg1618.com
```

This creates a proxied CNAME to `<uuid>.cfargotunnel.com` in the zone.

- [ ] **Step 6: Start the tunnel**

```bash
cd ~/anime_site
docker compose -f deploy/docker-compose.prod.yml up -d cloudflared
docker compose -f deploy/docker-compose.prod.yml logs -f cloudflared
```

Expected: registered connections to several Cloudflare edge locations.

- [ ] **Step 7: Verify from outside**

From the dev machine, and ideally from a phone on mobile data:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://media.cg1618.com/
```

Expected: `200`. Then open it in a browser and log in with the **new** admin
password.

---

### Task 8: The production Google Sheet

**Interfaces:**
- Consumes: a working production app from Task 7.
- Produces: a populated production sheet; the development sheet untouched.

- [ ] **Step 1: Create a new empty Google Sheet** named **App Database**.

The spreadsheet's name is for humans only — `open_by_key` is the only way the
app opens it (`app/services/integrations/sheets.py:184`), so it can be renamed
at any time without consequence. The **tab** names inside are the opposite:
`app/services/pipelines/tabs.py` matches them exactly, so renaming one makes
Backup create a fresh tab under the old name and leave the renamed one stale.

- [ ] **Step 2: Share it with the service account**

Find the address in `credentials.json` under `client_email` and add it as an
**Editor**. Without this the API reports a permission error that reads like a
missing sheet.

- [ ] **Step 3: Put its id in the box's `.env`**

```
GOOGLE_SHEET_ID=<the new sheet's id>
```

Re-read the warning in `deploy/README.md`: Backup overwrites every tab, so a
development id here destroys the development backup.

- [ ] **Step 4: Restart the app to pick it up**

```bash
docker compose -f deploy/docker-compose.prod.yml up -d app
```

- [ ] **Step 5: Run Backup from the production UI**

`https://media.cg1618.com` → `/system` → **Backup**.

`get_google_sheet_tab` creates each tab as it goes
(`app/services/integrations/sheets.py:199`), so an empty spreadsheet is expected
to work.

- [ ] **Step 6: Verify both sheets**

The production sheet now has every tab populated. **Open the development sheet
and confirm its `Media` tab is unchanged** — this is the check that the two ids
were not swapped.

---

### Task 9: Prove it recovers, and prove rollback works

This is the task the whole design rests on, and the only way to know is to break
it on purpose — while production still holds nothing a re-restore could not
replace.

**Interfaces:**
- Consumes: everything.
- Produces: evidence, and `docs/PROGRESS.md` marked done.

- [ ] **Step 1: The hotspot test**

Turn the phone's hotspot **off**. Confirm from the dev machine that
`https://media.cg1618.com/` stops responding and `ssh homelab` fails. Wait two
minutes. Turn it back **on**.

**Touch nothing on the box.** Within a few minutes:

```bash
ssh homelab 'ip -br addr show wlp1s0'
curl -sS -o /dev/null -w '%{http_code}\n' https://media.cg1618.com/
```

Expected: the interface is `UP` with an address, and the site returns `200`.

If WiFi does not reassociate on its own, that is a real finding and must be
fixed before this task is done — the likely cause is `wpa_supplicant` not
retrying, and the fix belongs in netplan. Do not record the task as passing with
a manual reconnect.

- [ ] **Step 2: The reboot test**

```bash
ssh homelab sudo reboot
```

Expected: within a few minutes, all three containers are up and the site serves,
with nothing typed on the box. This exercises `restart: unless-stopped` and the
`service_healthy` dependency together.

- [ ] **Step 3: The rollback rehearsal**

Run `./deploy/deploy.sh` once with no changes to pull, so it produces a dump and
a `.revision` file. Then follow the rollback procedure in `deploy/README.md`
end to end, and confirm the row counts afterwards:

Expected: `2081|2|2096|s1e2asonalix`, as in Task 5.

A rollback procedure that has never been run is a guess. This is the cheapest
moment it will ever be to find out it is wrong.

- [ ] **Step 4: Record the outcome**

Mark the tasks done in `docs/PROGRESS.md`, and mark the spec shipped with its
sha — including what the spec got wrong, if anything did. Commit on a docs
branch and open a PR.

---

## Self-Review

**Spec coverage.** Decision 1 → Task 1 (`build:` plus `image:`, no build args)
and Task 4. Decision 2 → Task 1 (`config.yml`) and Task 7, with the UUID moved
to `.env` as noted under File Structure. Decision 3 → Task 5. Decision 4 →
Task 8. Decision 5 → Tasks 4 (db only), 5 (restore), 6 (rotation). Decision 6 →
Task 1's tests and Task 9's reboot test. Decision 7 → Task 2 and Task 9 step 3.
Every verification bullet in the spec maps to a step: compose ps → Task 4/6;
alembic no-op → Task 6 step 2; row counts → Task 5 step 4; the site and an
authenticated route → Task 7 step 7; dev password fails → Task 6 step 5; Backup
populates the new sheet and the dev sheet is untouched → Task 8 step 6; deploy
dump and rollback → Task 9 step 3.

**Placeholders.** The `<...>` markers that remain are values that genuinely do
not exist until the step runs — the tunnel UUID, generated secrets, the sheet
id, the dump timestamp, the dev admin password being tested against. Each is
named where it comes from.

**Type consistency.** Service names `db`/`app`/`cloudflared` are used
identically in the compose file, the test, and every command. `.env` keys are
consistent between `deploy/README.md`, the compose file, and `deploy.sh`. The
image tags `anime-site-app:local` and `anime-site-app:previous` match between
Task 1's test, `deploy.sh`, and the rollback instructions.
