# Media Relations

Last verified: 2026-08-30 (commit 4339702)

## What this is for

A media relation is a typed link between two entries — "this anime is the Sequel of that one", "this movie is the Adaptation of that manga" — that can cross any of the seven media tables and any franchise. Relations are curated by hand on the admin `/relations` canvas, read on every detail page's "Related Entries" card, and drawn read-only on the collection, franchise and series hubs. Nothing derives them automatically. This document describes the table, the vocabulary, the write and read rules, the API, the canvas and the Sheets round trip, citing the code that implements each piece; where an older doc (`../frontend/pages.md`, `docs/api.md`, `../business-rules.md`, `../data-model.md`) disagrees with this one, the code and this file are current.

History, in one line: relations used to be the per-table `prequel_id` / `sequel_id` / `alternative` columns (plus `derive_related` on anime) filled partly by an automatic derivation; the `media_relation` table replaced them, the columns were dropped without backfill and the derivation retired (`alembic/versions/media_relation_add.py`, `alembic/versions/media_relation_drop_legacy.py`).

## Model

### Table `media_relation` — `app/models/media_relation.py`

One row is one fact, read as **`from` is the {label} of `to`**. With `relation_type = sequel`, `from` is the sequel and `to` the prequel. Both endpoints are FK-less `(type, id)` pairs, the same contract `watch_order_item` uses, because no single foreign key can span seven tables. A deleted entry therefore leaves a dangling endpoint that the read side flags as `missing` instead of dropping.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | no | PK, indexed |
| `from_type` | String | no | Hyphenated key from `MEDIA_TABLES` (`app/utils/media_resolver.py`), e.g. `anime`, `anime-movie` |
| `from_id` | UUID | no | Row id in that table |
| `relation_type` | String | no | One of the ten stored kinds below. Plain string, not a DB enum — validated in the API so adding a kind needs no migration |
| `to_type` | String | no | |
| `to_id` | UUID | no | |
| `remark` | Text | yes | Free text scoping the link, e.g. "covers ep 1–12 only" |
| `created_at` / `updated_at` | DateTime | yes | Taipei time via `get_taipei_now` |

| Constraint / index | Definition | Why |
| --- | --- | --- |
| `ck_media_relation_no_self` | `NOT (from_type = to_type AND from_id = to_id)` | An entry cannot relate to itself; enforced in the DB as well as the router so Pull cannot write one |
| `uq_media_relation_pair` | unique `(from_type, from_id, relation_type, to_type, to_id)` | One fact, one row. Only works because the service normalizes direction first (see Rules) |
| `ix_media_relation_from` | `(from_type, from_id)` | Both directions are queried on every entry read |
| `ix_media_relation_to` | `(to_type, to_id)` | |

### Kind registry — `app/utils/relation_kinds.py`

Eleven labels in the dropdown, ten kinds in the column: **Prequel is Sequel read backwards**, so `prequel` is accepted on input and stored as a swapped `sequel` row (`INPUT_ONLY_KINDS = {"prequel": "sequel"}`). The registry is the single source of truth; the frontend fetches it from `GET /api/media-relation/kinds` rather than keeping a copy.

| Stored key | Label (on `from`) | Inverse label (on `to`) | Family | Symmetric | Transitive |
| --- | --- | --- | --- | --- | --- |
| `sequel` | Sequel | Prequel | timeline | | |
| `alternative` | Alternative | Alternative | equivalence | yes | yes |
| `corresponding` | Corresponding | Corresponding | equivalence | yes | yes |
| `renew` | Renew | Original | equivalence | | |
| `directors_cut` | Director's Cut | Original | equivalence | | |
| `extended` | Extended | Original | equivalence | | |
| `side_story` | Side Story | Parent Story | branch | | |
| `spin_off` | Spin-off | Main Story | branch | | |
| `setting` | Setting | Main Story | branch | | |
| `adaptation` | Adaptation | Source | derivation | | |
| *(input only)* `prequel` | Prequel | Sequel | timeline | | stored as `sequel`, endpoints swapped |

