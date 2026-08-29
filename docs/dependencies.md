# Dependencies

---

## Python (`requirements.txt`)

| Package                | Version      | Purpose                                                                         |
| ---------------------- | ------------ | ------------------------------------------------------------------------------- |
| `fastapi`              | 0.110.2      | REST API framework — routing, request/response handling, dependency injection   |
| `pydantic`             | 2.7.1        | Data validation and serialization for request bodies and response models        |
| `pydantic-settings`    | 2.14.2       | Centralized environment/config loading (`app/config.py` `Settings`)             |
| `uvicorn`              | 0.29.0       | ASGI server — runs the FastAPI app                                              |
| `python-multipart`     | 0.0.9        | Parses `multipart/form-data` — required for `OAuth2PasswordRequestForm` (login) |
| `sqlalchemy`           | 2.0.23       | ORM and SQL toolkit — all database access                                       |
| `psycopg2-binary`      | 2.9.9        | PostgreSQL adapter for Python (binary distribution, no build deps needed)       |
| `alembic`              | 1.13.1       | Database schema migration management                                            |
| `bcrypt`               | 4.1.1        | Password hashing for the admin user                                             |
| `PyJWT`                | 2.8.0        | JWT token encoding and decoding for auth cookies                                |
| `passlib`              | 1.7.4        | Password utility library (legacy; bcrypt is used directly)                      |
| `gspread`              | 5.12.0       | Google Sheets API client — Backup and Pull pipelines                            |
| `google-auth`          | 2.23.3       | Google authentication — service account credentials for Sheets and GCS          |
| `requests`             | 2.31.0       | HTTP client — Tenrai API calls and cover image downloads                         |
| `google-cloud-storage` | 2.14.0       | Google Cloud Storage client — cover image upload and retrieval                  |
| `python-dotenv`        | 1.0.0        | Backs pydantic-settings' `.env` file loading for local development              |
| `pytz`                 | 2023.3.post1 | Timezone utilities — provides Asia/Taipei timezone for `get_taipei_now()`       |
| `tenacity`             | ≥8.0.0       | Retry decorator — exponential backoff for Tenrai API calls                       |

---

## Node / NPM (`frontend/package.json`)

### Runtime Dependencies

| Package                 | Version | Purpose                                                                                |
| ----------------------- | ------- | -------------------------------------------------------------------------------------- |
| `react`                 | ^18.3.0 | UI library                                                                             |
| `react-dom`             | ^18.3.0 | React DOM renderer                                                                     |
| `react-router-dom`      | ^6.27.0 | Client-side routing (`BrowserRouter`, `Routes`, `Link`, `useParams`, etc.)             |
| `@tanstack/react-query` | ^5.60.0 | Server state management — `QueryClient` is wired up; not actively used for queries yet |
| `@xyflow/react`         | ^12.11.3 | Relations canvas (`/relations`) — pan/zoom, custom nodes, drag-to-connect edges |
| `@dagrejs/dagre`        | ^3.1.1  | Layered left-to-right layout for the relations graph                                   |

### Dev Dependencies

| Package                       | Version | Purpose                                                                   |
| ----------------------------- | ------- | ------------------------------------------------------------------------- |
| `vite`                        | ^6.0.0  | Frontend build tool and dev server                                        |
| `@vitejs/plugin-react`        | ^4.3.4  | Vite plugin — JSX transform and React Fast Refresh                        |
| `tailwindcss`                 | ^4.2.2  | Utility-first CSS framework                                               |
| `@tailwindcss/vite`           | ^4.0.0  | Tailwind CSS Vite plugin (v4 integration — no `postcss.config.js` needed) |
| `vitest`                      | ^2.0.0  | Unit and component testing framework                                      |
| `@testing-library/react`      | ^16.0.0 | React DOM testing utilities for component unit tests                      |
| `@testing-library/jest-dom`   | ^6.0.0  | Custom jest matchers for DOM assertions                                   |
| `@testing-library/user-event` | ^14.0.0 | Simulates real browser interactions for testing                           |
| `jsdom`                       | ^25.0.0 | Pure-javascript browser environment for vitest                            |

---

## Vite Configuration (`frontend/vite.config.js`)

```js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/static": { target: "http://localhost:8000" },
    },
  },
  build: {
    outDir: "../frontend_dist",
    emptyOutDir: true,
  },
});
```

| Setting         | Value                   | Notes                                                                              |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Dev port        | 5173                    | Vite dev server                                                                    |
| `/api` proxy    | `http://localhost:8000` | Forwards API calls to FastAPI during development                                   |
| `/static` proxy | `http://localhost:8000` | Forwards cover image requests to FastAPI during development                        |
| Build output    | `../frontend_dist`      | Relative to `frontend/` — outputs to project root; served by FastAPI in production |
| `emptyOutDir`   | `true`                  | Clears old build before each new build                                             |

## Authorization dependencies

- `get_current_admin` (`app/dependencies.py`) — unchanged signature for its
  ~130 call sites, but now a thin wrapper: it resolves the viewer and checks
  the `admin` permission. Stricter than the token check it replaced — the user
  row is consulted, so a validly-signed token for a deleted user, or for one
  whose role has since lost admin, is rejected.
- `get_viewer` (`app/services/rbac/resolver.py`) — returns a `Viewer` for any
  request, authenticated or not. Never raises; an unresolvable caller is guest.
- `require_permission("...")` — dependency factory gating a route on one
  permission. 401, matching `get_current_admin`'s message and header.
- `resolve_viewer(request, db)` — the plain function behind both, so
  `get_current_admin` and `/api/auth/me` can call it without FastAPI injection.
