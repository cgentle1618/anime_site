# Authentication

Last verified: 2026-09-10 (APP_ENV, the secret fail-fast, and the closed hardening gate)

## What this is for

Authentication answers one question: *who is making this request?* The app has a single login form, a single kind of session (a signed JWT in an HTTP-only cookie), and a single seeded `admin` account plus whatever accounts an admin creates later. This document covers the login/logout round trip, how passwords and tokens are handled, what the browser learns from `/api/auth/me`, and how the React app reacts to being logged in or out. What a logged-in (or anonymous) viewer is *allowed* to see is a separate question, covered in [authorization.md](authorization.md).

## Files

| Concern | File |
| --- | --- |
| Login / me / logout routes | `app/routers/auth.py` |
| Password hashing, JWT minting | `app/services/security.py` |
| Cookie -> viewer resolution | `app/services/rbac/resolver.py` |
| `get_current_admin` dependency | `app/dependencies.py` |
| Admin seeding at boot | `app/main.py` (`lifespan`) |
| Settings (`JWT_SECRET_KEY`, expiry) | `app/config.py` |
| Frontend session state | `frontend/src/contexts/AuthContext.jsx` |
| Route guard | `frontend/src/components/layout/ProtectedRoute.jsx` |
| Login page | `frontend/src/pages/public/Login.jsx` |
| HTTP wrapper | `frontend/src/api/client.js` |
| Tests | `tests/api/test_auth.py`, `tests/unit/test_security.py`, `tests/api/test_admin_compat.py` |

## Login flow

`POST /api/auth/login` takes an `OAuth2PasswordRequestForm` (form-encoded `username` and `password`, not JSON).

1. Look up `users.username`. If no row, or `verify_password` fails, answer **401** `Incorrect username or password` with a `WWW-Authenticate: Bearer` header. The two failures are deliberately indistinguishable.
2. Mint a JWT (see below) and set it as the `access_token` cookie with the value `Bearer <token>`.
3. Return `{"message": "Successfully logged in", "role": "<role name>"}`.

`POST /api/auth/logout` deletes the cookie (same path/flags) and returns `{"message": "Successfully logged out"}`. It does not need a valid session to succeed.

There is no self-registration and no password reset. Accounts are created by an admin through `/api/users` (see [authorization.md](authorization.md)).

