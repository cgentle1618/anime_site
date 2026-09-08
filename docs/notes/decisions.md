# Design decisions

Last verified: 2026-08-30 (commit 4339702)

## What this is for

A dated log of the choices that shaped the code and, where it matters, the alternatives that were rejected. Read it before proposing a change that "obviously" simplifies something: the odds are the simpler shape was considered and turned down for a reason listed here. Each entry names the spec that produced it; the spec files themselves have been retired, so the date and name are the only attribution that remains.

## 2026-05

### Mark Completed endpoints (spec: 2026-05-08 mark-completed)

- Dedicated `POST /{id}/complete` on each router instead of the frontend PATCHing individual fields; the backend owns the completion rules.
- Fixed a manga bug where the frontend path forgot `ch_fin`, `vol_fin` and serialization updates.
- `completed_at` is set only when it is `None`.
- Endpoints reuse the existing `*Response` schemas.
- Auto-complete detection inside `apply_single_*` is untouched.

### Session expiry redirect (spec: 2026-05-09 session-expiry) — not implemented

- Proposed a centralised `apiFetch` that does a full-page redirect to `/login?next=` on 401 (excluding `/api/auth/login`) with credentials implicit.
- Abandoned. `fetchJson` throws and nothing redirects.

### Plan page (spec: 2026-05-14 plan-page)

- Watch Next and To Rewatch moved off Statistics to a dedicated public Plan page.
- Components were renamed, not rewritten; `statsUtils` is shared.
- `usePlanData` mirrors `useStatisticsData`.

## 2026-08

### Series structure (spec: 2026-08-23 series-structure)

- The series hub resembles the franchise hub without duplicating it: no `franchise_type`, no `collection_id`, no `type_covers` (a `cover_entry_id` instead), no `type_slots`, no `watch_next_group`, no new ORM relationships.
- Column declaration order equals sheet order.
- Main Cover is set only on Modify.
- Tabs are gated on list length; Watch Order and Notes are always on.
- `SeriesModal` retired.
- Anime movie is excluded (it has no `series_id`).

### Media relations (spec: 2026-08-23 media-relations)

- One polymorphic `media_relation` table replaces `prequel_id`, `sequel_id`, `alternative` and `derive_related`.
- FK-less `(media_type, entry_id)` pairs; a missing endpoint is served with `missing=True`.
- Rejected: mirrored rows, and per-table JSONB.
- A prequel is stored as a swapped sequel.
- Symmetric kinds sort their endpoints.
- The `RELATION_KINDS` registry is served over HTTP.
- 409 on self-relation or duplicate.
- The table started empty; derived values were not migrated.
- `is_main_entry` unchanged.
- The franchise/collection picker is a lens, not ownership.
- Reads are public, writes admin.

### Notes restructure (spec: 2026-08-23 notes-restructure)

- One polymorphic `note` table plus a backend section registry replaces the notes JSONB column. Rejected: table-per-shape, and JSONB with a backend schema.
- Registry in `app/utils/note_sections.py`.
- `text_links` carry an optional episode.
- Similar keys across types are kept distinct on purpose.
- Highlights got kinds; `special_*` split into `op_ed_changes` and `extended_episodes`.
- Episode-anchored sections stop at entry level; quotes are entry-only, memes are on all owners.
- Violations return 422; the migration logged unmappable values.
- Notes are edited only on the notes page.

### Remark as a note section (spec: 2026-08-23 remark-to-note)

- The `remark` column collapsed into the `remark` note section; the read path is a read-only `column_property`, so schemas and Sheets were untouched; remark leaves the entry sheets and lives in the Note tab.
- `pop_remark` distinguishes absent from empty; empty text deletes the row; last write wins.
- The migration merged existing text under an "original remark:" label; parsers drop remark.
- Accepted the correlated-subquery cost.

### Relations graph (spec: 2026-08-25 relations-graph)

- A canvas replaces the text list. Rejected: a second tab, a full-bleed overlay, persisted positions, hand-rolled SVG, Cytoscape.
- `@xyflow/react` + dagre, with a dedicated `/graph` endpoint.
- Ghosts are laid out like nodes; unconnected entries sit in a tray.
- Edges carry `label` and `inverse_label`; nodes are keyed `"type:id"`.
- Equivalence groups contract via union-find; branch and derivation edges get lower weight.
- Positions are stable across writes.
- The confirm popup is a sentence with a swap control; timeline edges have no chip, equivalence edges no arrowhead.
- Layout functions are pure.

