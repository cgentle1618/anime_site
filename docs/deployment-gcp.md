# Deployment (Google Cloud)

Last verified: 2026-09-02 (commit e14dba6)

> ## ⚠️ Status: the GCP deployment is down (as of 2026-09-02)
>
> It is **not expected to be restored in the near future**. Everything below
> describes how the deployment is *configured*, not how it is currently
> *running* — read it as the reference for rebuilding or resuming the
> deployment, not as a description of a live service.
>
> What this means in practice:
>
> - There is no reachable Cloud Run revision, and the Cloud SQL database
>   behind it is unavailable with it.
> - Cover images live in a GCS bucket in the same project, so treat cover
>   upload and serving as unavailable too — including from a local run, which
>   reaches the same bucket with `credentials.json`.
> - A push to `main` still triggers `.github/workflows/deploy.yml`. The test
>   job is unaffected and still gates; expect the deploy job that follows it
>   to fail. Merge on the strength of the tests, not the workflow's overall
>   status.
> - **Google Sheets is unaffected** and reached with a service account rather
>   than through GCP compute, so Backup and Pull keep working against a local
>   database (verified 2026-09-02).
>
> Local development is the only working environment — see
> [setup-local.md](setup-local.md).

**What this is for.** How the app gets from a push on `main` to a running
Cloud Run revision, and what is different about the code when it runs there.
Read this before touching `dockerfile`, `entrypoint.sh`,
`.github/workflows/deploy.yml`, the Cloud Run service configuration, or any
code that branches on `settings.is_cloud_run`. Local setup is in
`setup-local.md`.

## Topology

| Piece | Value |
| --- | --- |
| GCP project | `anime-site-sync` (workflow `PROJECT_ID: Anime-Site-Sync`) |
| Region | `asia-east1` |
| Artifact Registry image | `asia-east1-docker.pkg.dev/anime-site-sync/anime-repo/cg1618-tracker:<git sha>` |
| Cloud Run service | `cg1618-tracker` |
| Database | Cloud SQL PostgreSQL, reached over the Unix socket `/cloudsql/<INSTANCE_CONNECTION_NAME>` |
| Cover images | GCS bucket, default `cg1618-anime-covers` |
| Backup / restore | Google Sheets spreadsheet `GOOGLE_SHEET_ID`, via a service account |

## Container image (`dockerfile`)

Three stages, all pinned to Python 3.13 / Node 20:

| Stage | Base | Does |
| --- | --- | --- |
| `frontend-builder` | `node:20-slim` | `npm ci` in `frontend/` (lockfile-exact), then `npm run build` -> `/app/frontend_dist/`. |
| `py-builder` | `python:3.13-slim` | Installs `gcc libpq-dev python3-dev libffi-dev`, then `pip wheel -r requirements.txt` into `/app/wheels`. |
| final | `python:3.13-slim` | Installs only `libpq-dev`, `pip install --no-index --find-links=/wheels`, copies the repo (`COPY . .`), copies `frontend_dist/` from stage 1, `chmod +x entrypoint.sh`, `ENTRYPOINT ["/app/entrypoint.sh"]`. |

Build-time tools never reach the runtime image; the runtime installs strictly
from the prebuilt wheels. `COPY . .` copies whatever is in the build context,
so keep `.dockerignore` in mind when adding large local directories.

## Container start (`entrypoint.sh`)

```sh
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'
```

- `set -e`: if the migration fails the container exits and the revision fails
  to become healthy, so a bad migration blocks the rollout rather than serving
  against a half-migrated schema.
- `$PORT` is injected by Cloud Run (default 8080 if absent).
- `--proxy-headers --forwarded-allow-ips='*'` makes uvicorn trust
  `X-Forwarded-*` from the Cloud Run front end so `request.url` is `https`.

## CI/CD (`.github/workflows/deploy.yml`)

Triggers: every `pull_request`, and `push` to `main`.

