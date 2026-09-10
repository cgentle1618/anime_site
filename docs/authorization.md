# Authorization (RBAC)

Last verified: 2026-09-10 (audited against the code after Steps 0-5; see the drift note at the foot)

## What this is for

The app used to know two kinds of visitor: anyone (read everything) and the
admin (change everything). Authorization adds a third idea in between: a
**role** is a named bundle of **permissions**, every request resolves to a
viewer with exactly one role, and the read routes narrow what they return to
what that role may see. Permissions are declared in code and only their
**grants** live in the database. Entries are hidden with **content labels**
(`nsfw`, `spoiler`, …) that never name a role: a role holds `label.<key>` and
sees through the label; a role that does not hold it never learns the entry
exists. The day the system landed nothing changed for anyone — the guest role
was seeded with every read permission and an admin narrows it by *removing*
grants.

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
| `users.role_id` | the user's role | FK → role (`RESTRICT`), NOT NULL. The old `users.role` string column was dropped and re-exposed as a read-only `column_property` over `role.name` (bottom of `app/models/__init__.py`) |

Models: `app/models/system.py` (`Role`, `RolePermission`, `User`),
`app/models/content_label.py` (`ContentLabel`, `MediaContentLabel`).

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

`app/services/rbac/permissions.py`. A permission is `<family>.<key>`, except
the bare `admin`.

| Name | Meaning | Source of keys |
|---|---|---|
| `admin` | may use every admin route (`Depends(get_current_admin)`); implies nothing else by itself, but the admin *role* is superuser | constant `PERM_ADMIN` |
| `media_type.<key>` | may see any entry of that type; keys are hyphenated (`media_type.tv-show`) | `MEDIA_TYPE_KEYS` in `app/utils/media_resolver.py` |
| `field_group.<key>` | may see the fields in one `FIELD_GROUPS` entry | `app/services/rbac/field_groups.py` |
| `label.<key>` | may see entries carrying that content label | `content_label.key`, read at request time |
| `self.<key>` | may **write** your own rows of that kind — `self.list`, `self.personal_notes` | `SELF_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |

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

Three roles are seeded by `app/services/rbac/seed.py`, and the app reads all
three by name:

| Name | `sort_order` | System | Superuser | Holds |
|---|---|---|---|---|
| `guest` | 0 | yes | no | `default_guest_permissions()` — every media type and every field group except `GUEST_WITHHELD_FIELD_GROUPS` |
| `user` | 50 | yes | no | `default_user_permissions()` — guest's set plus `self.list` and `self.personal_notes` |
| `admin` | 100 | yes | **yes** | nothing explicitly; a superuser role holds every permission implicitly |

`default_user_permissions()` is *derived* from `default_guest_permissions()`
rather than restated, so a media type or field group added later reaches both
roles at once. The `user` role is three ideas and not a subsystem: guest reads,
write-own-list, write-own-personal-notes. Catalogue writes stay behind
`Depends(get_current_admin)`, so granting this role adds **no admin surface**.

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
| `guest` | Has no user rows; every anonymous or unresolvable request becomes this role. Can never hold `admin` → **409** (`app/routers/roles.py::replace_permissions`), because that would make anonymous callers admins. Cannot be deleted or renamed. |
| `user` | A system role like the other two, so it cannot be deleted or renamed either. Its grants *can* be edited - it is not superuser - and `self.list` / `self.personal_notes` are the only things separating it from `guest`. |
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
token_payload)`.

