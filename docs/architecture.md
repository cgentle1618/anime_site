# Architecture

Last verified: 2026-08-30 (commit 4339702)

**What this is for.** A map of the backend: how a request travels through the
`app/` package, where each kind of code lives, and the two generator patterns
(the media-type registry and the pipeline runner) that produce most of the API
surface. Read this before adding a media type, a router, or a pipeline.
Authentication (login, JWT cookie) is in `authentication.md`; permissions,
roles and content labels are in `authorization.md`; this page only says where
those hook in.

## Request flow

```
browser (React SPA, fetch /api/...)
  -> Cloud Run / uvicorn  (or Vite dev proxy 5173 -> 8000)
  -> FastAPI app (app/main.py)
       global exception handler (500 -> {"detail": "An unexpected server error occurred."})
       /static/*   -> StaticFiles("static")            local covers, quote images
       /assets/*   -> StaticFiles("frontend_dist/assets") Vite bundle
       /api/*      -> routers (app/routers/*)
            Depends(get_db)              one SQLAlchemy session per request
            Depends(get_viewer)          who is asking (cookie -> user -> role -> permissions)
            Depends(get_current_admin)   401 unless the viewer holds the admin permission
            -> services (domain / pipelines / integrations / rbac)
            -> models (SQLAlchemy) -> PostgreSQL
       /{path}     -> SPA catch-all (last route) serves frontend_dist/index.html
```

Routers are thin: validation via Pydantic schemas (`app/schemas`), DB access via
the session, business rules delegated to `app/services`. Responses are
Pydantic response models; errors are `HTTPException` with a `detail` string,
which is the one error shape the SPA understands.

## Package map

```
app/
  main.py          app factory, boot sequence, router registration, SPA catch-all
  config.py        Settings (pydantic-settings); the only place env vars are read
  database.py      engine, SessionLocal, Base, get_taipei_now()
  dependencies.py  get_db, get_current_admin
  registry.py      MEDIA_REGISTRY: one MediaTypeSpec per media type
  schema_guard.py  ensure_schema(): decides whether to create_all on boot
  models/          SQLAlchemy models (one module per table group)
  schemas/         Pydantic request/response models
  routers/         one APIRouter per resource; _factory.py and _patching.py are shared
  services/
    domain/        pure business rules: hierarchy, derivation, checking, completion,
                   credits, duplicates, plan_next, remarks, search, seasonal, watch_order ...
    pipelines/     Fill / Replace / Pull / Backup: runner.py, specs.py, tabs.py + per-op modules
    integrations/  outbound HTTP: tenrai, tmdb, omdb, imdb, comicvine, sheets, image_manager
    rbac/          permissions, resolver (Viewer), enforcement, field_gate, cache, seed
    calculation.py cover-image bookkeeping used by Data Control "Calculate"
    security.py    bcrypt hashing, JWT create/decode
  utils/           stateless helpers: formatter (sheet row <-> model), parsers for each
                   external API, media_resolver (type key -> model), constants, release_date ...
alembic/           migrations (env.py reuses app.database.SQLALCHEMY_DATABASE_URL)
frontend/          React + Vite SPA; builds to frontend_dist/
tests/             unit (no DB) and api (PostgreSQL) tiers, see testing.md
```

### Routers and prefixes

All routers are registered in `app/main.py` in this order (order matters only
for the catch-all, which is last).

