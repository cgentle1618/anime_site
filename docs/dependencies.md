# Dependencies

Last verified: 2026-08-30 (commit 4339702)

## What this is for

Every third-party package the app pulls in, with its pinned version and the
place in the code that needs it, so you can tell at a glance whether a package
is load-bearing before upgrading or removing it. It also records what has been
removed over time (so nobody re-adds it by habit) and how the Vite dev server
proxies to the backend. Backend versions are exact pins (`==`) in
`requirements.txt`; dev tools use minimum bounds; npm uses caret ranges with
`frontend/package-lock.json` as the lock.

## Python runtime (`requirements.txt`)

Installed into the Docker image from `python:3.13-slim` (`Dockerfile`) and in
CI with Python 3.13.

| Package | Version | Used by | Purpose |
|---|---|---|---|
| `fastapi` | 0.135.1 | `app/main.py`, all `app/routers/*` | Web framework: routing, dependency injection, response models |
| `pydantic` | 2.12.5 | `app/schemas/*` | Request/response validation and serialisation |
| `pydantic-settings` | 2.14.2 | `app/config.py` | Reads every env var once into `settings` (also loads `.env`) |
| `uvicorn` | 0.41.0 | `Dockerfile` CMD, dev command | ASGI server that runs the app |
| `python-multipart` | 0.0.22 | `app/routers/auth.py` | Form parsing for `OAuth2PasswordRequestForm` on login |
| `sqlalchemy` | 2.0.48 | `app/database.py`, `app/models/*`, services | ORM and query layer |
| `psycopg2-binary` | 2.9.11 | `app/database.py` (via the URL) | PostgreSQL driver, prebuilt wheel |
| `alembic` | 1.18.4 | `alembic/`, `app/schema_guard.py`, `app/models/staff.py` | Schema migrations; the guard checks the DB is at head |
| `bcrypt` | 5.0.0 | `app/services/security.py` | Password hashing for the seeded admin (called directly, no passlib) |
| `PyJWT` | 2.11.0 | `app/services/security.py`, `app/dependencies.py`, `app/services/rbac/resolver.py` | Sign and verify the `access_token` cookie |
| `gspread` | 6.2.1 | `app/services/integrations/sheets.py` | Google Sheets client for Backup and Pull |
| `google-auth` | 2.48.0 | `app/services/integrations/sheets.py`, `app/utils/gcp_utils.py` | Service-account credentials for Sheets and GCS |
| `requests` | 2.32.5 | `app/services/integrations/{tenrai,tmdb,omdb,comicvine,image_manager}.py` | HTTP calls to the metadata APIs and cover downloads |
| `google-cloud-storage` | 3.9.0 | `app/utils/gcp_utils.py`, `app/routers/system.py` | Cover image upload, listing and deletion in the GCS bucket |
| `pytz` | 2026.1.post1 | `app/database.py` | `Asia/Taipei` timezone for `get_taipei_now()` |
| `tenacity` | 9.1.4 | `app/services/integrations/{tenrai,tmdb,omdb,comicvine}.py` | Retry with backoff around external API calls |

## Python dev and test (`requirements-dev.txt`)

`pip install -r requirements-dev.txt` installs the runtime set too (`-r
requirements.txt`).

| Package | Bound | Used by | Purpose |
|---|---|---|---|
| `pytest` | >=8.0 | `tests/` | Test runner (`pytest.ini` holds the config) |
| `pytest-cov` | >=5.0 | optional `--cov` runs | Coverage report; no threshold is enforced |
| `httpx` | >=0.27 | `fastapi.testclient.TestClient` (indirect) | Transport that Starlette's `TestClient` requires; its `anyio` plugin also serves the `pytest.mark.anyio` tests |
| `freezegun` | >=1.5 | `tests/unit/test_security.py` | Travel time to test JWT expiry |
| `responses` | >=0.25 | nothing (see gaps in testing.md) | Was meant to mock `requests`; currently unused |
| `ruff` | >=0.6 | `ruff.toml`, CI | Lint and formatter for the backend |

## npm runtime (`frontend/package.json` dependencies)

