# Deployment (Google Cloud)

Last verified: 2026-09-08

> ## ⚠️ Status: historical record. The deployment is gone and so is its code
>
> This deployment genuinely worked. It went down on **2026-09-02**, and on
> **2026-09-08 the code that supported it was removed from the repository**
> (the full list is in
> [What was removed on 2026-09-08](#what-was-removed-on-2026-09-08)).
>
> There is nothing left to flip, redeploy or resume. **GCP remains a
> perfectly viable option and this page is kept so that taking it is cheap** —
> but it is a rebuild, not a restart: the branches, the config fields, the
> storage client and the deploy job would all have to be written again, and
> would be redesigned rather than restored. Everything below the banner
> describes how the deployment *was* configured, which is the starting
> reference for whoever does that.
>
> What is true today:
>
> - There is no reachable Cloud Run revision, and the Cloud SQL database
>   behind it is gone with it.
> - Cover images are **local disk only**, under `static/covers/`. The GCS arm
>   of `image_manager.py` no longer exists, and neither does the bucket
>   setting; nothing in the app reaches a bucket any more.
> - CI is `.github/workflows/ci.yml` (workflow name `Tests`). It **runs the
>   tests and deploys nothing** — `deploy.yml` and its `build-and-deploy` job
>   were deleted. A red workflow now means a real test failure.
> - **Google Sheets is unaffected and still fully in use.** It is reached with
>   a service account, not through GCP compute, so Backup and Pull All keep
>   working against the local database. `gspread` and `google-auth` remain in
>   `requirements.txt`.
>
> Local development is the only runtime — see [setup-local.md](setup-local.md).
> Self-hosting is the intended future production and is still only a plan:
> [deployment-selfhost.md](deployment-selfhost.md).

**What this is for.** How the app got from a push on `main` to a running
Cloud Run revision, and what was different about the code when it ran there.
Read it as the historical reference behind `dockerfile` and `entrypoint.sh`
(both kept — Postgres runs from `docker-compose.yml` locally and self-hosting
will reuse the image), and as the starting point for any future rebuild.
Local setup is in `setup-local.md`.

## What was removed on 2026-09-08

Exactly this, so a future rebuild knows what has to exist again:

| Path | What went |
| --- | --- |
| `app/utils/gcp_utils.py` | **Deleted entirely** — the GCS client factory and helpers. |
| `app/services/integrations/image_manager.py` | The `if bucket_name:` GCS arm removed from all four functions. Local disk under `static/covers/` is the only path now. `cover_key`, `COVER_DIR` and `COVER_OWNERS` are unchanged. |
| `app/routers/system.py` | `POST /api/system/test-bucket` deleted, along with the `google.cloud` import. |
| `app/config.py` | `k_service`, `is_cloud_run`, `instance_connection_name`, `gcp_bucket_name`, `bucket_name` and `validate_production()` deleted, plus the Cloud SQL unix-socket branch. `sqlalchemy_database_url` is now `DATABASE_URL` verbatim when set, else a localhost URL built from the `POSTGRES_*` values. **The old guard that ignored a `DATABASE_URL` containing `localhost` is gone** — a set `DATABASE_URL` is honoured as written. |
| `app/main.py` | The `settings.validate_production()` call at startup removed. |
| `app/database.py` | The Cloud Run localhost safety check removed. |
| `app/routers/auth.py` | The login cookie is now `secure=False` unconditionally (was `secure=is_cloud_run`), with a comment marking it to be made scheme-conditional under HTTPS later. |
| `app/services/rbac/cache.py` | The single-process rationale kept; the Cloud Run framing around it dropped. |
| `scripts/migrate_cover_layout.py` | The `GcsStore` class and the `--gcs` flag deleted; the script is local-only. |
| `requirements.txt` | `google-cloud-storage` removed. `gspread` and `google-auth` kept — Sheets still needs them. |
| `frontend/src/lib/covers.js` | `getCoverUrl` returns `/static/covers/<key>` unconditionally; the hard-coded `storage.googleapis.com` URL and `BUCKET_NAME` are gone. `isLocalHost()` still exists and `getQuoteImageUrl` still returns `null` off localhost — that gate was left in place deliberately, to be revisited with self-hosting. |
| `frontend/src/api/endpoints.js` | `testBucket` removed. |
| `.github/workflows/deploy.yml` | **Renamed** to `.github/workflows/ci.yml`, `name:` changed to `Tests`, the GCP `env:` block and the whole `build-and-deploy` job deleted. The `test` job is byte-identical. |
| `.env.example` | `INSTANCE_CONNECTION_NAME`, `GCP_BUCKET_NAME` and `K_SERVICE` removed; the Google section retitled "Google Sheets (backup / restore)"; the `DATABASE_URL` comment now says it is honoured verbatim. |

Kept and unchanged: `dockerfile`, `entrypoint.sh`, `docker-compose.yml`.

## Topology (as it was)

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

The image itself is **not** historical: `dockerfile` is kept as-is and
self-hosting is meant to reuse it. Three stages, all pinned to Python 3.13 /
Node 20:

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
- `$PORT` was injected by Cloud Run (default 8080 if absent).
- `--proxy-headers --forwarded-allow-ips='*'` makes uvicorn trust
  `X-Forwarded-*` from a front end so `request.url` is `https`. Still the
  right shape behind a Cloudflare Tunnel.

## CI/CD (was `.github/workflows/deploy.yml`)

> The workflow file was renamed to `.github/workflows/ci.yml` on 2026-09-08 and
> the `build-and-deploy` job below was deleted. The `test` job survives
> byte-identical and is described accurately here; **CI deploys nothing**.

Triggers: every `pull_request`, and `push` to `main`.

### `test` job (runs on both triggers — still current)

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

### `build-and-deploy` job (deleted 2026-09-08)

It read as follows. `needs: test`, and additionally `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`,
so PRs are tested but never deployed.

1. `google-github-actions/auth@v2` with the `GCP_CREDENTIALS` repository secret (service-account JSON).
2. `gcloud auth configure-docker asia-east1-docker.pkg.dev`.
3. `docker build -t <image>:<sha> .` then `docker push`.
4. `google-github-actions/deploy-cloudrun@v2` to service `cg1618-tracker`, region `asia-east1`, `timeout: 3600s` (request timeout, long enough for the SSE Fill/Replace streams).

The deploy step only passed the image; env vars, secrets, the Cloud SQL
attachment and scaling settings were whatever was already configured on the
service and were carried over between revisions.

## Runtime behaviour on Cloud Run (all of this is gone)

Cloud Run set `K_SERVICE` automatically. `app/config.py` exposed that as
`settings.is_cloud_run`, and it was the single switch for every production
difference. **None of these branches exist any more** — there is no
production-mode concept in the code at all today, which is itself the first
thing self-hosting has to build.

| Where (all as of 2026-09-06) | Local then | Cloud Run then |
| --- | --- | --- |
| `Settings.sqlalchemy_database_url` | `postgresql://user:pw@localhost:5432/db` | If `INSTANCE_CONNECTION_NAME` is set: `postgresql+psycopg2://user:pw@/db?host=/cloudsql/<instance>` (Unix socket). A `DATABASE_URL` containing `localhost` is ignored so a leaked local `.env` cannot break the container. |
| `Settings.validate_production()` (lifespan start) | no-op | Raises `RuntimeError` if `JWT_SECRET_KEY` or `ADMIN_PASSWORD` are still the dev defaults or the DB URL points at localhost. The container exits. |
| `Settings.bucket_name` | `GCP_BUCKET_NAME` or `None` (covers on disk) | `GCP_BUCKET_NAME` or the default `cg1618-anime-covers` |
| `app/utils/gcp_utils.get_gcs_client()` | service-account JSON from `GOOGLE_CREDENTIALS_JSON`, else Application Default Credentials | `storage.Client()` with the Cloud Run service account's IAM identity (no key file) |
| Login cookie (`app/routers/auth.py`) | `secure=False`, `httponly`, `samesite=lax` | `secure=True` |
| `app/database.py` | | Prints a CRITICAL message if the URL still contains `localhost` (the validate step then aborts) |

Note the Sheets client (`app/services/integrations/sheets.py`) does **not**
use IAM: it always needs `GOOGLE_CREDENTIALS_JSON` (or a `credentials.json`
file, which did not exist in the image), so that variable had to be set on the
service. **That is still true of Sheets today** — it is the one part of this
file that never depended on GCP compute.

### Environment variables and secrets on the service

These were set on the Cloud Run service (Console > Edit & deploy new revision >
Variables & Secrets), preferably as Secret Manager references for the
sensitive ones. `INSTANCE_CONNECTION_NAME`, `GCP_BUCKET_NAME` and `K_SERVICE`
are no longer read by anything and have been dropped from `.env.example`:

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
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | for Fill Game | Twitch application credentials, not an IGDB key — IGDB authenticates through Twitch. Both or neither: with one missing the client logs and skips, so Fill Game fills nothing. The bearer token is fetched and refreshed at runtime and is **not** an env var. |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALGORITHM` | optional | Defaults 1440 / HS256. |

`K_SERVICE` and `DATABASE_URL` were never to be set by hand. `K_SERVICE` no
longer means anything to the app; `DATABASE_URL` is now honoured **verbatim**
wherever it is set, so a stale value in a `.env` will be used as written.

## Cover images (GCS) — removed

> `app/services/integrations/image_manager.py` no longer has a GCS arm and
> `app/utils/gcp_utils.py` no longer exists. Covers are written to and served
> from `static/covers/` unconditionally, on every host. The layout below is
> still accurate for the keys on disk; the bucket half is history.

`image_manager.py` used to be a two-armed storage abstraction. Every function
checked `get_active_bucket_name()`: with a bucket it used the GCS client,
without one it used `static/covers/` on the local disk. Only the second arm
survives.

- Object name is `<owner_type>/<system_id>.jpg`, content type `image/jpeg`.
  The owner type is the table the id belongs to; `image_manager.cover_key()`
  builds it and `COVER_OWNERS` lists the thirteen valid folders.
- `download_cover_image(url, owner_type, id)` skips the fetch if the file
  already exists, otherwise downloads with a browser `User-Agent` (MAL's CDN
  returns 403 without one). It used to upload with `upload_from_string`.
- `delete_cover_image`, `cover_image_exists` and `list_all_cover_images`
  (used by the Data Control "check cover image" / "delete orphaned covers"
  actions) followed the same branch and are now local-only too.
- The frontend built the URL itself (`frontend/src/lib/covers.js`):
  `/static/covers/<key>` on localhost, otherwise
  `https://storage.googleapis.com/<bucket>/<key>`. The bucket therefore
  needed **public read** on objects (uniform bucket-level access with
  `allUsers: roles/storage.objectViewer`), and the Cloud Run service account
  needed `roles/storage.objectAdmin` (or objectCreator + objectViewer +
  delete) on it. `getCoverUrl` now returns `/static/covers/<key>` on every
  host and the bucket URL is gone.

`static/quotes/` (quote images) was local-only: Cloud Run's filesystem was
ephemeral and the frontend hides those controls off localhost. Quote and meme
images keep their own flat directory and were not part of the folder move.
That hostname gate is still in `covers.js` (`getQuoteImageUrl` returns `null`
off localhost) and is to be revisited with self-hosting, where the disk is
persistent.

### The bucket is still flat — and can no longer be migrated

The objects in the bucket sit at its root, under the old flat layout, because
the deployment was down when the folder move was made and they could not be
migrated with the local files. That is still true of the bucket. What has
changed is that there is no longer a tool to fix it: the `--gcs` branch of
`scripts/migrate_cover_layout.py` (and its `GcsStore` class) was deleted on
2026-09-08, so the script is local-only. Anyone reviving GCP would have to
write that migration again, or re-upload from `static/covers/`, which now
holds the canonical set in the new layout.

## Google Sheets service account — **still live**

> Nothing in this section went away with GCP. Sheets is reached with a service
> account over the Sheets/Drive APIs, not through GCP compute, so Backup and
> Pull All keep working exactly as described, today, against the local
> database.

One service account is used for Sheets (it also served GCS locally, which no
longer applies). It needs:

- The Google Sheets API and Google Drive API enabled in the project.
- Editor access to the spreadsheet (share the sheet with the service
  account's email).
- Its JSON key in `GOOGLE_CREDENTIALS_JSON`, or a local `credentials.json`.

Backup writes every tab listed in `app/services/pipelines/tabs.py`; Pull
restores them in that order. Cloud Run's 3600 s request timeout covered a
full Backup.

## Database migrations in production

Migrations ran in `entrypoint.sh`, before uvicorn, on **every instance
start** — that part of the script is unchanged and still applies to any
container run. Alembic's `env.py` builds its URL from the same
`SQLALCHEMY_DATABASE_URL`, so the container migrated the Cloud SQL database it
was about to serve. To roll back, a previous image was deployed and
`alembic downgrade` run manually against Cloud SQL (there was no automated
downgrade path).

## Known limits (of the deployment as it was)

- **Single instance assumed.** `app/services/rbac/cache.py` keeps role
  permission sets in a process-global dict and invalidates it with `bump()`
  on every role/content-label write. A second instance would keep serving
  stale grants until restart. Max instances had to stay at 1. The single-
  process assumption is still in the code (the Cloud Run framing around it
  was dropped on 2026-09-08) and applies equally to a self-hosted box run
  with more than one worker.
- **Unguarded migrations.** Because `alembic upgrade head` runs on every
  start with no lock, two instances (or a cold start during a deploy)
  starting at once can race on the same migration. Another reason for max
  instances = 1 during rollouts.
- **No health endpoint.** There is still no `/api/health`; Cloud Run's default
  TCP startup probe was what decided a revision was live. `dev.ps1` locally
  polls `/api/announcements/` for the same purpose.
- **Alembic before validation.** The migration ran before
  `validate_production()`, so a misconfigured secret was discovered only
  after the schema had been migrated. Moot now — `validate_production()`
  was deleted; there is no startup validation at all, which is a blocker
  self-hosting has to fix (see
  [deployment-selfhost.md](deployment-selfhost.md)).
- **Cold start does DB work.** `ensure_schema` (inspects tables) and the
  RBAC/admin seed run on every boot; they are idempotent but added to cold
  start latency.
- **Long-running SSE.** Fill/Replace stream progress over SSE for minutes.
  They survived because the request timeout was 3600 s; lowering it would
  have cut the streams off. The same constraint will apply to any future
  proxy in front of the app.
