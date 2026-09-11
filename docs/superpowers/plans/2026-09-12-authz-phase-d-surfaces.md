# Authorization Phase D — the surfaces, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the access-mode axis the surfaces it has been missing since
Phase B — a page to edit modes, a panel to assign them per account, and a
switcher to change the active one mid-session — so that modes stop being a
`psql` job.

**Architecture:** Nothing new is invented. The five tables, the resolver, the
caches and the enforcement all shipped in Phase B; this phase is CRUD over
them plus one genuinely new idea, the session switch. `/access-modes` is
shaped on `roles.py` / `Roles.jsx` down to the `/catalog` endpoint that feeds
the checkbox grid. The per-account panel extends `Users.jsx` rather than
adding a page, because mode assignment is per-account and that is where role
assignment already lives. **No migration** — the schema is complete.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, PostgreSQL 17 in Docker, pytest;
React + Vite, Tailwind v4 semantic tokens, TanStack Query, vitest.
Python via `venv/Scripts/python.exe`.

> **SHIPPED 2026-09-12, 10 of 11 tasks.** `ac4c7baf`, `6fa9d13f`, `c91931bb`,
> `b5f0612a`, `2753bf68`, `384bbdd4`, `acb747a`, `61f19d1`, and the record-it
> commit. **Task 9, the switcher control, is outstanding** - blocked by another
> session holding `Nav.jsx`, and deliberately not relocated. The endpoint and
> everything behind it are done and tested; see docs/PROGRESS.md for the
> handover. `docs/roadmap.md` holds the durable record; this plan is otherwise
> spent.