- `RELATION_FAMILIES = (timeline, equivalence, branch, derivation)` — how the admin page groups rows and how the canvas styles edges.
- **Symmetric** kinds mean the same thing both ways, so the service sorts their endpoints before writing and A-alt-B / B-alt-A collapse to one row.
- **Transitive** kinds carry along a chain (A-alt-B, B-alt-C ⇒ A and C related). `TRANSITIVE_KEYS` is derived from the registry *in declaration order, strongest first*: Alternative (essentially the same work) beats Corresponding (the same story told differently). Only the detail-page read expands chains; the canvas draws stored rows alone.
- `ACCEPTED_INPUT_KINDS = RELATION_KEYS + ("prequel",)` is what POST/PATCH accept as `kind`.
- "Setting" means a companion volume about a work (設定集, 公式書, 畫冊); it shares Spin-off's inverse "Main Story".

## Rules

### Write rules — `app/services/domain/media_relation.py` (`normalize_relation`, `find_duplicate`) and `app/routers/media_relation.py`

| Rule | Behaviour | Where |
| --- | --- | --- |
| Unknown kind | `400` "Unknown relation kind … Expected one of: …" (refused, never coerced). A malformed body — non-UUID id, missing field — is the usual pydantic `422` | `_validate_kind` |
| Unknown media type / non-existent entry | `400` | `_validate_endpoint` (uses `entry_exists` re-exported from `watch_order`) |
| Prequel | Kind becomes `sequel` and the two endpoints swap | `normalize_relation` step 1 |
| Symmetric kind | Endpoints sorted by `(type, str(id))` so the same pair always stores one way | `normalize_relation` step 2 |
| Directional kinds | Stored exactly as typed — which movie is the Director's Cut is the point | |
| Self relation | `409` "An entry cannot relate to itself." (checked after normalization, mirrors the CHECK constraint) | `_reject_self_and_duplicate` |
| Duplicate | `409` "That relation already exists (id …), possibly entered from the other side." (mirrors the unique constraint so it never surfaces as a 500) | `find_duplicate` |
| PATCH `kind` | Re-runs normalization: switching Sequel → Prequel flips the stored endpoints rather than inventing a stored `prequel` | `update_relation` |
| PATCH `swap: true` | Trades endpoints directly, keeping the kind — the only way to turn around a kind with no second name (Adaptation, Spin-off). Swap and re-kind go through one normalization; swapping a symmetric kind is a no-op, not an error | `update_relation` |
| Repointing | Not supported — delete and re-add | `app/schemas/media_relation.py` `MediaRelationUpdate` |
| Delete | Row logged to the deleted-record log (`log_deleted_record(db, row, "Media Relation")`) then removed in one commit; entries untouched | `delete_relation`, `reset_scope` |

### Read rules — `relations_for_entry` in `app/services/domain/media_relation.py`

- Rows are fetched from **both** endpoints (`_touching`) and ordered by `created_at`.
- Each item's `label` describes the **far** entry (`other`), so it inverts the stored kind when the viewed entry is the row's `from` side: A is the Sequel of B ⇒ on A's page B is labelled "Prequel". `direction` is `forward` (viewed entry is `from`) or `reverse`.
- **Transitive peers** (`_transitive_peers`): one query loads every row of a transitive kind, builds an undirected adjacency, and walks a widest-path BFS from the viewed entry, widening the allowed kinds one at a time in `TRANSITIVE_KEYS` order. An entry first reached on the pass for kind K has K as its bottleneck, so a chain A-alternative-B-corresponding-C reports A and C as **Corresponding** (weakest link), never Alternative. Cycles are stopped by the visited set. Pairs already covered by a stored row are skipped; the rest are appended after the stored rows with `derived: true`, `system_id: null`, `remark: null`, and `via` = display name of the neighbour the chain came through.
- Unknown `relation_type` (a sheet restored from a newer version) shows its raw key rather than blanking the row; family defaults to `derivation` for stored rows.
- **Dangling target**: `resolve_entries` / `entry_ref_for` (`app/utils/media_resolver.py`) return `missing=True` for any endpoint whose row no longer exists. The relation is still listed and still deletable by id.
- **Viewer filtering**: for a non-superuser, `filter_visible_pairs` (`app/services/rbac/enforcement.py`) drops any item whose far end is hidden — removed entirely, not blanked as missing, so nothing confirms the hidden entry exists.