| Package | Range | Used by | Purpose |
|---|---|---|---|
| `react` | ^18.3.0 | everything under `frontend/src` | UI library |
| `react-dom` | ^18.3.0 | `frontend/src/main.jsx` | DOM renderer |
| `react-router-dom` | ^6.27.0 | `App.jsx`, cards, pages | Client-side routing |
| `@tanstack/react-query` | ^5.60.0 | `hooks/useApiQuery.js`, `hooks/useLibraryState.js`, `hooks/useMediaCacheUpdate.js`, `api/mutations/useMediaMutation.js` | Server-state cache: queries, mutations, cache patching after edits |
| `@xyflow/react` | ^12.11.3 | `components/relations/{RelationGraph,RelationNode,FanEdge}.jsx` | Pan/zoom canvas, custom nodes and edges for `/relations` |

## npm dev (`frontend/package.json` devDependencies)

| Package | Range | Purpose |
|---|---|---|
| `vite` | ^6.0.0 | Dev server on :5173 and production bundler (`frontend_dist/`) |
| `@vitejs/plugin-react` | ^4.3.4 | JSX transform and Fast Refresh; also loaded in `vitest.config.js` |
| `tailwindcss` | ^4.2.2 | Utility CSS; theme tokens live in `src/index.css` |
| `@tailwindcss/vite` | ^4.0.0 | Tailwind v4 Vite plugin (no PostCSS config needed) |
| `vitest` | ^2.0.0 | Test runner (`test`, `test:run`, `test:ui` scripts) |
| `jsdom` | ^25.0.0 | DOM environment for vitest |
| `@testing-library/react` | ^16.0.0 | Render components and query the DOM in tests |
| `@testing-library/jest-dom` | ^6.0.0 | DOM matchers, loaded by `src/test-setup.js` |
| `@testing-library/user-event` | ^14.0.0 | Realistic clicks and typing in component tests |
| `eslint` | ^9.39.5 | Linter (`npm run lint`, run in CI) |
| `@eslint/js` | ^9.39.5 | ESLint's recommended rule set for `eslint.config.js` |
| `eslint-plugin-react` | ^7.37.5 | React rules |
| `eslint-plugin-react-hooks` | ^7.1.1 | Rules of hooks / exhaustive deps |
| `globals` | ^17.11.0 | Browser and Node global names for the flat ESLint config |
| `prettier` | ^3.9.6 | Formatter (`npm run format`, `format:check`; `.prettierrc`) |

## Removed over time

Taken from `git log -p` on the dependency files. Do not reintroduce these
without a reason.

| Package | Removed in | Why |
|---|---|---|
| `jinja2` | 99d60c8 | Server-rendered templates replaced by the React SPA |
| `passlib` | 155b298 | `bcrypt` is called directly in `security.py`; passlib was dead weight |
| `python-dotenv` | 155b298 | `pydantic-settings` loads `.env` itself |
| `pytest-asyncio` | 9f52223 | Async tests use the `anyio` plugin bundled with the httpx/Starlette stack |
| `factory-boy` | 9f52223 | Never used; sample rows are plain fixtures in `tests/api/conftest.py` |
| `@dagrejs/dagre` | 9f52223 | Relation layout moved to the in-house `lib/relationLayout.js` |

Commit 155b298 also re-pinned every runtime package from the 2023-era versions
(FastAPI 0.110, SQLAlchemy 2.0.23, gspread 5.12, ...) to the versions above and
switched the image and CI to Python 3.13. The "Jikan" name that survives in
old commit messages and a few identifiers refers to what is now the Tenrai
client; there was never a `jikan` package dependency.

## Vite dev proxy (`frontend/vite.config.js`)

```js
server: {
  port: 5173,
  proxy: {
    '/api':    { target: 'http://127.0.0.1:8000', changeOrigin: true },
    '/static': { target: 'http://127.0.0.1:8000' },
  },
},
build: { outDir: '../frontend_dist', emptyOutDir: true },
```

| Setting | Value | Why |
|---|---|---|
| Dev port | 5173 | Vite serves `frontend/src` with hot reload |
| `/api` proxy | `http://127.0.0.1:8000` | Forwards API calls to uvicorn so cookies stay same-origin |
| `/static` proxy | `http://127.0.0.1:8000` | Cover images served by FastAPI in local mode |
| Target host | `127.0.0.1`, not `localhost` | uvicorn binds IPv4 only; on Windows Node resolves `localhost` to `::1` first and the proxy fails |
| `outDir` | `../frontend_dist` | Bundle uvicorn serves on :8000; gitignored, rebuilt with `npm run build` |
| `emptyOutDir` | `true` | Old bundle is cleared on each build |

Plugins: `react()` and `tailwindcss()`. There is no test block here; vitest has
its own `frontend/vitest.config.js`.
