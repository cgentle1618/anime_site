# Testing

Last verified: 2026-09-04 (commit c80c84a)

## What this is for

This page tells you where the tests live, what each tier needs to run, which
fixtures you can lean on, how to run everything locally, how to cover a new
media type, and what CI actually executes. It is written for someone who wants
to add or run tests without first reverse-engineering the conftests. Numbers
below were measured on the commit named above; re-count before quoting them
elsewhere.

## Layout and counts

| Location | Files | Test functions | Needs |
|---|---|---|---|
| `tests/unit/` | 59 | 722 | Python only, no database, no network |
| `tests/api/` | 78 | 878 | PostgreSQL database `anime_site_test` |
| `tests/services/` | 0 (only `__init__.py`) | 0 | placeholder, never populated |
| `frontend/src/**/*.test.{js,jsx}` | 62 | 495 `it`/`test` blocks | Node + jsdom |

Counts were taken with `grep -E '^\s*(async )?def test_'` on the Python files
and `grep -E '^\s*(it|test)\('` on the frontend files, so parametrised cases
count once. Backend tests use only two markers: `pytest.mark.parametrize`
(66 sites) and `pytest.mark.anyio` (10 sites, all in
`tests/api/test_pipeline_runner.py`).

Frontend tests are co-located with the source they cover
(`Nav.test.jsx` next to `Nav.jsx`, `lib/autofill.test.js` next to
`lib/autofill.js`). There is no `e2e/` directory and no Playwright.

## Configuration files

| File | Role |
|---|---|
| `pytest.ini` | `testpaths = tests`, `test_*.py` / `Test*` / `test_*` discovery, `addopts = -v --tb=short`. There is no `pyproject.toml`. |
| `tests/conftest.py` | Runs before any app import. Sets `POSTGRES_DB=anime_site_test`, `POSTGRES_USER=postgres`, a throwaway `JWT_SECRET_KEY`, `ADMIN_PASSWORD=testadmin123` via `os.environ.setdefault`. `POSTGRES_PASSWORD` is deliberately not defaulted: it comes from your `.env` (pydantic-settings) or the CI job env. |
| `tests/api/conftest.py` | Engine, session, client and sample-row fixtures for the API tier (see below). |
| `frontend/vitest.config.js` | `environment: "jsdom"`, `globals: true` (so `it`/`expect` need no import), `setupFiles: ["./src/test-setup.js"]`, React plugin. |
| `frontend/src/test-setup.js` | One line: `import "@testing-library/jest-dom"` for DOM matchers. |
| `ruff.toml` | Backend lint that CI runs before the tests (`E`, `F`, `I`, `B`; `tests/**` may shadow imported fixtures). |
| `frontend/eslint.config.js` | Frontend lint that CI runs before the tests. |

## Tiers

### Unit (`tests/unit/`)

Pure-Python tests of utilities, formatters, derivations, schemas, model
metadata and registries. No fixture in this tier opens a database connection;
the only file that touches `app.database` is `test_schema_guard.py`, which
reads model metadata. Time-sensitive JWT tests use `freezegun`.