### `test` job (runs on both triggers)

Ubuntu runner with a `postgres:15` service container
(`postgres/postgres/anime_site_test`, health-checked with `pg_isready`). The
same three `POSTGRES_*` values are exported to the job environment, which is
how `tests/conftest.py` picks up the password.

Steps, in order; any failure stops the job:

1. `actions/setup-python@v5` with Python 3.13 (pip cache), `pip install -r requirements-dev.txt`.
2. `ruff check .`
3. `pytest -q -p no:cacheprovider` (unit + API tiers against the service DB).
4. `actions/setup-node@v4` with Node 20 (npm cache keyed on `frontend/package-lock.json`), `npm ci`.
5. `npm run lint` (eslint).
6. `npm run test:run` (vitest).
7. `npm run build` (proves the bundle compiles; the artifact is discarded, the Docker build rebuilds it).

### `build-and-deploy` job

`needs: test`, and additionally `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`,
so PRs are tested but never deployed.

1. `google-github-actions/auth@v2` with the `GCP_CREDENTIALS` repository secret (service-account JSON).
2. `gcloud auth configure-docker asia-east1-docker.pkg.dev`.
3. `docker build -t <image>:<sha> .` then `docker push`.
4. `google-github-actions/deploy-cloudrun@v2` to service `cg1618-tracker`, region `asia-east1`, `timeout: 3600s` (request timeout, long enough for the SSE Fill/Replace streams).

The deploy step only passes the image; env vars, secrets, the Cloud SQL
attachment and scaling settings are whatever is already configured on the
service and are carried over between revisions.

## Runtime behaviour on Cloud Run

Cloud Run sets `K_SERVICE` automatically. `app/config.py` exposes that as
`settings.is_cloud_run`, and it is the single switch for every production
difference:

| Where | Local | Cloud Run |
| --- | --- | --- |
| `Settings.sqlalchemy_database_url` | `postgresql://user:pw@localhost:5432/db` | If `INSTANCE_CONNECTION_NAME` is set: `postgresql+psycopg2://user:pw@/db?host=/cloudsql/<instance>` (Unix socket). A `DATABASE_URL` containing `localhost` is ignored so a leaked local `.env` cannot break the container. |
| `Settings.validate_production()` (lifespan start) | no-op | Raises `RuntimeError` if `JWT_SECRET_KEY` or `ADMIN_PASSWORD` are still the dev defaults or the DB URL points at localhost. The container exits. |
| `Settings.bucket_name` | `GCP_BUCKET_NAME` or `None` (covers on disk) | `GCP_BUCKET_NAME` or the default `cg1618-anime-covers` |
| `app/utils/gcp_utils.get_gcs_client()` | service-account JSON from `GOOGLE_CREDENTIALS_JSON`, else Application Default Credentials | `storage.Client()` with the Cloud Run service account's IAM identity (no key file) |
| Login cookie (`app/routers/auth.py`) | `secure=False`, `httponly`, `samesite=lax` | `secure=True` |
| `app/database.py` | | Prints a CRITICAL message if the URL still contains `localhost` (the validate step then aborts) |

Note the Sheets client (`app/services/integrations/sheets.py`) does **not**
use IAM: it always needs `GOOGLE_CREDENTIALS_JSON` (or a `credentials.json`
file, which does not exist in the image), so that variable must be set on the
service.

### Environment variables and secrets on the service

Set on the Cloud Run service (Console > Edit & deploy new revision >
Variables & Secrets), preferably as Secret Manager references for the
sensitive ones:

