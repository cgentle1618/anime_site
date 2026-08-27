# Relations Graph — Design

Date: 2026-08-25
Status: Approved (design); not yet planned or implemented

Supersedes the "Admin page" section of
`docs/superpowers/specs/2026-08-23-media-relations-design.md`. Everything else in
that spec — the `media_relation` table, the kind registry, the normalization
rules, the write endpoints — stands unchanged.

## Problem

`frontend/src/pages/admin/Relations.jsx` presents relations as text. Pick a
franchise, pick an entry, read a list of its relations grouped by family, add one
through a kind `<select>` and a ComboBox. It is correct and it is unreadable:

1. **The shape is invisible.** A franchise's structure — what follows what, which
   entries are alternative versions of one work, where a spin-off branches — is
   the thing being curated, and a per-entry list never shows it. You see one
   entry's neighbours, never the graph.
2. **Every link costs a form.** Connecting two entries means selecting the source
   row, opening the kind select, typing the target's name into a ComboBox, and
   submitting. For a franchise with twenty entries to wire up, that is twenty
   round trips through a form when the intent — "this one, then that one" — is a
   gesture.
3. **Mistakes are hard to see.** A relation pointing the wrong way, or an entry
   left unconnected, is invisible until you happen to open that entry's row.

## Solution

Replace the page's right pane with a graph canvas: the scope's entries as nodes,
its relations as edges, laid out automatically, with relations created by
dragging a line between two nodes.

The left pane is unchanged — the franchise/collection picker stays a browsing
lens, exactly as the original spec argues.

Nothing about the data model or the write path changes. The canvas is a new view
over the same rows and the same POST/PATCH/DELETE.

### Rejected alternatives

- **Graph as a second tab beside the list.** Two UIs curating the same data,
  with the worse one as the default.
- **Full-bleed canvas, list as a floating overlay.** Buys canvas area at the cost
  of rebuilding the working left-pane affordances as overlays.
- **Persisted node positions.** A `node_position` table, a migration, a sheet
  tab, and a stale-coordinate cleanup story, to preserve arrangements that
  auto-layout can recompute. Deferred; see Out of scope.
- **Hand-rolled SVG canvas.** Zero dependencies, but pan/zoom transforms, node
  hit-testing, the drag-preview line, edge routing and escape handling are all
  things the chosen library already ships tested.
- **Cytoscape.js.** Strong layouts, but an imperative style engine: cover images
  and Tailwind badges fight the framework instead of being React components.

## Rendering

`@xyflow/react` (React Flow, MIT core) for the canvas, `@dagrejs/dagre` for
layout. Two new frontend dependencies, roughly 55 KB gzipped combined.

React Flow already implements the two things this design turns on: pan/zoom with
hit-testing, and handle-based drag-to-connect with a live preview line, an
`onConnect` hook for a drop on a node and `onConnectEnd` for a drop on empty
canvas — which is exactly the two-gesture split below. Custom nodes are plain
React components, so a node stays a Tailwind card rendered by the same code as
the rest of the app.

## API

One new read endpoint. Guest-readable, matching the other reads.

| method | path | purpose |
| --- | --- | --- |
| `GET` | `/api/media-relation/graph?franchise_id=` or `?collection_id=` | Everything one canvas draws: `{ nodes, edges }`. |

Exactly one of the two scope parameters is required; both or neither is a 400,
reusing the check already in `list_relations_in_scope`. A collection resolves to
its member franchises first, as that endpoint and the watch-order candidates
endpoint both do.

**nodes** — every entry in the scope, from the existing `list_candidate_entries`,
which already returns `media_type`, `entry_id`, `display_name`, `search_names`
and `cover_image_file`. Each is marked `in_scope: true`. Entries with no
relations are included: you cannot drag a line from a node that is not drawn, and
connecting an unconnected entry is the page's main job.

**ghost nodes** — one per relation endpoint falling outside the scope, resolved
in a single batch through the existing `resolve_entries` in
`app/utils/media_resolver.py`, carrying name, cover, `franchise_id`, `nav_path`,
and `missing: true` for a dangling id.