Representative files: `test_utils.py`, `test_tenrai_utils.py`,
`test_tmdb_utils.py`, `test_comicvine_utils.py`, `test_formatter_*.py`,
`test_derivations.py`, `test_checking_rules.py`, `test_security.py`,
`test_release_date*.py`, `test_note_*.py`, `test_rbac_permissions.py`,
`test_rbac_viewer.py`, `test_field_groups.py`, `test_link_fields_schema.py`,
`test_sheets_retry.py`. Novel units: `test_novel_unit_model.py` (columns, kind vocabulary),
`test_novel_unit_schemas.py` (`NovelUnitWrite`/`Response`, `display_key`),
`test_novel_progress.py` (`normalize_arc_progress` rollover,
`derive_novel_progress`, `unit_display_key`), `test_novel_completion.py`
(`mark_novel_completed` with and without arc rows), `test_novel_unit_migration.py`
(the `nv1u2n3i4t5s` data migration's list-to-rows conversion), `test_formatter_novel_unit.py`
(`parse_novel_unit_from_sheet`, the "Novel Unit" sheet tab).

### API (`tests/api/`)

Full HTTP round trips through FastAPI's `TestClient` against a real
PostgreSQL database. `tests/api/conftest.py` does the following:

1. `test_engine` (session scope) refuses to run unless the database name
   contains `test`, then `DROP SCHEMA public CASCADE` / `CREATE SCHEMA public`
   and `Base.metadata.create_all`. Alembic is never run in tests; the schema
   comes from the current models, which is why the drop is needed (stale
   columns from old runs would otherwise linger). The RBAC roles that
   migration A would normally seed are created once here via
   `ensure_rbac_seed`. `drop_all` runs at session end.
2. `db_session` (function scope) opens one connection, begins an outer
   transaction and builds a `sessionmaker(bind=connection,
   join_transaction_mode="create_savepoint")`. Any `commit()` or `rollback()`
   the app performs acts on a SAVEPOINT, so production code paths run
   unchanged while the outer transaction is rolled back at teardown. Nothing a
   test writes survives it.
3. `_clear_permission_cache` (autouse) bumps the process-global role to
   permission cache before and after every test, because that cache is not
   part of the rolled-back transaction.

The `anyio` marker in `test_pipeline_runner.py` is served by the `anyio`
plugin that ships with Starlette/httpx; `pytest-asyncio` was removed.
`test_novel_units_api.py` covers `units` on `POST`/`PUT /api/novel`
(insert/update/delete-by-omission via `write_novel_units`, `display_key` on
the response, derived `arc_total`/`ch_total`/`ch_fin`, volume rows never
touching the volume counters, cascade delete on the parent novel, and
`selectinload` avoiding N+1 on list), plus `PATCH` rolling the
`arc_fin`/`ch_fin_in_arc` cursor over an arc boundary.

### Frontend (`frontend/src/**/*.test.*`)

Vitest with jsdom and Testing Library. Roughly half the files test pure
modules (`lib/`, `utils/`, `config/`, `api/endpoints`), the rest render
components with `@testing-library/react` and drive them with
`@testing-library/user-event`; 22 files stub modules or fetch with
`vi.mock`/`vi.fn`/`vi.spyOn`. `src/config/novelUnitKinds.test.js` is a
drift guard in the `planNext.test.js` style — it reads
`app/utils/constants.py` off disk (not a duplicated JS copy) and fails if
`NOVEL_UNIT_KINDS_BY_TYPE` in `lib/novelUnits.js` diverges from it, guarded
against a hollow pass by asserting the parsed map is non-empty and contains
all four novel types before comparing. `components/forms/NovelUnitsEditor.test.jsx`
covers the editor; `components/tracker/NovelDashboardCard.test.jsx` covers
the two-stage cursor stepper.

## Fixtures in `tests/api/conftest.py`

| Fixture | Scope | What you get |
|---|---|---|
| `test_engine` | session | Engine on `anime_site_test` with a fresh schema and seeded roles |
| `db_session` | function | SQLAlchemy session inside a rolled-back transaction (savepoint mode) |
| `_clear_permission_cache` | function, autouse | RBAC cache bumped before and after the test |
| `client` | function | Unauthenticated `TestClient` with `get_db` overridden to `db_session` |
| `admin_client` | function | `TestClient` with a `testadmin` user (role `admin`) inserted and a valid `access_token` cookie set |
| `sample_collection` | function | `Collection` "Test Collection" / "測試合集" |
| `sample_collected_franchise` | function | Anime `Franchise` linked to `sample_collection` |
| `sample_franchise` | function | Anime `Franchise` "Test Franchise" / "測試系列" |
| `sample_series` | function | `Series` under `sample_franchise` |
| `sample_anime` | function | TV `Anime` under `sample_franchise`, 12/12 episodes, Completed |
| `sample_comic` | function | `Comic` under `sample_franchise`, 6/6 issues, Completed |
| `role_id_for(db, name)` | helper, not a fixture | Looks up a seeded role's `system_id`; needed because `users.role` is a read-only mapping and fixtures must set `role_id` |

Sample rows are `flush()`ed, not committed, so they are visible to the request
under test and vanish at teardown. Anything you need for other media types you
create inline (most files do) or add here.

## How to run

Use the project venv's interpreter, not the system Python.

```bash
# One-time: create the test database (native PostgreSQL 17 or docker-compose)
createdb -U postgres anime_site_test

# Backend, all tiers
venv/Scripts/python -m pytest

# Backend, unit only (no database needed)
venv/Scripts/python -m pytest tests/unit

# Backend, API only
venv/Scripts/python -m pytest tests/api

# Coverage (pytest-cov)
venv/Scripts/python -m pytest --cov=app --cov-report=term-missing

# Lint, same as CI
venv/Scripts/ruff check .

# Frontend
cd frontend
npm run test:run        # one shot, what CI runs
npm test                # watch mode
npm run test:ui         # vitest browser UI
npm run lint            # eslint src
```

`POSTGRES_PASSWORD` must be set in `.env` for the API tier to connect. The
`test_engine` guard aborts if the configured database name lacks `test`, so a
mis-set `POSTGRES_DB` fails fast instead of wiping a real database.

## Adding tests for a new media type

Most cross-media coverage is table-driven, so a new media type is mostly a
matter of adding one row to each table and letting the parametrisation fan out.
Look at these files, in this order:

| File | Parametrised over | What to add |
|---|---|---|
| `tests/api/test_media_crud.py` | `CASES` list of `(route, name_field, status_field, model, deleted_record_label)` | One tuple. Covers create 201, get, 404, list, `search_query`, patch, delete + `DeletedRecord`. Entries are created with only a name so the write hook makes no network call. |
| `tests/api/test_cover_image_bulk.py` | `MEDIA_MODELS` list of `(model, name_field)` | One tuple, otherwise the new table's covers are reported as orphans and deleted. |
| `tests/api/test_data_control_routes.py` | `MEDIA` list of route slugs | One slug (note the `comic` exclusion for routes comic does not have). |
| `tests/api/test_media_type_gating.py`, `tests/unit/test_field_groups.py`, `tests/unit/test_rbac_permissions.py` | `MEDIA_TYPE_KEYS` from the registry | Nothing to add by hand; registering the type in `MEDIA_TABLES` makes these run. |
| `tests/unit/test_link_fields_schema.py` | `LINK_FIELD_MIXINS` | Nothing if the response mixin is registered; a mismatch fails here. |
| `tests/unit/test_release_date_models.py` | `ALL_MEDIA_MODELS` | Nothing if the model is in the list. |
| `tests/unit/test_plan_next_kinds.py` | `EXPECTED_MEMBERS` / `EXPECTED_NON_MEMBERS` | Decide which list the type belongs to. |

Type-specific behaviour (autofill mapping, completion rules, sheet formatter)
gets its own files following the comic precedent: `test_comic_model.py`,
`test_comic_schemas.py`, `test_comic_completion.py`, `test_comic_duplicates.py`,
`test_comic_fill_gate.py`, `test_formatter_comic.py` in `tests/unit/`, and
`test_comic_autofill.py` plus the `sample_comic` fixture in `tests/api/`. On the
frontend, `lib/autofill.test.js` pins one expected patch per media type and
`hooks/useFormDefaults.test.js` checks the defaults shape; extend both.

## The theme token guard

`frontend/src/theme-tokens.test.js` walks every `.js`, `.jsx` and `.css` file
under `frontend/src` (skipping `*.test.*`) and fails if it finds a hard-coded
grey utility such as `bg-gray-100`, `text-slate-500`, `border-zinc-200`,
`divide-neutral-*`, `ring-*` or `placeholder-*` in those palettes, with or
without variant prefixes (`dark:`, `hover:`). Colour must come from the
semantic tokens in `index.css` (`bg-surface`, `text-text-muted`,
`border-border`, ...) so both themes render. Two exceptions are built in: the
files `Nav.jsx` and `NavSearch.jsx` (the nav is always on the ink surface) and
the classes `bg-gray-900/800/700` anywhere (dark overlays over cover art). Add
to `ALLOWED_FILES` or `ALLOWED_CLASSES` only for a deliberate exception.

## What CI runs

`.github/workflows/deploy.yml` runs on every push to `main` and every pull
request. The `test` job:

1. Starts a `postgres:15` service with `POSTGRES_DB=anime_site_test`,
   user/password `postgres`, and exports the same three variables to the job.
2. Python 3.13 (same as the Docker image), `pip install -r requirements-dev.txt`.
3. `ruff check .`
4. `pytest -q -p no:cacheprovider` (unit + API).
5. Node 20, `npm ci` in `frontend/`.
6. `npm run lint`
7. `npm run test:run`
8. `npm run build`

`build-and-deploy` needs `test` to pass and only runs on a push to `main`; it
builds the Docker image, pushes it to Artifact Registry and deploys to Cloud
Run. A red test therefore blocks deployment.

## Known gaps

- `tests/services/` exists but is empty; the mocked-external service tests
  once planned there (Tenrai client, image manager, Sheets, pipelines) were
  never written. Integration code is covered indirectly by API tests that
  create entries without external links so the write hooks no-op.
- `responses` is listed in `requirements-dev.txt` but no test imports it; HTTP
  mocking is done ad hoc with `monkeypatch`.
- No end-to-end browser tests (no Playwright), no coverage threshold, no
  migration up/down test. Tests build the schema with `create_all`, so a
  migration that diverges from the models is not caught here (that is what
  `app/schema_guard.py` and `tests/unit/test_schema_guard.py` mitigate).
- `frontend/src/theme-tokens.test.js` is a lint disguised as a test; it runs
  under vitest because there is no custom ESLint rule for it.
- Only Anime and Comic have `sample_*` row fixtures; other media types are
  built inline in each test file.
