# Session Expiry Auto-Redirect

**Date:** 2026-05-09

## Problem

When an admin's JWT expires (24-hour lifetime), any admin API call returns 401 but the user only sees a generic error toast — they must manually navigate to the login page.

## Solution

Create a centralized `apiFetch` utility that wraps native `fetch()`. On any 401 response (except from the login endpoint), it performs a full-page redirect to `/login?next=<current-path>`. All `fetch()` calls with `credentials: "include"` are migrated to use `apiFetch()`.

## New File

**`frontend/src/utils/apiFetch.js`**

```js
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  if (res.status === 401 && !url.startsWith("/api/auth/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  return res;
}
```

- `/api/auth/login` is excluded — wrong-password 401 should stay on the login form
- `credentials: "include"` is now implicit — callers drop it from their options
- After login, the existing `?next` param handling in `ProtectedRoute` returns the user to their original page

## Scope

43 files updated: all `frontend/src` files currently using `fetch(..., { credentials: "include" })`.

## Verification

1. Delete `access_token` cookie in DevTools → trigger any admin action → verify redirect to `/login?next=<path>`
2. Log back in → verify `?next` returns you to the original page
3. Wrong password on login form → verify NO redirect (shows existing error message)
4. Normal admin actions (add/modify/delete) → verify no regressions
