# Authorization redesign — design (DRAFT, brainstorm in progress)

Status: **draft**. Brainstormed on 2026-09-10 (home) and stopped partway at an
environment switch. Sections 2-6 are unwritten and section 1 is **not yet
approved**. This file exists so the next session resumes from the decisions
already taken rather than re-asking them. It is not a spec to implement.

Read first: [authorization.md](../../authorization.md#what-the-redesign-inherits)
— the four gates that already exist, the rules not to break, and the lessons
from making the system multi-user.

## The problem

The site knows two kinds of visitor with any real power: `guest` and `admin`,
and `admin` is one permission guarding ~110 route dependencies across 26
routers while the `admin` role is `is_superuser=True` and therefore holds every
permission implicitly — including every content label. One person owns the
installation and uses the `admin` account for everything.

Wanted instead:

- **admin** — a break-glass account that manages authorization and nothing else.
- **super** — the owner's daily account; adds, modifies and deletes catalogue
  data. One today, possibly more later.
- **user** — an ordinary account: own list, own personal notes.
- **guest** — unchanged.

and, orthogonally, three **view modes** on an account — *no restriction*,
*normal use*, *safe view* — chosen per session.

## Decisions taken (2026-09-10)

| # | Question | Decision |
|---|---|---|
| 1 | Is `admin` a separate login or a capability of the super account? | **Separate break-glass account.** The super account can add/modify/delete catalogue data but cannot grant permissions, edit roles, or widen its own restrictions. Changing authorization means logging in as admin. A careless or compromised super session cannot widen its own access |
| 2 | What differs between the three view modes? | **Sight only, over content labels.** All three keep the identical write surface. `nsfw` shows only in *no restriction*; borderline material in *normal use*; *safe view* is the narrowest. Explicitly **not** about writes |
| 3 | How is a mode switched? | **Free toggle, re-auth to widen.** Narrowing is instant; widening asks for the password again. So a browser left logged in at safe view is actually safe |
| 4 | Who has modes? | **General — any account may hold several, including the admin account.** A newly created account holds **safe view only**, by default |
| 5 | Structure for the view-mode axis | **Its own tables** (option B of three): `view_mode`, `view_mode_label`, `user_view_mode`. A mode is structurally incapable of carrying anything but content labels, so "modes are view, not write" is a schema guarantee rather than a review rule. The role machinery keeps its current meaning and all its guards. Costs a second small admin page and a second vocabulary to document |

### The shape those decisions imply

**Two independent axes.** What an account may *do* (admin / super / user /
guest) is fixed by the admin account. What it may *see* is a view mode picked
per session. They must not be one knob: if they were, dropping to safe view
would also drop the `admin` grant, contradicting decision 2.

**Content labels leave the role axis entirely.** `label.<key>` stops being
grantable to a role and becomes exclusively what a view mode carries. This is
what makes "the admin account defaults to safe view" work at all, and it is the
single largest change to the existing model. Every viewer — guest included —
therefore resolves a view mode as well as a role.

**Effective permissions = capability role ∪ active view mode.**

## Section 1 — the capability axis (PRESENTED, NOT APPROVED)

Presented at the point the session stopped; the user had not answered. The two
questions put to them were: is it acceptable that the admin account cannot
touch the catalogue at all, and should `manage.pipelines` be separate from
`manage.catalog`?

`admin` splits into three named permissions, drawn on the routers that exist:

| Permission | Guards | Held by |
|---|---|---|
| `admin.authz` | `roles.py`, `users.py`, `content_labels.py`, and the new view-mode routes | **admin only** (break-glass) |
| `manage.catalog` | everything else currently admin-gated: entry CRUD via `_factory.py`, the three tiers, person/studio/publisher/character/casting, credits, options, relations, watch orders, announcements, quotes/memes, catalogue notes, `constants`, `form_defaults` | **super** |
| `manage.pipelines` | `system.py`, `data_control.py` — Backup, Pull All, Fill, Replace, Calculate | **super** |

Splitting pipelines out of catalogue is nearly free — two routers, one
dependency each — and buys a real distinction: a helper account could fix a
typo on an entry without being able to overwrite the entire database with a
Pull All.

The four roles become **admin** (`admin.authz` only; it cannot edit the
catalogue), **super** (`manage.*` plus every `media_type.*` and
`field_group.*`), **user** (`self.*` plus reads), **guest** (reads).

`is_superuser` is **retired**. The admin role holds an explicit grant set like
every other role, so a permission minted in code reaches nobody until it is
granted — the same safe direction the codebase already uses for new field
groups and content labels. Retiring it touches `Viewer.has()`'s short-circuit,
`hidden_label_ids`, the `PUT /permissions` 409 on a superuser role, the
last-admin guard in `users.py` and `seed.py`.

Three consequences named at the time:

- The admin account **cannot** add or delete entries. That is the point of
  break-glass, but it means every catalogue fix happens as super.
- The SPA's `is_admin` flag from `/api/auth/me` has to become something finer.
- `plan_next.py` has three writes still gated on `get_current_admin` that are
  per-user data (lines 145, 195, 224). They become `get_current_user_id` — a
  small bug fix riding along.

## Still to design (sections 2-6)

2. **The view-mode axis.** `view_mode` / `view_mode_label` / `user_view_mode`
   columns and constraints; the three seeded modes and which labels each
   carries; what a guest's mode is; whether a mode needs to be orderable (see
   the widening rule below, which may make ordering unnecessary).
3. **Session and switching.** Where the active mode lives — a JWT claim
   alongside `sub` is the obvious candidate, with the resolver verifying the
   named mode is still granted to that user and falling back to the narrowest
   if not, preserving fail-closed and immediate revocation. The proposed
   widening test is a **set comparison, not an ordering**: a switch that adds a
   label the session does not currently hold needs the password; a switch that
   only removes labels does not. Re-auth then reissues the cookie with the new
   claim, so widening is just a login that names a mode.
4. **Enforcement.** What changes in `resolver.py`, `enforcement.py`,
   `cache.py` (memoised per role id today; needs the mode in the key too),
   `/api/auth/me` and `AuthContext`.
5. **Admin UI and migration.** The view-mode page; how today's single `admin`
   account splits into an admin plus a super account without locking the owner
   out; seeding.
6. **Testing.** Two accounts minimum, per the multi-user lesson.

## Open questions carried in

From `docs/PROGRESS.md`, unchanged — the redesign is expected to settle these:

1. `field_group.personal_notes` gates a query parameter and nothing on any
   response, and is still labelled "Personal Reviews".
2. No SPA surface for a non-admin: notes editors and tracker controls are
   `isAdmin`-only, so the `user` role is usable but not useful. The `is_admin`
   change in section 1 lands in the same code.
3. One remark per owner, site-wide.
4. Note writes answer 403; every other gate answers 401 or 404.