### Graph rules — `graph_for_scope` in `app/services/domain/media_relation.py`

- Candidate nodes come from `list_candidate_entries` (`app/services/domain/watch_order.py`) for the franchise ids, or `series_ids` for a series scope. **Every in-scope entry is a node, connected or not** — you cannot drag a line from a node that is not drawn.
- Candidates are narrowed by `filter_visible_pairs(db, viewer, …)` first; hidden entries are not nodes.
- Rows are loaded by id at either end, then re-checked against `(type, id)` because SQL cannot express the type discriminator across seven tables.
- Endpoints outside the scope become **ghost nodes** (`in_scope: false`), resolved in one batch via `resolve_entries`; a ghost whose row is gone has `missing: true`. Ghosts the viewer may not see are dropped **with every edge touching them**, so an edge label alone can never reveal a hidden entry.
- Node key is `"{media_type}:{entry_id}"` (`_node_key`), type-qualified because each table has its own id space.
- `anime_movie` has no `series_id`, so an anime movie only ever appears on a series graph as a ghost.

## API

Router: `app/routers/media_relation.py`, prefix `/api/media-relation`. Reads are public (subject to RBAC visibility via `get_viewer`); writes require `get_current_admin`. Schemas: `app/schemas/media_relation.py`. Frontend endpoint map: `frontend/src/api/endpoints.js` (`endpoints.mediaRelation`).

| Method & path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- |
| `GET /kinds` | public | — | `RelationKindResponse[]`: `key, label, inverse_label, family, symmetric, stored_as`. Ten stored kinds plus `prequel` (label "Prequel", `stored_as: "sequel"`) | — |
| `GET /for-entry` | public, viewer-filtered | query `media_type`, `entry_id` | `MediaRelationResolved[]`: `system_id, relation_type, label, family, direction, remark, other{media_type, entry_id, missing, display_name, label, cover_image_file, franchise_id, nav_path}, created_at, updated_at, derived, via` | `400` unknown media type; `404` entry hidden or unknown |
| `GET /` | public, viewer-filtered | exactly one of `franchise_id`, `collection_id` | `MediaRelationResponse[]` (raw rows) — backs the admin page's per-entry count badges. A row naming any hidden endpoint is dropped whole | `400` if not exactly one scope |
| `GET /graph` | public, viewer-filtered | exactly one of `franchise_id`, `collection_id`, `series_id` | `RelationGraphResponse` `{nodes, edges}`. Node: `key, media_type, entry_id, in_scope, missing, display_name, search_names, cover_image_file, franchise_id, nav_path, type_label`. Edge: `system_id, from, to, relation_type, label, inverse_label, family, remark` (`from`/`to` are node keys) | `400` if not exactly one scope |
| `POST /` | admin | `MediaRelationCreate`: `from_type, from_id, kind, to_type, to_id, remark?` | `201` `MediaRelationResponse` (normalized row) | `400` bad kind / type / missing entry; `409` self or duplicate; `422` malformed body |
| `PATCH /{system_id}` | admin | `MediaRelationUpdate`: `kind?, swap=false, remark?` | `MediaRelationResponse` | `404`; `400` bad kind; `409` self/duplicate after normalization |
| `DELETE /scope` | admin | exactly one of `franchise_id`, `collection_id`, `series_id` | `{status, deleted, message}` — deletes every row `/graph` would draw for that scope (including ghost links with one end outside), all logged to the deleted-record log, one commit. Not undoable on the page | `400` if not exactly one scope |
| `DELETE /{system_id}` | admin | — | `{status, message}` | `404` |

`DELETE /scope` is declared before `DELETE /{system_id}` on purpose: otherwise a reset would be routed as a delete of the relation with id `"scope"`.

## UI

Dependencies: `@xyflow/react` (React Flow 12) is the only graph library in `frontend/package.json`. **Dagre is no longer used** — `relationLayout.js` states that centring a column on its rank was exactly what bent the spine, so layout is hand-rolled.

