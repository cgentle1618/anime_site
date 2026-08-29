# View Authorization (RBAC) — Design Spec

**Date:** 2026-08-29

## Problem

The app has exactly one authorization axis: `get_current_admin` in `app/dependencies.py`, which decodes the `access_token` cookie and requires `role == "admin"`. Every route is either fully public or fully admin — reads are public, writes are admin-gated across ~133 call sites. There is no per-entry, per-field, or per-media-type visibility control anywhere, and no model carries any visibility column.

We need **view** permission, at three granularities:

1. **Whole media type** — a viewer can be blocked from e.g. Manga entirely.
2. **Individual entries** — an entry marked `nsfw` is visible only to viewers permitted to see that label.
3. **Field groups** — e.g. the `source_other` block on a media detail page can be hidden while the rest of the entry stays visible.

Viewers are: **guest** (anonymous, not logged in), **admin**, and **named users created and managed by the admin** (no self-registration).

The intended outcome is a standard RBAC core — named permissions, roles as permission bundles, content labels on entries — enforced **server-side** (hidden entries never leave the API), with admin pages for managing users, roles, labels, and entry labelling. Existing admin write-gating keeps working unchanged by being reimplemented on top of the new core.

**Day one must be behavior-identical:** the seeded `guest` role is granted every media type and every field group, and no content labels exist. The admin restricts by *removing* grants.

---

## Design decisions

- **RBAC, not numeric tiers.** A permission is a named atomic capability; a role is a bundle; a user has one role. Numeric tiers fail on the real cases — "can see NSFW" and "can see alternate sources" are not on one ladder, and the day a role needs one but not the other, the ladder breaks.
- **Permissions are a code registry; only grants live in the DB.** This follows the house rule already stated in `app/models/system.py::SystemOption`'s docstring: anything the business logic compares against is a Python constant, so it cannot be renamed out from under the logic. `field_group.sources_other` names real column names; `media_type.tv-show` names a `MEDIA_TABLES` key. A DB `permission` row with no code counterpart is inert; a code group with no row is invisible. The one dynamic family, `label.<key>`, is *derived* from the `content_label` table, so the effective catalog is `static_catalog() | {label perms}` — dynamic where it must be, code-owned where it must be.
- **Entries carry labels; labels never name roles.** Adding a role touches zero entries.
- **Dedicated `media_content_label` table**, copying `MediaTag`'s `(media_type, entry_id)` FK-less contract — *not* reusing `media_tag`, which is bound to `system_option`/`TAG_FIELD_KEYS` and is written by the Fill/backfill pipelines. Overloading it would let a pipeline run silently change access.
- **The `admin` role is `is_superuser`**, holding every permission implicitly. Otherwise every new content label or field group would instantly hide content from the admin too.
- **JWT carries `sub` only** (the `role` claim stays as a vestigial display value). Permissions resolve per-request from the DB, cached by role id. Putting permissions in the token would delay revocation until cookie expiry (`settings.access_token_expire_minutes`, default 1440 minutes), and there is no refresh flow or token blacklist to bolt onto.

---

## Data model

Models: `Role`/`RolePermission` in `app/models/system.py` next to `User`; `ContentLabel`/`MediaContentLabel` in a new `app/models/content_label.py`. Both registered in `app/models/__init__.py`.

```
role              system_id UUID pk, name unique ("guest"/"admin"), label, description,
                  is_system Bool (undeletable), is_superuser Bool, sort_order, timestamps
role_permission   id Integer pk, role_id FK role CASCADE, permission String
                  UniqueConstraint(role_id, permission)
content_label     system_id UUID pk, key unique ("nsfw" -> perm "label.nsfw"),
                  label, description, sort_order, timestamps
media_content_label  system_id UUID pk, media_type String (hyphenated), entry_id UUID (FK-less),
                  label_id FK content_label CASCADE, position, created_at
                  UniqueConstraint(media_type, entry_id, label_id)
                  Index ix_media_content_label_entry (media_type, entry_id)
users             + role_id UUID FK role RESTRICT
```

`role_permission.permission` is a plain `String` validated against the computed catalog on write (422 on unknown) — the same shape as `media_tag.field` validating against `TAG_FIELD_KEYS`.

**Guest** is a `role` row with no `users` row; `resolve_viewer` falls back to it by name.