> ### The hardening gate — closed on 2026-09-10
>
> Step 2 shipped the `user` role, so an admin could invite somebody who is not
> an administrator, and two defects made that unsafe: the login cookie was
> `secure=False` unconditionally, and nothing refused a default
> `JWT_SECRET_KEY` or `ADMIN_PASSWORD`. **Both are fixed.** The cookie's
> `Secure` flag now follows `APP_ENV`, and `Settings.validate_secrets()` runs
> from the lifespan in **every** environment. See
> [The production signal](#the-production-signal-app_env) below.
>
> **Two things this did not do**, both still deliberately open: session
> lifetime is still a flat 24 hours with no refresh or revocation, and there is
> **no password reset** — an admin sets a password at `/users` and that is the
> only path. Neither blocks inviting somebody; both are worth designing before
> more than a handful of people use this.

## The production signal (`APP_ENV`)

`APP_ENV` names the runtime: `development` or `production`. A typo is rejected
at settings-validation time rather than interpreted, because "not development"
and "not production" fail in opposite directions and neither announces itself.

**Unset means `production`.** That is the minority convention — Rails, Django,
Laravel and Node all default to development — and it is chosen for the
direction it fails in. A dev machine that forgets `APP_ENV` sets a `Secure`
cookie over plain HTTP, the browser drops it, and login stops working
immediately on the machine you are sitting at. The opposite default lets a
public box run with an insecure cookie and say nothing. ASP.NET Core defaults
to Production for the same reason. Both dev machines therefore carry
`APP_ENV=development` in `.env`, and so does CI.

`Settings.validate_secrets()` is **not** gated on it, and that separation is
the point. It refuses to start while `JWT_SECRET_KEY` or `ADMIN_PASSWORD`
still holds the value `.env.example` used to ship, in development as well as
production — Django's `SECRET_KEY` raises whether or not `DEBUG` is set, for
exactly the reason this codebase already learned: the previous check,
`validate_production()`, returned early unless it was running on Cloud Run, so
it never fired on a developer's machine and then left with the GCP code
without anybody noticing it had gone. Both problems are reported in one
message, and neither message quotes the offending value.

It is called as the first statement of the lifespan in `app/main.py`, before
the `try` that swallows seeding errors into a printed line, and before the
admin account is seeded from `settings.admin_password` — otherwise the example
password would be hashed into the database before anything objected.

## Passwords (bcrypt)

`app/services/security.py`:

- `get_password_hash` encodes the password as UTF-8, **truncates to 72 bytes**, and hashes with `bcrypt.hashpw` and a fresh salt.
- `verify_password` applies the same truncation before `bcrypt.checkpw`, and returns `False` on any exception (malformed stored hash, bad encoding) rather than raising.

The 72-byte cut is bcrypt's hard input limit. It is applied on both sides so a very long password hashes and verifies consistently; the practical consequence is that only the first 72 bytes of a password are significant.

### Accounts with no password — `UNUSABLE_PASSWORD_HASH`

`app/services/security.py` also defines `UNUSABLE_PASSWORD_HASH = "!"` and
`is_unusable_password_hash(value)`. `"!"` is not a bcrypt hash and cannot be
produced by `get_password_hash` (every bcrypt hash starts `$2`), so no input
can verify against it: `checkpw` raises on the malformed salt and
`verify_password` returns `False`. Django uses the same leading `"!"`
convention for the same reason.

Accounts carrying it come from **one place**: a Google Sheets Pull. Since Step
4 the `Users` tab carries who exists and what role they hold but deliberately
**not** `hashed_password` — it is credential material for other people's
accounts, and a Backup writes the sheet outside this database's trust boundary
([data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy)). Pull stamps
the marker on an account it creates, and **never** touches an existing
account's hash, so a Pull All cannot lock the admin out of their own machine.
An admin gives such an account a real password through `PUT /api/users/{id}`
at `/users`.

## The JWT

| Item | Value |
| --- | --- |
| Algorithm | `HS256` (`settings.algorithm`) |
| Secret | `JWT_SECRET_KEY` (`settings.jwt_secret_key`) |
| Claims | `sub` = username, `role` = role name, `exp` = now + expiry |
| Expiry | `ACCESS_TOKEN_EXPIRE_MINUTES` = 1440 (**24 hours**), also used as the cookie `max_age` |

The `role` claim is **vestigial**. Nothing reads it for authorization: the server resolves the user's role and permissions from the database on every request (`resolver.py`), so a token minted before a role change carries a stale claim that is simply ignored. It is still minted because the login response and the old `User.role` shape returned it, and `User.role` is now a read-only `column_property` over `role.name` (`app/models/__init__.py`).

There is no startup check on the secrets any more. `settings.validate_production()`, which refused to boot on Cloud Run with a default `JWT_SECRET_KEY` or `ADMIN_PASSWORD`, was deleted with the GCP deployment on 2026-09-08; it never did anything locally. Self-hosting needs an equivalent guard before the app is exposed - see [deployment-selfhost.md](deployment-selfhost.md).

## The cookie

| Flag | Value | Why |
| --- | --- | --- |
| `key` | `access_token` | Read by `resolver._decode`, which expects the `Bearer ` prefix |
| `HttpOnly` | true | `document.cookie` cannot read it; XSS cannot exfiltrate the token |
| `SameSite` | `Lax` | Sent on same-site navigation and fetches; not on cross-site POSTs |
| `Secure` | `not settings.is_development` | Follows `APP_ENV`, not the request scheme: behind a tunnel the scheme is only trustworthy when proxy headers are configured correctly, and a missing header would produce an insecure cookie over HTTPS silently - the failure the flag exists to prevent. Django's `SESSION_COOKIE_SECURE` and Rails' `config.force_ssl` are per-environment settings for the same reason. Read per request rather than at import, so a test can move it. |
| `max_age` | 86400 s | Matches the JWT expiry |

The browser sends it automatically; the SPA always fetches with `credentials: "include"`.

## `GET /api/auth/me`

The one place the SPA learns who it is. It **never raises**: a missing, expired or badly signed cookie, a deleted user, or a missing role all resolve to the guest viewer, and even an unexpected exception falls back to `GUEST_FALLBACK`.

```json
{
  "is_admin": false,
  "username": null,
  "role": "guest",
  "is_superuser": false,
  "permissions": ["field_group.credits", "media_type.anime", "..."]
}
```

- `is_admin` is `viewer.has("admin")` - true for a superuser role or any role granted the `admin` permission.
- `username` is `null` for an anonymous caller.
- `permissions` is the sorted grant list of the viewer's role. For a superuser it may be empty; `is_superuser` is what says "everything".

## `get_current_admin` (`app/dependencies.py`)

Every write route and every admin-only router uses `Depends(get_current_admin)`. It calls `resolve_viewer` and requires `viewer.has("admin")`.

- Failure is always **401** with `Could not validate credentials or insufficient permissions` and `WWW-Authenticate: Bearer`. There is no 403 anywhere in the app: the SPA has one error shape to handle, and a non-admin caller learns nothing about *why* it was refused.
- Because the user row is consulted on each request, a validly signed token for a deleted user, or for a user whose role has since lost `admin`, is rejected immediately. There is no token blacklist or refresh flow to maintain.
- The return value is the decoded JWT payload (or `{sub, role}` built from the viewer). Only `users.py` reads it, for the "cannot delete yourself" guard.

`require_permission(<perm>)` in `resolver.py` is the generalised form for gating a route on any single permission; it answers 401 in the same shape.

## Admin seeding at boot

`lifespan` in `app/main.py`, before the first request:

1. `ensure_rbac_seed(db)` creates the `guest` and `admin` roles if missing (idempotent - see [authorization.md](authorization.md)).
2. If a `users` row named `admin` exists with a `NULL` `role_id` (a row from before the RBAC migration, or restored from a backup), it is attached to the `admin` role.
3. If no `admin` user exists at all, one is created with `ADMIN_PASSWORD` (default `admin123`) hashed via `get_password_hash` and `role_id` = the admin role.

Any exception during seeding is printed and swallowed so the server still starts; check the boot log for `Critical Error during seeding`.

## Frontend

### `AuthContext` (`frontend/src/contexts/AuthContext.jsx`)

`AuthProvider` fetches `/api/auth/me` on mount and exposes, via `useAuth()`:

| Field | Meaning |
| --- | --- |
| `isAdmin` | `is_admin` from the server; the flag every existing "show this control" check reads |
| `username` | `null` when anonymous |
| `role` | Role name, `"guest"` by default |
| `isSuperuser` | Mirrors the server flag |
| `permissions` | Array of grant strings |
| `has(permission)` | `isSuperuser || permissions.includes(permission)` - same semantics as `Viewer.has` on the server, backed by a `Set` |
| `loading` | True until the first `/me` response |
| `refetchAuth()` | Re-runs the `/me` fetch; the login page calls it after a successful `POST /login` |

A failed or non-OK `/me` request resets to the anonymous snapshot rather than erroring. Hiding in the UI is cosmetic - the server has already withheld anything the viewer may not see.

### `ProtectedRoute` and `?next`

`<Route element={<ProtectedRoute />}>` wraps every admin page in `App.jsx`. It takes an optional `permission` prop (default `"admin"`), shows a spinner while `loading`, then either renders the `<Outlet />` or redirects to `/login?next=<current path + search>` with `replace`.

`Login.jsx` posts the form, calls `refetchAuth()`, then navigates to `next` **only if it starts with `/`** (an absolute path on this site), otherwise to `/system`. That prevents an open redirect through the query string.

### No automatic redirect on 401

`fetchJson` in `frontend/src/api/client.js` does **not** intercept 401. Any non-2xx response throws an `Error` whose message is the backend `detail` (or `message`, or the HTTP status text); a 204 resolves to `null`. Pages and mutation hooks decide what to do with the error - typically a toast. So an admin whose cookie expired mid-session sees failed writes, not a forced trip to the login page, until they navigate to a protected route and `ProtectedRoute` sends them there. This is intentional: an in-progress form is not thrown away by a background 401.

## Known gaps

- **No rate limiting or lockout.** `POST /login` logs a warning per failed attempt and nothing else; brute force is bounded only by bcrypt cost.
- **No password policy.** Any non-empty string is accepted on `/api/users` create/update, and only the first 72 bytes count.
- **No session revocation short of a role change.** A cookie stays valid until its 24-hour `exp`; changing the user's password does not invalidate existing tokens. Deleting the user or removing `admin` from their role does take effect on the next request, because the role is re-read per request.
- **`JWT_SECRET_KEY` rotation logs everyone out**, since there is no key id or grace list.
- **The cookie is never `Secure`.** Fine for local HTTP, which is the only runtime today, but it has to be made conditional on the request scheme before the app is served over HTTPS to anyone.