### Where it appears

| Surface | Component | Mode |
| --- | --- | --- |
| Admin `/relations` (`frontend/src/pages/admin/Relations.jsx`) | `RelationGraph` + `RelationForm` | editable |
| Collection / Franchise / Series hubs (`frontend/src/pages/detail/*Page.jsx`) | `<RelationGraph readOnly scopeType=… />` | read-only: handles inert, no drag/connect, no Undo/Tidy/Reset, inspector shows plain text |
| Every media detail page | `frontend/src/components/tracker/RelationsSection.jsx` "Related Entries" card, via `/for-entry` | read-only; the only place derived (transitive) rows appear |

### Layout — `frontend/src/lib/relationLayout.js` (`layoutGraph`, `mergePositions`)

- Pure, DOM-free, unit-tested (`relationLayout.test.js`).
- **Clusters** via union-find over usable edges (both ends known, not self). Each connected cluster is walked separately and stacked vertically in bands (`CLUSTER_GAP` 120px, or `TIGHT_CLUSTER_GAP` 48px when both neighbours are single-row).
- **Grid of slots**: every node takes one `(rank, row)`. `GRID = 24`, `NODE_WIDTH = 192`, `NODE_HEIGHT = 72`, `RANK_PITCH = 288`, `ROW_PITCH = 168` — the canvas snaps dragging to the same grid.
- **Timeline** (`sequel`) steps a rank, staying in its row, so a run of sequels is one straight horizontal spine. A timeline edge runs `to → from` (original → later work).
- **Every other family** steps a row: up towards the original, down towards the derived work, ordered within a fan by `KIND_ORDER` (the registry's key order; `kindRank` puts unknown kinds last). Siblings share one row and fan across ranks so connectors turn in the empty gutter. Rows are **opened** (everything shifts out) rather than skipped, and columns a stretched connector now crosses are reserved (`reserveCrossings`).
- Spine start: fewest prequels, then longest sequel chain (`chainLengths`), then most downward branches on the chain (`chainHubs`), then key order.
- **Tray**: nodes no relation touches go below the deepest placed node (`TRAY_TOP_GAP` 120px) in a 4-column band with `section: "tray"`; connected nodes get `section: "graph"`.
- `mergePositions` keeps every previously seen coordinate across a refetch, so adding/editing/removing a relation draws a line and moves nothing; auto-layout runs at load and again only when **Tidy** empties the position map.

### Handles — `frontend/src/lib/relationHandles.js`

Four handles in two groups: left/right = `timeline` (sequel/prequel only), top/bottom = `middle` (the other three families). `kindsForGroup` filters the `/kinds` payload by family, so a drag off a side handle can only become Sequel/Prequel and one off a top/bottom handle anything else.

### Canvas interactions — `frontend/src/components/relations/RelationGraph.jsx`

| Interaction | Behaviour |
| --- | --- |
| Drag node → node | `onConnect` opens `ConnectPopup` at the drop point with both ends known; the handle group gates the kinds |
| Drag → empty canvas | `onConnectEnd` opens the popup with a **global search** for the far end — this is how a cross-franchise link is made |
| `ConnectPopup` (`components/relations/ConnectPopup.jsx`) | Reads as a sentence "{subject} is the {kind} of {object}"; **Prequel is listed first** (timeline group); **Swap** flips subject/object; remark box. A `409` keeps the popup open with the server message so the typed kind and remark are not lost |
| Click edge | `EdgeInspector` (`components/relations/EdgeInspector.jsx`): kind select (posts kind as typed, server re-normalizes), Swap (disabled for symmetric kinds with an explanatory title), remark, Remove |
| Click in-scope node | `NodePanel` (`components/relations/NodePanel.jsx`): link out to the detail page and **Isolate** toggle, which dims everything more than one hop away; type chips (one per media type on canvas) dim whole types and compose with isolate |
| Click ghost node | Dashed, dimmed node from another franchise; clicking it calls `onPickGhostFranchise` and the admin page switches scope to that franchise |
| Missing node | Endpoint whose row is gone: red border/background with a `fa-link-slash` icon (`components/relations/RelationNode.jsx`); its edges can still be selected and deleted |
| Undo | `undoLast` replays the inverse request recorded for the last write (see below); a failure drops the entry |
| Tidy | Clears `positionsRef` and refetches, so `layoutGraph` recomputes everything from scratch |
| Reset | Confirm dialog, then `DELETE /scope`; empties the undo stack because the rows it remembers are gone — recovery is the deleted-record log |
| Fullscreen | Class swap on the wrapper |
| Dark mode | `colorMode={theme}` on `<ReactFlow>` from `useThemeOrLight()` (`contexts/ThemeContext`) |

### Undo — `frontend/src/lib/relationUndo.js`

An in-memory stack on the admin page, dead on reload (rows are shared with other editors). Each write records the one request that reverses it (`undoRequest`): create → `DELETE {id}`; delete → `POST` the old row back (`storedTupleFromEdge`); swap → `PATCH {swap: true}`; kind change → `PATCH {kind: restoringKind(...)}`. `restoringKind` is the subtle part: undoing Sequel→Prequel must send `prequel` (the input kind that stores as the old row from the other side), because sending `sequel` against the flipped row would normalize to the flipped row again. `describeEntry` builds the tooltip text.

### Edge styles — `FAMILY_STYLE` in `RelationGraph.jsx`, `FanEdge.jsx`

Edges are drawn reversed (`source: e.to`, `target: e.from`) so every arrow runs original → derivative. Timeline edges use React Flow `smoothstep`; the other three families use the custom `FanEdge`, which spreads a fan by angle and renders its label as an opaque HTML chip.

| Family | Stroke | Dash | Arrowhead | Label chip |
| --- | --- | --- | --- | --- |
| timeline | `#4f46e5` indigo | solid | yes | no — the arrow already says which way it reads |
| equivalence | `#0ea5e9` sky | dashed `6 4` | no | yes |
| branch | `#10b981` emerald | solid | yes | yes |
| derivation | `#f59e0b` amber | dotted `2 4` | yes | yes |

Unknown families fall back to the derivation style. Stroke width is 2 throughout.

## Sheets

- Tab **"Media Relation"**, registered in `app/services/pipelines/tabs.py` (`SHEET_TABS`). Backup writes the model's columns in table order (`app/services/pipelines/backup.py`, `headers = [c.name for c in tab.model.__table__.columns]`): `system_id, from_type, from_id, relation_type, to_type, to_id, remark, created_at, updated_at`.
- **Restore order**: after every media tab and the Watch Order tabs, before Plan Next / Quote / Meme / Note / Seasonal — both endpoints must already exist. Order in `SHEET_TABS` is the restore order.
- Parser `parse_media_relation_from_sheet` (`app/utils/formatter.py`): `from_id` / `to_id` use `_uuid_or_none`, so an unparseable cell becomes a missing endpoint on the admin page rather than failing the whole Pull; `relation_type` is preserved as written so a kind from a newer version survives a round trip (it then shows as its raw key). The CHECK constraint still rejects a self-relation row on Pull.

## Related

- Tests: `tests/api/test_media_relation.py`, `tests/api/test_media_relation_model.py`, `tests/api/test_media_relation_service.py`, `tests/unit/test_relation_kinds.py`, `tests/unit/test_formatter_media_relation.py`; frontend `frontend/src/lib/relationLayout.test.js`, `relationUndo.test.js`, and the `*.test.jsx` files beside each component in `frontend/src/components/relations/`.
- Cross-table resolver and `MEDIA_TABLES`: `app/utils/media_resolver.py`.
- RBAC visibility used by every read: `app/services/rbac/enforcement.py` (`entry_visible`, `filter_visible_pairs`), `app/services/rbac/resolver.py` (`get_viewer`).
- Watch orders share the FK-less endpoint contract and `list_candidate_entries`: `app/services/domain/watch_order.py`.
- Older prose (partly stale): `../frontend/pages.md` relation-graph section, `docs/api.md`, `../business-rules.md`, `../data-model.md`.