**`users.role`** (the existing string column) is kept through Phases 1–6 — it is asserted by `tests/api/test_auth.py` and constructed in `tests/api/conftest.py` — and dropped in Phase 7, where `User.role` is re-exposed as a read-only `column_property(select(...).scalar_subquery())` over `Role.name`. That is the idiom already used at the bottom of `app/models/__init__.py` to map `remark` back onto ten models after its storage moved into `note`.

The migration preserves the existing seeded admin by matching **by name**, never by recreating the row.

---

## Permission core — new package `app/services/rbac/`

| File | Contents |
|---|---|
| `permissions.py` | `PERM_ADMIN`, `media_type_perm`/`label_perm`/`field_group_perm`, `static_catalog()`, `catalog(db)`, `is_valid(db, perm)` |
| `field_groups.py` | the field-group registry (below) |
| `resolver.py` | `Viewer` dataclass, `resolve_viewer`, `get_viewer`, `require_permission` |
| `enforcement.py` | `hidden_label_ids`, `apply_entry_visibility`, `entry_visible`, `filter_visible_pairs` |
| `field_gate.py` | `gated_columns`, `gate()` |
| `cache.py` | `{role_id: frozenset[str]}` + `bump()`, cleared by every role/label write |
| `seed.py` | `ensure_rbac_seed(db)`, idempotent |
| `users.py` | `create_user`, `set_user_role`, last-admin guard |

`resolve_viewer(request, db)` is a **plain function**, not a dependency, so `get_current_admin` and `/api/auth/me` can call it directly. It **never raises** — a missing, malformed, expired, or bad-signature cookie, a deleted user, or a missing role row all fail closed to the guest `Viewer`. This is required: three tests in `tests/api/test_auth.py::TestGetMe` depend on `/me` never raising.

`Viewer.has(perm)` short-circuits on `is_superuser`.

`get_current_admin` is rewritten in place, keeping its 401 status, exact detail string, and `WWW-Authenticate` header:

```python
viewer = resolve_viewer(request, db)
if not viewer.has(PERM_ADMIN):
    raise credentials_exception
return viewer.token_payload or {"sub": viewer.username, "role": viewer.role_name}
```

All 133 `Depends(get_current_admin)` call sites are untouched; the added `db` param is resolved by FastAPI. `SECRET_KEY`/`ALGORITHM` stay exported from `app/dependencies.py` — `app/routers/auth.py` and `tests/api/conftest.py` import them by name. The returned payload is read by no call site, so its shape is free.

**Intentional behavior change:** a validly-signed token for a deleted user, or for a user whose role lost `admin`, now 401s where it previously passed.

401 rather than 403 throughout, matching the existing detail string and header; `frontend/src/api/client.js::fetchJson` has no 401 interceptor, so the status choice is purely a server-contract question.

---

## Enforcement

### Entry- and media-type-level

One helper wires **both** gates, so no caller can wire only one:

```python
def apply_entry_visibility(query, model, media_type, db, viewer):
    if not viewer.has(media_type_perm(media_type)):
        return query.filter(sa.false())
    ids = hidden_label_ids(db, viewer)      # [] when nothing is hidden -> zero cost
    if not ids:
        return query
    return query.filter(~sa.exists().where(sa.and_(
        MediaContentLabel.media_type == media_type,
        MediaContentLabel.entry_id == model.system_id,
        MediaContentLabel.label_id.in_(ids))))
```

`NOT EXISTS` is an anti-semi-join — correct when an entry carries several labels, no row multiplication — and is driven by `ix_media_content_label_entry`. **It must stay in SQL:** filtering in Python after `.limit()/.offset()` would silently shrink pages.

Detail routes reuse each router's *existing* not-found message, so a hidden entry is indistinguishable from a missing one.

### Leak-surface checklist

Every read path that can expose a hidden entry or its title:

| Surface | Action |
|---|---|
| `app/routers/_factory.py::list_entries`, `_get_or_404` | one edit covers 6 media types; use `spec.owner_type` (hyphenated), **never** `spec.key` |
| `app/routers/anime.py`, `anime_movie.py` list + detail | same, media types `anime` / `anime-movie` |
| **`app/utils/media_resolver.py::resolve_entries`** | highest-value hook — optional `viewer`, hidden pairs omitted. Backs quote, meme, watch_order, relations |
| `entry_ref_for` consumers | a hidden pair must be **dropped**, not degraded to `missing=True` (which the UI badges as a dangling reference) |
| `quote.py` list / grouped / by-id | the quote *text* is itself a leak; 404 the by-id route |
| `meme.py` list / grouped / by-id | owner may be a tier; tiers are unlabelled, so filter only the entry branch |
| `media_relation.py` + `services/domain/media_relation.py` | 404 a hidden anchor; drop edges whose other endpoint is hidden |
| `watch_order.py` + `resolve_items`, `build_release_items`, `list_candidate_entries` | drop hidden steps |
| `plan_next.py::list_plan_next` | drop rows whose target entry is hidden |
| `credits.py::get_credits` | public GET keyed by `(media_type, entry_id)` — must 404, else it confirms existence |
| `note.py::list_notes` | public GET keyed by `(owner_type, owner_id)` — 404, plus note-section stripping |
| `person.py::_to_response` `credit_count` + `studio.py` equivalent | count leak — exclude credits on hidden entries |
| `services/domain/credits.py::attach_link_fields` / `link_values_for_entries` | since `f0a43cf` every entry payload carries derived credit/tag names. Reached only through the 3 read call sites above, so entry hiding covers it — but this is where the `credits` field group is gated |
| **`data_control.py` check/duplicates, check/remarks, calculate/check-cover-image** | **currently unauthenticated and return entry names** — add `Depends(get_current_admin)`; only the admin ReviewQueue page uses them |
| **`system.py` /logs, /deleted** | **currently unauthenticated**; `DeletedRecord` carries `name_cn`/`name_en` — add `Depends(get_current_admin)` |
| Frontend `Statistics.jsx`, `Search.jsx` | **no server work** — both aggregate client-side from the 8 gated list endpoints |

