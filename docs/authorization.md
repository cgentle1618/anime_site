# Authorization (RBAC)

Last verified: 2026-09-12 (Phase B: the access-mode axis, plus decisions 12,
13 and 14)

## What this is for

The app used to know two kinds of visitor: anyone (read everything) and the
admin (change everything). Authorization adds a third idea in between: a
**role** is a named bundle of **permissions**, every request resolves to a
viewer with exactly one role, and the read routes narrow what they return to
what that role may see. Permissions are declared in code and only their
**grants** live in the database.

**Since Phase B (2026-09-12) there are TWO axes, and they answer different
questions.**

- The **role** answers *what kinds of operation may this account perform* —
  read, edit the catalogue, run a pipeline, change authorization. It holds
  `admin.*`, `manage.*`, `media_type.*` and `self.*`.
- The **access mode** answers *which objects can those operations reach in
  this session*. It carries content labels and field groups, and nothing
  else.

Effective access = (the role's permissions) applied to (the active mode's
object set). The two are disjoint **by construction**: there is no column on
the access-mode tables in which `manage.catalog` could be stored, and
`label_perm()` / `field_group_perm()` were deleted so that no code can ask
the role axis an object question. That is what lets the owner's own admin
account sit in a narrow mode and actually be narrowed.

Entries are hidden with **content labels** (`nsfw`, `spoiler`, …) that never
name a role: a *mode* carries `label`, and a session whose mode does not carry
it never learns the entry exists. The day the system landed nothing changed
for anyone — the guest role was seeded with every read permission, the `safe`
mode was seeded from whatever the guest role actually held, and an admin
narrows either by *removing* grants.

Related: [authentication.md](authentication.md) (login, cookie),
[data-model.md](data-model.md) (tables), [api.md](api.md) (routes),
[notes/decisions.md](notes/decisions.md) (2026-08-29 View authorization).

## Tables

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `role` | one named bundle of permissions | `name` unique (`guest`, `admin` read by name), `label`, `description`, `is_system` (cannot be deleted or renamed), `is_superuser` (holds every permission implicitly), `sort_order` |
| `role_permission` | one grant | `role_id` FK → role (`CASCADE`), `permission` string; unique `(role_id, permission)` |
| `content_label` | one admin-managed reason an entry may be restricted | `key` unique (becomes permission `label.<key>`), `label`, `description`, `sort_order` |
| `media_content_label` | one label on one entry | `media_id` FK → `media.system_id` (`CASCADE`) since Step 0 - it was an FK-less `(media_type, entry_id)` pair before - plus `label_id` FK → content_label (`CASCADE`) and `position`; unique `(media_id, label_id)`. A label on a deleted entry is now cleaned up by the database rather than left dangling |
| `access_mode` | one named ceiling on what a session may reach | `key` unique, `label`, `description`, `sort_order` (UI only — modes are deliberately **not** ordered for enforcement), `is_system`, `is_guest_default` with a partial unique index `ix_one_guest_default_access_mode` so at most one mode is the anonymous policy |
| `access_mode_label` | one content label a mode CARRIES (i.e. does not hide) | `mode_id` → access_mode (`CASCADE`), `label_id` → content_label (`CASCADE`); unique `(mode_id, label_id)` |
| `access_mode_field_group` | one field group a mode carries | `mode_id` (`CASCADE`), `field_group_key` — a plain string validated against `FIELD_GROUP_KEYS`, not an FK, because field groups are code and not rows; unique `(mode_id, field_group_key)` |
| `user_access_mode` | one mode an account holds | `user_id` → users (`CASCADE`), `mode_id` (`CASCADE`), `is_default` with a partial unique index `ix_one_default_mode_per_user`. `is_default` lives here rather than on `users` so an account's landing mode is necessarily one it holds |
| `user_access_mode_denial` | one item this account does NOT get from that mode | `user_access_mode_id` (`CASCADE`), and exactly one of `label_id` / `field_group_key`, enforced by `ck_denial_names_one_thing`. **Subtraction only** — there is no grant counterpart and there must not be one: a mode is a ceiling, so an account's reach is always a subset of its mode's |
| `users.role_id` | the user's role | FK → role (`RESTRICT`), NOT NULL. The old `users.role` string column was dropped and re-exposed as a read-only `column_property` over `role.name` (bottom of `app/models/__init__.py`) |

Models: `app/models/system.py` (`Role`, `RolePermission`, `User`),
`app/models/content_label.py` (`ContentLabel`, `MediaContentLabel`),
`app/models/access_mode.py` (the five access-mode tables).

**Why two typed link tables instead of one generic
`access_mode_grant(permission text)`:** neither has a column in which
`manage.catalog` or `admin.authz` could be stored, so "a mode scopes objects,
it never grants powers" is a property of the schema rather than a rule a
reviewer has to remember.

Labels are deliberately **not** rows in `media_tag`: that table is keyed to
`system_option` and written by the Fill/backfill pipelines, so a pipeline run
could silently change who sees an entry.

Both tables travel between machines on the `Content Label` and `Media Content
Label` sheet tabs. They are the only tables whose absence from the sheet failed
**open** — a Pull All restored every entry unlabelled, i.e. visible — so treat
a Backup as part of labelling work, not an afterthought. `role` and
`role_permission` have no tab: `ensure_rbac_seed` recreates guest and admin
anywhere, but a role added or a grant removed by hand is per-machine. See
[data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy).

## Permission catalog (code)

`app/services/rbac/permissions.py`. A permission is `<family>.<key>`.

**Phase A of the authorization redesign (2026-09-11) removed the bare `admin`
permission and `get_current_admin` with it.** What used to be one permission
that gated every admin route is now three named ones, so an account can
administer *who* may do what without also being handed the catalogue, or vice
versa:

| Name | Meaning | Source of keys |
|---|---|---|
| `admin.authz` | may **change who may do what** — roles, accounts, content labels | `ADMIN_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |
| `manage.catalog` | may **write the catalogue** — entries, groups, people, credits, options, relations, watch orders, catalogue notes | `MANAGE_PERMISSION_KEYS` in the same module |
| `manage.pipelines` | may **run a pipeline** — Backup, Pull, Fill, Replace, Calculate | `MANAGE_PERMISSION_KEYS` in the same module |
| `media_type.<key>` | may see any entry of that type; keys are hyphenated (`media_type.tv-show`) | `MEDIA_TYPE_KEYS` in `app/utils/media_resolver.py` |
| `field_group.<key>` | may see the fields in one `FIELD_GROUPS` entry | `app/services/rbac/field_groups.py` |
| `label.<key>` | may see entries carrying that content label | `content_label.key`, read at request time |
| `self.<key>` | may **write** your own rows of that kind — `self.list`, `self.personal_notes` | `SELF_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |

Splitting `manage.pipelines` out of `manage.catalog` was nearly free — two
routers, one dependency each — and buys a real distinction: an account can fix
a typo on an entry without being able to overwrite the entire database with a
Pull All. `/api/auth/me`'s `is_admin` flag, which 394 call sites across the SPA
read as "may this person edit the catalogue", now means `manage.catalog`
rather than the old bare `admin`; only the genuinely authorization-shaped
screens (`Roles.jsx`, the users page, `ContentLabels.jsx`) ask for
`admin.authz` instead. See [Roles](#roles) for the `super` role this made
possible — every catalogue capability, none of the authorization one.

`self` is the odd family out and deliberately so: every other family answers
"may you *see* this", and this one answers "may you *write* your own". It is
also the only family whose keys are constants rather than derived, because each
one names a router dependency — a `self.<key>` with no route behind it would be
an inert grant.

`static_catalog()` is the half knowable without a database; `catalog(db)` adds
the label half. Writes to `PUT /api/roles/{id}/permissions` validate every
name against `catalog(db)` and reject unknown ones with **422**, so a grant
naming nothing is never stored. `split_perm()` partitions on the first dot so
hyphenated keys survive.

### Roles

Four roles are seeded by `app/services/rbac/seed.py`, and the app reads three
of them by name (`guest`, `user`, `admin`; `super` is reached only through its
grants, the way any custom role is):

| Name | `sort_order` | System | Superuser | Holds |
|---|---|---|---|---|
| `guest` | 0 | yes | no | `default_guest_permissions()` — every media type and every field group except `GUEST_WITHHELD_FIELD_GROUPS` |
| `user` | 50 | yes | no | `default_user_permissions()` — guest's set plus `self.list` and `self.personal_notes` |
| `super` | 75 | yes | no | `default_user_permissions()` plus `manage.catalog` and `manage.pipelines` — every catalogue capability, deliberately **not** `admin.authz` |
| `admin` | 100 | yes | **yes** | nothing explicitly; a superuser role holds every permission implicitly |

`super` is what Phase A added the three named permissions to make possible: a
helper account that can write the catalogue and run pipelines without being
able to touch roles, accounts or content labels. It is `is_system` (cannot be
deleted or renamed) but **not** `is_superuser` — its grants are real rows,
inspectable and editable on `/roles` like a custom role's, and `viewer.has()`
does not short-circuit for it the way it does for `admin`.

`default_user_permissions()` is *derived* from `default_guest_permissions()`
rather than restated, so a media type or field group added later reaches both
roles at once. The `user` role is three ideas and not a subsystem: guest reads,
write-own-list, write-own-personal-notes. Catalogue writes stay behind
`require_manage_catalog`, so granting this role adds **no catalogue-write
surface**.

The same `if not held:` top-up rule applies to `user` as to `guest`: the seed
grants the defaults only to a role holding nothing at all, so a permission an
admin deliberately removed is never handed back on the next restart.

Migration `m2a1users` seeds the role for a database that already has its
schema. It copies **this installation's** guest grants rather than recomputing
the defaults, so an admin who narrowed guest gets a `user` role narrowed the
same way.

`self.personal_notes` is enforced since Step 5 - it is what
`app/routers/note.py` requires of every personal-scope note write. See
[Note scope](#note-scope) below.

### Field groups

| Key | Label | What it gates | How |
|---|---|---|---|
| `sources_other` | Other Sources | `media_source` rows with `bucket='other'`, on every media type | fifth `FieldGroup` flavour, `source_buckets`; filtered inside `attach_sources` before the response is built (not `field_gate.gate()` — see below) |
| `sources_restricted` | Restricted Sources | `media_source` rows with `bucket='restricted'`, on every media type | same flavour, `source_buckets=("restricted",)` |
| `personal_notes` | Personal Reviews | reading **another user's** personal notes, through `GET /api/notes?author=<username>` | Step 5 narrowed it: personal sections filter by `author_id` on the entry page, so this group no longer withholds anything a viewer wrote. See [Note scope](#note-scope) |
| `system_info` | System Info | `created_at` / `updated_at` on every media type, plus the entry id printed down a detail page's poster spine | timestamps are real columns, stripped from a copy; the spine id is `ui_block` only |
| `credits` | Credits | every credit-kind link field (studio, director, …), derived from `credit_roles` | link attrs blanked before response |

`sources_other` keeps its pre-existing key across the media-sources change so
existing role grants survive unchanged; only what it points at moved, from
the `source_other` column to the `other` bucket of `media_source`.

**`sources_restricted` is deliberately excluded from a fresh guest role.**
`app/services/rbac/seed.py`'s `GUEST_WITHHELD_FIELD_GROUPS` (currently just
`{"sources_restricted"}`) is subtracted from `default_guest_permissions()`,
so a newly seeded guest role does not hold it — a field group whose whole
point is to withhold something from ordinary viewers must not be granted by
default, or it withholds nothing until an admin remembers to revoke it.
Every other field group is still granted by default, matching "everything a
viewer could see before this system existed". This only affects a *fresh*
seed: `_ensure_role`'s `if not held:` guard means an already-established
guest role is never re-granted a permission it doesn't hold, so an existing
deployment's guest role is unaffected either way.

**Gating a `media_source` bucket is not the "real columns" copy-and-strip
path described below** — it happens earlier, inside
`services.domain.sources.attach_sources`, because the filter is *partial*: a
viewer may hold `sources_other` and not `sources_restricted`, so the whole
`sources` attribute cannot simply be blanked the way `source_other` used to
be. `attach_sources` queries `media_source` with the withheld buckets
excluded and sets `entry.sources` to the result; `field_gate.gate()` itself
is unchanged.

Each `FieldGroup` may also carry a `ui_block` name for a block the SPA hides
itself. `tests/unit/test_field_groups.py` asserts every declared column and
link field still exists (drift test).

**`system_info` gates two things at two strengths, deliberately.** Its
timestamps are withheld for real — they appear in no URL and nothing routes on
them. Its `system_id` is not gated at all: that id is the route parameter of
the page the viewer is already on (`/anime/<system_id>`), as well as the query
cache key, the notes owner and every link out, so withholding it would break
navigation while concealing nothing. Hiding the spine text is presentation, and
the code says so. This is not a hole — an id is not a credential here; a hidden
entry is protected by `entry_visible` answering 404, and a viewer can only
learn an id for an entry they were already allowed to see. Removing the id from
the UI entirely would mean routing on slugs instead of UUIDs.

Withheld fields are **absent, not blanked**, in the UI as well as the API: the
"Last updated" figure is dropped rather than showing `—`, for the same reason
`note.py` drops a withheld section instead of serving an empty card.

#### Changing which columns a group hides — code only

> **There is no admin page for this.** `/roles` decides *who holds* a field
> group; *what a field group contains* is `FIELD_GROUPS` in
> `app/services/rbac/field_groups.py` and changing it is a commit and a deploy.
> This is the same rule as the rest of the catalog — permissions live in code,
> grants live in the database — so a string the code branches on cannot be
> edited out from under it by an admin editing a row. `PUT
> /api/roles/{id}/permissions` validates against `catalog(db)` and answers
> **422** for anything unknown, so a group cannot be invented from the UI
> either.

Edit the `columns` mapping on a group. `ALL` (`"*"`) means every media type;
otherwise key by the **hyphenated** media type. Both forms merge.

```python
"system_info": FieldGroup(
    ...
    columns={ALL: ("created_at", "updated_at")},   # every type
),
# or, for columns that only exist on some types:
    columns={"anime": ("mal_rank",), "tv-show": ("imdb_rating",)},
```

A new `FieldGroup` entry appears on `/roles` by itself: the editor grid is
built from `GET /api/roles/catalog`, never mirrored in the SPA. No migration —
the vocabulary is code, only the grants are rows. Restart to pick it up.

**Three rules before adding a column.**

1. **It must be `Optional` in that media type's Response schema.** The gated
   response is a copy with the column set to `None`, and FastAPI re-validates
   it against the route's `response_model`. A required field means the route
   answers **500** instead of a blanked entry. `AnimeResponse` was the one
   schema with required timestamps and had to be widened before `system_info`
   could gate them.
2. **Never gate a column the SPA routes on.** `system_id` is the route
   parameter, the query cache key and the notes owner id; withholding it breaks
   navigation and conceals nothing, since it is the page's own URL.
3. **Check the frontend for a placeholder.** The API blanking a value is the
   gate, but a component that renders `—` where the value used to be still
   announces that something is being withheld. Drop the element instead.

`tests/unit/test_field_groups.py` is a drift test: it fails if a group names a
column or link field that no longer exists, so a typo surfaces in CI rather
than as a silent no-op.

**The two edits default opposite ways.** Adding a column to an *existing* group
changes nothing until someone unticks it, because guest already holds that
permission. Creating a *new* group hides it from guests immediately: the seed
only tops up a guest role holding no grants at all (`seed.py`, `if not held`),
so an established guest role never receives the new permission and an admin
grants it deliberately. Same safe direction as content labels — new
restrictions start restrictive.

## Role guards

What each role is *seeded* with is in [Roles](#roles) above; this is what the
API refuses to let an admin do to one.

| Role | Rules |
|---|---|
| `guest` | Has no user rows; every anonymous or unresolvable request becomes this role. Can never hold `admin.authz`, `manage.catalog` or `manage.pipelines` → **409** (`app/routers/roles.py::replace_permissions`), because that would hand any anonymous caller the ability to administer, write the catalogue, or run a pipeline. Cannot be deleted or renamed. |
| `user` | A system role like the others, so it cannot be deleted or renamed either. Its grants *can* be edited - it is not superuser - and `self.list` / `self.personal_notes` are the only things separating it from `guest`. |
| `super` | A system role too. Not superuser - its grants are ordinary rows and editable on `/roles` - but seeded with `manage.catalog` and `manage.pipelines` and deliberately without `admin.authz`. |
| `admin` | `is_superuser=True`, so `Viewer.has()` short-circuits and it holds every permission including ones that do not exist yet (a new content label hides nothing from it). `PUT /permissions` on a superuser role → **409**. Cannot be deleted or renamed. |
| custom | `is_superuser=False`. Created empty; grants replaced as a whole set (`PUT`, never append). Deleting one with users still holding it → **409**. |

Seed: `app/services/rbac/seed.py::ensure_rbac_seed` is idempotent and runs
from both the `r1b2a3c4c5o6_add_rbac_core` migration and the app lifespan
(`app/main.py`), because the API tests build the schema with `create_all` and
never run Alembic. It only tops up a guest role that has *no* grants, so a
grant an admin removed is not handed back on restart.

## Viewer resolution

`app/services/rbac/resolver.py::resolve_viewer(request, db)` → frozen
`Viewer(username, role_id, role_name, is_superuser, permissions, user_id,
token_payload, mode_id, mode_key, visible_label_ids, field_groups)`.

The last four are the **object axis**, added in Phase B. `permissions` still
means the ROLE's capability set and `has()` is unchanged.
`visible_label_ids` holds the labels this session may SEE —
`hidden_label_ids()` derives the complement, so do not invert it.

`user_id` is the resolved account's id, or `None` for a guest. It is what every
per-user read and write keys on, and it is the reason a guest now sees no list
at all - see [What a guest sees](#what-a-guest-sees).

- Reads the `access_token` cookie, decodes the JWT (which carries `sub`, a
  decorative `role`, and since Phase B a `mode` uuid), loads the user, takes
  `user.role_ref` or the guest role, then resolves the access mode.

**Mode resolution, fail-closed** (`app/services/rbac/modes.py::resolve_mode`):

```
token.mode  ->  still granted to this user?
                  yes -> effective = mode's sets - this pair's denials
                  no  -> effective = EMPTY SET
no token    ->  the is_guest_default mode, or EMPTY SET if none flagged
```

The claim **names a choice, not a grant**: whether the account may still use
that mode is re-resolved from the database on every request, exactly as the
role already is, so revoking a mode or ticking a denial takes effect on the
viewer's next request even with a live cookie. It carries the mode's **uuid**
rather than its key, so renaming a mode does not invalidate live sessions.

Three fallbacks that all go to the **empty set**, and each for a reason worth
keeping:

- A revoked mode does **not** fall back to the account's default. "Narrowest"
  is not well defined once modes are deliberately unordered, and falling back
  to `is_default` could *widen* a session — sitting in `safe` when an admin
  revokes `safe` would hand the viewer `unrestricted` with no password.
- A signed-in caller with no usable claim does **not** inherit the guest
  default. That mode is the anonymous policy, not this account's.
- No mode flagged `is_guest_default` gives a guest nothing, rather than
  everything. A misconfiguration must hide, not publish.
- **Never raises.** Missing/garbage/expired cookie, deleted user, deleted role,
  any exception → `GUEST_FALLBACK` (no permissions). Fails closed; this is what
  lets `/api/auth/me` and the public routes share it.
- `get_viewer` is the `Depends` form (deduped per request);
  `require_permission(name)` is a dependency factory.
- `app/dependencies.py::get_current_admin` is **gone**, deleted in Phase A of
  the authorization redesign along with the bare `admin` permission
  (`PERM_ADMIN`) it checked. `app/services/rbac/resolver.py` binds three named
  replacements at import time, one per capability: `require_admin_authz`,
  `require_manage_catalog`, `require_manage_pipelines` — each
  `require_permission(<name>)`, else **401**. Routers depend on these by name
  rather than calling `require_permission` inline, so swapping a router's gate
  is a one-word edit and grepping for a capability finds every route holding
  it. Same strictness as the dependency it replaced: a valid token for a
  deleted user or a role that lost the permission is rejected.
- `app/dependencies.py::get_current_user_id` is the **third** gate, added in
  Step 3, and it asks a different question from the other two: not "does this
  viewer hold a permission" but "is there an account at all". It returns
  `viewer.user_id` or **401**. Every `/api/plan-next` and `/api/seasonal` route
  depends on it, because those tables hold one account's private queues and
  ratings; the seasonal rating PATCH uses it *instead of* a capability gate,
  since the rating it writes is the caller's own.
  `app/services/rbac/resolver.py::viewer_user_id(viewer)` is the non-raising
  companion for the handful of routes that stay public and must simply show
  nothing per-user - the entry `watch_next` / `read_next` flags and the
  `seasonal` bucket of `/api/search`. It returns the viewer's own id or `None`,
  and there is deliberately **no fallback to another account**.
- The frontend counterpart is `ProtectedRoute`'s `requireAuth` prop
  (`frontend/src/components/layout/ProtectedRoute.jsx`), which gates on
  `username` rather than on `has(permission)`. `/plan`, `/seasonal`,
  `/seasonal/:seasonal_id` and `/statistics` use it.
- `/api/auth/me` returns `is_admin`, `username`, `role`, `is_superuser`,
  `permissions` (sorted); `AuthContext.jsx` builds a `Set` and exposes `has()`.

### Cache (`cache.py`)

Permissions are resolved from the DB on every request rather than carried in
the JWT so that revoking one takes effect immediately. **Three caches now,
and one `bump()` that clears all of them:**

| Cache | Key | Holds |
|---|---|---|
| `_CACHE` | `role_id` | that role's permissions |
| `_MODE_CACHE` | `mode_id` | that mode's labels and field groups — shared by everyone holding it, so this is the hot one |
| `_DENIAL_CACHE` | `user_access_mode_id` | that (account, mode) pair's denials, usually empty |

They are keyed on the thing that is SHARED, never on the account: adding the
user to a key would make the cache unbounded in accounts and destroy the
sharing that makes it worth having. Every write in `roles.py` and
`content_labels.py` calls `cache.bump()`, which clears all three — a `bump()`
that cleared only the first would leave a revoked mode live until restart, and
would leak mode state between tests in a way whose failures are random and
order-dependent.
**Single-instance caveat:** the cache is process-local, so it is only
correct while the app runs as one process - which it does today, local
development being the only runtime. Self-hosting keeps that shape (one
container behind the tunnel), but any future second worker would serve stale
grants until its own restart and would need a short TTL instead. The GCP
deployment this caveat used to name was removed on 2026-09-08.

## Visibility enforcement (`enforcement.py`)

Two gates, always applied together, and since Phase B they read **different
axes**: the viewer's ROLE holds `media_type.<key>` or the whole type
disappears; the viewer's active MODE carries every label the entry carries, or
the entry disappears. Both run in SQL — filtering in Python after
`limit/offset` would shrink pages and shift the next page's start.

| Helper | Use | Behaviour |
|---|---|---|
| `hidden_label_ids(db, viewer)` | building block | ids of labels the viewer's ACTIVE MODE does not carry; `[]` is the common case and every caller short-circuits on it. **No `is_superuser` short-circuit** — that is the point of Phase B |
| `apply_entry_visibility(query, model, media_type, db, viewer)` | list routes | `filter(false)` if the type is not held; otherwise `NOT EXISTS` anti-join on `media_content_label` |
| `apply_media_visibility(query, db, viewer)` | anything spanning every type at once | The same two gates over the `media` supertable rather than one detail table: the media-type check becomes an `IN` over the types the viewer holds, and the label anti-join goes through `media_content_label.media_id`. Added in Step 2 for the profile page, which answers for all nine types in one query. The query must already select from or join `Media` |
| `entry_visible(db, viewer, media_type, entry_id)` | detail and per-entry sub-routes | bool; callers **404 with their normal not-found message** |
| `filter_visible_pairs(db, viewer, pairs)` | cross-type batches | one query for many `(media_type, id)` pairs; tier pairs (franchise/series/collection) are always allowed since tiers carry no labels or type permission |
| `drop_hidden_rows(db, viewer, rows, type_attr, id_attr)` | quotes, memes, plan-next | rows are **dropped**, not degraded to `missing=True` (the text itself is the leak; `missing` means "dangling reference, fix it"); rows with no reference are kept |

`viewer=None` returns input untouched everywhere, and that half of the guard
**must stay**: internal callers pass `None` to mean "not a request", and
`_factory._finish(db, entry, viewer=None)` relies on it. The `is_superuser`
half is gone — object scoping left the role axis, so holding every capability
no longer reaches it. The media-type half still goes through `has()`, which
does short-circuit on `is_superuser`, because `media_type.*` stayed on the
role axis.

**404, not 403.** A hidden entry answers exactly as an absent one, so a viewer
cannot enumerate what exists. Admin routes use **401**, never 403, so the SPA
sees one error shape.

### Covered surfaces

| Surface | Where wired |
|---|---|
| media lists, detail (every type, incl. gating) | `app/routers/_factory.py` (`apply_entry_visibility`, `entry_visible`, `gate`) |
| credits for an entry | `routers/credits.py` → 404; hidden entries' credits not counted on person/studio |
| notes for an owner | `routers/note.py` → 404 for hidden entry owners, `gated_note_sections` withheld |
| quotes (list, grouped, by id) | `routers/quote.py` (`drop_hidden_rows`) |
| memes (list, grouped, by id) | `routers/meme.py` |
| plan-next rows | `routers/plan_next.py` |
| relations `for-entry`, `scope`, `graph` | `routers/media_relation.py` — hidden anchor → 404; an edge naming a hidden entry is dropped whole; graph is viewer-filtered |
| watch-order items, addable candidates | `routers/watch_order.py` (`resolve_items`, `list_candidate_entries`) |
| search | `routers/search.py` |
| a public profile (`/api/profile/{username}`) | `routers/profile.py` (`apply_media_visibility`) - filtered by the **reader's** permissions, never the list owner's |
| own-list reads and writes (`/api/me/list/{media_id}`) | `routers/me_list.py`, behind `self.list` **and**, since 2026-09-11, `entry_visible` in `_media_or_404`. Until then this row named only the capability gate and the entry was resolved with a bare `db.get`, so an account holding `self.list` could rate an entry it could not see, or a media type it did not hold, by knowing the uuid. Writes follow reads: 404 with the not-found message, never 403 |
| account settings (`/api/account/settings`) | `routers/account.py` - the `list_is_public` toggle, writable only by its owner |
| previously unauthenticated `data_control` / `system` GETs | closed behind `require_manage_pipelines` |
| Pull's three authorization tabs (`Users`, `Content Label`, `Media Content Label`) | `routers/data_control.py` passes `may_restore_authz=viewer.has(PERM_ADMIN_AUTHZ)` into `pull.py`. Without it each returns `status: "skipped"` and is named in `unresolved_refs`, so the rest of the restore still lands and the gap is visible. Stops a `manage.pipelines` holder promoting themselves by typing `admin` into the sheet's Users tab. **Backup is not gated** - it writes local -> sheet and cannot change this database |

### Write binding (Phase C, 2026-09-11)

**A write answers exactly what a read would.** Eight routers — the per-type
entry routes, `casting`, `credits`, `quote`, `meme`, `note`, `media_relation`,
`watch_order` — resolve a client-supplied entry id through `entry_visible`
before writing, and a hidden or nonexistent entry gets the
same answer a `GET` of it would: the per-type routes and `casting`/`credits`
their existing 404, `media_relation`/`watch_order` their existing
`400 "Referenced entry does not exist."`, `note` its existing
`404 "Owner not found."`. `entry_visible` (`enforcement.py`) is the single
place this is decided; nothing else re-implements the check. No route gained
a new status code or a new message — a 403 would itself confirm the entry
exists, which is the property being protected.

The structural change was `_factory.py::_get_or_404`'s `viewer` parameter
losing its default: `entry_visible` returns `True` for a `None` viewer, so the
default was the defect, silently closing the check on every call site that
omitted it (36 routes, the four per-type write routes across all nine media
types). Making the argument required turns a future write route that forgets
it into a `TypeError` rather than a silent grant — the same fail-loudly move
Phase A made by deleting `get_current_admin`.

That is eight routers, not *every* route in the app: the audit's inventory was
found incomplete by the final review of the branch, and
`POST /api/data-control/replace/{key}/{entry_id}` is the route it missed. See
the residuals below, and do not read the list of eight as a proof of
completeness.

Three routers — `quote`, `note`, `meme` — take a `(type, id)` pair from the
client but write against the id alone, and all three shipped the same defect:
the type in the payload is not evidence of anything, so gating on it checks
the wrong `media_type.<key>` permission while the label half (keyed on
`media_id`) still bites — a silent bypass of the type axis only. They now share
`enforcement.require_visible_media(db, viewer, entry_id, detail)`, which
resolves the type from the media row and raises the caller's own 404. The
helper exists because forgetting this is a security bug and the lesson did not
travel by comment; the shortest form is now the safe one.

**Accepted residuals, deliberately not closed here:**

- `content_labels.py`'s `PUT /api/content-labels/entry/{media_type}/{entry_id}`
  still writes labels with no visibility test. It is gated by `admin.authz`,
  the permission that *defines* the label axis, and a holder of it can grant
  itself any label anyway, so a visibility check would guard nothing a
  permission check doesn't already cover.
- `franchise.py` stores `cover_entry_id` unvalidated. The consequence of a
  mismatched or hidden id is a cover image, not a data leak.
- `POST /api/data-control/replace/{key}/{entry_id}` (`data_control.py`, nine
  media types) takes a client-supplied entry id, is gated by
  `require_manage_pipelines` alone and never asks `entry_visible`:
  `services/pipelines/runner.py` answers 404 "<label> entry not found" for a
  missing entry and 200 "Successfully updated <display_name>." for a hidden
  one — a write, an existence oracle and a title leak. It is left alone on
  purpose: gating it while `Replace All` in the same router stays ungated
  would enforce the object axis incoherently inside one subsystem, and what
  the object axis means for a pipeline is the parked policy question (a
  `manage.pipelines` holder can already rewrite labels and role assignments
  through Pull All) that must be answered before Phase B.
- `note.py`'s owner guard waves through an `owner_id` naming no media row,
  because a grouping tier is a legitimate owner and is not a `media` row
  either. A *nonexistent* id therefore reaches the insert and fails on the
  `media_id` foreign key, surfacing as a 500, while a hidden id answers 404 —
  so on that one path hidden and missing are still distinguishable, by the
  status code rather than by the body.

Plan: `docs/superpowers/plans/2026-09-11-authz-phase-c-write-binding.md`,
spec section "The write-binding audit (2026-09-11)" in
`docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`.

### Accepted residuals

- Seasonal counts (`/api/seasonal`) still include hidden entries. Narrower
  than it was: since Step 3 the whole route needs an account
  (`get_current_user_id`), so this leaks a count to signed-in users only, not
  to the public.
- Community aggregates (`/api/community/{media_id}`) are filtered by
  `users.list_is_public` and **nothing else**. This entry understated it until
  2026-09-12: `community.py` is the only router in the app with **no viewer
  dependency of any kind** — it is not a gated endpoint missing two gates, it
  is answerable unauthenticated. Blast radius today is zero because
  `list_is_public` is false for the only account, and a game's id, an anime's
  id and a fabricated uuid all return byte-identical empty bodies. It arms
  itself the moment a second account makes a list public. Note also that
  `anime.system_id` FKs to `media.system_id`, so the community key IS the
  entry's system_id: anything exposing one hands over the other. **Phase D
  owns this** — it is an SPA-permission-surface change as well as a router
  one.
- Watch-order *list* summaries expose `media_types` and `item_count` including
  hidden items.
- `/static/covers/...` files are served without checks (a cover URL is only
  learned from a visible response, but it is not itself gated).
- Franchise/series hubs may render empty rather than 404 when all children are hidden.
- A content label created AFTER the Phase B migration reaches **no access
  mode**, so it hides its entries from everyone — the owner included — until
  somebody grants it. That is the fail-closed direction and therefore correct,
  but there is no UI for granting it until Phase D ships `/access-modes`, so
  until then it is a `psql` job. Do not "fix" this by making a mode's label set
  implicit: the seeded `unrestricted` mode is a row set precisely so that
  editing it is an auditable act.

### The two-spellings trap

`MEDIA_REGISTRY` (router configs, `_factory.py`) uses underscore keys
(`anime_movie`, `tv_show`); `MEDIA_TABLES`/`OWNER_TABLES`
(`app/utils/media_resolver.py`) and every stored `media_type` column use
hyphens (`anime-movie`, `tv-show`). Permissions are keyed on the hyphenated
form. Always pass `spec.owner_type` (hyphenated) into the rbac helpers — a
registry key would never match a grant and would hide the whole type.

## Field gating (`field_gate.py`)

`gate(viewer, media_type, payload, schema)` applies withheld field groups to
one entry or a list. **Since Phase B, `_withheld(viewer)` reads
`viewer.field_groups` — the active MODE's set — not `viewer.has(field_group
.<key>)`, and it no longer short-circuits on `is_superuser`.** A `None` viewer
still withholds nothing, because internal callers pass `None` to mean "not a
request".

- **Link fields** (credits) are plain attributes attached at read time by
  `attach_link_fields`, so they are blanked in place — nothing to flush.
- **Real columns** (`created_at`/`updated_at` under `system_info`) are
  stripped from a **copy**: `schema.model_validate(entry).model_copy(update=
  {col: None})`. Never `setattr` on a live ORM row — autoflush would persist
  the blank and gating would become silent data loss.
- **`media_source` buckets** are a fifth flavour, gated earlier and
  differently: `attach_sources` (called before `gate()` runs) excludes the
  withheld buckets at the query level, so `entry.sources` never carries the
  rows in the first place. `gate()` and `gated_columns()` know nothing about
  `source_buckets` — see [Field groups](#field-groups) above.
- Returns the ORM instances untouched when nothing is withheld (the common case).
- `gated_note_sections(viewer)` lists `note.section` values to withhold. It is
  applied **only to rows the viewer did not author** - hiding somebody's own
  notes from them is not a permission, it is a bug.
- **`remark` is not gated here at all.** It is a personal-scope note and is
  read per viewer by `app.services.domain.remark_field.attach_remark`,
  filtered on `note.author_id`. It used to be a class-level `column_property`
  on ten models — a scalar subquery, which cannot know who is asking, so it
  served one person's private assessment to everybody and forced
  `ix_note_one_remark_per_owner` to stay per-owner (the database refused a
  second account's remark outright). Both halves moved together in Phase B;
  see [business-rules.md](business-rules.md).

## What a guest sees

**Which OBJECTS:** a logged-out visitor resolves the access mode flagged
`is_guest_default`, seeded on `safe`. A flag rather than the hardcoded key
`safe`, because editing the mode you happen to sit in yourself must not
silently republish it to the internet; and if no mode is flagged, a guest gets
the **empty set** rather than everything.

`safe` is seeded from whatever the **guest role actually held** at migration
time, not from the design's assumption about it. That distinction was worth a
defect: the design said guest withheld `sources_restricted` and nothing else,
but this installation's guest role held only `credits` and `system_info` —
`sources_other` and `personal_notes` were added to `FIELD_GROUPS` after the
roles were first seeded, and `ensure_rbac_seed` tops up only a role holding
*nothing*, deliberately, so an admin's removal survives a restart. Seeding
`safe` from the default set would have published the other-sources list and
other people's personal reviews to every logged-out visitor on the day Phase B
landed.

**Which LIST:** a logged-out visitor has **no list**, and is shown none. `acting_user_id`
returns None for an unresolved viewer, `attach_list_fields` sets nothing, and
the nine `*Response` schemas declare their status field `Optional[str] = None`
so it serialises as null. The library table renders `-`, and the detail page's
"My tracker" card does not render at all - the card is one person's by name,
and there is no "my" without a viewer.

Until 2026-09-10 the fallback resolved a guest to the **lowest-username admin**,
so a stranger read that account's statuses, ratings and progress as though they
were facts about the work, and *which* account was an accident of username sort.
Steps 1 and 2 kept it deliberately, to hold the public pages still while the
data model went multi-user underneath; Step 3 narrowed it (`plan_next` and
`seasonal` answer 401, and `viewer_user_id` never had a fallback). This closes
it.

**A filter over a personal column matches nothing for a guest.** That is not
cosmetic: `join_list` is a no-op when there is no user, so a reference to
`user_media_list` in a `WHERE` clause became an implicit **cross join** and
`?watching_status=Completed` would have matched rows from *every* account.
`app/routers/_factory.py` short-circuits such a filter to `false()`.

Two rules that are **not** this one and survive unchanged:

- **`installation_owner_id(db)`** (`app/services/domain/user_list.py`) - whose
  rows a restore or a pipeline writes. The sheet holds one person's collection
  and carries no owner column, and `user_media_list.user_id` is NOT NULL, so
  Pull and Calculate have to name somebody. A data-ownership question, never a
  visibility one; nothing on a request path may call it. `pull.py` had a
  private copy of the same query, and there is one answer now.
- **`viewer_user_id`** - the non-raising companion for the two public paths
  that must show nothing per-user. It never had a fallback.

## Note scope

Every entry in `NOTE_SECTIONS` (`app/utils/note_sections.py`) declares a
`scope`, with no default: **`catalog`** (20 sections) holds one shared set of
rows, **`personal`** (7) holds one set per user, and the two `SHAPE_EXTERNAL`
sections - `quotes` and `memes` - declare `None`, because they store no `note`
row and are universal by design. The distinction lives in the registry rather
than in the schema, so reclassifying a section stays a registry edit plus a
data reassignment, never an `ALTER TABLE`. `/api/notes/sections` serves it.

| Scope | Write | Read |
|---|---|---|
| `catalog` | `manage.catalog` (was the bare `admin` before Phase A) | everyone, unfiltered |
| `personal` | any signed-in account holding `self.personal_notes`, own rows only | `WHERE author_id = viewer` - or the profile owner's, through `?author=`, when their `list_is_public` **and** the viewer's MODE carries `personal_notes` |

**Two answers, and 403 is gone from this router entirely** (decision 13,
shipped 2026-09-12). `401` means *you may not do this kind of thing* — a
capability failure, matching what `require_permission` already returns and the
one error shape the SPA knows. `404` means *this object is not yours to see*,
in the same words a genuinely absent row gets, because a 403 confirms a row
exists exactly as surely as a 200 does.

| Situation | Answer |
|---|---|
| no `self.personal_notes` (a guest included) | **401** |
| no `manage.catalog`, creating a catalogue note | **401** |
| no `manage.catalog`, editing a catalogue note | **401** — the caller may not edit catalogue notes at all, which is not a fact about this note |
| somebody else's personal note | **404**, worded identically to a missing one |
| `?author=` naming a private list, a viewer whose mode lacks `personal_notes`, or a username that does not exist | **404**, all three identical, so the reply cannot be read as "this account exists" |

`tests/api/test_note_status_codes.py` asserts the absence of 403 directly, so
a future "clearer" 403 fails the suite rather than quietly reintroducing an
oracle. Note that the middle row corrects the design's own line list, which
had assigned it 404.

**Quotes and memes are untouched by scope.** They carry an `author_id` for
provenance and every viewer reads the same rows.

**The authorization redesign is now partly shipped.** Phases 0, A, A.1, B and
C are in; Phase D (the access-mode admin page, the per-account panel and the
session mode switcher) is not. What changed for notes:

- **A remark belongs to its author.** `remark` is read per viewer by
  `attach_remark`, filtered on `note.author_id`, and
  `ix_note_one_remark_per_owner` carries `author_id`. Two accounts may each
  hold a remark on one entry and each reads back their own. Before Phase B the
  read was a class-level `column_property` — a scalar subquery, which cannot
  know who is asking — so one person's assessment was served to everybody and
  the database refused a second account's write outright. Both halves moved in
  one commit, deliberately: relaxing the index alone would have turned a loud
  refusal into an accepted-then-invisible write.
- **`field_group.personal_notes` is a mode item now**, not a role grant. It
  still gates the `personal_reviews` section on every row the viewer did not
  author.

## Admin routes

| Method & path | Notes |
|---|---|
| `GET /api/roles/`, `GET /api/roles/{id}` | with `permissions` and `user_count` |
| `GET /api/roles/catalog` | the vocabulary grouped by family — the editor grid is built from it, never mirrored in the SPA. **Four families only** since Phase B: `admin`, `manage`, `media_type`, `self`. Content labels and field groups are not offered, because a role cannot express "minus this label" — permission resolution is a union |
| `POST /api/roles/` | 409 on duplicate name; created non-superuser |
| `PATCH /api/roles/{id}` | label/description/sort_order only; `guest`/`admin` cannot be renamed |
| `PUT /api/roles/{id}/permissions` | replaces the set; 422 unknown, 409 superuser role, 409 guest+admin |
| `DELETE /api/roles/{id}` | 204; 409 for system roles or roles still held |
| `GET/POST/PATCH/DELETE /api/users/…` | `role_id` must exist (422); username 409 |
| `GET /api/content-labels/`, `POST`, `PATCH`, `DELETE` | 409 duplicate key; delete cascades assignments (entries become visible again); 204 |
| `GET/PUT /api/content-labels/entry/{media_type}/{entry_id}` | list / replace an entry's label keys; 400 unknown type, 404 entry, 422 unknown label |

`ContentLabelResponse` no longer carries a `permission` field: a label stopped
being a permission in Phase B, and publishing `label.<key>` would have named
something that does not exist. The admin table shows the label's `key`.

All are behind `require_admin_authz`; every write calls `cache.bump()`.

### The pipeline routers need an unscoped MODE as well (decision 14)

`data_control.py` and `system.py` carry **two** router-level dependencies:
`require_manage_pipelines` *and* `require_unscoped_mode`, which answers **401**
unless the session's active mode carries every `content_label` row and every
`FIELD_GROUP_KEYS` entry.

`manage.pipelines` is declared **unscoped on the object axis** — no pipeline
filters by label, field group or media type. That is deliberate and the
alternative is worse: the sheet holds exactly one version of the data and
Backup overwrites every tab, so filtering the runner per viewer would write a
*partial* sheet over the complete one and a Pull All would restore a partial
database. Silent data loss, in place of an information leak.

This does **not** contradict "a mode never changes which kinds of operation an
account may perform". A pipeline's object set is every entry, declared and not
negotiable; the mode still only decides which objects an operation reaches, and
it is the *operation* that refuses to run against a subset, because a partial
Backup is not a smaller version of the job. `viewer.has(manage.pipelines)`
answers the same in `safe` as in `unrestricted`.

The test is **computed** — both full sets — never a comparison against the key
`unrestricted`. Editing that mode must not silently widen who qualifies, and an
admin's own equivalent custom mode must qualify. A label minted today narrows
every mode that does not carry it, which is the fail-closed direction.

It also closes an oracle for free: `POST /api/data-control/replace/{key}/
{entry_id}` answered 404 for a missing entry and 200 `"Successfully updated
<display_name>."` for a hidden one — a write, an existence oracle and a title
leak in one answer. A caller who can reach the route has no hidden entries.

401 rather than 404 here because the route's existence is not a secret and the
caller is being told to widen, which is something they can act on. 404 is the
object axis, where indistinguishability is the property being protected.

### Guards on users (`app/routers/users.py`)

- **Last admin:** changing the role of, or deleting, the last account whose
  role can administer (superuser or holds `admin.authz`) → **409** "last
  account that can administer the site".
- **Self-delete:** deleting your own account → **409**.

## Admin UI

| Page | File | What it does |
|---|---|---|
| Roles | `frontend/src/pages/admin/Roles.jsx` | role list, create/delete, checkbox grid per family from `/api/roles/catalog`; superuser roles show a notice instead of a grid |
| Users | `frontend/src/pages/admin/Users.jsx` | create users, assign roles, reset passwords, delete |
| Content Labels | `frontend/src/pages/admin/ContentLabels.jsx` | key/label/description; shows the `label.<key>` permission each becomes |
| Label picker | `frontend/src/components/forms/ContentLabelPicker.jsx` | rendered **once** on Add and once on Modify (not in the per-type tabs); on Add the parent holds the selection and `PUT`s after create, mirroring the credits control |
| Field groups | — | **No page exists.** `/roles` grants them; their contents are `FIELD_GROUPS` in code. See [Changing which columns a group hides](#changing-which-columns-a-group-hides--code-only). |

What an admin can change from the browser, and what needs a commit:

| | Browser | Code |
|---|---|---|
| who holds a permission | `/roles` | |
| which content labels exist | `/content-labels` | |
| which entries carry a label | Add / Modify | |
| which columns a field group hides | | `field_groups.py` |
| which field groups exist | | `field_groups.py` |
| which media types / field-group families exist | | `permissions.py`, the registry |

A field group's `ui_block` is hidden by the SPA itself: the detail pages read
`useAuth().has("field_group.system_info")` to drop the poster-spine id.
Where the server already blanks the value there is nothing to ask —
`ScoreBlock.jsx` drops its "Last updated" figure on a null timestamp, so the
component stays presentational. Either way this is cosmetic; every gate that
matters is enforced server-side.

## Tests

| File | Covers |
|---|---|
| `tests/unit/test_rbac_permissions.py` | catalog, naming, `split_perm` |
| `tests/unit/test_rbac_viewer.py` | `Viewer.has`, superuser, guest |
| `tests/unit/test_field_groups.py` | every declared column/link field exists |
| `tests/api/test_rbac_core.py` | seed idempotence, `/me` never raises, deleted-user / de-admined tokens rejected |
| `tests/api/test_rbac_admin_api.py` | roles/users/labels routes, 409/422 guards; guest can never be granted `admin.authz`, `manage.catalog` or `manage.pipelines` |
| `tests/api/test_admin_compat.py` | characterization test: every route enumerated from the app itself must stay gated by one of the three capabilities, so a route that loses its guard in a refactor fails here |
| `tests/api/test_capability_dependencies.py` | `require_admin_authz` / `require_manage_catalog` / `require_manage_pipelines` each answer 401, never 403 |
| `tests/api/test_catalog_router_gates.py` | a `super` account may edit the catalogue, an ordinary `user` may not - one representative route per router family, pinning that the *right* capability was chosen |
| `tests/api/test_no_bare_admin_permission.py` | the bare `admin` permission is absent from `static_catalog()` and no module imports `get_current_admin` |
| `tests/api/test_media_type_gating.py` | whole type disappears, 404 on detail |
| `tests/api/test_field_gating.py` | column and link stripping, DB untouched, `system_info` timestamps null while `system_id` survives |
| `tests/api/test_visibility.py` | label hiding on lists/detail — asserts on `response.text` so an id cannot leak through any field |
| `tests/api/test_visibility_aggregates.py` | quotes, memes, credits, notes, plan, relations, watch orders, person counts |
| `tests/api/test_visibility_graph.py` | `/graph` filtering |
| `tests/api/test_guest_has_no_list.py` | a guest reads no status, rating or progress; the personal-column filter matches nothing rather than cross-joining; `installation_owner_id` still answers |
| `tests/api/test_viewer_user_id.py` | `Viewer.user_id`, and that `acting_user_id` does **not** fall back |
| `tests/api/test_note_scope_reads.py`, `test_note_scope_writes.py` | personal note sections filter by author; catalogue sections do not; who may write which |
| `tests/api/test_profile.py`, `test_community_aggregate.py` | a private list 404s; public figures count public lists only |
| `frontend/src/components/info/ScoreBlock.test.jsx` | the "Last updated" figure is dropped, not blanked to `—` |
| `frontend/src/components/tracker/trackerGuard.test.jsx` | the "My tracker" card is withheld from a logged-out visitor |

## Why it is built this way

- **RBAC over tiers.** A fixed ladder (guest < member < admin) cannot express
  "sees anime but not personal reviews" without a new tier per combination;
  named permissions and free-form roles can.
- **401, not 403.** The SPA already redirects on one error shape; and a 403
  would confirm the resource exists. Hidden data is 404.
- **Content labels, not `media_tag`.** Tags are descriptive vocabulary that
  pipelines write; access control must not be something a Fill run can change.
- **Permissions in code, grants in DB.** Code branches on the exact string, so
  the string cannot be renamed out from under it (same rule as Tier 1 options).
- **Per-request resolution, not JWT claims.** Revocation is immediate; the
  cache pays for it.

## What the redesign inherits

Written 2026-09-10, from the multi-user programme (Steps 0-5) that has just
finished. These are the constraints and the lessons the next design has to
carry, not a plan for it.

### Four ways of asking, and a fifth would be a smell

The system already distinguishes these, and every new surface should say which
one it uses rather than invent another:

| Gate | Question | Answer when it fails |
|---|---|---|
| `require_admin_authz` / `require_manage_catalog` / `require_manage_pipelines` | do you hold this one capability? (Phase A; replaced `get_current_admin` and the bare `admin` permission) | 401 |
| `require_permission(name)` | do you hold this one grant? | 401 |
| `get_current_user_id` | is there an **account** at all? (Step 3) | 401 |
| `viewer_user_id(viewer)` / `acting_user_id(db, viewer)` | who are you, if anyone? | `None`, never an error |

The third is the one people forget exists. It asks for a person rather than a
permission, and it is what `/api/plan-next` and `/api/seasonal` use, because
those tables hold one account's private queues rather than a restricted view
of a shared catalogue.

### Two families, and one member that no longer fits

- **`field_group.<key>`** answers *may you see this* over the columns, link
  fields and source buckets of a media type. It is applied by `field_gate` to
  a response.
- **`self.<key>`** answers *may you write your own*, and each key names a
  router dependency.

`field_group.personal_notes` is now in neither shape: since Step 5 filtered
personal note sections by `author_id`, it gates a **query parameter**
(`GET /api/notes?author=`) and nothing on any response. It is also still
labelled "Personal Reviews", the section it used to hide. That mismatch is the
strongest argument that this is a re-modelling rather than a renaming.

### Rules not to break

- **Permissions live in code, grants in the database.** A permission naming no
  code is forbidden as an inert grant. Step 5's plan proposed a new
  `note.write_own` when `self.personal_notes` already meant exactly that -
  check `catalog(db)` before minting a name.
- **Fail closed.** `resolve_viewer` never raises; anything unresolvable is the
  guest role holding nothing.
- **`cache.bump()` on every grant write.** Permissions resolve per request so
  revocation is immediate; the cache is process-local.
- **The SPA mirrors no vocabulary.** `/api/roles/catalog` is served, which is
  why the role editor rendered the whole `self.*` family without a single
  frontend change. Keep that property.
- **One error shape, and the redesign has now picked it** (spec decision 13,
  2026-09-11). **401 means you may not do this kind of thing** - a capability
  failure, which is what `require_permission` already answers and the one shape
  the SPA redirects on. **404 means this object is not yours to see** - the
  object axis, answered in the same words a genuinely absent row gets. **403
  disappears.**

  Step 5 had broken this: the note gates answer 403, and those five are the
  only 403s the app raises anywhere (`_authorize_write`, `_authorize_edit` and
  the `?author=` refusal in `app/routers/note.py`). Under the decision, lines
  178 and 183 - lacking `self.personal_notes` or the catalogue write - become
  401; lines 195, 199 and 285 - somebody else's note, and "that user's notes
  are not public" - become 404, because a 403 confirms the row exists exactly
  as surely as a 200 does. That is the argument Phase C spent nine commits on,
  and the `?author=` refusal keeps the property it was built for: unknown,
  private and not-permitted stay one answer.

  **Not yet implemented** - the decision is recorded, the five sites are not
  changed. Until they are, this page describes two conventions because the code
  still runs two.

### Lessons from making it multi-user

- **Test with two accounts.** This is the big one. Two defects survived the
  entire suite because there was only ever one user: `POST /{type}/{id}/complete`
  wrote to the *lowest-username admin's* list rather than the caller's, and a
  guest filtering on a personal column cross-joined `user_media_list` and
  matched every account's rows. Both were found only when a second account
  existed in a test. Any new per-user surface needs a two-account test, not a
  one-account one.
- **"Nobody is asking" is not "asked, and has nothing."** `attach_list_fields`
  returns early for a `user_id` of `None` rather than filling in the type's
  default, because a default status is a claim about a person.
- **A class-level read path cannot know the viewer.** The `remark`
  `column_property` was the standing example and is now the worked one: a
  scalar subquery served one person's assessment to everybody, and it forced
  the unique index to stay per-owner so the subquery could never see two rows,
  which made the database refuse a second account's remark outright. Phase B
  replaced it with a per-request `attach_remark`. The lesson generalises:
  anything that must be per-user needs a read path that **takes a viewer**,
  and the constraint protecting the broken read path has to move in the same
  commit — relaxing it alone turns a loud refusal into a silent loss.
- **Per-user data has to cross machines.** A new per-user table needs a
  `username` column on its sheet tab (Step 4), and Pull's header filter drops
  any parsed key the sheet's header row did not carry - which bit Step 3 and
  Step 5 in exactly the same way.
- **Migrations must not import ORM models** - an open defect class in
  `docs/PROGRESS.md`, not a style preference.

## Known drift, and what this page does not yet describe

Audited against the code on 2026-09-10 after Steps 0-5, again on 2026-09-11
when Phase C landed, and again on 2026-09-12 for Phase B. Every stale line
found each time described a rule a later step had **narrowed rather than
removed** - an FK-less pair that became a foreign key, a `Viewer` that grew a
field, a caveat naming a deployment that no longer exists, a residual that was
worse than recorded. That is the pattern to expect when reading this page
against the code: not inventions, but sentences that were true of a smaller
system.

**This page now describes the two-axis model.** The redesign
(`docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`) is
partly shipped: Phase 0 (the object-level hole on `/me/list`), Phase A (the
capability axis), Phase A.1 (Pull may not restore the authorization tabs),
Phase B (the access-mode axis) and Phase C (write binding) are all in.

**What is NOT built, and is Phase D:**

- **No mode switcher.** `POST /api/auth/access-mode`, the subset test that
  decides whether widening needs the password, and the rule that a reissued
  cookie keeps the original `exp` (without which toggling modes would be an
  unlimited session-extension oracle) are all unwritten. A session sits in
  whatever mode it logged in with.
- **No admin UI for modes.** `/access-modes`, the per-account panel on the
  users page and `PUT /api/users/{id}/access-modes` do not exist, so modes,
  their items and per-account denials can only be changed in the database.
  This is why the migration grants every existing account all four modes: it
  had to be behaviour-neutral without a page to fix it on.
- **New accounts do not yet get `safe` only.** That rule is runtime code in
  `users.py`'s create handler and belongs with the panel that shows what an
  account holds. Today a new account holds no mode at all and therefore
  resolves the empty object set until someone grants one.
- **There is still no UI for a non-admin account.** A `user`-role account can
  write its own list and its own personal notes through the API, and the SPA
  offers no way to do either — the notes editors and tracker controls are
  `isAdmin`-only, which has meant `manage.catalog` since Phase A. The `user`
  role is usable but not yet *useful*.
- **The SPA has two independent permission surfaces**, and this keeps
  catching people: `App.jsx`'s `<ProtectedRoute permission=...>` and
  `frontend/src/config/navigation.js`, which calls `has(...)` directly.
  Redefining what a permission means reaches the first and not the second —
  Phase A shipped `is_admin` and had to fix the nav separately two commits
  later. A related mismatch found on 2026-09-12 and left for Phase D: the
  route gate asks `requireAuth` while `navigation.js` asks `has("self.list")`,
  making the **nav** the stricter surface, so a page can be reachable but
  unlisted — the opposite of the usual direction.
- **`field_group.personal_notes` still reads "Personal Reviews".** The label
  is accurate (it gates the `personal_reviews` section), but the group is a
  mode item now, not a role grant, and the admin vocabulary page that would
  say so is Phase D.