| Module | Prefix | Notes |
| --- | --- | --- |
| `auth` | `/api/auth` | login / logout / me |
| `options` | `/api/options` | system options (three tiers) |
| `constants` | `/api/constants` | enum vocabularies for the SPA |
| `collection` | `/api/collection` | |
| `franchise` | `/api/franchise` | |
| `series` | `/api/series` | |
| `anime` | `/api/anime` | registry entry (factory) |
| `anime_movie` | `/api/anime-movie` | registry entry (factory), no series |
| `cartoon` | `/api/cartoon` | factory |
| `movie` | `/api/movies` | factory |
| `tv_show` | `/api/tv-show` | factory |
| `manga` | `/api/manga` | factory |
| `note` | `/api/notes` | |
| `novel` | `/api/novel` | factory |
| `comic` | `/api/comic` | factory router nested in a prefix-less router that adds `GET /api/comic/search-comicvine` |
| `watch_order` | `/api/watch-order` | |
| `media_relation` | `/api/media-relation` | |
| `plan_next` | `/api/plan-next` | |
| `quote` | `/api/quote` | |
| `meme` | `/api/meme` | |
| `seasonal` | `/api/seasonal` | |
| `search` | `/api/search` | server-side search endpoint |
| `announcements` | `/api/announcements` | |
| `form_defaults` | `/api/form-defaults` | |
| `data_control` | `/api/data-control` | Fill / Replace / Pull / Backup / Calculate / Check |
| `system` | `/api/system` | |
| `person` | `/api/person` | |
| `studio` | `/api/studio` | |
| `credits` | `/api/credits` | |
| `roles` | `/api/roles` | RBAC admin |
| `users` | `/api/users` | RBAC admin |
| `content_labels` | `/api/content-labels` | visibility labels |

To print the live route table:

```powershell
venv\Scripts\python.exe -c "from app.main import app;[print(sorted(r.methods),r.path) for r in app.routes if hasattr(r,'methods')]"
```

Endpoint-level detail (parameters, bodies) is in `api.md`.

## The media-type registry and router factory

Eight media types share one router shape. What differs per type is declared
once in `app/registry.py` as a frozen `MediaTypeSpec`; `app/routers/_factory.py`
(`make_media_router(spec)`) turns it into an `APIRouter`. Anime and anime
movie used to be hand-written routers; they are now ordinary registry entries
that differ only in the hooks they declare.

### `MediaTypeSpec` fields

| Field | Meaning |
| --- | --- |
| `key` | internal key, e.g. `tv_show`; the `MEDIA_REGISTRY` dict key |
| `owner_type` | hyphenated key used by notes, remarks, credits, plan-next and visibility (`OWNER_TABLES`), e.g. `tv-show`. Never use `key` for those. |
| `label` | human label for messages and OpenAPI tags (`"<label> Management"`) |
| `route` | URL segment: `/api/<route>` (`movies`, `anime-movie`, ...) |
| `model`, `create_schema`, `update_schema`, `response_schema` | SQLAlchemy model and the three Pydantic schemas |
| `status_field` | `watching_status` or `reading_status`; used by the complete endpoint |
| `list_filters` | column names accepted as equality query params on the list endpoint |
| `hierarchy_names` | semantic key (`en`, `cn`, `roman`, `jp`, `alt`) -> name column, passed to the hierarchy resolver |
| `search_fields` | columns matched by `?search_query=`; empty tuple disables search |
| `resolve_hierarchy` | `(db, franchise_id, series_id, names) -> (franchise_id, series_id)`; creates or finds parents |
| `mark_completed` | `(entry) -> None`, sets status/timestamps on `POST /{id}/complete` |
| `write_hook` | optional `async (db, id_str, action_type, log_action)` run **after commit** (the six regular types run their single-entry Replace pipeline here) |
| `pre_commit_hook` | optional `(db, entry)` run **inside** the create/update transaction (anime: synchronous Tenrai autofill + `ep_previous` derivation, `app/services/domain/anime_write.py`) |
| `has_series` | `False` for anime movie, whose table has no `series_id` |
| `extra_filters` | optional `(query, query_params) -> query` for non-equality filters (anime: `?airing_season=SPR 2024`) |

### Routes the factory generates per type

| Method | Path | Auth | Behaviour |
| --- | --- | --- | --- |
| GET | `/api/<route>/` | viewer | list; `list_filters`, `extra_filters`, `search_query`; visibility applied via `apply_entry_visibility`; link fields and plan flags attached |
| GET | `/api/<route>/{id}` | viewer | 404 for missing **and** for hidden entries (indistinguishable by design) |
| POST | `/api/<route>/` | admin | resolve parents, pop remark/plan flag, `pre_commit_hook`, commit, `write_hook` |
| PUT | `/api/<route>/{id}` | admin | full update, same hook sequence |
| PATCH | `/api/<route>/{id}` | admin | column patch through `_patching.apply_column_patch` (whitelisted columns) |
| POST | `/api/<route>/{id}/complete` | admin | `mark_completed` + `apply_completion_timestamp` |
| DELETE | `/api/<route>/{id}` | admin | deletes credits links, plans, cover image; logs to the deleted-record table |