**edges** — one per `media_relation` row: `system_id`, `from` and `to` as
`"{media_type}:{entry_id}"` keys, `relation_type`, `label`, `inverse_label`,
`family`, `remark`. `label` reads the row in the stored direction (`from` → `to`)
and `inverse_label` reads it backwards, both taken from `RELATION_KINDS`, so the
canvas never needs a second copy of the registry to label an edge or its
inspector.

The key format matches the `"type:id"` convention the current page already uses,
for the same reason: `entry_id` alone is ambiguous because each media table has
its own `system_id` space.

Why a dedicated endpoint rather than extending `GET /?franchise_id=`: the page
would otherwise fetch candidates and relations separately and synthesize the
ghost set by diffing them client-side. "Which nodes does this canvas contain" is
one question with one answer, and answering it needs the resolver, which is
server-side.

New schemas in `app/schemas/media_relation.py`: `RelationGraphNode`,
`RelationGraphEdge`, `RelationGraphResponse`. The query lives in
`app/services/domain/media_relation.py` as `graph_for_scope(db, franchise_ids)`,
keeping the router thin — the split that file already uses.

**Unchanged:** `/kinds`, `/for-entry`, `POST`, `PATCH`, `DELETE`, and all
normalization (Prequel still writes a swapped `sequel` row; `alternative` still
sorts its endpoints before writing). `GET /?franchise_id=` stays for API
consumers, but the page stops calling it — the left pane's count badges are
counted off the graph's edge list.

**No schema change, no migration, no new sheet tab.**

## Layout

Pure functions in `frontend/src/lib/relationLayout.js`, taking `{nodes, edges}`
and returning positioned nodes. No DOM, no React — unit-testable directly.

Three passes:

1. **Group the versions.** Union-find over `equivalence` edges (alternative,
   renew, director's cut, extended). Those kinds all mean "the same work, another
   version", so spreading them along the timeline misreads them. Each connected
   group contracts to one layout node.
2. **Rank the groups.** dagre with `rankdir: "LR"` over the between-group edges.
   `timeline` edges carry full weight and drive the left-to-right flow;
   `branch` and `derivation` carry lower weight, so a spin-off or an adaptation
   bends off the spine instead of stretching it.
3. **Expand the groups.** Members of a version group stack vertically at their
   group's slot, so alternatives read as a column at one point in the timeline.

**Unconnected entries bypass dagre.** A franchise with thirty entries and four
relations would otherwise become mostly empty ranks. They land in a wrapped grid
docked below the graph, visually separated, and remain full drag sources — that
tray is where most connecting work starts.

**Ghost nodes take part in the layout** like any other node, distinguished by
styling rather than position. Pinning them to the canvas border was considered
and rejected: it produces long lines crossing the whole graph to reach a node
that is often central to the story.

**Positions are stable across writes.** After each write the graph refetches, but
coordinates are not recomputed from scratch: node keys already on the canvas keep
their positions, and only new keys are laid out. Otherwise the canvas rearranges
under the cursor after every added link, which makes rapid connecting unusable.

## Canvas

**Nodes** are fixed-size React components (about 200x72 — dagre needs constant
dimensions): cover thumbnail, display name truncated to two lines, and a
media-type badge. No media-type colour map exists in the codebase yet, so the
graph module defines one.

| node state | rendering |
| --- | --- |
| in scope | solid card, full opacity |
| ghost (out of scope) | dashed border, dimmed, owning franchise in a footer; clicking switches the left pane's scope to that franchise |
| missing (dangling id) | red, raw id shown; deletable, not clickable |

**Edges** are styled by family:

| family | stroke | arrowhead | label chip |
| --- | --- | --- | --- |
| timeline | solid | yes | none — the arrow already says which way `sequel` reads |
| equivalence | dashed | no — the kind is symmetric | yes |
| branch | solid, lighter | yes | yes |
| derivation | dotted | yes | yes |

**Chrome:** fit-view and zoom controls, a minimap (some franchises are large), a
family legend that doubles as a show/hide filter, and a search box that
highlights and centres a node by name.

## Interactions

### Creating a relation

Drag from a node's handle; a live line follows the cursor.

- **Drop on a node** opens a popup at the drop point reading
  *"<source> is the ___ of <target>"*, listing the nine user-facing kinds with
  Prequel first and keyboard navigation, an optional remark, and a
  swap-direction button. Enter confirms, Esc cancels. **Nothing is written until
  you confirm**, so a misdrop costs one keystroke.
- **Drop on empty canvas** opens the same popup with a global entry search above
  the kind list, for the cross-franchise case. That search is the debounced
  seven-endpoint fetch currently inlined in `AddRelationForm`, extracted to
  `frontend/src/hooks/useGlobalMediaSearch.js` so both callers share one copy.

The sentence in the popup resolves direction unambiguously, which matters because
Prequel is stored as a swapped `sequel` row server-side, so the source of the
drag is not necessarily the `from` of the stored row.

A duplicate or a self-relation returns 409 from the guards already in the router.
The popup stays open showing the message rather than closing back to the canvas.

### Editing

- **Click an edge** → inspector: kind select (PATCH, re-normalized server-side),
  remark, and delete behind a `window.confirm` naming both endpoints.
- **Click a node** → panel: cover, name, link to its detail page, its relation
  list, and an "isolate" toggle dimming everything but its neighbours.

Every write refreshes the graph and reports through `useToast`, matching the
`busy` / `showToast` pattern the page already uses. Entries themselves are never
touched by this page.

## Files

Backend:

- `app/schemas/media_relation.py` — three new schemas.
- `app/services/domain/media_relation.py` — `graph_for_scope`.
- `app/routers/media_relation.py` — the `/graph` route.

Frontend:

- `frontend/src/pages/admin/Relations.jsx` — keeps the left pane and the shell;
  the right pane becomes `<RelationGraph>`. It sheds `AddRelationForm` and the
  per-family list rendering, so the 612-line file comes out substantially
  smaller.
- `frontend/src/components/relations/RelationGraph.jsx` — React Flow wiring.
- `frontend/src/components/relations/RelationNode.jsx`
- `frontend/src/components/relations/ConnectPopup.jsx`
- `frontend/src/components/relations/EdgeInspector.jsx`
- `frontend/src/components/relations/UnconnectedTray.jsx`
- `frontend/src/lib/relationLayout.js` — pure layout.
- `frontend/src/hooks/useGlobalMediaSearch.js` — extracted from the old form.
- `frontend/src/api/endpoints.js` — `mediaRelation.graph`.

Dependencies: `@xyflow/react`, `@dagrejs/dagre`.

## Tests

- `tests/api/test_media_relation.py` — add `/graph` cases: unconnected entries
  appear as nodes; an out-of-scope endpoint resolves to `in_scope: false` with a
  name; a dangling id resolves to `missing`; both or neither scope parameter is a
  400; a collection scope covers its member franchises' entries.
- `frontend/src/lib/relationLayout.test.js` (vitest) — equivalence groups
  contract to one layout node; timeline edges rank left to right; unconnected
  entries are separated from the ranked graph; output is deterministic for a
  given input.
- `frontend/src/components/relations/ConnectPopup.test.jsx` — kind selection,
  Esc cancels, and no write is issued before confirm.

The React Flow canvas itself is not meaningfully unit-testable in jsdom: pan,
zoom and drag hit-testing get verified by running the app.

## Documentation

- `docs/api.md` — the `/graph` endpoint.
- `docs/pages.md` and `docs/admin-forms.md` — the page's new right pane and the
  drag-to-connect flow.
- `docs/dependencies.md` — the two new NPM packages.
- `docs/reusable-elements.md` — `useGlobalMediaSearch`, the media-type colour map.

## Out of scope

- Rendering relations on the public detail pages. Still admin-only;
  `/for-entry` remains the right shape to feed that later.
- Persisted node positions.
- A whole-library graph, unscoped by franchise or collection.
- Editing entry fields from the canvas.

## Sequencing

Two commits:

1. `/graph` endpoint, schemas, service, API tests.
2. The canvas, the frontend cleanup, layout tests, `npm run build`.

The page keeps working between them: commit 1 adds an endpoint nothing calls yet.
