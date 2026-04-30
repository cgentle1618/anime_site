# Testing Strategy

> **Status (as of 2026-04-27):** Tiers 1 and part of Tier 3 are implemented. Tiers 4–7 and most of Tier 3 are planned but not yet written. See the directory layout below — files marked _(planned)_ do not exist yet.

This document is the canonical reference for the CG1618 Media Tracker test suite. Tests are organized in a pyramid from fast, isolated unit tests up through full end-to-end flows.

---

## Stack

### Backend (Python)

| Package          | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `pytest`         | Test runner                                |
| `pytest-asyncio` | Async test support                         |
| `httpx`          | FastAPI `AsyncClient` for HTTP-level tests |
| `pytest-cov`     | Coverage reports                           |
| `freezegun`      | Freeze/travel time for JWT expiry tests    |
| `responses`      | Mock `requests.get` calls to Jikan API     |
| `factory-boy`    | Test data factories for SQLAlchemy models  |

Install: `pip install -r requirements-dev.txt`

### Frontend (JS)

| Package                       | Purpose                       |
| ----------------------------- | ----------------------------- |
| `vitest`                      | Vite-native test runner       |
| `@testing-library/react`      | Component rendering & queries |
| `@testing-library/jest-dom`   | DOM assertion matchers        |
| `@testing-library/user-event` | Simulate user interactions    |
| `jsdom`                       | Browser DOM environment       |
| `@playwright/test`            | End-to-end browser automation |

Install: `cd frontend && npm install`

---

## Directory Layout

```
tests/                          ← backend tests
  conftest.py                   ← in-memory DB, admin/guest client fixtures
  unit/
    test_utils.py               ← validate_episode_math, extract_mal_id_anime, etc.
    test_jikan_utils.py         ← map_jikan_to_anime_data
    test_formatter.py           ← format_model_for_sheet, parse_*_from_sheet  (planned)
    test_security.py            ← hashing, JWT sign/verify/expiry
    test_derivations.py         ← derive_watch_order_anime, ep_previous, prequel/sequel
    test_checking_rules.py      ← has_missing_values_anime, check_is_watching_completed
  api/
    conftest.py                 ← sample DB rows (franchise, series, anime)
    test_auth.py
    test_franchise.py
    test_series.py              (planned)
    test_anime.py               (planned)
    test_anime_movie.py         (planned)
    test_options.py             (planned)
    test_seasonal.py            (planned)
    test_system.py              (planned)
  services/
    test_jikan_service.py       ← Jikan HTTP client + rate limiter  (planned)
    test_image_manager.py       ← GCS / local cover image abstraction  (planned)
    test_sheets.py              ← Google Sheets sync  (planned)
    test_pipelines.py           ← Fill / Replace / Pull / Backup pipelines  (planned)

frontend/src/
  utils/anime.test.js           ← getDisplayName, getNextStatus, getCoverUrl, etc.  (planned)
  components/
    AnimeCard.test.jsx          (planned)
    ProtectedRoute.test.jsx     (planned)
  contexts/AuthContext.test.jsx (planned)
  pages/Login.test.jsx          (planned)

e2e/                            (planned — directory does not exist yet)
  playwright.config.js
  browse.spec.js                ← public pages load
  auth.spec.js                  ← login / logout / protected routes
  seasonal.spec.js
```

---

## Tier 1 — Pure Python Unit Tests

Tests for stateless functions with no DB or network dependencies.

### `tests/unit/test_utils.py` → `utils/utils.py`

- `validate_episode_math`: `ep_fin > ep_total` → clamps; `"?"`, `""`, `None` → `None`; `"1.0"` → `int`
- `extract_mal_id_anime`: valid MAL URL → ID; invalid → `None`
- `extract_season_from_title`: season string patterns

### `tests/unit/test_jikan_utils.py` → `utils/jikan_utils.py`