`user_id` is the resolved account's id, or `None` for a guest. It is what every
per-user read and write keys on, and it is the reason a guest now sees no list
at all - see [What a guest sees](#what-a-guest-sees).

- Reads the `access_token` cookie, decodes the JWT (which carries `sub` only),
  loads the user, takes `user.role_ref` or the guest role.
- **Never raises.** Missing/garbage/expired cookie, deleted user, deleted role,
  any exception → `GUEST_FALLBACK` (no permissions). Fails closed; this is what
  lets `/api/auth/me` and the public routes share it.
- `get_viewer` is the `Depends` form (deduped per request);
  `require_permission(name)` is a dependency factory.
- `app/dependencies.py::get_current_admin` is now a thin wrapper:
  `resolve_viewer` then `viewer.has("admin")`, else **401**. Stricter than the
  old token check: a valid token for a deleted user or a de-admined role is
  rejected.
- `app/dependencies.py::get_current_user_id` is the **third** gate, added in
  Step 3, and it asks a different question from the other two: not "does this
  viewer hold a permission" but "is there an account at all". It returns
  `viewer.user_id` or **401**. Every `/api/plan-next` and `/api/seasonal` route
  depends on it, because those tables hold one account's private queues and
  ratings; the seasonal rating PATCH uses it *instead of*
  `get_current_admin`, since the rating it writes is the caller's own.
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
the JWT so that revoking one takes effect immediately. `permissions_for(db,
role_id)` memoises per role id in a module-level dict; every write in
`roles.py` and `content_labels.py` calls `cache.bump()` which clears it.
**Single-instance caveat:** the cache is process-local, so it is only
correct while the app runs as one process - which it does today, local
development being the only runtime. Self-hosting keeps that shape (one
container behind the tunnel), but any future second worker would serve stale
grants until its own restart and would need a short TTL instead. The GCP
deployment this caveat used to name was removed on 2026-09-08.

## Visibility enforcement (`enforcement.py`)

Two gates, always applied together: the viewer holds `media_type.<key>` or the
whole type disappears; the entry carries no label whose `label.<key>` the
viewer lacks. Both run in SQL — filtering in Python after `limit/offset` would
shrink pages and shift the next page's start.

| Helper | Use | Behaviour |
|---|---|---|
| `hidden_label_ids(db, viewer)` | building block | ids of labels the viewer lacks; `[]` for superuser, and every caller short-circuits on `[]` |
| `apply_entry_visibility(query, model, media_type, db, viewer)` | list routes | `filter(false)` if the type is not held; otherwise `NOT EXISTS` anti-join on `media_content_label` |
| `apply_media_visibility(query, db, viewer)` | anything spanning every type at once | The same two gates over the `media` supertable rather than one detail table: the media-type check becomes an `IN` over the types the viewer holds, and the label anti-join goes through `media_content_label.media_id`. Added in Step 2 for the profile page, which answers for all nine types in one query. The query must already select from or join `Media` |
| `entry_visible(db, viewer, media_type, entry_id)` | detail and per-entry sub-routes | bool; callers **404 with their normal not-found message** |
| `filter_visible_pairs(db, viewer, pairs)` | cross-type batches | one query for many `(media_type, id)` pairs; tier pairs (franchise/series/collection) are always allowed since tiers carry no labels or type permission |
| `drop_hidden_rows(db, viewer, rows, type_attr, id_attr)` | quotes, memes, plan-next | rows are **dropped**, not degraded to `missing=True` (the text itself is the leak; `missing` means "dangling reference, fix it"); rows with no reference are kept |

`viewer=None` or superuser returns input untouched everywhere.

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
| own-list writes (`/api/me/list/{media_id}`) | `routers/me_list.py`, behind `self.list` |
| account settings (`/api/account/settings`) | `routers/account.py` - the `list_is_public` toggle, writable only by its owner |
| previously unauthenticated `data_control` / `system` GETs | closed behind `get_current_admin` |

### Accepted residuals

- Seasonal counts (`/api/seasonal`) still include hidden entries. Narrower
  than it was: since Step 3 the whole route needs an account
  (`get_current_user_id`), so this leaks a count to signed-in users only, not
  to the public.
- Community aggregates (`/api/community/{media_id}`) are filtered by
  `users.list_is_public` but **not** by media-type or label visibility, so a
  viewer who lacks `media_type.game` can still read a game's rating average if
  they already know its `media_id`. The same argument as covers below - the id
  has to come from a visible response first - and the same weakness.
- Watch-order *list* summaries expose `media_types` and `item_count` including
  hidden items.
- `/static/covers/...` files are served without checks (a cover URL is only
  learned from a visible response, but it is not itself gated).
- Franchise/series hubs may render empty rather than 404 when all children are hidden.

### The two-spellings trap

`MEDIA_REGISTRY` (router configs, `_factory.py`) uses underscore keys
(`anime_movie`, `tv_show`); `MEDIA_TABLES`/`OWNER_TABLES`
(`app/utils/media_resolver.py`) and every stored `media_type` column use
hyphens (`anime-movie`, `tv-show`). Permissions are keyed on the hyphenated
form. Always pass `spec.owner_type` (hyphenated) into the rbac helpers — a
registry key would never match a grant and would hide the whole type.

## Field gating (`field_gate.py`)

`gate(viewer, media_type, payload, schema)` applies withheld field groups to
one entry or a list:

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

## What a guest sees

A logged-out visitor has **no list**, and is shown none. `acting_user_id`
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
| `catalog` | admin only (`admin`) | everyone, unfiltered |
| `personal` | any signed-in account holding `self.personal_notes`, own rows only | `WHERE author_id = viewer` - or the profile owner's, through `?author=`, when their `list_is_public` **and** the viewer holds `field_group.personal_notes` |

A logged-out visitor has no `user_id` and therefore sees **no** personal rows
at all, and may write nothing: both answers are 403, from
`_authorize_write` / `_authorize_edit` in `app/routers/note.py`. An unknown
username, a private list and a viewer without the field group all answer the
same 403 on `?author=`, so the reply cannot be read as "this account exists".

**Quotes and memes are untouched by scope.** They carry an `author_id` for
provenance and every viewer reads the same rows.

**This is not the authorization redesign.** The spec calls for one, and it is
still deferred. Three consequences stand:

- **One remark per owner, site-wide.** `remark` is personal-scope, but its read
  path is a class-level `column_property` that cannot know who is asking, so
  `ix_note_one_remark_per_owner` stays per-owner and a second user's remark is
  **refused by the database** rather than shown to the first user. The
  conservative failure, recorded in `app/models/__init__.py` and pinned by
  `tests/api/test_remark_author.py`.
- **The `personal_notes` field group is only half rebuilt.** It governs the
  `author` parameter and nothing else.
- **No frontend.** `scope` reaches the API and nothing renders it; the notes
  page still shows its editors to admins only, so a `user`-role account can
  write personal notes through the API but not through the UI.

## Admin routes

| Method & path | Notes |
|---|---|
| `GET /api/roles/`, `GET /api/roles/{id}` | with `permissions` and `user_count` |
| `GET /api/roles/catalog` | the vocabulary grouped by family — the editor grid is built from it, never mirrored in the SPA |
| `POST /api/roles/` | 409 on duplicate name; created non-superuser |
| `PATCH /api/roles/{id}` | label/description/sort_order only; `guest`/`admin` cannot be renamed |
| `PUT /api/roles/{id}/permissions` | replaces the set; 422 unknown, 409 superuser role, 409 guest+admin |
| `DELETE /api/roles/{id}` | 204; 409 for system roles or roles still held |
| `GET/POST/PATCH/DELETE /api/users/…` | `role_id` must exist (422); username 409 |
| `GET /api/content-labels/`, `POST`, `PATCH`, `DELETE` | 409 duplicate key; delete cascades assignments (entries become visible again); 204 |
| `GET/PUT /api/content-labels/entry/{media_type}/{entry_id}` | list / replace an entry's label keys; 400 unknown type, 404 entry, 422 unknown label |

All are behind `get_current_admin`; every write calls `cache.bump()`.

### Guards on users (`app/routers/users.py`)

- **Last admin:** changing the role of, or deleting, the last account whose
  role can administer (superuser or holds `admin`) → **409** "last account
  that can administer the site".
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
| `tests/api/test_rbac_admin_api.py` | roles/users/labels routes, 409/422 guards |
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
| `get_current_admin` | do you hold `admin`? | 401 |
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
- **One error shape.** 404 for a thing you may not see, 401 for an admin route.
  Step 5 broke this: the note gates answer **403**, and those five are the
  only 403s the app raises anywhere (`_authorize_write`, `_authorize_edit` and
  the `?author=` refusal in `app/routers/note.py`). Every other module carries
  a comment explaining why it answers 401 or 404 instead. Either the 403s are
  right and the rest should follow, or they are wrong and should become 401 -
  the redesign should decide rather than leave two conventions running.

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
  `column_property` is the standing example, and it is why one remark per owner
  is still a site-wide rule. Anything the redesign wants to make per-user needs
  a read path that takes a viewer.
- **Per-user data has to cross machines.** A new per-user table needs a
  `username` column on its sheet tab (Step 4), and Pull's header filter drops
  any parsed key the sheet's header row did not carry - which bit Step 3 and
  Step 5 in exactly the same way.
- **Migrations must not import ORM models** - an open defect class in
  `docs/PROGRESS.md`, not a style preference.

## Known drift, and what this page does not yet describe

Audited against the code on 2026-09-10, after Steps 0-5. Ten things were stale
and are corrected above; they are listed here because the pattern matters more
than any one of them. Every stale line described a rule that a later step had
narrowed rather than removed - an FK-less pair that became a foreign key, a
`Viewer` that grew a field, a caveat naming a deployment that no longer exists.

**This page describes the system as built, not as designed.** The spec
(`docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md`) calls for an
authorization redesign that this documentation should be *rewritten* for rather
than amended again, and it has not happened. Three things are half-finished and
are the reason:

- **`field_group.personal_notes` is only half rebuilt.** It governs
  `GET /api/notes?author=` and nothing else. Its name still says "Personal
  Reviews", which is what it gated before Step 5 made personal sections filter
  by author.
- **There is no UI for a non-admin account.** A `user`-role account can write
  its own list and its own personal notes through the API, and the SPA offers
  no way to do either: the notes editors and the tracker controls are still
  `isAdmin`-only. The `user` role is therefore usable but not yet *useful*.
- **One remark per owner, site-wide.** `remark` is personal-scope but its read
  path is a class-level `column_property` that cannot know who is asking, so
  the partial unique index stays per-owner and a second user's remark is
  refused by the database.
