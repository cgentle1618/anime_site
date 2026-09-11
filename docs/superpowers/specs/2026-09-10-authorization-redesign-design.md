# Authorization redesign — design (DRAFT, brainstorm in progress)

Status: **complete, awaiting review**. Brainstormed on 2026-09-10 (home),
stopped at an environment switch, resumed and finished 2026-09-11 (company).
All six sections are written and approved. Next step is an implementation plan;
nothing here has been built.

Read first: [authorization.md](../../authorization.md#what-the-redesign-inherits)
— the four gates that already exist, the rules not to break, and the lessons
from making the system multi-user.

> **Naming note (2026-09-11).** What this document called a *view mode* through
> its first three sections is now an **access mode**. The rename is not
> cosmetic: once a mode governs what you may rate and edit as well as what you
> may read (decision 9), "view" would actively mislead a reader into assuming
> writes bypass it — which is the precise assumption that produces the
> vulnerability class in "Defects this redesign must fix" below.

## The problem

The site knows two kinds of visitor with any real power: `guest` and `admin`,
and `admin` is one permission guarding **89** route dependencies across **27**
routers (counted 2026-09-11) while the `admin` role is `is_superuser=True` and
therefore holds every permission implicitly — including every content label.
One person owns the installation and uses the `admin` account for everything.

Wanted instead:

- **admin** — the owner's account. Everything, including authorization.
- **super** — everything except authorization; the shape a second person takes.
- **user** — an ordinary account: own list, own personal notes.
- **guest** — unchanged.

and, orthogonally, **access modes** on an account — four are seeded
(`unrestricted`, `borderline`, `normal`, `safe`) and an admin may create more —
chosen per session. An account holds one role and one *or more* access modes.

## Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Is `admin` a separate login or a capability of the super account? | **REVISED 2026-09-11: `admin` is a superset.** It holds `admin.authz` *and* both `manage.*` permissions, and stays the owner's daily account. `super` is "admin minus the ability to change who may do what", and is the shape a second person takes. The original decision — a break-glass admin that could not touch the catalogue — was rejected as more friction than the risk warranted: it put a password prompt in the middle of any task that turned out to need both axes. The consequence accepted with it: the account in daily use can regrant itself anything, so a compromised daily session is a total compromise |
| 2 | What differs between the access modes? | **RESTATED 2026-09-11.** A mode never changes which *kinds* of operation an account may perform — it never removes `manage.catalog` or `self.list`. It changes **which objects those operations can reach**. It scopes two vocabularies: content labels (whether an entry exists for you at all) and field groups (which columns of a reachable entry you see). The earlier wording, "sight only, never writes", was wrong in its second half — see decision 9 |
| 3 | How is a mode switched? | **Free toggle, re-auth to widen.** Narrowing is instant; widening asks for the password again. So a browser left logged in at `safe` is actually safe |
| 4 | Who has modes? | **General — any account may hold several, including the admin account.** A newly created account holds **`safe` only**, by default |
| 5 | Structure for the access-mode axis | **Its own tables** (option B of three). **AMENDED 2026-09-11:** five tables, not three, because a mode carries field groups as well as labels — see section 2. Two *typed* link tables rather than one generic `access_mode_grant(permission text)`: neither has a column in which `manage.catalog` or `admin.authz` could be stored, so "a mode scopes objects, it never grants powers" stays a schema guarantee rather than a review rule. The role machinery keeps its current meaning and all its guards |
| 6 | What access mode does a logged-out guest resolve to? | **A real mode, flagged `is_guest_default`**, seeded on `safe`. Rejected: hardcoding guests to the empty set, which would make the anonymous policy the one access decision in this codebase that is not data an admin edits. Rejected: resolving the literal key `safe`, which silently republishes to the internet whenever you edit that mode for yourself. A partial unique index enforces at-most-one flagged mode; the resolver falls back to the **empty set** when none is flagged, so the failure mode is closed |
| 7 | Which mode does a session start in? | **The account's chosen default** (`is_default` on `user_access_mode`). You just typed your password to log in, so landing wide is not a new grant. Rejected: always landing narrowest, which would make the widening prompt routine — and a prompt typed through by reflex has stopped being a control |
| 8 | Can a per-account adjustment ADD to a mode, or only remove? | **Only remove — a mode is a ceiling.** An account's reach is always a subset of its mode's. So a mode name on the user list is a trustworthy upper bound, and widening a mode later reaches everyone not explicitly narrowed. To let one person reach more, assign a wider mode and deny the specific items (or create a mode, if it is policy you will reuse) |
| 9 | Does a mode bind writes, or only reads? | **NEW 2026-09-11: writes follow reads, against the ACTIVE mode.** If `GET` answers 404 for you, every write to that id answers 404 too. Rejected: binding writes to the account's *ceiling* (the union of its modes), which would have the server 404 a `GET` and then accept a `PUT` for that same id. The industry precedent is uniform — Postgres RLS applies one `USING` clause to `SELECT` and `UPDATE` alike; AWS session policies and OAuth scopes narrow a session for every operation, not just reads; OWASP ranks the inverse as API1:2023, Broken Object Level Authorization. The same guard also enforces `media_type.*`, because `entry_visible` already checks both and calling it is less work than not |

### The shape those decisions imply

**Two axes, and they answer different questions.** The **role** answers *what
kinds of operation may this account perform* — read, edit the catalogue, run a
pipeline, change authorization. The **access mode** answers *which objects can
those operations reach* in this session. They must not be one knob: if they
were, dropping to `safe` would also drop the `admin` grant, contradicting
decision 2.

**Object-scoping vocabulary leaves the role axis entirely.** `label.<key>` and
`field_group.<key>` stop being grantable to a role and become exclusively what
an access mode carries. This is what makes "the admin account can sit in
`safe`" work at all, and it is the single largest change to the existing model.
Every viewer — guest included — therefore resolves an access mode as well as a
role.

Field groups *must* move, not merely may: permission resolution is a union, and
a union can only add. If `field_group.sources_restricted` stayed grantable on a
role, no mode could ever take it away, and the narrow tiers would be
unbuildable.

**Effective access = (the role's permissions) applied to (the active mode's
object set).** The two sides are disjoint by construction — the role axis holds
`admin.*`, `manage.*`, `media_type.*` and `self.*`; the mode axis holds labels
and field groups. Neither can express the other.

**`media_type.*` stays on the role axis**, the one arguable boundary. "May I
see Games" is object-shaped, but it says what an account is *for* rather than
how careful this session is being, and it is the axis the existing open item
about guests and Games already lives on. Note that decision 9 makes it *also*
enforced on writes, which it is not today.

## Defects this redesign must fix

Found while designing, both exploitable independent of any of this. They are
listed here so the implementation plan carries them as tasks rather than
discovering them again.

**1. `PUT /me/list/{media_id}` performs no object-level check. FIXED 2026-09-11 (Phase 0).** `me_list.py`'s
`_media_or_404` (line 56) resolves the entry with a bare
`db.get(models.Media, media_id)` and never calls `entry_visible`. Any account
holding `self.list` can therefore set a status, rating and progress on an entry
it cannot see — one carrying a label it lacks, or a Game when it holds no
`media_type.game` — provided it knows the uuid. This is OWASP API1:2023 exactly,
and decision 9 is the rule that closes it. `read_my_list_row` on the same router
needs the same guard; it returns only the caller's own row, but it still
confirms whether a `media_id` exists.

**2. Reads are otherwise genuinely enforced**, and this was verified rather than
assumed: the detail route 404s at `_factory.py:79` with a message deliberately
identical to a real not-found, list queries carry the anti-join, and
`search.py`, `profile.py`, `quote.py`, `note.py`, `casting.py`, `credits.py`
and `media_relation.py` all guard. The gate is not frontend hiding.

**3. One part of the field-group gate is cosmetic by design, and must stay
documented as such.** Real columns are stripped from a *copy* of the response
(nulling the live ORM instance would flush the blank to disk), note sections
are filtered in `note.py`, source buckets are filtered before the response is
composed — all server-side. But `ui_block` is presentation only, and
`field_groups.py` says so outright: *"This is presentation, never a gate."*
`system_info` withholds its timestamps for real and hides the spine id
cosmetically, because that id is the page's own URL.

## Section 1 — the capability axis (APPROVED 2026-09-11)

`admin` splits into three named permissions, drawn on the routers that exist:

| Permission | Guards | admin | super | user | guest |
|---|---|:-:|:-:|:-:|:-:|
| `admin.authz` | `roles.py`, `users.py`, `content_labels.py`, and the new access-mode routes | yes | — | — | — |
| `manage.catalog` | everything else currently admin-gated: entry CRUD via `_factory.py`, the three tiers, person/studio/publisher/character/casting, credits, options, relations, watch orders, announcements, quotes/memes, catalogue notes, `constants`, `form_defaults` | yes | yes | — | — |
| `manage.pipelines` | `system.py`, `data_control.py` — Backup, Pull All, Fill, Replace, Calculate | yes | yes | — | — |

Splitting pipelines out of catalogue is nearly free — two routers, one
dependency each — and buys a real distinction: a helper account can fix a typo
on an entry without being able to overwrite the entire database with a Pull
All. That blast radius is not hypothetical; a Pull All silently rolled back a
whole tab on 2026-09-11 (`709f9f00`).

`user` holds `self.*` plus reads; `guest` holds reads. Both unchanged.

### `is_superuser` survives, narrowed

The 2026-09-10 draft retired `is_superuser` outright, because an implicit
"holds every permission" defeats decision 4 — an admin could never sit in
`safe`. Decision 1's reversal makes a narrower change correct instead.

`is_superuser` keeps meaning **"holds every capability permission"**. It is
read at 22 sites across 8 files (counted 2026-09-11), and almost all of them
stay exactly as they are: 6 short-circuits in `enforcement.py`, plus
`field_gate.py`, the two domain services (`media_relation.py:330`,
`watch_order.py:212`), `note.py:168`'s author-or-superuser check, `roles.py`,
`users.py`, `seed.py` and `auth.py:105`.

What changes is that **`label.<key>` and `field_group.<key>` stop being
permissions at all**. They leave the role axis (decision 5), so
`is_superuser`'s short-circuit cannot reach them by construction — the axis
independence decision 2 asks for becomes a property of the schema rather than a
rule a reviewer has to remember.

The real edits are `hidden_label_ids`, `field_gate._withheld` and the
`entry_visible` / `filter_visible_pairs` short-circuits, which must consult the
active mode instead of `viewer.is_superuser`. Roughly 4 sites rather than 22.

### Consequences named

- The SPA's `is_admin` flag from `/api/auth/me` has to become something finer.
  Section 4 settles how. This is the same code that closes carried-in question 2.
- `plan_next.py` has three writes still gated on `get_current_admin` that are
  per-user data (lines 145, 195, 224 — verified 2026-09-11; each already takes
  `get_current_user_id` alongside). They drop the admin gate: a small bug fix
  riding along.

## Section 2 — the access-mode axis (APPROVED 2026-09-11)

### Schema

```sql
access_mode              system_id · key · label · description · sort_order
                         is_system · is_guest_default · created_at · updated_at
  UNIQUE (key)
  UNIQUE INDEX ix_one_guest_default_access_mode ON ((true)) WHERE is_guest_default

access_mode_label        system_id · mode_id → access_mode · label_id → content_label
  UNIQUE (mode_id, label_id)                 both FKs ON DELETE CASCADE

access_mode_field_group  system_id · mode_id → access_mode · field_group_key
  UNIQUE (mode_id, field_group_key)          key validated against FIELD_GROUP_KEYS

user_access_mode         system_id · user_id → users · mode_id → access_mode · is_default
  UNIQUE (user_id, mode_id)                  both FKs ON DELETE CASCADE
  UNIQUE INDEX ix_one_default_mode_per_user ON (user_id) WHERE is_default

user_access_mode_denial  system_id · user_access_mode_id → user_access_mode
                         label_id → content_label NULL · field_group_key NULL
  CHECK (exactly one of label_id / field_group_key is set)
  UNIQUE (user_access_mode_id, label_id)
  UNIQUE (user_access_mode_id, field_group_key)
```

`sort_order` is UI-only. Decision 3's widening test is a set comparison, so
nothing in enforcement needs modes ranked — which matters, because with
per-account denials the modes are genuinely not a total order.

The `CHECK (exactly one of ...)` mirrors the constraint already on `note`'s
four owner columns. `is_default` living *on* `user_access_mode` means an
account's landing mode is necessarily one it holds; it cannot drift out of the
granted set. Denials hang off the grant row, not the user, so revoking a mode
cascades that account's adjustments to it away with it.

### The model in one line

An account holds **one role** and **one or more access modes**. Each (account,
mode) pair may be narrowed independently. Exactly one held mode is active per
session; `is_default` picks where a fresh login lands.

> user 1 is a `super`; holds `unrestricted` (minus `hentai_image`) and
> `normal`; lands in `normal` at login.

**Effective object set** = mode's labels − denials, and mode's field groups −
denials. Subtraction only (decision 8), so an account is always a subset of its
mode.

### Seeded modes

All four carry `is_system` and cannot be deleted; an admin may create more, the
way `roles.py` already allows for roles. Label and field-group assignments are
data, editable on the admin page — only these rows are seeded.

| key | labels | field groups |
|---|---|---|
| `unrestricted` | every label | all five |
| `borderline` | `nsfw` | all five |
| `normal` | — | all five |
| `safe` (`is_guest_default`) | — | all except `sources_restricted` |

`safe` is today's guest exactly: `GUEST_WITHHELD_FIELD_GROUPS` already withholds
`sources_restricted` and nothing else. The top three tiers differ only in which
*entries* are reachable; the step down to `safe` is the one that changes what a
reachable entry shows.

Note that `safe` therefore keeps `personal_notes` (decided 2026-09-11), so the
public site shows personal reviews — unchanged from today, and tangled with
carried-in question 1, which observes that this field group gates a query
parameter and nothing on any response.

Finer labels need no schema work: `hentai_video` / `hentai_image` are rows an
admin adds to `content_label`, and every mode and gate picks them up.

### Modes versus denials

Two ways to express the same result, worth telling apart:

- **A new mode** is policy applied more than once — named, assignable to
  several people, editable in one place.
- **A denial** is an exception for one person — nothing to name or maintain.

Rule of thumb: applying the same denial to a third account means it wanted to
be a mode.

### Enforcement

`hidden_label_ids` (`enforcement.py:27`) stops asking
`viewer.has(label_perm(key))` and stops short-circuiting on `is_superuser`; it
returns the labels the active mode does not carry. All five consumers —
`apply_entry_visibility`, `apply_media_visibility` and the rest — are untouched,
because the list they receive means the same thing. `field_gate._withheld`
changes the same way and loses the same short-circuit.

**Writes call the same guard** (decision 9). `entry_visible` already tests both
the media-type permission and the label set, so the write paths simply call it
and 404 on false, with the same not-found message the read paths use. The
paths that need it: `me_list.py`'s two handlers (the defect above), and an
audit of every other route taking a client-supplied entry id.

Resolution is fail-closed at every step, matching `role_for_user`'s existing
"least access, not most" rule. The exact order is in section 3.

### Migration cost

Near zero on the label side. There are currently **zero** `label.*` rows in
`role_permission`, on **zero** labelled entries (checked 2026-09-11) — the label
gate is fully built and entirely inert, so the axis is being defined before it
was ever used in anger. `field_group.*` grants *do* exist on the seeded roles
and move to the mode axis. `content_labels.py` is unchanged; labels stay
admin-managed under `admin.authz`.

## Section 3 — session and switching (APPROVED 2026-09-11)

### The claim names a choice, not a grant

The token payload gains `mode` beside `sub`, carrying the mode's **uuid** — not
its key, so renaming a mode does not invalidate live sessions. It records
*which* of the account's modes is selected. Whether the account may still use
it is resolved from the database on every request, exactly as the role already
is: today's `role` claim is decorative, and `resolver.py` says so ("nothing
reads it for authorization"). So revoking a mode or ticking a new denial takes
effect on the viewer's next request, even with a live cookie — for reads and,
under decision 9, for writes.

### Resolution order, fail-closed

```
token.mode  ->  still granted to this user?
                  yes -> effective = mode's sets - this pair's denials
                  no  -> effective = EMPTY SET
no token    ->  the is_guest_default mode, or EMPTY SET if none flagged
```

The fallback for a revoked mode is the **empty set, not the account's default
mode**. This corrects the 2026-09-10 draft, which said "fall back to the
narrowest they hold": narrowest is not well-defined once modes are deliberately
unordered (decision 5), and falling back to `is_default` could *widen* a
session — sitting in `safe` when an admin revokes `safe` would hand the viewer
`unrestricted` with no password. The empty set is the only fallback that cannot
widen.

### Switching

`POST /api/auth/access-mode` with `{mode_id, password?}`:

```
effective(target) subset-of effective(current session)  ->  reissue immediately
otherwise                                               ->  password required
```

A set comparison per decision 3 — no ordering needed, which is what lets it
survive per-account denials. Narrowing is free; adding even one label or field
group asks for the password. The second case answers 401 with a
`requires_password` marker so the SPA prompts rather than guesses.

### The reissued cookie keeps the original `exp`

If switching minted a fresh 24-hour token, toggling `safe` -> `normal` ->
`safe` would be an unlimited session-extension oracle, and the flat 24-hour
lifetime (an open auth item, with no refresh or revocation) would stop meaning
anything. The new token copies the old token's `exp`; the cookie's `max_age`
is the remaining seconds.

### Guests do not switch

No account, so no granted modes and no denials to resolve. A guest gets the
guest-default mode and nothing else; wanting more means logging in.

## Section 4 — enforcement and the SPA (APPROVED 2026-09-11)

### `/api/auth/me` keeps its contract; only the server's source changes

It goes on publishing `field_group.*` entries in `permissions` — but computed
from the **active mode minus denials** instead of the role's grants. Every
`has("field_group.system_info")` already written in the SPA keeps working
untouched. Labels stay out of the payload, as they are today; they scope whole
entries server-side and the browser never needs them.

It gains the mode surface the switcher needs: the active mode, and the list of
modes this account holds, each flagged with whether switching to it would
require the password (the subset test from section 3, computed server-side so
the SPA never has to model the rule).

### `is_admin` is redefined rather than migrated

```
is_admin  :=  viewer.has("manage.catalog")      # was: has("admin")
```

`isAdmin` has **394 uses across 77 files** (counted 2026-09-11), and they
overwhelmingly mean "may this person edit the catalogue?" — they gate edit
buttons, notes editors and tracker controls. Redefining the alias this way
leaves almost all 394 correct for free, and correctly *adds* the edit surface
for a `super` account, which is carried-in question 2 solved as a side effect.
Only the genuinely authorization screens — `Roles.jsx`, the users page,
`ContentLabels.jsx` and the new access-mode page — switch to
`has("admin.authz")`. A handful of files rather than 77.

### The safety move: delete `label_perm()` and `field_group_perm()`

Once object-scoping leaves the role axis, any call site still asking
`viewer.has(field_group_perm(k))` would silently answer `True` for a superuser —
a wrong answer no test would obviously catch. Removing the helpers turns every
stale call into an import error. A break that stops the build beats a behaviour
that quietly changes. `roles.py /catalog` stops offering both families as
grantable.

### `Viewer` and the cache

`Viewer` gains `mode_id`, `mode_key`, `visible_label_ids` and `field_groups`.
`permissions` keeps meaning the *role's* capability set and `has()` is
unchanged. `GUEST_FALLBACK` gains empty object sets, which is already the
fail-closed answer.

`cache.py` today memoises `role_id -> frozenset[str]`, cleared wholesale by
`bump()`. Adding the user to that key would make it unbounded in accounts and
destroy the sharing that makes it worth having. Instead, two dicts:

- `_MODE_CACHE[mode_id]` — the mode's labels and field groups, shared by
  everyone holding it, hot.
- `_DENIAL_CACHE[user_access_mode_id]` — that pair's denials, usually empty.

Both cleared by the existing `bump()`, which every grant-changing write already
calls, so the new mode and denial writes simply call it too. The single-process
assumption in that module's docstring is unchanged.

## Section 5 — admin UI and migration (APPROVED 2026-09-11)

### The access-mode page

New `/access-modes` (`AccessModes.jsx`) and `app/routers/access_modes.py`, both
shaped on `Roles.jsx` / `roles.py` — list on the left, the selected mode's
grants as checkboxes on the right, a create form, delete refused when
`is_system`. Routes mirror roles: `GET /`, `GET /catalog`, `POST /`,
`PATCH /{id}`, `PUT /{id}/grants`, `DELETE /{id}`, all under `admin.authz`.

Two differences from the roles page:

- Checkboxes come in **two labelled groups** (Content Labels, Field Groups) fed
  by `/catalog`, the way `roles.py` already serves its permission families.
- **Guest default is a radio across modes, not a checkbox on one.** The partial
  unique index permits at most one, and a radio is the control that cannot
  express otherwise. The server still validates; the UI simply cannot ask for
  the invalid thing.

### The per-account panel

Extends **`Users.jsx`** rather than adding a page — it is per-account, and that
is where role assignment already lives. For the selected account: which modes
they hold, a radio for the login default among those held, and under each held
mode its items rendered as **the mode's own list with tick-to-deny**.

That rendering is the point. Decision 8 says denials only subtract; showing the
mode's items and letting you untick them makes the UI structurally incapable of
expressing something outside the ceiling. The rule becomes visible rather than a
server error discovered by hitting it.

One endpoint, `PUT /api/users/{id}/access-modes`, replaces the whole set —
grants, default and denials — in a single payload. Matches
`PUT /roles/{id}/permissions`'s replace-the-set precedent: one write, one
`bump()`, no partial states.

### The migration

Ordered so the owner is never locked out, in one revision:

1. Create the five tables.
2. Seed the four modes and their label/field-group rows; flag `safe` as guest
   default.
3. Mint `admin.authz`, `manage.catalog`, `manage.pipelines`; grant all three to
   the `admin` role, the two `manage.*` to a newly seeded `super` role.
4. Grant **every existing account all four modes, defaulting to
   `unrestricted`** — so nothing changes visibly on the day it lands. For the
   owner's `admin` account that is the faithful mapping of today's
   `is_superuser`, which sees everything.
5. *Only then* delete the `field_group.*` and `label.*` rows from
   `role_permission`.

Steps 3 and 5 must not be reordered: the new grants have to exist before the old
ones are removed, or there is a window in which the admin role holds neither.
Alembic runs on container start before uvicorn serves, so a half-applied state is
never exposed to a request — but the ordering still matters for a failed
migration someone has to resume by hand.

New accounts get `safe` only (decision 4). That is runtime code in `users.py`'s
create handler, not migration.

**Downgrade loses denials.** Dropping the tables cannot reconstruct per-account
adjustments. The revision docstring says so rather than leaving it to be
discovered.

### The seed is a frozen snapshot, not an ORM import

The migration seeds through Core SQL with its column list written out
literally:

```python
mode_table = sa.table("access_mode", sa.column("key"), sa.column("label"), ...)
op.bulk_insert(mode_table, [...])
```

A separate runtime `ensure_access_mode_seed` — importing `app.models`,
idempotent, called from the lifespan — covers the `create_all` path, because
`tests/api/conftest.py` builds the schema directly and never runs Alembic. That
is the same reason `seed.py` is called from two places today.

What is deliberately **not** copied from `seed.py` is its ORM import inside the
migration. A migration that queries `app.models` emits `SELECT` over every
column the model declares *today*, so the day a later revision adds a column,
this migration starts asking for a column that does not exist yet when run from
an empty database, and a recipe that worked for a year breaks untouched. That is
not hypothetical here: `docs/PROGRESS.md` records `alembic upgrade head` from an
empty database already failing at `86982d71c2f1` for exactly this reason, and a
second instance blocked the home machine on 2026-09-07.

The cost is one duplicated column list. These are brand-new tables with no
history to preserve, so this is the cheapest possible moment to establish the
durable pattern — and it chips at that open item rather than adding a third
instance to it.

## Section 6 — testing (APPROVED 2026-09-11)

### Fixtures

`tests/api/conftest.py` already carries the two-account shape the multi-user
work left behind: `admin_user` / `admin_client`, `plain_user` / `user_client`,
and an autouse `_clear_permission_cache`. Add `super_user` / `super_client`, a
`mode(key)` and `grant_mode(user, mode, denials=...)` pair, and
`labelled_entry(label_key)`.

**`_clear_permission_cache` must also clear `_MODE_CACHE` and
`_DENIAL_CACHE`.** If it does not, mode state leaks between tests and the
failures are random and order-dependent — the likeliest source of a day lost to
mystery flakes.

### The matrix

**1 - Capability.** `super` can PUT an entry but is refused `POST /roles`;
`admin` does both; `user` does neither. An account holding `manage.catalog` but
not `manage.pipelines` is refused Backup and Pull All, so section 1's split is
asserted rather than assumed. Plus a regression for the `plan_next.py` fix: a
plain user can write their own plan rows.

**2 - Read scoping.** An `nsfw`-labelled entry 404s on detail in `safe` and
returns 200 in `borderline`; it is absent from list, search, profile and
community aggregates. `sources_restricted` is missing from the response body in
`safe` and present in `normal`.

**3 - Write scoping.** Entirely new; no coverage exists today.
`PUT /me/list/{id}` on a labelled entry 404s in `safe`; on a Game it 404s for an
account without `media_type.game` — the regression test for the live defect.
Each asserts **404 with the standard not-found message, never 403**:
indistinguishability is the property being protected, and a 403 leaks the
entry's existence as surely as a 200 would.

**4 - Denials.** An account holding `unrestricted` minus `hentai_image` sees
`nsfw` entries and 404s on the `hentai_image` one. Revoking the mode grant
cascades its denials away. The server refuses a payload naming an item the mode
does not carry, so decision 8 is enforced and not merely rendered.

**5 - Switching.** Narrowing: 200, no password. Widening bare: 401 with
`requires_password`. Widening with a wrong password: 401. With the right one:
200. Switching to an ungranted mode: refused. And **decode both tokens and
assert `exp` is identical** — nothing else catches the session-extension oracle,
and it is invisible to manual testing.

**6 - Fail-closed resolution.** Delete the grant row while the cookie is live:
the next request resolves the **empty set, not the account's default mode**,
asserted by a previously-visible labelled entry now 404ing. No mode flagged
guest-default: a guest sees nothing labelled. Two flagged: the partial unique
index raises.

**7 - Axis independence.** An `is_superuser` account sitting in `safe` does
**not** see a labelled entry. This is the test that proves the redesign did what
it set out to do; it would have failed in the old model, where `is_superuser`
short-circuited everything.

**8 - Seeding and migration.** A `create_all` database holds all four modes
after the lifespan seed. The migration leaves every existing account with four
modes and an `unrestricted` default, and zero `field_group.*` / `label.*` rows
in `role_permission`. The frozen-snapshot migration runs clean **from an empty
database**, guarding the defect class section 5 avoids.

### Expected breakage is signal

28 test files touch `is_admin`, `field_group` or `is_superuser` (counted
2026-09-11). Redefining `is_admin` and moving field groups off the role axis
will break some of them. Each break should be re-pointed at the new model, never
silenced — a test that asserted the old model is exactly what should fail here.

On the frontend the redefinition keeps most of the 394 `isAdmin` sites correct,
but the Roles and Users page tests need the new endpoints mocked.

## Implementation shape

This is too large for one plan. The phases below are separable, and every one
of them is behaviour-neutral for the owner's account on the day it lands, which
is the property that makes the sequence safe to stop halfway.

**Phase 0 — the object-level hole. DONE 2026-09-11.** `me_list.py`'s two
handlers now resolve through `entry_visible` and 404 with the not-found message.
Five tests in `tests/api/test_visibility.py` under "Writes"; no existing test
regressed, which is itself the useful signal — nothing in the suite depended on
being able to write an entry it could not see.

**Phase A — the capability axis. DONE 2026-09-11.** Minted `admin.authz`,
`manage.catalog` and `manage.pipelines`; seeded the `super` role
(`is_system`, not `is_superuser`); re-gated roles/users/content_labels and
system/data_control, then 20 catalogue routers (73 call sites) onto the new
dependencies; dropped the three `plan_next.py` admin gates; redefined
`is_admin` to mean `manage.catalog` and split the SPA's route guard
accordingly; deleted the bare `admin` permission and `get_current_admin`
last, so a missed router became an `ImportError` rather than a silent grant.
No new tables. Neutral for `admin`, which held every new permission via
`is_superuser` throughout. A real bug surfaced and was fixed along the way:
`get_current_admin` returned a `dict`, the new dependencies return a
`Viewer`, and `users.py`'s self-delete guard read `admin.get("sub")` — so
from the roles/users swap until the fix it raised `AttributeError` instead
of firing.

**Phase B — the access-mode axis, reads only** (sections 2-4). Tables,
migration, seed, resolution, `hidden_label_ids` and `field_gate`. Every existing
account lands on `unrestricted`, so nothing visibly changes.

**Phase C — write binding** (decision 9). The write paths call the same guard.
Phase 0 is a subset of this and a down payment on it.

**Phase D — the surfaces** (section 5). The access-mode page, the per-account
panel, the switch endpoint, the SPA switcher. Until this ships, modes exist and
are enforced but can only be changed in the database — which is why it is last
rather than first.

Testing (section 6) is not a phase; each phase carries the slice of the matrix
it makes true, written first.

## Post-Phase-A audit of sections 2-6 (2026-09-11)

Checked against the code Phase A left behind, so the Phase B plan argues from
verified ground rather than from what was true on 2026-09-10.

**Still accurate, verified:** `hidden_label_ids` is at `enforcement.py:27`;
`field_gate._withheld` exists; `GUEST_WITHHELD_FIELD_GROUPS` is still exactly
`{"sources_restricted"}`; `label_perm()` and `field_group_perm()` both still
exist for Phase B to delete; `cache.py` is still `dict[UUID, frozenset[str]]`
keyed on role id alone; the login token is still
`{"sub": username, "role": ...}` with the role claim decorative.

**Five corrections:**

1. **Section 4's `is_admin` redefinition is DONE**, not proposed. Phase A
   shipped it (`c71ad497`): `/api/auth/me` returns
   `viewer.has(PERM_MANAGE_CATALOG)`, and the SPA route block is split 12
   (`manage.catalog`) + 3 (`admin.authz`). The SPA *nav* needed the same split
   and did not get it until `da4f23b6` — `navigation.js` calls `has("admin")`
   directly and so was untouched by redefining `is_admin`. Phase B must
   remember that the nav is a second, independent surface.

2. **Section 5's migration step 3 is DONE.** Minting the three permissions and
   seeding `super` happened in Phase A with **no Alembic revision at all** —
   `ensure_rbac_seed` runs from the lifespan and is idempotent. Phase B's
   migration therefore covers only: create the five tables, seed the modes,
   grant every existing account all four, and remove the `field_group.*` /
   `label.*` rows. There are now **four** seeded roles, not three.

3. **Section 2's label-side migration claim still holds, and the field-group
   side grew.** Still zero `label.*` grants on zero labelled entries (2 labels
   defined, unused). But `field_group.*` grants now number **12 across three
   roles** — guest, user and super — because `default_super_permissions()`
   derives from the user set. Phase B moves all twelve.

4. **Section 6 needs `super_user` / `super_client` fixtures, and there is now
   duplication to clean up.** `tests/api/conftest.py` has `admin_user`,
   `admin_client`, `plain_user`, `user_client` — no super pair. Phase A's tests
   therefore built a super account inline in **five** separate files
   (`test_authz_router_gates`, `test_capability_dependencies`,
   `test_catalog_router_gates`, `test_me_is_admin`, `test_pipeline_router_gates`).
   Phase B should extract the shared fixture and re-point those five.

5. **The parked policy question now bites harder.** `manage.pipelines` allows
   Pull All, which restores the Users and Content Label tabs and can rewrite
   role assignments and labels from the sheet. In Phase A that was an oddity.
   In Phase B, content labels become the **entire basis of the access-mode
   axis**, so a pipeline run can silently re-label every entry and move what
   each mode can reach — without holding `admin.authz`. This needs an answer
   before Phase B's schema is seeded, not after.

## Open questions carried in

From `docs/PROGRESS.md`, unchanged — the redesign is expected to settle these:

1. `field_group.personal_notes` gates a query parameter and nothing on any
   response, and is still labelled "Personal Reviews".
2. No SPA surface for a non-admin: notes editors and tracker controls are
   `isAdmin`-only, so the `user` role is usable but not useful. Section 4's
   `is_admin` redefinition lands in the same code.
3. One remark per owner, site-wide.
4. Note writes answer 403; every other gate answers 401 or 404.