- `map_jikan_to_anime_data`: full response → correct dict; webp preferred over jpg; type/status/season/date mappings; official/twitter link extraction

### `tests/unit/test_formatter.py` → `utils/formatter.py`

- `format_model_for_sheet`: Anime/Franchise/Series/Option rows → string list; `None` → `""`
- `parse_*_from_sheet`: round-trip with format; UUID parsing; date parsing; empty strings → `None`

### `tests/unit/test_security.py` → `services/security.py`

- `get_password_hash`: output differs from input; two calls differ (salt)
- `verify_password`: correct → `True`; wrong → `False`
- `create_access_token` + decode: correct payload; expired token raises `JWTError` (via `freezegun`)

### `tests/unit/test_derivations.py` → `services/other_logics.py`

- `derive_watch_order_anime`: sequential assignment; null `season_part` skipped; airing type priority (TV before OVA); series grouping
- `derive_ep_previous_anime`: Season 1 → `0`; Season 2 → `S1.ep_total`; different series isolated
- `derive_prequel_sequel_anime`: links built; `derive_related=False` skipped; nulls only filled, not overwritten
- `derive_season_1_anime`: single TV in franchise → `"Season 1"`; multi TV → no change; non-TV → no change

### `tests/unit/test_checking_rules.py` → `services/other_logics.py` + `utils/utils.py`

- `has_missing_values_anime`: blank tracked fields → `True`; all filled → `False`; `"Not Yet Aired"` exceptions; `ep_previous` exemptions
- `check_is_watching_completed`: `ep_fin == ep_total > 0` → `True`; explicit `"Completed"` → `True`; partial → `False`

---

## Tier 2 — Frontend JS Unit Tests

Tests for pure utility functions in `frontend/src/utils/anime.js`.

**Setup**: `vitest.config.js` with `environment: "jsdom"`; `src/test-setup.js` imports `@testing-library/jest-dom`.

### `frontend/src/utils/anime.test.js`

- `getDisplayName`: CN → EN → Alt → Roman → JP fallback chain; all null → `""`
- `getSortName`: returns EN or Roman, never CN
- `getNextStatus`: all 10 statuses cycle in order; last wraps to first
- `getStatusButtonConfig`: all 10 statuses → `{symbol, color, nextStatus}`
- `getStatusStyle`: all statuses → Tailwind class string
- `getRatingWeight`: `"S"` → `0`; `"F"` → `7`; `null` → `8`
- `getCoverUrl`: `null` → empty; `"file.jpg"` → `/static/covers/file.jpg`; `https://` URL → unchanged
- `isBaha`: link set → `true`; absent → `false`

---

## Tier 3 — API Integration Tests

Test the full HTTP request → response cycle with an in-memory SQLite DB. No external services.

**Setup** (`tests/conftest.py`):

- `sqlite:///:memory:` engine; override `get_db` dependency
- All tables created on startup; row data rolled back after each test
- `admin_client`: `AsyncClient` with valid admin JWT cookie
- `guest_client`: `AsyncClient` with no auth

### `tests/api/test_auth.py`

- Valid login → `200` + `Set-Cookie: access_token`
- Wrong password → `401`
- Unknown user → `401`
- `GET /me` with cookie → `{is_admin: true}`
- `GET /me` without cookie → `{is_admin: false}`
- Logout → cookie cleared

### `tests/api/test_franchise.py`

- `GET /` → `200` + list; `GET /{id}` → `200`; bad ID → `404`
- `POST` (admin) → `201`; (guest) → `401`
- `DELETE` → `204` + `DeletedRecord` row created

### `tests/api/test_anime.py`

- Full CRUD + auth (same pattern as franchise)
- `POST` with `ep_fin > ep_total` → clamped in response
- `PATCH` +1 reaching `ep_total` → `watching_status` auto-set to `"Completed"`
- `GET ?airing_season=WIN+2025` → filtered results
- All responses include `cum_ep_fin` and `cum_ep_total`