### Comic entry (spec: 2026-08-26 comic-entry)

- Comics are runs; events and eras are labels, not entries.
- Modelled on Novel with Western-shaped columns; display order EN → CN → Alt; events comma-joined.
- `read_next` / `to_reread` columns were created early.
- Registered through the factory registry.
- No fill queue originally; `progress_display` dropped; an external API was deferred and then adopted (Comic Vine).

### Comic parity (spec: 2026-08-28 comic-feature-parity)

- Scope came from an audit of every file naming manga but not comic.
- Issue ranges are allowed in watch orders.
- The empty-Notes-card fix is general, not comic-specific.
- Duplicates are keyed on `comicvine_id` plus names.

### Release dates (spec: 2026-08-28 iso-release-dates)

- Truncated ISO strings. Rejected: DATE plus a precision column, and free text.
- A CHECK constraint per column; one helper module owns parse, validate, normalize and display.
- Multi-region columns kept; movie flips to TW-first.
- A year-only value leaves `release_season` untouched; anime year is the first four characters.
- Sheets get an apostrophe prefix (rejected RAW mode).
- Unparseable rows were logged and left NULL.

### Plan next (spec: 2026-08-29 plan-next)

- One `plan_next` table replaces `watch_next`, `read_next` and `watch_next_group`; row existence is the boolean.
- FK-less `(scope, media_type, target_id)`; rejected three nullable FKs. `media_type` is stored for entry scope too, and a franchise may appear once per type.
- `size_group_derived` and `size_group_manual` JSONB; manual wins per key.
- Comic buckets 1-3 / 4-10 / 11+ came from real data (35/35/29).
- An entry's bucket inherits series → franchise, except comic on `issue_total`; anime sums `ep_total`.
- Scope is validated in the API; virtual `watch_next` / `read_next` fields are kept.
- Reads public, writes admin.
- Both JSONB fields must be in the parsers with a round-trip test; the Plan page is config-driven.

### Rewatch levels (spec: 2026-08-29 rewatch-levels)

- `plan_next` gains `kind`. Rejected: a second table, JSONB on tiers, renaming `plan_next`.
- The per-type scope map differs from Watch Next (anime and cartoon are franchise-only).
- `kind` is validated in the API; requests default to `"next"` (a server default was added later).
- Nine `to_rewatch` / `to_reread` columns dropped; the cartoon entry flag discarded.
- The backfill reads child entries, not `franchise_type`.
- Plan page sections by scope with a shared toggle control; Calculate untouched.

### System options redesign (spec: 2026-08-29 system-options)

- Three tiers decided by "does code branch on the exact value?". Tier 1 stays in `constants.py` (Main/Spinoff and Region moved there; Dub Preference dropped).
- One vocabulary with explicit scopes: a value with no scopes is offered everywhere; person scope is explicit, not derived.
- Gender lives on the person base; `studio` means anime studios only.
- `media_credit` and `media_tag` are FK-less; `media_tag.field`, not `category`.
- Credit roles and person roles are separate.
- Everything becomes a link row; no nullable FKs on entries.
- The migration reports rather than guesses; delete cascades, merge handles duplicates.
- `/api/constants` is read-only.
- Entry sheets keep comma-joined columns generated from the links.
- `manga.anime_studio` is out of scope (belongs in relations); `character` belongs to franchise (deferred).

### View authorization (spec: 2026-08-29 view-authorization)

- RBAC, not tiers. Permissions are a code registry; grants live in the DB.
- Labels on entries never name roles; a dedicated `media_content_label` table (not `media_tag`, which the pipelines write).
- The admin role is `is_superuser`.
- The JWT carries `sub` only; permissions are resolved per request and cached by role id.
- Day-one behaviour-identical guest seed; `resolve_viewer` never raises and fails closed to guest.
- 401, not 403.
- One helper wires the media-type and label gates; a `NOT EXISTS` anti-join in SQL.
- Hidden means missing (404); hidden resolver pairs are dropped.
- Pre-existing unauthenticated `data_control` and `system` GETs were closed.
- Accepted residuals: seasonal counts, empty hubs, static covers.
- Field gating works on a copy, never `setattr` on live ORM rows; a field-group registry with a drift test.
- `PUT /permissions` replaces the whole set.
- The label picker is rendered once in Add and Modify.
- `ensure_rbac_seed` is idempotent and runs from both the migration and lifespan.
- `users.role` was kept, then dropped and re-exposed via `column_property`.
- Visibility tests assert on `response.text`.