| Variable | Required | Notes |
| --- | --- | --- |
| `INSTANCE_CONNECTION_NAME` | yes | `project:region:instance`; also attach the Cloud SQL instance under Connections so the socket exists. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | yes | Cloud SQL credentials. |
| `JWT_SECRET_KEY` | yes | Must differ from the dev default or startup aborts. |
| `ADMIN_PASSWORD` | yes | Same rule. Only used when no `admin` user exists yet. |
| `GOOGLE_CREDENTIALS_JSON` | for Backup/Pull | Service-account JSON on one line. |
| `GOOGLE_SHEET_ID` | for Backup/Pull | |
| `GCP_BUCKET_NAME` | optional | Defaults to `cg1618-anime-covers`. |
| `TMDB_API_KEY`, `OMDB_API_KEY`, `COMICVINE_API_KEY` | for Fill | Missing keys make those fills fail per entry, not the app. |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALGORITHM` | optional | Defaults 1440 / HS256. |

Do not set `K_SERVICE` or `DATABASE_URL` yourself.

## Cover images (GCS)

`app/services/integrations/image_manager.py` is the storage abstraction. Every
function checks `get_active_bucket_name()`: with a bucket it uses the GCS
client, without one it uses `static/covers/` on the local disk.

- Object name is `<system_id>.jpg`, content type `image/jpeg`.
- `download_cover_image(url, id)` skips the fetch if the object already
  exists, otherwise downloads with a browser `User-Agent` (MAL's CDN returns
  403 without one) and uploads with `upload_from_string`.
- `delete_cover_image`, `cover_image_exists` and `list_all_cover_images`
  (used by the Data Control "check cover image" / "delete orphaned covers"
  actions) follow the same branch.
- The frontend builds the URL itself (`frontend/src/lib/covers.js`):
  `/static/covers/<file>` on localhost, otherwise
  `https://storage.googleapis.com/<bucket>/<file>`. The bucket therefore
  needs **public read** on objects (uniform bucket-level access with
  `allUsers: roles/storage.objectViewer`), and the Cloud Run service account
  needs `roles/storage.objectAdmin` (or objectCreator + objectViewer +
  delete) on it.

`static/quotes/` (quote images) is local-only: Cloud Run's filesystem is
ephemeral and the frontend hides those controls off localhost.

## Google Sheets service account

One service account is used for both Sheets and, locally, GCS. It needs:

- The Google Sheets API and Google Drive API enabled in the project.
- Editor access to the spreadsheet (share the sheet with the service
  account's email).
- Its JSON key stored in `GOOGLE_CREDENTIALS_JSON` on Cloud Run.

Backup writes every tab listed in `app/services/pipelines/tabs.py`; Pull
restores them in that order. Cloud Run's 3600 s request timeout covers a
full Backup.

## Database migrations in production

Migrations run in `entrypoint.sh`, before uvicorn, on **every instance
start**. Alembic's `env.py` builds its URL from the same
`SQLALCHEMY_DATABASE_URL`, so the container migrates the Cloud SQL database it
will serve. To roll back, deploy a previous image and run `alembic downgrade`
manually against Cloud SQL (there is no automated downgrade path).

## Known limits

- **Single instance assumed.** `app/services/rbac/cache.py` keeps role
  permission sets in a process-global dict and invalidates it with `bump()`
  on every role/content-label write. A second instance would keep serving
  stale grants until restart. Keep max instances at 1 or add a TTL before
  scaling out.
- **Unguarded migrations.** Because `alembic upgrade head` runs on every
  start with no lock, two instances (or a cold start during a deploy)
  starting at once can race on the same migration. Another reason for max
  instances = 1 during rollouts.
- **No health endpoint.** There is no `/api/health`; Cloud Run's default
  TCP startup probe is what decides a revision is live. `dev.ps1` locally
  polls `/api/announcements/` for the same purpose.
- **Alembic before validation.** The migration runs before
  `validate_production()`, so a misconfigured secret is discovered only
  after the schema has been migrated.
- **Cold start does DB work.** `ensure_schema` (inspects tables) and the
  RBAC/admin seed run on every boot; they are idempotent but add to cold
  start latency.
- **Long-running SSE.** Fill/Replace stream progress over SSE for minutes.
  They survive because request timeout is 3600 s; lowering it will cut the
  streams off.