### Other routers

`test_series.py`, `test_options.py`, `test_seasonal.py`, `test_system.py` — CRUD + auth matrix; system log deletion count verified.

---

## Tier 4 — Service Tests (Mocked Externals)

Verify business logic pipelines with all network calls mocked.

### `tests/services/test_jikan_service.py`

- Mock `requests.get` → returns mapped dict; 404 → `None`; 429 → `RateLimitExceeded`; 500 → `None`
- Rate limiter: 30th call succeeds; 31st blocks (`time.sleep` asserted)

### `tests/services/test_image_manager.py`

- Mock `requests.get` → `download_cover_image` writes bytes; non-200 → no file written
- Mock GCS `blob.upload_from_string` → called with correct content
- `delete_cover_image` → local unlink or `blob.delete()`
- `list_all_cover_images` → correct file list

### `tests/services/test_sheets.py`

- Mock gspread → `bulk_overwrite_sheet` calls `.clear()` then `.update()`
- 429 quota → retries 3× with backoff (`time.sleep` asserted)

### `tests/services/test_pipelines.py`

- `execute_fill_anime`: mocked Jikan → missing fields updated; SSE events have correct shape
- `execute_pull_specific`: string FK name → UUID resolved; parent auto-created if missing; duplicate skipped
- `execute_backup`: `bulk_overwrite_sheet` called for each of 4 tabs

---

## Tier 5 — Frontend Component Tests

### `AnimeCard.test.jsx`

- Renders display name and cover image
- Missing cover → placeholder shown
- Status button click → `PATCH /api/anime/{id}` called (mocked `fetch`)

### `AuthContext.test.jsx`

- Fetches `/api/auth/me` on mount; `isAdmin` reflects response
- Network error → `isAdmin` defaults `false`, no crash

### `ProtectedRoute.test.jsx`

- `isAdmin=true` → renders children; `isAdmin=false` → redirects to `/login`

### `Login.test.jsx`

- Username/password fields present; submit → `POST /api/auth/login`
- `401` → error message visible; `200` → `refetchAuth` called

---

## Tier 6 — End-to-End Tests (Playwright)

Run against a locally running server with seeded DB (`docker-compose up -d` + `uvicorn main:app`).

### `e2e/browse.spec.js`

- `/` loads without JS error
- `/library/anime` → anime card grid visible
- `/search?q=a` → results or empty state; no crash

### `e2e/auth.spec.js`

- `/add` (unauthenticated) → redirected to `/login`
- Wrong password → error message
- Correct login → `/add` now accessible
- Logout → `/system` redirects to `/login`

### `e2e/seasonal.spec.js`

- `/seasonal` → season list renders
- `/seasonal/{valid_id}` → entry list renders

---

## Tier 7 — Advanced / Quality Gates

### Coverage (pytest-cov)

Target: 70% line coverage overall; 90%+ on `utils/` and core derivation functions.

```
pytest --cov=. --cov-report=term-missing --cov-fail-under=70
```

### Migration Tests (`tests/test_migrations.py`)

Apply `alembic upgrade head`, verify schema, apply `alembic downgrade -1`, verify rollback.
Requires real PostgreSQL (use `docker-compose up -d`).

### Mutation Testing (mutmut)

```
mutmut run --paths-to-mutate=utils/,services/other_logics.py
mutmut results
```

Target mutation score: > 80% on derivation functions.

### Load Tests (Locust)

```
locust -f locustfile.py --headless -u 50 -r 5 --run-time 30s
```

Target: p95 < 500ms on `GET /api/anime/` at 50 concurrent users.

---

## Running Tests

```bash
# Backend unit + API + service tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=. --cov-report=term-missing

# Frontend unit + component tests
cd frontend && npm test

# E2E (requires running server)
cd frontend && npx playwright test

# All backend + frontend (from project root)
pytest tests/ -v && cd frontend && npm test -- --run
```