**Accepted residuals** (document, don't fix): `seasonal.py` counts are precomputed over all entries and will over-count for restricted viewers (numeric only); franchise/series/collection hubs are unlabelled and may render as empty shells; `/static/covers/<entry_id>.*` is served by `StaticFiles`, so hiding an entry does not hide its cover.

### Field-level

Registry in `app/services/rbac/field_groups.py`. **`app/schemas/link_fields.py` is the precedent to copy** — a per-media-type field map (`LINK_FIELD_MIXINS`, hyphenated keys) kept honest by a drift test (`tests/unit/test_link_fields_schema.py`) asserting it stays in step with `credit_roles.sheet_column_for`. Model the registry and its test on that pair, and on the frozen-dataclass shape of `app/utils/credit_roles.py` / `note_sections.py`.

A group covers **four** kinds of surface:

```python
@dataclass(frozen=True)
class FieldGroup:
    key: str; label: str; description: str
    columns: dict[str, tuple[str, ...]]      # REAL columns; media_type -> names; "*" = all 8
    link_fields: dict[str, tuple[str, ...]]  # derived attrs from link_fields.py
    note_sections: tuple[str, ...] = ()      # keys in NOTE_SECTIONS
    ui_block: str = ""                       # pure-UI block, no backing data
```

Initial groups:

- `sources_other` — `columns={"*": ("source_other",)}`, `ui_block="info.SourcesCard.other"`
- `personal_notes` — `note_sections=("personal_reviews",)`
- `system_info` — `ui_block` only; the "System Info" block on all 8 detail pages is frontend-only with no backing column, currently gated by `isAdmin`
- `credits` — `link_fields` covering the people/studio keys per type (`studio`, `director`, `producer`, `music`, `author_plot`, `writer`, `artist`, …), enumerated from `LINK_FIELD_MIXINS`

Permission name: `field_group.<key>`. A group is stripped when the viewer *lacks* it, and guest is seeded holding all of them, so nothing changes on day one.

#### Two seams, because the two kinds of field behave differently

Commit `f0a43cf` made every media entry response carry credit/tag values **derived at read time** by `app/services/domain/credits.py::attach_link_fields`, mixed into `*Response` only, never the Create/Update bases. That splits field gating cleanly:

- **Link fields are plain Python attrs, not columns** (the 26 comma-joined columns were dropped in `d1r2o3p4c5o6l`). Like `watch_next`/`to_rewatch`, they are safe to blank in place — or better, simply not attached when the viewer lacks the group.
- **`source_other` is a real JSONB column** and must go through the copy-based gate: `schema.model_validate(o).model_copy(update={col: None})`. Returning Pydantic instances from an endpoint declaring `response_model=` is fine — FastAPI re-validates. `source_other: Optional[dict] = None` is already declared on all 8 `*Base` schemas.

> **Critical:** never `setattr(entry, "source_other", None)` on a live ORM instance. The `setattr` calls already in `_factory.py` are safe *only* because those attributes stopped being columns (`9b0bcb763e8c` for the plan flags, `d1r2o3p4c5o6l` for the 26 credit columns). Nulling a *real* column marks the instance dirty, and an autoflush later in the same request would persist the blanking. `tests/api/test_field_gating.py` asserts the DB row is intact afterwards precisely to catch this.

`field_gate.py::gate(viewer, media_type, obj_or_list, schema)` returns its input untouched when nothing is gated — the overwhelmingly common fast path.

**Call sites:** the same three that already call `attach_link_fields` on the read path cover all 8 types — `_factory.py`, `anime.py`, `anime_movie.py`, each at both the list and detail return — plus `note.py::list_notes` for note sections. Because `attach_link_fields` is the single funnel for credit/tag values, the `credits` group is best gated *inside* it rather than stripped afterwards.

---

## API surface

Follows the repo's per-resource router convention (public reads block, then `PROTECTED WRITE OPERATIONS (Admin Only)`), registered in `app/main.py`. Every write calls `rbac.cache.bump()`.

- **`auth.py::/me`** — extended, keeping `is_admin`/`username` and the never-raises contract: `+ role, permissions[], is_superuser`. Gains `db: Session = Depends(get_db)`.
- **`app/routers/roles.py`** (`/api/roles`, admin) — `GET /`; `GET /catalog` returning the permission catalog grouped by family (`admin` / `media_type` / `field_group` / `label`) with human labels, so the admin UI is built from server truth (mirrors `media_relation.py::/kinds` and `note.py::/sections`); `POST /`, `PATCH /{id}`, `DELETE /{id}` (409 if `is_system` or held by users); `PUT /{id}/permissions` **replacing the whole set**, the same replace-not-append contract as `credits.py::replace_credits`, 422 on any key outside `catalog(db)`.
- **`app/routers/users.py`** (`/api/users`, admin) — `GET /`, `POST /`, `PATCH /{id}`, `DELETE /{id}`. Guards: cannot delete yourself; cannot remove the last user whose role holds `admin`. Hashing via `app/services/security.py::get_password_hash`. Reuses `schemas.UserOut` from `app/schemas/auth.py`, extended with `role_id`/`role_name`.
- **`app/routers/content_labels.py`** (`/api/content-labels`) — vocabulary CRUD (admin), plus `GET`/`PUT /entry/{media_type}/{entry_id}` taking `{"label_keys": [...]}`, replace-the-set, structurally identical to `credits.py`. Validates `media_type in MEDIA_TABLES` (400) and entry existence (404).

---

## Frontend

- **`contexts/AuthContext.jsx`** — keep `isAdmin` so every existing consumer is untouched; add `role`, `permissions` (a `Set`), `isSuperuser`, and a memoized `has(perm)` with a superuser short-circuit.
- **`components/layout/ProtectedRoute.jsx`** — take a `permission` prop defaulting to `"admin"`: `has(permission) ? <Outlet/> : <Navigate to={"/login?next=…"} replace/>`.
- **`config/navigation.js`** — generalize `adminOnly` to `requires: "<perm>"` with a one-phase shim (`section.requires ?? (section.adminOnly ? "admin" : null)`), export `visibleSections(sections, has)`. Single consumer: `components/layout/Nav.jsx`. Both `Nav.test.jsx` and `config/navigation.test.js` already exist — **extend them, don't create them**; their auth mocks need `has`.
- **Three new admin pages** in `frontend/src/pages/admin/`:
  - `Users.jsx` — table plus create/edit modal (role dropdown from `/api/roles`), password reset
  - `Roles.jsx` — role list; selecting one renders the `/api/roles/catalog` families as grouped checkbox blocks, saved with one `PUT`. `is_system` roles are rename-locked; the `admin` row shows "superuser — all permissions" with the grid disabled
  - `ContentLabels.jsx` — vocabulary CRUD

  **Copy `frontend/src/pages/admin/SystemOptions.jsx` as the template.** It is a 637-line admin page over exactly this shape of data (a vocabulary table grouped by tier), and its commit shows the complete wiring path these three pages need: `pages/admin/Admin.jsx`, `App.jsx`, `api/endpoints.js`, `config/navigation.js`, `config/navigation.test.js`.
- **Label picker** — one `components/forms/ContentLabelPicker.jsx` rendered **once** in `pages/admin/Add.jsx` and once in `Modify.jsx` near the submit area, *not* in all 16 `add-tabs/*` + `modify-tabs/*` files. On Add, `PUT` the labels right after the create response returns its `system_id` — the post-create-PUT pattern `ComicAddTab.jsx` already uses for credits. On Modify, load current labels when an entry is selected.
- `SourcesCard.jsx` already renders nothing when `sourceOther` is empty, so server nulling suffices; optionally also gate the block on `has("field_group.sources_other")`.
- **`cd frontend && npm run build`** after any frontend change, so both :5173 and :8000 agree.

---

## Implementation phases

Each phase ships independently.

| # | Content | Migration |
|---|---|---|
| **0** | `field_groups.py` + `permissions.py` as pure code; unit tests; docs skeleton | — |
| **1** | Mig **A** `add_rbac_core` (role, role_permission, `users.role_id` nullable + backfill by name); `seed.py`/`cache.py`/`resolver.py`; rewrite `get_current_admin`; extend `/me`; call `ensure_rbac_seed` in the lifespan | A |
| **2** | Mig **B** `add_content_labels`; models; `enforcement.py`; wire the 8 list/detail routes + media-type gating | B |
| **3** | Wire the aggregate surface: `resolve_entries`, quote, meme, watch_order (+3 domain fns), media_relation (+domain), plan_next, credits, note, person/studio counts. **Close the unauthenticated `data_control` and `system` GETs.** | — |
| **4** | `field_gate.py`; the 3 media call-site edits; note-section stripping in `note.py` | — |
| **5** | `roles.py`, `users.py`, `content_labels.py` + schemas; cache bumps | — |
| **6** | Frontend: AuthContext, ProtectedRoute, navigation, 3 admin pages, ContentLabelPicker, endpoints.js; `npm run build` | — |
| **7** | Mig **C**: `role_id` NOT NULL, drop `users.role`, `column_property` for `User.role`; update the 2 test fixtures; finish docs | C |

Phase 1 is the riskiest — gate it on `test_admin_compat.py`. A strictly before B (label permissions are `role_permission` rows). B is pure DDL with no backfill, so trivially reversible. C is last because it is the only one that breaks a test fixture. Hand-written leetspeak revision ids in flat `alembic/versions/`, single head maintained.

**Seeding never lives in a migration body alone** — always `ensure_rbac_seed`, called from *both* the migration and the lifespan, because `tests/api/conftest.py::test_engine` does `DROP SCHEMA public CASCADE` + `Base.metadata.create_all()` and never runs Alembic.

The seed grants the `guest` role all 8 `media_type.*` permissions and every `field_group.*` permission. Label permissions are granted to nobody, and no labels exist, so day-one behavior is byte-identical to today.

---

## Verification

**Backend** (API tests need the `anime_site_test` PostgreSQL DB; see `docs/test.md`):

- `tests/unit/test_field_groups.py` — **the test that makes a code registry safe.** Introspect `MEDIA_TABLES[mt].model.__table__.columns` and assert every declared *column* exists on every media type the group claims; every `link_fields` name exists on the matching `LINK_FIELD_MIXINS[mt]`; every `note_sections` key exists in `NOTE_SECTIONS`; keys and permission names unique. Modelled directly on `tests/unit/test_link_fields_schema.py`, which already does this drift check for the link-field mixins, and on `tests/unit/test_credit_roles.py`.
- `tests/unit/test_rbac_permissions.py` — catalog composition, `Viewer.has` superuser short-circuit, guest defaults.
- `tests/api/test_visibility.py` — **the negative matrix, the centre of gravity.** New fixtures: `restricted_client` (a role holding everything except `label.nsfw`) and the plain guest `client`. Parametrize over all 8 media types × every route in the leak checklist, and assert on **`response.text`** — not on parsed fields — that neither the hidden entry's `system_id` nor its display name appears anywhere. Substring assertions catch leaks through nested resolved payloads (`entry_display_name`, watch-order items, relation graph nodes) that field-level assertions miss.
- `tests/api/test_media_type_gating.py` — a role without `media_type.manga`: list → `[]`, detail → 404, `/api/credits/manga/{id}` → 404, `/api/note?owner_type=manga` → 404.
- `tests/api/test_field_gating.py` — guest sees `source_other: null` on list *and* detail for all 8; admin sees the value; **plus a regression assert that the DB row still holds the value afterwards** (guards the ORM-mutation footgun).
- `tests/api/test_admin_compat.py` — walk `app.routes`, select every route whose dependant tree contains `get_current_admin`, assert each 401s for an anonymous client. The safety net for the 133 call sites during Phase 1.
- `tests/api/test_rbac_roles.py` / `test_rbac_users.py` / `test_content_labels.py` — CRUD, 401 without a cookie, 422 on an unknown permission key, 409 on deleting an `is_system` or held role, the last-admin guard.
- Extend `tests/api/test_auth.py::TestGetMe` for the new `permissions`/`role` keys and the guest case, keeping the three never-raises tests green.

**Frontend** (vitest, matching `Nav.test.jsx` / `useFormDefaults.test.js`): `AuthContext.test.jsx` (`has()` semantics, superuser), `navigation.test.js` (`visibleSections`), and an update to `Nav.test.jsx`'s auth mock.

**End-to-end**, after `alembic upgrade head`, `cd frontend && npm run build`, `uvicorn app.main:app --reload --reload-dir app`:

1. Log in as admin → `/api/auth/me` returns `is_superuser: true`. Confirm every library and detail page looks exactly as before.
2. Create label `nsfw`; create role `friend` holding all media types and field groups but **not** `label.nsfw`; create user `friend1`.
3. Tag one anime `nsfw` in Modify. As guest and as `friend1`: it is absent from `/api/anime/`, detail 404s, and it does not appear in search, statistics, quotes, memes, relations, watch orders, or plan-next. As admin it is still fully visible.
4. Remove `field_group.sources_other` from `friend`: `source_other` comes back `null` in the API and the Sources block loses its "other" pills — then confirm the value is still in the database.
5. Remove `media_type.manga` from `friend`: the Manga nav item disappears, `/library/manga` is empty, direct URLs 404.
6. Revoke a permission while `friend1` is logged in → the change takes effect on their **next request**, without re-login.

---

## Gotchas

1. **The Alembic head moves fast on this branch** — it was `d1r2o3p4c5o6l` at the start of this design session and `n1u2l3l4s5n6d` (70 revisions, single head) a few hours later. Re-derive the head immediately before writing each migration; chaining off a stale id forks the tree into two heads.
2. `tests/api/conftest.py::test_engine` never runs Alembic — it does `DROP SCHEMA public CASCADE` + `Base.metadata.create_all()`. Every seed row must come from `ensure_rbac_seed`, or all API test files start role-less and everything 401s.
3. `app/main.py`'s lifespan uses `database.SessionLocal()` directly, not the `get_db` override. In tests it commits outside the per-test rollback, so seeded roles persist between tests — `ensure_rbac_seed` must be idempotent against a dirty table.
4. Never `setattr` a gated **column** on a live ORM instance (see Field-level). The `attach_plan_flag` / `attach_link_fields` precedent is a trap here.
5. **Two key spellings.** `MEDIA_REGISTRY` uses underscores (`tv_show`); `MEDIA_TABLES`, `media_credit.media_type`, `media_tag.media_type` and now `media_content_label.media_type` use hyphens (`tv-show`). Always store and compare the hyphenated key; in the factory always reach for `spec.owner_type`, never `spec.key` — `app/registry.py` documents this exact trap.
6. `admin` must be `is_superuser`, not an enumerated grant list, or every new label and field group instantly hides content from the admin too.
7. `/api/auth/me` must never raise — wrap its DB lookup in try/except.
8. `get_current_admin` gains a `db` param; verify no caller invokes it as a plain function (today all 133 are `Depends`).
9. Pagination correctness depends on the anti-join staying in SQL.
10. The pre-existing unauthenticated leaks in `data_control.py` and `system.py` must be closed in Phase 3, or entry hiding is theatre.

---

## Docs to update (Phase 7)

`database-schema.md` (4 new tables + `users.role_id`), `api.md` (4 routers + `/me`), `architecture.md` (the permission core, and the code-registry-vs-DB-vocabulary rationale cross-referencing the existing three-tier options design), `pages.md` (3 admin pages + the accepted residuals), `admin-forms.md` (the label picker), `options.md` (contrast `content_label` with `system_option`), `dependencies.md` (`get_viewer`, `require_permission`, the rewritten `get_current_admin`), `test.md` (new files in the layout listing).
