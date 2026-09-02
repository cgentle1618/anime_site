# Authorization (RBAC)

Last verified: 2026-09-02

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
| `media_content_label` | one label on one entry | FK-less `(media_type, entry_id)` pair (hyphenated `media_type`, resolved through `MEDIA_TABLES`), `label_id` FK → content_label (`CASCADE`), `position`; unique `(media_type, entry_id, label_id)` |
| `users.role_id` | the user's role | FK → role (`RESTRICT`), NOT NULL. The old `users.role` string column was dropped and re-exposed as a read-only `column_property` over `role.name` (bottom of `app/models/__init__.py`) |

Models: `app/models/system.py` (`Role`, `RolePermission`, `User`),
`app/models/content_label.py` (`ContentLabel`, `MediaContentLabel`).

Labels are deliberately **not** rows in `media_tag`: that table is keyed to
`system_option` and written by the Fill/backfill pipelines, so a pipeline run
could silently change who sees an entry.

## Permission catalog (code)

`app/services/rbac/permissions.py`. A permission is `<family>.<key>`, except
the bare `admin`.

| Name | Meaning | Source of keys |
|---|---|---|
| `admin` | may use every admin route (`Depends(get_current_admin)`); implies nothing else by itself, but the admin *role* is superuser | constant `PERM_ADMIN` |
| `media_type.<key>` | may see any entry of that type; keys are hyphenated (`media_type.tv-show`) | `MEDIA_TYPE_KEYS` in `app/utils/media_resolver.py` |
| `field_group.<key>` | may see the fields in one `FIELD_GROUPS` entry | `app/services/rbac/field_groups.py` |
| `label.<key>` | may see entries carrying that content label | `content_label.key`, read at request time |

`static_catalog()` is the half knowable without a database; `catalog(db)` adds
the label half. Writes to `PUT /api/roles/{id}/permissions` validate every
name against `catalog(db)` and reject unknown ones with **422**, so a grant
naming nothing is never stored. `split_perm()` partitions on the first dot so
hyphenated keys survive.

### Field groups

| Key | Label | What it gates | How |
|---|---|---|---|
| `sources_other` | Other Sources | `source_other` on every media type | real column, stripped from a copy |
| `personal_notes` | Personal Reviews | note section `personal_reviews` | note rows filtered in `routers/note.py` |
| `system_info` | System Info | `created_at` / `updated_at` on every media type, plus the entry id printed down a detail page's poster spine | timestamps are real columns, stripped from a copy; the spine id is `ui_block` only |
| `credits` | Credits | every credit-kind link field (studio, director, …), derived from `credit_roles` | link attrs blanked before response |

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

## Roles

| Role | Seeded as | Rules |
|---|---|---|
| `guest` | `is_system=True`, granted every `media_type.*` and every `field_group.*` | Has no user rows; every anonymous or unresolvable request becomes this role. Can never hold `admin` → **409** (`app/routers/roles.py::replace_permissions`), because that would make anonymous callers admins. Cannot be deleted or renamed. |
| `admin` | `is_system=True`, `is_superuser=True` | `Viewer.has()` short-circuits on `is_superuser`, so it holds every permission including ones that do not exist yet (a new content label hides nothing from it). `PUT /permissions` on a superuser role → **409**. Cannot be deleted or renamed. |
| custom | `is_superuser=False` | Created empty; grants replaced as a whole set (`PUT`, never append). Deleting one with users still holding it → **409**. |

Seed: `app/services/rbac/seed.py::ensure_rbac_seed` is idempotent and runs
from both the `r1b2a3c4c5o6_add_rbac_core` migration and the app lifespan
(`app/main.py`), because the API tests build the schema with `create_all` and
never run Alembic. It only tops up a guest role that has *no* grants, so a
grant an admin removed is not handed back on restart.

## Viewer resolution

`app/services/rbac/resolver.py::resolve_viewer(request, db)` → frozen
`Viewer(username, role_id, role_name, is_superuser, permissions, token_payload)`.

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
- `/api/auth/me` returns `is_admin`, `username`, `role`, `is_superuser`,
  `permissions` (sorted); `AuthContext.jsx` builds a `Set` and exposes `has()`.

### Cache (`cache.py`)

Permissions are resolved from the DB on every request rather than carried in
the JWT so that revoking one takes effect immediately. `permissions_for(db,
role_id)` memoises per role id in a module-level dict; every write in
`roles.py` and `content_labels.py` calls `cache.bump()` which clears it.
**Single-instance caveat:** the cache is process-local. Cloud Run currently
runs one instance; a second instance would keep stale grants until its own
restart and would need a short TTL instead.

## Visibility enforcement (`enforcement.py`)

Two gates, always applied together: the viewer holds `media_type.<key>` or the
whole type disappears; the entry carries no label whose `label.<key>` the
viewer lacks. Both run in SQL — filtering in Python after `limit/offset` would
shrink pages and shift the next page's start.

| Helper | Use | Behaviour |
|---|---|---|
| `hidden_label_ids(db, viewer)` | building block | ids of labels the viewer lacks; `[]` for superuser, and every caller short-circuits on `[]` |
| `apply_entry_visibility(query, model, media_type, db, viewer)` | list routes | `filter(false)` if the type is not held; otherwise `NOT EXISTS` anti-join on `media_content_label` |
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
| previously unauthenticated `data_control` / `system` GETs | closed behind `get_current_admin` |

### Accepted residuals

- Seasonal counts (`/api/seasonal`) still include hidden entries.
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
- **Real columns** (`source_other`) are stripped from a **copy**:
  `schema.model_validate(entry).model_copy(update={col: None})`. Never
  `setattr` on a live ORM row — autoflush would persist the blank and gating
  would become silent data loss.
- Returns the ORM instances untouched when nothing is withheld (the common case).
- `gated_note_sections(viewer)` lists `note.section` values to withhold.

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
| Label picker | `frontend/src/components/forms/ContentLabelPicker.jsx` | rendered **once** on Add and once on Modify (not in the 16 per-type tabs); on Add the parent holds the selection and `PUT`s after create, mirroring the credits control |
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

A field group's `ui_block` is hidden by the SPA itself: the eight detail pages
read `useAuth().has("field_group.system_info")` to drop the poster-spine id.
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
| `frontend/src/components/info/ScoreBlock.test.jsx` | the "Last updated" figure is dropped, not blanked to `—` |

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
