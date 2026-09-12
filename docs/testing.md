# Testing

Last verified: 2026-09-12

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
| `tests/unit/` | 94 | 1043 | Python only, no database, no network |
| `tests/api/` | 126 | 1301 | PostgreSQL database `anime_site_test` |
| `tests/services/` | 0 (only `__init__.py`) | 0 | placeholder, never populated |
| `frontend/src/**/*.test.{js,jsx}` | 103 | 852 `it`/`test` blocks | Node + jsdom |

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
   and `Base.metadata.create_all`. Alembic is not run for *this* schema; it
   comes from the current models, which is why the drop is needed (stale
   columns from old runs would otherwise linger). That blind spot is why the
   migration chain went 145 revisions unable to build a database at all, so
   one file does run it: `test_migrations_build_the_schema.py` upgrades a
   scratch database from empty and compares the result to the models, object
   by object and column by column. The RBAC roles that
   migration A would normally seed are created once here via
   `ensure_rbac_seed`, followed by `ensure_access_mode_seed` and
   `grant_all_modes_to_existing_accounts`. `drop_all` runs at session end.

   **Anything the lifespan seeds must be seeded here too, committed.** This
   has caused a hang twice. `with TestClient(app)` runs the lifespan on its
   OWN connection; if a test transaction has already inserted the same rows
   uncommitted, the lifespan's INSERT blocks on the unique key - the test
   waiting on the client, the client waiting on the test, forever. Seeding
   here first keeps the lifespan's copy to a SELECT. The symptom is a run that
   produces no output at all rather than a failure, so it reads as "slow"
   rather than "stuck"; `SELECT ... FROM pg_stat_activity` shows one session
   `idle in transaction` and one `active` on `Lock: transactionid`.
2. `db_session` (function scope) opens one connection, begins an outer
   transaction and builds a `sessionmaker(bind=connection,
   join_transaction_mode="create_savepoint")`. Any `commit()` or `rollback()`
   the app performs acts on a SAVEPOINT, so production code paths run
   unchanged while the outer transaction is rolled back at teardown. Nothing a
   test writes survives it.
3. `_clear_permission_cache` (autouse) bumps the process-global caches before
   and after every test, because they are not part of the rolled-back
   transaction. There are **three** of them - role permissions,
   access-mode items, per-account denials - and one `bump()` clears all three.
   If that ever stops being true, mode state leaks between tests and the
   failures are random and order-dependent.

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
| `admin_client` | function | `TestClient` with a `testadmin` user (role `admin`) inserted, all four access modes granted, and a valid `access_token` cookie carrying a `mode` claim |
| `user_client` / `plain_user` | function | The same for an account on the `user` role |
| `super_client` / `super_user` | function | The same for the `super` role - both `manage.*`, no `admin.authz`. **This is the account shape that keeps a library**, so it is what a test of a personal endpoint should use: an admin holds no `self.*` grant. Use the fixture rather than building one inline |
| `mode_client(key, user=None, denials=())` | function | A client sitting in one named access mode. The mode travels in the token claim exactly as in production, so these exercise the real resolution path rather than a `Viewer` built by hand |
| `mode(key)` / `grant_mode(user, key, denials=(), is_default=False)` | function | The seeded modes, and granting one (optionally minus some labels, named by key) |
| `nsfw_label` / `hidden_anime` | function | A content label and an entry carrying it. Label fixtures call `carry_label_in_wide_modes`, because a mode's labels are materialised rows and a label created after the seed would otherwise reach no mode - which would make fixture ORDER decide what a mode holds |
| `catalog_writer(username=…, extra=…, label_keys=())` | function | An account holding `manage.catalog` in a mode carrying NO labels - i.e. a writer who cannot see the labelled entry |
| `sample_collection` | function | `Collection` "Test Collection" / "測試合集" |
| `sample_collected_franchise` | function | Anime `Franchise` linked to `sample_collection` |
| `sample_franchise` | function | Anime `Franchise` "Test Franchise" / "測試系列" |
| `sample_series` | function | `Series` under `sample_franchise` |
| `sample_anime` | function | TV `Anime` under `sample_franchise`, 12/12 episodes, Completed |
| `sample_comic` | function | `Comic` under `sample_franchise`, 6/6 issues, Completed |
| `role_id_for(db, name)` | helper, not a fixture | Looks up a seeded role's `system_id`; needed because `users.role` is a read-only mapping and fixtures must set `role_id` |
| `make_viewer(db, client, username, permissions, field_groups=None, label_keys=None)` | helper | Logs `client` in as a new account. `permissions` is the ROLE axis; the two keyword arguments are the OBJECT axis and build a bespoke mode. Both default to "everything", so a test that only cares about capabilities need not mention them |

**A signed-in test client with no `mode` claim resolves the EMPTY object set**
and every gated field vanishes from every response. Never mint a token by
hand; use the fixtures above. This has cost two debugging cycles, each time
presenting as "my route 401s / my field is missing" with nothing wrong in the
code under test.