**Spec:** `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
— **sections 3 and 5**, both approved 2026-09-11 in the same brainstorming
pass that produced the sections Phase B built, plus decisions 3, 4, 7 and 8.
Read them alongside this plan; the plan does not repeat their reasoning.

## Global Constraints

- **`Nav.jsx` and `Nav.test.jsx` are LOCKED** to another session until told
  otherwise. Task 9 (the switcher) is last for that reason. **If they are
  still locked when you reach task 9, STOP and say so** — do not put the
  switcher somewhere else to avoid the file. A mode switcher living outside
  the site chrome because of a scheduling accident is a design decision made
  by a merge conflict, and it will outlive the reason.
- **Three sessions share this repo.** Stage by explicit path, never a
  directory pathspec; on a shared file (`docs/PROGRESS.md`, `docs/roadmap.md`)
  stage only your own hunks; and **commit with `git commit -- <paths>`, never
  bare** — a bare commit takes the whole index including hunks another session
  staged. That happened three times on 2026-09-11, in three directions.
- **Run the backend suite under the cross-session lock**, against this
  session's own database (`POSTGRES_DB=anime_site_test_phaseb`). Never two
  pytest processes at once.
- **After any frontend change run `cd frontend && npm run build`**, plus
  `npm run test:run` and `npm run lint`. Phase D changes the SPA for real,
  unlike Phase B.
- Semantic colour tokens only — `bg-surface`, `text-text-muted`, … A
  hard-coded grey utility fails `src/theme-tokens.test.js`.
- **Fail closed everywhere.** Every new resolution path's unknown case is the
  empty set or a refusal, never a widening.

## The question this phase must not get wrong

**A reissued cookie keeps the ORIGINAL `exp`.** If switching mints a fresh
24-hour token, toggling `safe → normal → safe` is an unlimited
session-extension oracle, and the flat 24-hour lifetime — which has no refresh
and no revocation — stops meaning anything. It is invisible to manual testing
and to every kind of checking except one: decode both tokens and assert `exp`
is identical. That is **task 2**, with its own test, deliberately not a
caveat inside another task.

## Which SPA permission surface each control reads

The SPA has **two independent** permission surfaces and they already disagree.
Changing what a permission means reaches one and not the other; Phase A
shipped `is_admin` and had to fix the nav two commits later for exactly this.
Every control this phase adds is named here so it cannot be implemented twice.

| Control | Surface | Reads | Why |
|---|---|---|---|
| `/access-modes` route | `App.jsx` `<ProtectedRoute permission=…>` | `admin.authz` | It changes who may reach what — the same family as `/roles`, `/users`, `/content-labels` |
| "Access Modes" nav link | `navigation.js` `requires:` | `admin.authz` | Must match the route gate. It goes in the existing `admin` section, which already declares `requires: "admin.authz"`, so the link inherits it and adds **no** new declaration |
| Per-account mode panel on `/users` | neither — it is inside `Users.jsx`, already behind `admin.authz` | (inherited) | Do not add a second gate inside a page that is already gated; a nested check that can disagree with its route is the bug this table exists to prevent |
| The mode switcher (task 9) | **neither** | *no permission at all* | Every signed-in account holds at least one mode. Gating the switcher on a permission would hide it from the `user` role, which is precisely the account that most needs it. It renders when `/api/auth/me` returns **more than one** held mode, and is otherwise absent — a control with one option is noise |
| "Personal notes" / tracker controls (task 10) | `isAdmin` → `self.list` | `self.list` | Question 6. `isAdmin` has meant `manage.catalog` since Phase A, which is the wrong question for a control over one's OWN rows |

**The rule behind the table:** a route gate and its nav entry must ask the
same question, and a control inside an already-gated page asks nothing. There
is a live counter-example to fix in task 10 — the route gate asks
`requireAuth` where `navigation.js` asks `has("self.list")`, making the nav
the *stricter* surface, so a page is reachable but unlisted.

## What `/access-modes` does about a label that reaches no mode

A content label created after the Phase B migration is carried by **no mode**,
so it hides its entries from everyone — the owner included. That behaviour is
**correct and stays**: fail-closed is the right direction, and a label that
silently did nothing until someone remembered to grant it would be worse.

What is wrong today is that it is *invisible*. So `/access-modes` shows it:

- The page fetches every `content_label` row from `/catalog`, not just the
  ones some mode carries.
- A label carried by **zero** modes renders with a visible warning on the
  page — "carried by no mode: entries with this label are hidden from
  everyone, including you" — not a tooltip and not a muted hint.
- The same warning appears when the last mode carrying a label is unticked,
  at the moment of unticking, because that is when the person can still
  reconsider.

This is a **UI affordance over unchanged server behaviour**. Do not add a
server rule that auto-grants a new label to `unrestricted`: the seeded mode's
label set is a row set precisely so that widening it is an auditable act, and
an auto-grant would make the one mode that must be trustworthy the one that
changes behind your back.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `app/routers/access_modes.py` | CRUD for modes and their items. Shaped on `roles.py`. |
| `frontend/src/pages/admin/AccessModes.jsx` | The page. Shaped on `Roles.jsx`. |
| `frontend/src/pages/admin/AccessModes.test.jsx` | Its vitest cover. |
| `frontend/src/components/layout/ModeSwitcher.jsx` | The switcher control (task 9). |
| `tests/api/test_access_mode_router.py` | The CRUD matrix. |
| `tests/api/test_mode_switch.py` | The switch endpoint, `exp` included. |
| `tests/api/test_user_access_modes.py` | `PUT /api/users/{id}/access-modes`. |

**Modified**

| File | Change |
|---|---|
| `app/routers/auth.py` | `/me` gains `modes`; the new `POST /access-mode`. |
| `app/routers/users.py` | `PUT /{id}/access-modes`; new accounts get `safe`. |
| `app/schemas/rbac.py` | Mode schemas. |
| `app/main.py` | Register the new router. |
| `frontend/src/App.jsx` | The `/access-modes` route. |
| `frontend/src/config/navigation.js` | The nav link. |
| `frontend/src/api/endpoints.js` | The new endpoints. |
| `frontend/src/pages/admin/Users.jsx` | The per-account panel. |
| `frontend/src/components/layout/Nav.jsx` | **LOCKED** — task 9 only. |
| `docs/*` | api, authorization, frontend/components, roadmap, PROGRESS, spec. |

## Task order

Tasks 1-5 are backend and independent of the SPA; the suite stays green
throughout and each is separately reviewable. Tasks 6-8 are the admin UI.
Task 9 is the switcher and is last **because of the `Nav.jsx` lock**, not
because it is least important. Task 10 is question 6's slice, which is
unrelated to modes but is the other half of "the `user` role is usable but
not useful" and belongs in this phase. Task 11 is docs.

---

### Task 1: `/api/auth/me` publishes the modes this account holds

**Files:** Modify `app/routers/auth.py`. Test: `tests/api/test_me_access_mode.py` (extend).

**Interfaces:**
- Consumes: `Viewer.mode_id`, `models.UserAccessMode`, `cache.mode_sets`, `cache.denials_for`.
- Produces: `/me` gains `modes: [{id, key, label, is_active, requires_password}]`.

`requires_password` is **computed server-side**, so the SPA never has to model
the rule. It is the subset test from spec section 3: switching to a target
whose effective set is a subset of the current session's is free; anything
that adds even one label or field group needs the password.

- [ ] **Step 1: Write the failing test**

```python
# in tests/api/test_me_access_mode.py
def test_me_lists_the_modes_this_account_holds(mode_client):
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    keys = {m["key"] for m in body["modes"]}
    assert keys == {"unrestricted", "borderline", "normal", "safe"}
    active = [m for m in body["modes"] if m["is_active"]]
    assert len(active) == 1 and active[0]["key"] == MODE_NORMAL


def test_narrowing_is_free_and_widening_needs_the_password(mode_client, nsfw_label):
    """The subset test, computed server-side so the SPA never models it."""
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    by_key = {m["key"]: m for m in body["modes"]}
    assert by_key["safe"]["requires_password"] is False          # narrower
    assert by_key["borderline"]["requires_password"] is True     # adds a label
    assert by_key["normal"]["requires_password"] is False        # itself


def test_a_guest_holds_no_modes(client, access_modes):
    assert client.get("/api/auth/me").json()["modes"] == []
```

- [ ] **Step 2: Run it; expect KeyError on `modes`.**
- [ ] **Step 3: Implement.** Resolve each held grant through the same
  `cache.mode_sets` / `cache.denials_for` pair `resolve_mode` uses — do NOT
  re-implement the subtraction, or the two will drift.

```python
    # Held modes, each with the switch cost computed HERE so the SPA never
    # has to model the rule. Narrowing is free; adding even one label or field
    # group asks for the password again (spec decision 3).
```

- [ ] **Step 4: Run the file, then the suite under the lock. Commit.**

---

### Task 2: `POST /api/auth/access-mode` — and the `exp` that must not move

**Files:** Modify `app/routers/auth.py`, `app/services/security.py`. Create `tests/api/test_mode_switch.py`.

**This is the task the whole phase can get quietly wrong.** A reissued cookie
MUST carry the original token's `exp`. Otherwise toggling
`safe → normal → safe` extends the session indefinitely and the flat 24-hour
lifetime — no refresh, no revocation — stops meaning anything.

**Interfaces:**
- Consumes: task 1's subset computation (extract it to a helper both call).
- Produces: `POST /api/auth/access-mode` `{mode_id, password?}` → 200 and a
  reissued cookie, or 401 `{detail, requires_password: true}`.

- [ ] **Step 1: Write the failing test — the `exp` case first**

```python
# tests/api/test_mode_switch.py
import jwt
from app.services.security import ALGORITHM, SECRET_KEY


def _exp(client):
    raw = client.cookies["access_token"].removeprefix("Bearer ")
    return jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])["exp"]


def test_switching_keeps_the_original_expiry(mode_client, mode):
    """THE test. A fresh 24-hour token on every switch would make toggling
    safe -> normal -> safe an unlimited session-extension oracle, and the flat
    lifetime (no refresh, no revocation) would stop meaning anything. Invisible
    to manual testing; only decoding both tokens catches it."""
    c = mode_client(MODE_UNRESTRICTED)
    before = _exp(c)

    r = c.post("/api/auth/access-mode", json={"mode_id": str(mode(MODE_SAFE).system_id)})

    assert r.status_code == 200
    assert _exp(c) == before


def test_narrowing_needs_no_password(mode_client, mode):
    c = mode_client(MODE_UNRESTRICTED)
    r = c.post("/api/auth/access-mode", json={"mode_id": str(mode(MODE_SAFE).system_id)})
    assert r.status_code == 200
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_SAFE


def test_widening_bare_is_refused_with_a_marker(mode_client, mode, nsfw_label):
    c = mode_client(MODE_SAFE)
    r = c.post("/api/auth/access-mode",
               json={"mode_id": str(mode(MODE_UNRESTRICTED).system_id)})
    assert r.status_code == 401
    assert r.json()["requires_password"] is True


def test_widening_with_the_wrong_password_is_refused(mode_client, mode, nsfw_label):
    c = mode_client(MODE_SAFE)
    r = c.post("/api/auth/access-mode",
               json={"mode_id": str(mode(MODE_UNRESTRICTED).system_id),
                     "password": "not-the-password"})
    assert r.status_code == 401


def test_widening_with_the_right_password_succeeds(mode_client, mode, nsfw_label):
    c = mode_client(MODE_SAFE)
    r = c.post("/api/auth/access-mode",
               json={"mode_id": str(mode(MODE_UNRESTRICTED).system_id),
                     "password": "testpass"})
    assert r.status_code == 200


def test_switching_to_an_ungranted_mode_is_refused(db_session, admin_user, mode_client):
    """Not 'requires_password' - the account may not use this mode at all."""
    from app import models
    c = mode_client(MODE_SAFE)
    other = models.AccessMode(key="ungranted", label="Ungranted")
    db_session.add(other)
    db_session.flush()
    r = c.post("/api/auth/access-mode", json={"mode_id": str(other.system_id)})
    assert r.status_code in (401, 404)
    assert r.json().get("requires_password") is not True


def test_a_guest_may_not_switch(client, mode, access_modes):
    r = client.post("/api/auth/access-mode",
                    json={"mode_id": str(mode(MODE_SAFE).system_id)})
    assert r.status_code == 401
```

- [ ] **Step 2: Run; expect 404 (no route).**
- [ ] **Step 3: Give `create_access_token` an explicit expiry.**

It currently always computes `now + ACCESS_TOKEN_EXPIRE_MINUTES`. Add an
`expires_at: Optional[datetime]` parameter that is used verbatim when given,
with a docstring saying *why* — a caller reissuing a token must be able to
preserve the original deadline, and the mode switcher is that caller.

- [ ] **Step 4: Write the handler.** Cookie `max_age` is the **remaining**
  seconds, not the full lifetime: `int(exp - now)`, floored at 0. A switch
  that lands on an already-expired token should not resurrect it.
- [ ] **Step 5: Run the file. Then the suite under the lock. Commit.**

---

### Task 3: `app/routers/access_modes.py` — the CRUD

**Files:** Create `app/routers/access_modes.py`, `tests/api/test_access_mode_router.py`. Modify `app/schemas/rbac.py`, `app/main.py`.

Mirror `roles.py` route for route: `GET /`, `GET /catalog`, `GET /{id}`,
`POST /`, `PATCH /{id}`, `PUT /{id}/grants`, `DELETE /{id}`, all under
`require_admin_authz`, every write calling `cache.bump()`.

**Two differences from roles, both deliberate:**

1. `/catalog` returns **two labelled groups** — Content Labels (from the
   `content_label` table) and Field Groups (from `FIELD_GROUPS`) — not the
   permission families. A label carried by no mode is still listed; the page
   needs it in order to warn about it.
2. **Guest default is a radio across modes, not a checkbox on one.** The
   partial unique index permits at most one. The server still validates:
   `PATCH {is_guest_default: true}` clears the flag on every other mode in the
   same transaction rather than letting the index raise. An index violation is
   a 500; this is a 200 that does what was asked.

- [ ] **Step 1: Write the failing tests** — creation, the grants replace, the
  system-mode refusals, and the guest-default move:

```python
def test_a_system_mode_cannot_be_deleted(admin_client, mode):
    r = admin_client.delete(f"/api/access-modes/{mode(MODE_SAFE).system_id}")
    assert r.status_code == 409


def test_setting_a_new_guest_default_clears_the_old_one(admin_client, mode, db_session):
    """The partial unique index permits one. Move it in one transaction rather
    than letting the index raise - an index violation is a 500."""
    target = mode(MODE_NORMAL)
    r = admin_client.patch(f"/api/access-modes/{target.system_id}",
                           json={"is_guest_default": True})
    assert r.status_code == 200
    flagged = [m.key for m in db_session.query(models.AccessMode)
               .filter(models.AccessMode.is_guest_default.is_(True))]
    assert flagged == [MODE_NORMAL]


def test_grants_are_replaced_wholesale(admin_client, mode, nsfw_label):
    r = admin_client.put(
        f"/api/access-modes/{mode(MODE_NORMAL).system_id}/grants",
        json={"label_keys": [nsfw_label.key], "field_group_keys": ["credits"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["label_keys"] == [nsfw_label.key]
    assert body["field_group_keys"] == ["credits"]


def test_an_unknown_field_group_is_422(admin_client, mode):
    r = admin_client.put(f"/api/access-modes/{mode(MODE_NORMAL).system_id}/grants",
                         json={"label_keys": [], "field_group_keys": ["not_a_group"]})
    assert r.status_code == 422


def test_a_super_is_refused_the_router(super_client):
    assert super_client.get("/api/access-modes/").status_code == 401
```

- [ ] **Steps 2-5:** run red, implement, run green, full suite under the lock,
  commit. Register the router in `app/main.py` beside `roles`.

---

### Task 4: `PUT /api/users/{id}/access-modes`

**Files:** Modify `app/routers/users.py`, `app/schemas/rbac.py`. Create `tests/api/test_user_access_modes.py`.

**One endpoint replaces the whole set** — grants, default and denials — in a
single payload, matching `PUT /roles/{id}/permissions`: one write, one
`bump()`, no partial states.

```
PUT /api/users/{id}/access-modes
{ "modes": [ {"mode_id": "...", "is_default": true,
              "denied_label_keys": [...], "denied_field_group_keys": [...]} ] }
```

**Decision 8 is enforced server-side, not merely rendered:** a denial naming
an item the mode does not carry is **422**. A mode is a ceiling; a denial that
subtracts something not present is meaningless and almost always a mistake.

- [ ] **Step 1: Write the failing tests**

```python
def test_replacing_the_set_sets_grants_default_and_denials(admin_client, plain_user, mode, nsfw_label):
    r = admin_client.put(f"/api/users/{plain_user.id}/access-modes", json={"modes": [
        {"mode_id": str(mode(MODE_BORDERLINE).system_id), "is_default": True,
         "denied_label_keys": [nsfw_label.key], "denied_field_group_keys": []},
    ]})
    assert r.status_code == 200


def test_a_denial_outside_the_mode_is_422(admin_client, plain_user, mode, nsfw_label):
    """Decision 8: a mode is a CEILING. Denying something it does not carry is
    meaningless, and the server refuses rather than storing a no-op."""
    r = admin_client.put(f"/api/users/{plain_user.id}/access-modes", json={"modes": [
        {"mode_id": str(mode(MODE_NORMAL).system_id), "is_default": True,
         "denied_label_keys": [nsfw_label.key], "denied_field_group_keys": []},
    ]})
    assert r.status_code == 422


def test_replacing_drops_the_modes_left_out_and_their_denials(
    db_session, admin_client, plain_user, mode
):
    ...  # assert UserAccessModeDenial rows are gone via the FK cascade


def test_two_defaults_is_422(admin_client, plain_user, mode):
    """The partial unique index would raise a 500; refuse it as a payload error."""
```

- [ ] **Steps 2-5** as before.

---

### Task 5: A new account gets `safe` only

**Files:** Modify `app/routers/users.py` (`create_user`). Test: `tests/api/test_user_access_modes.py`.

Decision 4. Runtime code, not a migration — and it must not fight
`grant_all_modes_to_existing_accounts`, which skips any account already
holding a mode. Granting `safe` at creation is what makes that skip correct
for new accounts.

```python
def test_a_new_account_holds_safe_and_only_safe(admin_client, db_session):
    """Decision 4. An invitee starts narrow and is widened deliberately -
    the opposite of starting wide and being narrowed if anyone remembers."""
```

Also assert the new account can actually log in and see something — a new
account holding no mode resolves the EMPTY object set, which is the
fail-closed answer but a terrible first impression, and is exactly what this
task prevents.

---

### Task 6: `/access-modes` — the page

**Files:** Create `frontend/src/pages/admin/AccessModes.jsx` + `.test.jsx`. Modify `App.jsx`, `navigation.js`, `api/endpoints.js`.

Shaped on `Roles.jsx`: list left, selected mode's grants as checkboxes right,
create form, delete refused for `is_system`.

- Route under `<ProtectedRoute permission="admin.authz" />`, beside `/roles`.
- Nav link inside the existing `admin` section, which already declares
  `requires: "admin.authz"` — **add no new `requires`**, inherit it.
- Checkboxes in **two labelled groups** from `/catalog`.
- **Guest default is a radio across modes**, never a checkbox on one: the UI
  must not be able to express the invalid state.
- **A label carried by zero modes renders the warning** described above.

- [ ] Write `AccessModes.test.jsx` first: the radio renders one selection
      across modes; the zero-mode label warning appears; a system mode's
      delete is absent or disabled.
- [ ] Then the page. Then `npm run test:run && npm run lint && npm run build`.

---

### Task 7: The per-account panel on `Users.jsx`

**Files:** Modify `frontend/src/pages/admin/Users.jsx` (+ its test if present).

For the selected account: which modes they hold, a radio for the login default
**among those held**, and under each held mode its items rendered as **the
mode's own list with tick-to-deny**.

That rendering is the point and is not a style choice. Decision 8 says denials
only subtract; showing the mode's items and letting you untick them makes the
UI **structurally incapable** of expressing something outside the ceiling. The
rule becomes visible instead of being a 422 discovered by hitting it.

Add **no permission check inside the page** — it is already behind
`admin.authz` at the route.

---

### Task 8: Docs for the admin surface

**Files:** `docs/api.md`, `docs/authorization.md`, `docs/frontend/components.md`.

Do this before task 9, so that if the `Nav.jsx` lock stalls the phase, what
has shipped is documented rather than half-recorded.

---

### Task 9: The mode switcher — **`Nav.jsx` IS LOCKED**

**Files:** Create `frontend/src/components/layout/ModeSwitcher.jsx`. Modify `Nav.jsx` **only when released**.

**FIRST STEP IS NOT CODE:** confirm `Nav.jsx` is released. If it is not,
**STOP and report**. Do not relocate the switcher to avoid the file.

- Renders only when `/api/auth/me` returns **more than one** held mode. No
  permission gate — every signed-in account holds at least one mode, and
  gating this would hide it from the `user` role, which needs it most.
- Narrowing switches immediately. Widening opens a password prompt, driven by
  the server's `requires_password` flag — **never** by the SPA recomputing the
  subset test. Two implementations of one rule is how they drift.
- On success, refetch `/api/auth/me` and invalidate the entry queries: the
  whole point is that what the viewer may see just changed.

---

### Task 10: Question 6's minimal slice — `isAdmin` → `self.list`

**Files:** `frontend/src/config/libraryColumns.jsx` (~112, ~181), `frontend/src/components/.../RemarkModal.jsx`, and the `requireAuth` / `has("self.list")` mismatch.

The controls over a viewer's OWN rows — the status toggle, progress, the
remark modal — gate on `isAdmin`, which has meant `manage.catalog` since
Phase A. That is the wrong question: editing your own list is `self.list`.
Until this lands the `user` role is usable through the API and useless
through the UI.

Also reconcile the surfaces: the route gate asks `requireAuth` while
`navigation.js` asks `has("self.list")`, so the nav is the **stricter** one
and a page is reachable but unlisted. Pick `self.list` for both — a page whose
controls all need `self.list` should not be reachable without it.

Verify the line numbers before editing; they are from a count on 2026-09-11.

---

### Task 11: Record it

`docs/roadmap.md` (a Done entry — what changed, why, what was deliberately
not done), `docs/PROGRESS.md` (Phase D done; delete the spent table), and the
spec marked shipped. All three in one commit, per the repo's rule, and each
staged as your own hunks only.

---

## Risks

| Risk | Mitigation |
|---|---|
| The `exp` oracle ships silently | Task 2, its own task, with a test that decodes both tokens |
| The subset test implemented twice and drifting | Computed server-side once; the SPA only reads `requires_password` |
| `Nav.jsx` lock stalls the phase | Task 9 is last and tasks 1-8 are independently shippable; docs land in task 8, before it |
| The two SPA surfaces disagree again | Every new control named in the table above, with its surface |
| A denial outside its mode stored as a silent no-op | 422 server-side (task 4) **and** a UI that cannot express it (task 7) |

## Estimate

Backend tasks 1-5: ~90 minutes including suite runs. Frontend 6-9: ~90
minutes including builds. Tasks 10-11: ~40 minutes. **~3.5-4 hours**, with
task 9 possibly blocked.