Field-level gating (`app/services/rbac/field_gate.gate`) is applied to
responses so viewers without a permission do not receive the gated columns;
see `authorization.md`.

### Adding a media type

1. Model in `app/models`, schemas in `app/schemas`, Alembic migration.
2. Hierarchy resolver and `mark_*_completed` in `app/services/domain`.
3. A `MediaTypeSpec` in `MEDIA_REGISTRY`; a two-line `app/routers/<type>.py`
   calling `make_media_router`; `include_router` in `main.py`.
4. Register the type in `app/utils/media_resolver.MEDIA_TABLES` (and
   `OWNER_TABLES`) so notes, credits and visibility can address it.
5. A `PipelineSpec` in `app/services/pipelines/specs.py` and a `SheetTab` in
   `tabs.py` if it has Fill/Replace/Backup.
6. Tests: see `testing.md`, "Writing a test for a new media type".

## The pipeline runner

`app/services/pipelines/runner.py` is the single Fill/Replace loop. It
replaced ~20 hand-copied SSE loops that had drifted. Per-type facts live in
`specs.py` as a frozen `PipelineSpec`:

| Field | Meaning |
| --- | --- |
| `key`, `label`, `model` | hyphenated type key (`anime-movie`), label, model |
| `extract_id` | per entry, before queueing (e.g. parse a MAL/TMDB/Comic Vine id from a link) |
| `fill_eligible(db, entry)` / `fill(db, entry)` | which entries to fetch, and the fetch+write |
| `fill_sleep` | pause between fetches (`MAL_PAUSE = 1`, `COMICVINE_PAUSE = 1`) |
| `post_process(entry, db)` | every entry after the queue (derivations) |
| `fill_after`, `replace_after` | `(progress message, fn(db))` steps run after the loop |
| `budget()` | `False` stops early and reports the rest (OMDb daily quota) |
| `in_fill_all`, `in_replace_all` | whether "Fill All"/"Replace All" include this type |
| `replace_select(db)` / `replace(db, entry, bulk)` | bulk Replace; `None` means no bulk Replace |
| `single_after` | steps after a single-entry Replace |

`run_fill`, `run_replace`, `run_replace_single` and `run_all` are async
generators yielding `data: {json}\n\n` SSE frames
(`status=processing|complete|error`, `current_entry`, `processed`, `total`).
External fetches are synchronous `requests` calls, so each one runs in
`run_in_threadpool`; the `await` keeps the SSE stream and every other request
alive. `request.is_disconnected()` is checked between entries and raises
`CancelledError` so a closed tab stops the run. One row is written to the
data-control log per run the user actually started (`log_action=False` for
sub-pipelines under Fill All / Replace All).

`tabs.py` is the matching registry for Google Sheets: `SHEET_TABS` declares
each tab's name, model, parser and **restore order** once; Backup writes and
Pull restores from that list.

### How `/api/data-control` routes are generated

`app/routers/data_control.py` declares literal routes first (`/fill/all`,
`/replace/all`, `/backup`, `/pull`, the Calculate and Check endpoints), then
loops:

- `for spec in PIPELINES.values()`: `POST /fill/<key>`, `POST /replace/<key>`
  (only if `replace_select` is set), `POST /replace/<key>/{entry_id}`.
- `for tab, media in MEDIA_TYPE_FOR_TAB.items()`: `POST /pull/<key>` per
  entry tab, then a generic `POST /pull/{tab_name}` for the remaining tabs.

Fill/Replace return `StreamingResponse` (SSE); Backup/Pull/Calculate return
JSON, with a 404/400 mapped from the result dict. Adding a type to
`PIPELINES` therefore adds its routes with no router edit.

## Boot sequence (`app/main.py`)

At import time:

1. `os.makedirs("static/covers")` and `static/quotes` (quote images are local-only).
2. `ensure_schema(engine)` (`app/schema_guard.py`): `migrated` -> nothing;
   `empty` -> `create_all` + warning to stamp Alembic; `unmanaged` (tables
   but no `alembic_version`) -> warning, nothing created. Alembic owns the
   schema; this only stops a dropped database from silently reappearing.
3. `FastAPI(...)` is created with the `lifespan` below, `/static` and (if
   `frontend_dist/` exists) `/assets` are mounted, routers included, catch-all
   added last.

In the lifespan (before the first request):

1. `settings.validate_production()` -- on Cloud Run, abort on default secrets.
2. `ensure_rbac_seed(db)` -- idempotent role/permission seed
   (`app/services/rbac/seed.py`).
3. Admin user: create `admin` with `ADMIN_PASSWORD` if missing; attach the
   admin role to a pre-RBAC `admin` row that has `role_id IS NULL`.
   Exceptions here are printed, not raised.

## Configuration

`app/config.py` defines `Settings(BaseSettings)` reading `.env` (encoding
utf-8, case-insensitive, unknown keys ignored) and exposes a cached module
singleton `settings`. Derived properties: `is_cloud_run` (`K_SERVICE` set),
`bucket_name` (explicit, else prod default on Cloud Run, else `None`),
`sqlalchemy_database_url` (Cloud SQL socket > `DATABASE_URL` unless it says
localhost > local). Never call `os.getenv` elsewhere. Full variable table:
`setup-local.md`.

## Database engine and sessions

`app/database.py`: `create_engine(url, pool_size=10, max_overflow=20,
pool_pre_ping=True, pool_recycle=1800)`, `SessionLocal =
sessionmaker(autocommit=False, autoflush=False)`, `Base = declarative_base()`.
`get_taipei_now()` returns a naive Asia/Taipei datetime used as the default
for timestamp columns. All ids are UUID `system_id` columns.

## Dependency injection (`app/dependencies.py`, `app/services/rbac/resolver.py`)

| Dependency | Returns | Use |
| --- | --- | --- |
| `get_db` | one `Session` per request, closed in `finally` | every DB route |
| `get_viewer` | `Viewer` (username, role, permission set, token payload); anonymous viewer if no/invalid cookie. Cached per request by FastAPI's dependency cache. | read routes that filter by visibility |
| `get_current_admin` | the JWT payload dict; raises **401** (never 403) unless `viewer.has(PERM_ADMIN)`. Consults the user row, so a deleted user or a role that lost admin is rejected even with a valid token. | every write route |
| `require_permission(perm)` | dependency factory for a single permission, same 401 shape | finer gates |

Permission sets per role are cached in-process (`rbac/cache.py`) and bumped on
every grant change; the cache assumes one process (see `deployment-gcp.md`).

## SPA catch-all

`GET /{full_path:path}` is the last route and is excluded from the schema.
If `frontend_dist/index.html` is missing it returns a JSON hint to run
`npm run build`. Otherwise it resolves `frontend_dist/<full_path>` and serves
it **only if** the resolved path is inside the dist directory, is not the
directory itself, and is a regular file; everything else (client-side routes,
`..%2F` traversal attempts) gets `index.html`. Unit test:
`tests/unit/test_spa_catch_all.py`.

## Logging

Standard `logging`; each module uses `logging.getLogger(__name__)`.
`app/routers/auth.py` calls `logging.basicConfig(level=logging.INFO)` at
import, which is currently what configures the root logger for the whole app.
Several boot messages still use `print`. The global exception handler logs
unhandled exceptions with a traceback and returns a generic 500 so stack
traces never reach the client. On Cloud Run stdout/stderr go to Cloud
Logging.

## Frontend in one paragraph

`frontend/src` is a React 18 SPA (react-router 6, TanStack Query for data
fetching, Tailwind v4 with semantic colour tokens, `@xyflow/react` for the
relation graph). Pages call `/api/...` with native `fetch` through
`src/api/endpoints.js`; auth state comes from the `me` endpoint
(`contexts/AuthContext`). Vite proxies `/api` and `/static` to :8000 in dev
and builds to `frontend_dist/` for uvicorn. Page and component detail:
`frontend/pages.md`, `frontend/components.md`, `frontend/admin-pages.md`.