Sample rows are `flush()`ed, not committed, so they are visible to the request
under test and vanish at teardown. Anything you need for other media types you
create inline (most files do) or add here.

## How to run

Use the project venv's interpreter, not the system Python.

```bash
# One-time: create the test database inside the postgres:17 container
docker exec anime_site_postgres_db createdb -U postgres anime_site_test

# Working alongside another session? Give yourself your own database and
# select it with POSTGRES_DB - tests/conftest.py uses os.environ.setdefault,
# so the variable wins. Two suites sharing one database produce spurious
# "relation role does not exist" and unique-constraint failures that look
# exactly like real breakage.
docker exec anime_site_postgres_db createdb -U postgres anime_site_test_mine

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

## The `media` supertable in tests

`tests/api/conftest.py` builds its schema with `Base.metadata.create_all` and
**never runs Alembic**, so anything a migration creates has to be attached to
the metadata as well or it simply does not exist under test. Two things in this
category, both in `app/models/media_sync.py`:

- the `delete_media_row()` function and the nine `trg_<table>_delete_media`
  triggers, attached as `after_create` DDL;
- the nine `<table>_public_id_seq` sequences, declared against the metadata now
  that no column hangs them.

Four guards keep the supertable honest, and a failure in any of them names the
media type that was missed rather than the symptom:

| Test | Guards |
|---|---|
| `tests/unit/test_media_constraints.py` | Every detail table declares the composite FK, the CHECK and the `media_type` column, and the FK is deferred. Alembic autogenerates none of these |
| `tests/api/test_media_supertable.py` | The same, in the database: the triggers really exist, a detail row cannot attach to a media row of the wrong type, and deleting either end cleans up both |
| `tests/api/test_display_name_drift.py` | `media.display_name` is denormalized; this walks every entry and compares the stored value with `compute_display_name` |
| `tests/api/test_public_id.py` | All nine detail routes resolve by `public_id` **and** by `system_id`, and a non-media route still resolves by its own |

A test that invents a `uuid4()` for a link row's `media_id` will now fail on the
foreign key: create a real entry and use its `system_id`. Every media entry gets
its `media` row automatically when it is constructed, so adding the entry is
enough.

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

## Gates that compute over a set, and fixtures that look like decoration

**A fixture that exists to make a negative test bite is load-bearing and looks
like decoration.**

`tests/api/test_clean_routes.py` asserts that a narrowed session is refused
`/api/data-control/clean/scan`. It takes an `nsfw_label` fixture that appears
nowhere in the body of the test. Remove it as "unused" and the test still
passes — but it now passes because the gate has nothing to refuse, not because
the gate works.

The mechanism: `is_unscoped` compares the session's mode against **all**
content labels and **all** field groups. With no labels in the database, the
comparison is `set() <= anything`, which is vacuously true, so `normal` carries
everything there is to carry and legitimately **is** unscoped. The label is
what makes a narrowed mode narrow.

Generalised: **any gate that computes over a set is vacuously satisfied when
the set is empty, and an empty set is exactly what a fresh test database gives
you.** The dangerous version of this bug is not a loud failure — it is
`assert response.status_code == 401` against a gate that happens to refuse
everything for an unrelated reason, going green on day one and staying green
through the change that breaks it.

Two rules follow:

1. Populate whatever set the gate computes over, and say in the docstring that
   the fixture is doing that job.
2. Assert the **mirror** case with the *same* fixture — an unscoped session
   reaching the handler while the label exists — so a green proves the mode did
   the refusing rather than something incidental about the route.

This is the same family as "when a loud refusal is being softened, put the
regression test on the read, not on the write": in both, the assertion runs,
ends green, and measures nothing.

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

`.github/workflows/ci.yml` (workflow name `Tests`) runs on **every pull
request, and on pushes to `main`**. Nothing else triggers it: a push to a
feature branch or to `dev` runs no CI at all, which is why every branch reaches
`dev` by pull request (`CLAUDE.md`, "Git Branches"). There is one job, `test`:

1. Starts a `postgres:17` service with `POSTGRES_DB=anime_site_test` and
   user/password `postgres`. Six variables reach the job env: those three,
   plus `APP_ENV=development` and throwaway values for `JWT_SECRET_KEY` and
   `ADMIN_PASSWORD` — the runner has no `.env`, and without them the startup
   secret check refuses to boot and every API test fails.
2. Python 3.13 (same as the Docker image), `pip install -r requirements-dev.txt`.
3. `ruff check .`
4. `pytest -q -p no:cacheprovider` (unit + API).
5. Node 20, `npm ci` in `frontend/`.
6. `npm run lint`
7. `npm run test:run`
8. `npm run build`

**The workflow deploys nothing**, and there is no second job. A red run is
therefore always a real test failure and never a failed release. There is no
deployment at all — [deployment-gcp.md](deployment-gcp.md) records the one
that existed, and [deployment-selfhost.md](deployment-selfhost.md) is the plan
for the one that does not yet.

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
