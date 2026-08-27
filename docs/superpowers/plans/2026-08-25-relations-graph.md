# Relations Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right pane of the admin Relations page with a graph canvas where the scope's entries are nodes, its relations are edges, and a relation is created by dragging a line between two nodes.

**Architecture:** One new read endpoint, `GET /api/media-relation/graph`, returns everything one canvas draws — in-scope entries as nodes, out-of-scope relation endpoints as ghost nodes, and the relation rows as edges. The frontend lays those out with pure functions over `@dagrejs/dagre` and renders them with `@xyflow/react`. No data-model change: the canvas is a new view over the existing `media_relation` rows and the existing POST/PATCH/DELETE.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 18 + Vite + Tailwind v4 (frontend), `@xyflow/react` (canvas), `@dagrejs/dagre` (layout), pytest (API tests), vitest + @testing-library/react (frontend tests).

**Spec:** `docs/superpowers/specs/2026-08-25-relations-graph-design.md`

## Global Constraints

- **Never commit automatically.** `CLAUDE.md` overrides the default TDD-commit rhythm: at every "Commit" step, stage only the named files, show the one-line message, and **ask the user for approval before running `git commit`**. Do not push.
- **Never `git add -A` or `git commit -a`.** Other Claude Code sessions may be editing the same branch. Stage only the exact files a task names, and re-read the diff of those files first — if a file contains hunks that are not yours, stop and ask.
- **After any frontend change, run `cd frontend && npm run build`** so `:8000` (uvicorn, serving `frontend_dist/`) matches `:5173` (Vite dev). A frontend task is not done without it.
- **No schema change, no Alembic migration, no new Google Sheets tab** anywhere in this plan. If a task seems to need one, the plan is wrong — stop and ask.
- **The page must keep working between tasks.** The existing `AddRelationForm` and per-family relation list stay in place until Task 8 removes them, by which point the canvas fully replaces them.
- **Node key format is `"{media_type}:{entry_id}"`** everywhere — backend and frontend. `entry_id` alone is ambiguous because each media table has its own `system_id` space.
- **The nine user-facing kinds come from `GET /api/media-relation/kinds`.** Never hardcode a second copy of the registry in the frontend.
- API tests require PostgreSQL (`anime_site_test` DB) — see `tests/api/conftest.py`.

**Two deviations from the spec's file list, decided while planning:**

1. The spec lists `UnconnectedTray.jsx` as a component. It isn't one here. The tray is a *position band* produced by `layoutGraph` (Task 2), so tray entries stay ordinary React Flow nodes on the same canvas — which they must be, since dragging a connection *out of* the tray is the commonest gesture on the page. A separate component would sit outside the canvas and could not be a drag source.
2. The spec's "two commits" sequencing is superseded by this plan's nine tasks. Each task is independently reviewable and leaves the page working; collapsing them into two commits would hide the review points.

---

### Task 1: The `/graph` endpoint

Everything the canvas reads, in one request: in-scope entries as nodes, out-of-scope relation endpoints as ghost nodes, relation rows as edges.

**Files:**
- Modify: `app/schemas/media_relation.py` (append three schemas; re-export in `app/schemas/__init__.py` if that file lists names explicitly — check it)
- Modify: `app/services/domain/media_relation.py` (add `graph_for_scope`)
- Modify: `app/routers/media_relation.py` (add the route, next to `list_relations_in_scope`)
- Test: `tests/api/test_media_relation.py` (append a "Graph" section)

**Interfaces:**
- Consumes: `list_candidate_entries(db, franchise_ids)` from `app.services.domain.watch_order`; `resolve_entries(db, pairs)` and `entry_ref_for(resolved, media_type, entry_id)` and `MEDIA_TABLES` from `app.utils.media_resolver`; `RELATION_KINDS` from `app.utils.relation_kinds`.
- Produces: `graph_for_scope(db: Session, franchise_ids: List[UUID]) -> Dict[str, Any]` returning `{"nodes": [...], "edges": [...]}`; the HTTP route `GET /api/media-relation/graph`. Task 4 consumes the JSON shape.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_media_relation.py`. The fixtures `sample_franchise`, `sample_anime`, `second_anime`, `sample_manga_entry`, `client`, `admin_client`, `db_session` already exist in that file or its conftest.

```python
# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def test_graph_lists_every_scope_entry_including_unconnected_ones(
    client, sample_franchise, sample_anime, second_anime
):
    # No relations exist between them, yet both must be drawable: you cannot
    # drag a line from a node that is not on the canvas.
    res = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
    body = res.json()
    keys = {n["key"] for n in body["nodes"]}
    assert f"anime:{sample_anime.system_id}" in keys
    assert f"anime:{second_anime.system_id}" in keys
    assert all(n["in_scope"] for n in body["nodes"])
    assert body["edges"] == []


def test_graph_edges_carry_both_labels_and_the_family(
    admin_client, client, sample_franchise, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime",
            "to_id": str(sample_anime.system_id),
            "remark": "the direct continuation",
        },
    )

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    assert len(body["edges"]) == 1
    edge = body["edges"][0]
    assert edge["from"] == f"anime:{second_anime.system_id}"
    assert edge["to"] == f"anime:{sample_anime.system_id}"
    assert edge["relation_type"] == "sequel"
    assert edge["label"] == "Sequel"
    assert edge["inverse_label"] == "Prequel"
    assert edge["family"] == "timeline"
    assert edge["remark"] == "the direct continuation"


def test_graph_adds_a_ghost_node_for_an_out_of_scope_endpoint(
    admin_client, client, db_session, sample_franchise, sample_anime
):
    import uuid as _uuid

    from app import models

    other_franchise = models.Franchise(
        system_id=_uuid.uuid4(), franchise_name_en="Somewhere Else"
    )
    db_session.add(other_franchise)
    db_session.flush()
    outsider = models.Anime(
        system_id=_uuid.uuid4(),
        franchise_id=other_franchise.system_id,
        anime_name_en="Outside Entry",
    )
    db_session.add(outsider)
    db_session.flush()

    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(sample_anime.system_id),
            "kind": "spin_off",
            "to_type": "anime",
            "to_id": str(outsider.system_id),
        },
    )

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    ghost = next(
        n for n in body["nodes"] if n["key"] == f"anime:{outsider.system_id}"
    )
    assert ghost["in_scope"] is False
    assert ghost["missing"] is False
    assert ghost["display_name"] == "Outside Entry"
    assert ghost["franchise_id"] == str(other_franchise.system_id)


def test_graph_marks_a_dangling_target_as_missing(
    admin_client, client, db_session, sample_franchise, sample_anime
):
    import uuid as _uuid

    from app import models

    # Written straight to the table: the API would refuse a nonexistent
    # endpoint, but a row can be orphaned later by deleting the entry.
    orphan_id = _uuid.uuid4()
    db_session.add(
        models.MediaRelation(
            system_id=_uuid.uuid4(),
            from_type="anime",
            from_id=sample_anime.system_id,
            relation_type="adaptation",
            to_type="manga",
            to_id=orphan_id,
        )
    )
    db_session.flush()

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    ghost = next(n for n in body["nodes"] if n["key"] == f"manga:{orphan_id}")
    assert ghost["missing"] is True
    assert ghost["in_scope"] is False
    assert ghost["display_name"] is None


def test_graph_scope_can_be_a_collection(
    client, db_session, sample_franchise, sample_anime
):
    from app import models

    collection = models.Collection(collection_name_en="A Collection")
    db_session.add(collection)
    db_session.flush()
    sample_franchise.collection_id = collection.system_id
    db_session.flush()

    body = client.get(
        "/api/media-relation/graph",
        params={"collection_id": str(collection.system_id)},
    ).json()

    assert f"anime:{sample_anime.system_id}" in {n["key"] for n in body["nodes"]}


def test_graph_requires_exactly_one_scope(client):
    assert client.get("/api/media-relation/graph").status_code == 400
    assert (
        client.get(
            "/api/media-relation/graph",
            params={"franchise_id": str(uuid.uuid4()), "collection_id": str(uuid.uuid4())},
        ).status_code
        == 400
    )


def test_graph_is_public(client, sample_franchise):
    res = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
```

Note: `models.Collection`'s constructor and the `sample_franchise` fixture's field names may differ slightly — read `tests/api/conftest.py` and `app/models/collection.py` first and adjust the two fixture-building blocks to match. Do not change what the assertions check.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/api/test_media_relation.py -k graph -v`
Expected: FAIL — every test 404s, because `/api/media-relation/graph` does not exist yet.

- [ ] **Step 3: Add the schemas**

Append to `app/schemas/media_relation.py`:

```python
class RelationGraphNode(BaseModel):
    """
    One entry on the canvas.

    `in_scope` separates the franchise's own entries from the ghosts pulled in
    by a relation that leaves the scope; `missing` marks an endpoint whose row
    is gone, which stays visible so it can be found and deleted.
    """

    key: str
    media_type: str
    entry_id: Optional[UUID] = None
    in_scope: bool
    missing: bool = False
    display_name: Optional[str] = None
    # Every title the entry answers to, so the canvas search box finds an entry
    # displayed under its Chinese title.
    search_names: List[str] = []
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    nav_path: Optional[str] = None
    # The media type's human label ("Anime Movie"), for the node badge.
    type_label: Optional[str] = None


class RelationGraphEdge(BaseModel):
    """
    One media_relation row, keyed by the two node keys it joins.

    Both labels travel with the edge - `label` reads the row in the stored
    direction and `inverse_label` reads it backwards - so the canvas never
    needs a second copy of RELATION_KINDS to label an edge or its inspector.
    """

    system_id: UUID
    # Named `from` in JSON; `from` is a Python keyword, hence the alias.
    from_key: str = Field(..., alias="from")
    to_key: str = Field(..., alias="to")
    relation_type: str
    label: str
    inverse_label: str
    family: str
    remark: Optional[str] = None

    model_config = {"populate_by_name": True}


class RelationGraphResponse(BaseModel):
    """Everything one canvas draws, in one request."""

    nodes: List[RelationGraphNode]
    edges: List[RelationGraphEdge]
```

Add `Field` to the pydantic import at the top of the file if it is not already imported, and `List` to the typing import. If `app/schemas/__init__.py` re-exports names explicitly, add the three new ones there too.

- [ ] **Step 4: Add `graph_for_scope` to the domain service**

Append to `app/services/domain/media_relation.py`:

```python
def _node_key(media_type: str, entry_id: UUID) -> str:
    """
    The canvas's identity for an entry.

    Type-qualified because each media table has its own system_id space, so an
    id alone cannot name a node. Matches the "type:id" convention the admin
    page already uses for its picker.
    """
    return f"{media_type}:{entry_id}"


def graph_for_scope(db: Session, franchise_ids: List[UUID]) -> Dict[str, Any]:
    """
    Every node and edge one relations canvas draws.

    Entries with no relations are included on purpose: you cannot drag a line
    from a node that is not drawn, and connecting an unconnected entry is the
    page's main job.

    Relation endpoints falling outside the scope come back as ghost nodes, so a
    cross-franchise link is visible as structure rather than hidden behind a
    count. They are resolved in one batch, so a heavily linked franchise never
    degrades into an N+1.
    """
    candidates = list_candidate_entries(db, franchise_ids)

    nodes: List[Dict[str, Any]] = []
    in_scope: set = set()
    for c in candidates:
        endpoint = (c["media_type"], c["entry_id"])
        in_scope.add(endpoint)
        ref = MEDIA_TABLES.get(c["media_type"])
        nodes.append(
            {
                "key": _node_key(*endpoint),
                "media_type": c["media_type"],
                "entry_id": c["entry_id"],
                "in_scope": True,
                "missing": False,
                "display_name": c["display_name"],
                "search_names": c["search_names"],
                "cover_image_file": c["cover_image_file"],
                "franchise_id": c["franchise_id"],
                "nav_path": (
                    f"{ref.nav_path}/{c['entry_id']}"
                    if ref and ref.nav_path
                    else None
                ),
                "type_label": ref.label if ref else None,
            }
        )

    entry_ids = [c["entry_id"] for c in candidates]
    rows = (
        db.query(MediaRelation)
        .filter(
            or_(
                MediaRelation.from_id.in_(entry_ids),
                MediaRelation.to_id.in_(entry_ids),
            )
        )
        .order_by(MediaRelation.created_at)
        .all()
        if entry_ids
        else []
    )
    # The id filter above ignores the type discriminator, which SQL cannot
    # express against seven tables at once. Re-check the pair here so a row
    # whose id happens to collide across tables is not drawn on this canvas.
    rows = [
        row
        for row in rows
        if (row.from_type, row.from_id) in in_scope
        or (row.to_type, row.to_id) in in_scope
    ]

    # One batched resolve for every endpoint the scope does not already hold.
    outside: List[Endpoint] = []
    for row in rows:
        for endpoint in ((row.from_type, row.from_id), (row.to_type, row.to_id)):
            if endpoint not in in_scope and endpoint not in outside:
                outside.append(endpoint)

    resolved = resolve_entries(db, outside)
    for media_type, entry_id in outside:
        ref = entry_ref_for(resolved, media_type, entry_id)
        nodes.append(
            {
                "key": _node_key(media_type, entry_id),
                "media_type": media_type,
                "entry_id": entry_id,
                "in_scope": False,
                "missing": ref.missing,
                "display_name": ref.display_name,
                "search_names": [],
                "cover_image_file": ref.cover_image_file,
                "franchise_id": ref.franchise_id,
                "nav_path": ref.nav_path,
                "type_label": ref.label,
            }
        )

    edges: List[Dict[str, Any]] = []
    for row in rows:
        kind = RELATION_KINDS.get(row.relation_type)
        edges.append(
            {
                "system_id": row.system_id,
                "from": _node_key(row.from_type, row.from_id),
                "to": _node_key(row.to_type, row.to_id),
                "relation_type": row.relation_type,
                # A kind restored from a sheet written by a newer version shows
                # its raw key rather than blanking the edge.
                "label": kind.label if kind else row.relation_type,
                "inverse_label": (
                    kind.inverse_label if kind else row.relation_type
                ),
                "family": kind.family if kind else "derivation",
                "remark": row.remark,
            }
        )

    return {"nodes": nodes, "edges": edges}
```

Extend the module's imports: `list_candidate_entries` from `app.services.domain.watch_order`, and `MEDIA_TABLES` from `app.utils.media_resolver` (`entry_ref_for` and `resolve_entries` are already imported).

- [ ] **Step 5: Add the route**

In `app/routers/media_relation.py`, immediately before the `PROTECTED WRITES` banner:

```python
@router.get(
    "/graph",
    response_model=schemas.RelationGraphResponse,
    summary="Graph For A Scope",
)
def get_relation_graph(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Everything the relations canvas draws for one franchise or collection.

    One request rather than two, because "which nodes does this canvas contain"
    is a single question whose answer needs the cross-table resolver - the page
    would otherwise have to synthesize the ghost set by diffing two lists.
    """
    if bool(franchise_id) == bool(collection_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of franchise_id or collection_id.",
        )

    if franchise_id:
        franchise_ids = [franchise_id]
    else:
        franchise_ids = [
            row[0]
            for row in db.query(models.Franchise.system_id)
            .filter(models.Franchise.collection_id == collection_id)
            .all()
        ]

    return graph_for_scope(db, franchise_ids)
```

Import `graph_for_scope` alongside the other domain imports at the top of the router.

**Route order matters:** FastAPI matches in declaration order, and `/graph` is a literal path with no competing parameterized route above it (`/{system_id}` routes are PATCH/DELETE only, different methods) — but declare `/graph` before any future `GET /{...}` route regardless.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/api/test_media_relation.py -v`
Expected: PASS — the seven new graph tests plus every pre-existing test in the file.

- [ ] **Step 7: Commit (ask first)**

Show the user: `feat(relations): add a graph endpoint for one franchise or collection`

```bash
git add app/schemas/media_relation.py app/services/domain/media_relation.py app/routers/media_relation.py tests/api/test_media_relation.py
# then, only after the user approves:
git commit -m "feat(relations): add a graph endpoint for one franchise or collection"
```

---

### Task 2: Layout functions

Pure functions turning `{nodes, edges}` into positioned nodes. No DOM, no React, no fetch — this is the piece worth testing hard, and it is testable directly.

**Files:**
- Create: `frontend/src/lib/relationLayout.js`
- Create: `frontend/src/lib/relationLayout.test.js`
- Modify: `frontend/package.json` (two dependencies)

**Interfaces:**
- Consumes: the JSON shape from Task 1.
- Produces:
  - `NODE_WIDTH = 200`, `NODE_HEIGHT = 72` (exported constants; Task 3's node component must render at exactly these dimensions or dagre's spacing lies)
  - `layoutGraph({ nodes, edges }) -> Array<node & { position: {x, y}, section: "graph" | "tray" }>`
  - `mergePositions(previousByKey, positioned) -> positioned` — keeps coordinates for keys already on the canvas

- [ ] **Step 1: Install the dependencies**

Run: `cd frontend && npm install @xyflow/react @dagrejs/dagre`

Then confirm the installed React Flow major version, because its connection API changed at v12:

Run: `cd frontend && node -p "require('./node_modules/@xyflow/react/package.json').version"`

Record the version — Task 4 and Task 7 need it. If anything about the `onConnectEnd` signature is unclear later, look it up with the context7 MCP tool (`resolve-library-id` then `query-docs` for `@xyflow/react`) rather than guessing.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/lib/relationLayout.test.js`:

```js
// Frontend: tests for the relations canvas layout.
//
// Layout is where the graph either reads as a story or reads as a hairball, so
// it lives in pure functions and gets tested directly rather than through the
// canvas.
import { layoutGraph, mergePositions, NODE_HEIGHT } from "./relationLayout";

function node(key, extra = {}) {
  return { key, media_type: "anime", in_scope: true, display_name: key, ...extra };
}

function edge(from, to, family = "timeline", relation_type = "sequel") {
  return { system_id: `${from}->${to}`, from, to, family, relation_type };
}

function byKey(positioned) {
  return Object.fromEntries(positioned.map((n) => [n.key, n]));
}

describe("layoutGraph", () => {
  it("flows a timeline left to right", () => {
    // "B is the sequel of A" is stored as B -sequel-> A, and the canvas must
    // still read A first: the earlier work belongs on the left.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("anime:b")],
        edges: [edge("anime:b", "anime:a")],
      }),
    );
    expect(out["anime:a"].position.x).toBeLessThan(out["anime:b"].position.x);
    expect(out["anime:a"].section).toBe("graph");
  });

  it("stacks alternative versions in one column", () => {
    // Alternatives are the same work, not successive works: they share a slot
    // on the timeline and separate vertically.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("movie:a")],
        edges: [edge("anime:a", "movie:a", "equivalence", "alternative")],
      }),
    );
    expect(out["anime:a"].position.x).toBe(out["movie:a"].position.x);
    expect(
      Math.abs(out["anime:a"].position.y - out["movie:a"].position.y),
    ).toBeGreaterThanOrEqual(NODE_HEIGHT);
  });

  it("sends an entry with no relations to the tray", () => {
    // A franchise with thirty entries and four relations would otherwise be
    // mostly empty ranks.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("anime:b"), node("anime:lonely")],
        edges: [edge("anime:b", "anime:a")],
      }),
    );
    expect(out["anime:lonely"].section).toBe("tray");
    expect(out["anime:a"].section).toBe("graph");
  });

  it("keeps an entry linked only by an alternative out of the tray", () => {
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("movie:a")],
        edges: [edge("anime:a", "movie:a", "equivalence", "alternative")],
      }),
    );
    expect(out["anime:a"].section).toBe("graph");
    expect(out["movie:a"].section).toBe("graph");
  });

  it("ignores an edge whose endpoint is not a node", () => {
    const out = layoutGraph({
      nodes: [node("anime:a")],
      edges: [edge("anime:a", "anime:ghost-that-was-not-sent")],
    });
    expect(out).toHaveLength(1);
  });

  it("is deterministic for the same input", () => {
    const input = {
      nodes: [node("anime:a"), node("anime:b"), node("anime:c")],
      edges: [edge("anime:b", "anime:a"), edge("anime:c", "anime:b")],
    };
    expect(layoutGraph(input)).toEqual(layoutGraph(input));
  });
});

describe("mergePositions", () => {
  it("keeps coordinates for nodes already on the canvas", () => {
    // Otherwise the whole canvas rearranges under the cursor after every added
    // link, which makes rapid connecting unusable.
    const positioned = [
      { key: "anime:a", position: { x: 0, y: 0 }, section: "graph" },
      { key: "anime:new", position: { x: 400, y: 0 }, section: "graph" },
    ];
    const merged = mergePositions(
      { "anime:a": { x: 123, y: 456 } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 123, y: 456 });
    expect(merged[1].position).toEqual({ x: 400, y: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/relationLayout.test.js`
Expected: FAIL — "Failed to resolve import ./relationLayout".

- [ ] **Step 4: Write the layout module**

Create `frontend/src/lib/relationLayout.js`:

```js
// Frontend: positions for the relations canvas.
//
// Pure functions, no DOM: layout is what decides whether a franchise reads as
// a story or as a hairball, so it is testable on its own.
//
// Three passes, because the four relation families mean different things
// spatially. Equivalence ("the same work, another version") must not spread
// along the timeline, so those nodes are contracted into one layout node and
// re-expanded as a column afterwards. Timeline drives the left-to-right flow;
// branch and derivation bend off the spine at lower weight.
import dagre from "@dagrejs/dagre";

// Nodes are fixed-size because dagre reserves space from declared dimensions -
// RelationNode must render at exactly these numbers or the spacing lies.
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 72;

// Vertical gap between the members of one version group.
const GROUP_GAP = 12;
// Where the unconnected tray starts, below the deepest ranked node.
const TRAY_TOP_GAP = 120;
const TRAY_COLUMNS = 4;
const TRAY_GAP_X = 24;
const TRAY_GAP_Y = 20;

// How hard each family pulls on the left-to-right ranking. Timeline is the
// spine; a spin-off or an adaptation should bend off it rather than stretch it.
const FAMILY_WEIGHT = { timeline: 4, branch: 2, derivation: 1 };

function unionFind(keys) {
  const parent = new Map(keys.map((k) => [k, k]));
  function find(k) {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression, so a long alternative chain stays cheap.
    while (parent.get(k) !== root) {
      const next = parent.get(k);
      parent.set(k, root);
      k = next;
    }
    return root;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return { find, union };
}

/**
 * Positions every node, splitting them into the ranked graph and the tray of
 * entries no relation touches.
 *
 * Returns each input node with `position` and `section` added; input order is
 * preserved so the caller can rely on it.
 */
export function layoutGraph({ nodes, edges }) {
  const keys = nodes.map((n) => n.key);
  const known = new Set(keys);
  // A ghost node is only sent when an edge needs it, but a client-side filter
  // can still hide one - drop edges we cannot place rather than crash dagre.
  const usable = (edges || []).filter(
    (e) => known.has(e.from) && known.has(e.to),
  );

  // Pass 1: contract equivalence-linked nodes into version groups.
  const { find, union } = unionFind(keys);
  for (const e of usable) {
    if (e.family === "equivalence") union(e.from, e.to);
  }
  const members = new Map();
  for (const key of keys) {
    const root = find(key);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(key);
  }

  // Cross-group edges are the only ones that rank; an equivalence edge inside
  // a group has already been absorbed by the contraction.
  const crossEdges = usable.filter(
    (e) => find(e.from) !== find(e.to),
  );

  const ranked = new Set();
  for (const e of crossEdges) {
    ranked.add(find(e.from));
    ranked.add(find(e.to));
  }
  // A version group of two is structure worth drawing even with no other edge.
  for (const [root, group] of members) {
    if (group.length > 1) ranked.add(root);
  }

  // Pass 2: rank the groups left to right.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 40, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const groupHeight = (root) => {
    const n = members.get(root).length;
    return n * NODE_HEIGHT + (n - 1) * GROUP_GAP;
  };

  // Sorted so dagre sees the same insertion order for the same input.
  const rankedRoots = [...ranked].sort();
  for (const root of rankedRoots) {
    g.setNode(root, { width: NODE_WIDTH, height: groupHeight(root) });
  }
  for (const e of crossEdges) {
    const from = find(e.from);
    const to = find(e.to);
    if (!ranked.has(from) || !ranked.has(to)) continue;
    // Reversed on purpose. Every stored kind reads "`from` is the {label} of
    // `to`", which always makes `to` the earlier, parent or source work: B is
    // the Sequel of A, X is the Adaptation of Y. Ranking from->to would put
    // every sequel to the LEFT of its prequel. The canvas draws the same
    // reversal (see toFlowEdges), so one rule holds throughout: an arrow runs
    // from the original to the work derived from it.
    g.setEdge(to, from, { weight: FAMILY_WEIGHT[e.family] ?? 1 });
  }
  dagre.layout(g);

  // Pass 3: expand each group back into a column of real nodes. dagre reports
  // centres; React Flow wants top-left corners.
  const positions = new Map();
  let deepest = 0;
  for (const root of rankedRoots) {
    const box = g.node(root);
    const height = groupHeight(root);
    const top = box.y - height / 2;
    members.get(root).forEach((key, i) => {
      const y = top + i * (NODE_HEIGHT + GROUP_GAP);
      positions.set(key, { x: box.x - NODE_WIDTH / 2, y });
      deepest = Math.max(deepest, y + NODE_HEIGHT);
    });
  }

  // The tray: everything no relation touches, in a wrapped grid below the
  // graph. Still full drag sources - it is where most connecting starts.
  const trayKeys = keys.filter((k) => !positions.has(k));
  const trayTop = deepest + TRAY_TOP_GAP;
  trayKeys.forEach((key, i) => {
    positions.set(key, {
      x: (i % TRAY_COLUMNS) * (NODE_WIDTH + TRAY_GAP_X),
      y: trayTop + Math.floor(i / TRAY_COLUMNS) * (NODE_HEIGHT + TRAY_GAP_Y),
    });
  });
  const tray = new Set(trayKeys);

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.key),
    section: tray.has(n.key) ? "tray" : "graph",
  }));
}

/**
 * Keeps hand-dragged and previously computed coordinates across a refetch.
 *
 * Only nodes new to the canvas get the freshly computed position, so adding a
 * relation does not rearrange the graph under the cursor.
 */
export function mergePositions(previousByKey, positioned) {
  return positioned.map((n) =>
    previousByKey[n.key] ? { ...n, position: previousByKey[n.key] } : n,
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/relationLayout.test.js`
Expected: PASS — all seven cases.

Then run the whole frontend suite to be sure nothing else broke:
Run: `cd frontend && npm run test:run`
Expected: PASS.

- [ ] **Step 6: Commit (ask first)**

Show the user: `feat(relations): add layout functions for the relations canvas`

```bash
git add frontend/src/lib/relationLayout.js frontend/src/lib/relationLayout.test.js frontend/package.json frontend/package-lock.json
```

---

### Task 3: The node component

**Files:**
- Create: `frontend/src/config/mediaTypeColors.js`
- Create: `frontend/src/components/relations/RelationNode.jsx`

**Interfaces:**
- Consumes: `NODE_WIDTH`, `NODE_HEIGHT` from `../../lib/relationLayout`; `getCoverUrl` from `../../lib/covers`; `Handle`, `Position` from `@xyflow/react`.
- Produces:
  - `MEDIA_TYPE_COLORS` — `{ [media_type]: { chip: string, dot: string } }` of Tailwind class strings, plus `mediaTypeChip(mediaType)` returning the chip classes with a neutral fallback.
  - `RelationNode` — a React Flow custom node. Registered by Task 4 as `nodeTypes = { relation: RelationNode }`. Its `data` is the graph node from Task 1 plus `{ dimmed: boolean }`.

- [ ] **Step 1: Write the colour map**

Create `frontend/src/config/mediaTypeColors.js`:

```js
// Frontend: one colour per media type, for anywhere seven types share a view.
//
// The relations canvas is the first such place: a graph can hold anime, movies
// and manga side by side, and the type has to be readable at a glance without
// reading the badge text. Keys match MEDIA_TYPE keys used across the app.
export const MEDIA_TYPE_COLORS = {
  anime: { chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  "anime-movie": { chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  movie: { chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  "tv-show": { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  cartoon: { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  manga: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  novel: { chip: "bg-stone-200 text-stone-700", dot: "bg-stone-500" },
};

const FALLBACK = { chip: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };

/** Chip classes for a media type, neutral for a type we do not know yet. */
export function mediaTypeChip(mediaType) {
  return (MEDIA_TYPE_COLORS[mediaType] || FALLBACK).chip;
}
```

- [ ] **Step 2: Write the node component**

Create `frontend/src/components/relations/RelationNode.jsx`:

```jsx
// Frontend: one entry as it appears on the relations canvas.
//
// Fixed-size on purpose: dagre reserves space from the dimensions declared in
// relationLayout, so a node that renders taller than NODE_HEIGHT would overlap
// its neighbours. Width and height are set inline rather than in Tailwind
// classes so the two numbers cannot drift apart.
import { Handle, Position } from "@xyflow/react";

import { getCoverUrl } from "../../lib/covers";
import { mediaTypeChip } from "../../config/mediaTypeColors";
import { NODE_HEIGHT, NODE_WIDTH } from "../../lib/relationLayout";

export default function RelationNode({ data, selected }) {
  const { display_name, media_type, type_label, cover_image_file } = data;

  // Three states, three treatments: a scope entry is solid, a ghost from
  // another franchise is dashed and dimmed, and an endpoint whose row is gone
  // is red - visible so it can be found and deleted, rather than silently
  // absent.
  const tone = data.missing
    ? "border-red-300 bg-red-50"
    : data.in_scope
      ? "border-gray-200 bg-white"
      : "border-dashed border-gray-300 bg-gray-50 opacity-70";

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`flex items-center gap-2 rounded-xl border px-2 shadow-sm transition-opacity ${tone} ${
        selected ? "ring-2 ring-brand" : ""
      } ${data.dimmed ? "opacity-20" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-brand"
      />

      {data.missing ? (
        <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-red-100">
          <i className="fas fa-link-slash text-xs text-red-500"></i>
        </div>
      ) : (
        <img
          src={getCoverUrl(cover_image_file)}
          alt=""
          className="h-12 w-9 shrink-0 rounded-md object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-black leading-tight text-gray-800">
          {data.missing
            ? `Missing ${media_type} ${String(data.entry_id).slice(0, 8)}…`
            : display_name}
        </p>
        <span
          className={`mt-1 inline-block rounded-full px-1.5 text-[9px] font-black uppercase tracking-wide ${mediaTypeChip(
            media_type,
          )}`}
        >
          {type_label || media_type}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-brand"
      />
    </div>
  );
}
```

Check `frontend/src/lib/covers.js` for `getCoverUrl`'s exact signature before wiring it — if it takes `(file, mediaType)` or returns a fallback differently, match the call sites in `frontend/src/pages/library/`.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds. (There is no test for this component yet — it renders nothing on its own until Task 4 mounts it. The build is the check that the imports resolve.)

- [ ] **Step 4: Commit (ask first)**

Show the user: `feat(relations): add the canvas node component and a media-type colour map`

```bash
git add frontend/src/config/mediaTypeColors.js frontend/src/components/relations/RelationNode.jsx
```

---

### Task 4: The read-only canvas

The graph appears on the page and reads correctly. Editing still happens through the existing form below it — this task adds a view, removes nothing.

**Files:**
- Create: `frontend/src/components/relations/RelationGraph.jsx`
- Modify: `frontend/src/api/endpoints.js` (add `mediaRelation.graph`)
- Modify: `frontend/src/pages/admin/Relations.jsx` (mount the canvas above the existing right-pane content)

**Interfaces:**
- Consumes: `layoutGraph`, `mergePositions`, `NODE_WIDTH`, `NODE_HEIGHT` (Task 2); `RelationNode` (Task 3); `GET /api/media-relation/graph` (Task 1).
- Produces: `<RelationGraph scopeType scopeId onPickGhostFranchise />` — `scopeType` is `"franchise" | "collection"`, `scopeId` a UUID string or null, `onPickGhostFranchise(franchiseId)` is called when a ghost node is clicked. Tasks 7 and 8 extend this component's props rather than replacing it.

- [ ] **Step 1: Add the endpoint**

In `frontend/src/api/endpoints.js`, inside the existing `mediaRelation` block:

```js
    graph: () => "/api/media-relation/graph",
```

- [ ] **Step 2: Write the canvas component**

Create `frontend/src/components/relations/RelationGraph.jsx`:

```jsx
// Frontend: the relations canvas.
//
// Nodes are the scope's entries, edges are its media_relation rows, and the
// layout is recomputed only for nodes new to the canvas - see mergePositions
// in lib/relationLayout, without which the graph would rearrange under the
// cursor after every write.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import RelationNode from "./RelationNode";
import { layoutGraph, mergePositions } from "../../lib/relationLayout";

const nodeTypes = { relation: RelationNode };

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Only the styling
// lives here; the kinds themselves come from the API.
export const FAMILY_STYLE = {
  timeline: { stroke: "#4f46e5", dash: undefined, arrow: true, showLabel: false },
  // Symmetric, so no arrowhead: neither end is the origin.
  equivalence: { stroke: "#0ea5e9", dash: "6 4", arrow: false, showLabel: true },
  branch: { stroke: "#10b981", dash: undefined, arrow: true, showLabel: true },
  derivation: { stroke: "#f59e0b", dash: "2 4", arrow: true, showLabel: true },
};

export const FAMILY_LABELS = {
  timeline: "Timeline",
  equivalence: "Equivalence",
  branch: "Branch",
  derivation: "Derivation",
};

function toFlowEdges(edges, hiddenFamilies) {
  return edges
    .filter((e) => !hiddenFamilies.has(e.family))
    .map((e) => {
      const style = FAMILY_STYLE[e.family] || FAMILY_STYLE.derivation;
      return {
        id: String(e.system_id),
        // Reversed, matching layoutGraph: a row reads "`from` is the {label}
        // of `to`", so `to` is the original and `from` the work derived from
        // it. Drawing to->from makes every arrow run from the original to the
        // derivative, left to right along the timeline.
        source: e.to,
        target: e.from,
        // A sequel arrow already says which way the row reads; the other
        // families are ambiguous without their name.
        label: style.showLabel ? e.label : undefined,
        markerEnd: style.arrow ? { type: "arrowclosed", color: style.stroke } : undefined,
        style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.dash },
        labelStyle: { fontSize: 10, fontWeight: 800, fill: style.stroke },
        data: e,
      };
    });
}

function GraphCanvas({ scopeType, scopeId, onPickGhostFranchise, refreshKey }) {
  const [nodes, setNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [hiddenFamilies, setHiddenFamilies] = useState(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  // Coordinates survive a refetch: only nodes new to the canvas get laid out.
  const positionsRef = useRef({});

  useEffect(() => {
    // A scope change is a different canvas, so nothing carries over.
    positionsRef.current = {};
  }, [scopeType, scopeId]);

  useEffect(() => {
    if (!scopeId) {
      setNodes([]);
      setGraphEdges([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params =
      scopeType === "franchise"
        ? { franchise_id: scopeId }
        : { collection_id: scopeId };

    fetch(buildUrl(endpoints.mediaRelation.graph(), params), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then((body) => {
        if (cancelled) return;
        const positioned = mergePositions(
          positionsRef.current,
          layoutGraph(body),
        );
        positionsRef.current = Object.fromEntries(
          positioned.map((n) => [n.key, n.position]),
        );
        setNodes(
          positioned.map((n) => ({
            id: n.key,
            type: "relation",
            position: n.position,
            data: n,
          })),
        );
        setGraphEdges(body.edges);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [scopeType, scopeId, refreshKey]);

  const onNodesChange = useCallback((changes) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      // Remember a hand-drag, so it too survives the next refetch.
      for (const n of next) positionsRef.current[n.id] = n.position;
      return next;
    });
  }, []);

  const needle = query.trim().toLowerCase();
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          dimmed:
            needle.length > 0 &&
            ![n.data.display_name || "", ...(n.data.search_names || [])]
              .join(" ")
              .toLowerCase()
              .includes(needle),
        },
      })),
    [nodes, needle],
  );

  const flowEdges = useMemo(
    () => toFlowEdges(graphEdges, hiddenFamilies),
    [graphEdges, hiddenFamilies],
  );

  function toggleFamily(family) {
    setHiddenFamilies((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  function onNodeClick(_event, node) {
    // A ghost belongs to another franchise; clicking it moves the lens there.
    if (!node.data.in_scope && node.data.franchise_id) {
      onPickGhostFranchise?.(node.data.franchise_id);
    }
  }

  if (!scopeId) {
    return (
      <div className="flex h-[36rem] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
        <p className="text-sm font-medium text-gray-400">
          Pick a {scopeType} to see its relations.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Highlight an entry…"
          className="flex-1 min-w-[12rem] rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {Object.keys(FAMILY_LABELS).map((family) => {
          const on = !hiddenFamilies.has(family);
          return (
            <button
              key={family}
              type="button"
              onClick={() => toggleFamily(family)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-opacity ${
                on ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-300"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: FAMILY_STYLE[family].stroke }}
              />
              {FAMILY_LABELS[family]}
            </button>
          );
        })}
      </div>

      <div className="h-[36rem] rounded-2xl border border-gray-200 bg-gray-50">
        <ReactFlow
          nodes={displayNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.15}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {loading ? (
        <p className="text-xs font-bold text-gray-400">Loading graph…</p>
      ) : null}
    </div>
  );
}

// React Flow's hooks require the provider above the component that uses them.
export default function RelationGraph(props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
```

If the installed React Flow major from Task 2 Step 1 is 11 rather than 12, the package is `reactflow` not `@xyflow/react` — in that case reinstall `@xyflow/react` explicitly; this plan targets v12.

- [ ] **Step 3: Mount it on the page**

In `frontend/src/pages/admin/Relations.jsx`, import the canvas:

```jsx
import RelationGraph from "../../components/relations/RelationGraph";
```

Then, inside the right-pane `<div className="flex flex-col gap-4">`, place the canvas *above* the existing `{!selected ? … : …}` block, so the old editor keeps working underneath it:

```jsx
          <RelationGraph
            scopeType={scopeType}
            scopeId={scopeId}
            onPickGhostFranchise={(franchiseId) => {
              // A ghost lives in another franchise; following it moves the lens.
              setScopeType("franchise");
              setScopeId(franchiseId);
              setSelected(null);
            }}
          />
```

- [ ] **Step 4: Build and look at it**

Run: `cd frontend && npm run build`
Expected: build succeeds.

Then run the app (`uvicorn app.main:app --reload` plus `cd frontend && npm run dev`), open `/relations` as admin, and pick a franchise that has several entries and at least one relation. Confirm: nodes render with covers, a sequel edge points left-to-right, unconnected entries sit in a block below the graph, the family chips hide and show edges, and the search box dims non-matches.

- [ ] **Step 5: Run the frontend suite**

Run: `cd frontend && npm run test:run`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit (ask first)**

Show the user: `feat(relations): draw the scope's relations as a graph canvas`

```bash
git add frontend/src/components/relations/RelationGraph.jsx frontend/src/api/endpoints.js frontend/src/pages/admin/Relations.jsx
```

---

### Task 5: Extract the global media search

The seven-endpoint debounced search is currently inlined in `AddRelationForm`. Task 7's connect popup needs the same search, and two copies would drift.

**Files:**
- Create: `frontend/src/hooks/useGlobalMediaSearch.js`
- Modify: `frontend/src/pages/admin/Relations.jsx` (`AddRelationForm` uses the hook)

**Interfaces:**
- Produces: `useGlobalMediaSearch(query, { enabled }) -> { hits, searching }` where each hit is `{ media_type, entry_id, display_name, key }` and `key` is `"{media_type}:{entry_id}"`. Task 7 consumes it.

- [ ] **Step 1: Write the hook**

Create `frontend/src/hooks/useGlobalMediaSearch.js`:

```js
// Frontend: search every media table at once.
//
// A relation is bound to no tier, so its far endpoint may live in any of the
// seven tables and in any franchise. There is no cross-table search endpoint,
// so this fans out across the seven list endpoints and merges the results.
import { useEffect, useState } from "react";

import { getDisplayName } from "../utils/media";

// Mirrors TYPE_JOBS in components/layout/Nav.jsx, minus the grouping tiers - a
// relation always links two entries, never a franchise or collection.
const SEARCH_ENDPOINTS = [
  ["/api/anime", "anime"],
  ["/api/anime-movie", "anime-movie"],
  ["/api/movies", "movie"],
  ["/api/tv-shows", "tv-show"],
  ["/api/cartoon", "cartoon"],
  ["/api/manga", "manga"],
  ["/api/novel", "novel"],
];

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/**
 * Hits from every media table for `query`, or an empty list while the query is
 * too short or the hook is disabled.
 */
export function useGlobalMediaSearch(query, { enabled = true } = {}) {
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = (query || "").trim();
    if (!enabled || q.length < MIN_QUERY) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // Debounced: seven requests per keystroke would be seven too many.
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        SEARCH_ENDPOINTS.map(([endpoint, type]) =>
          fetch(`${endpoint}/?search_query=${encodeURIComponent(q)}&limit=10`, {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) =>
              rows.map((row) => ({
                media_type: type,
                entry_id: row.system_id,
                key: `${type}:${row.system_id}`,
                display_name: getDisplayName(row, type),
              })),
            )
            .catch(() => []),
        ),
      );
      if (cancelled) return;
      setHits(results.flat());
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { hits, searching };
}

export default useGlobalMediaSearch;
```

- [ ] **Step 2: Rewire `AddRelationForm` to the hook**

In `frontend/src/pages/admin/Relations.jsx`: delete the `globalHits` state and the whole `useEffect` that fans out over `SEARCH_ENDPOINTS`, delete the module-level `SEARCH_ENDPOINTS` constant and the now-unused `getDisplayName` import if nothing else in the file uses it, and replace them with:

```jsx
  const { hits: globalHits } = useGlobalMediaSearch(globalQuery, {
    enabled: searchAll,
  });
```

plus the import:

```jsx
import { useGlobalMediaSearch } from "../../hooks/useGlobalMediaSearch";
```

Everything downstream (`source`, `items`) keeps working: a hit already carries `media_type`, `entry_id` and `display_name`.

- [ ] **Step 3: Verify the extraction changed no behaviour**

Run: `cd frontend && npm run build && npm run test:run`
Expected: build succeeds, tests PASS.

Then in the running app, open `/relations`, select an entry, tick "Search all media", type at least two characters, and confirm the combobox still fills with cross-table hits.

- [ ] **Step 4: Commit (ask first)**

Show the user: `refactor(relations): extract the cross-table entry search into a hook`

```bash
git add frontend/src/hooks/useGlobalMediaSearch.js frontend/src/pages/admin/Relations.jsx
```

---

### Task 6: The connect popup

The thing that appears when you drop a dragged line. Built and tested standalone; Task 7 wires it to the canvas.

**Files:**
- Create: `frontend/src/components/relations/ConnectPopup.jsx`
- Create: `frontend/src/components/relations/ConnectPopup.test.jsx`

**Interfaces:**
- Consumes: `useGlobalMediaSearch` (Task 5).
- Produces: `<ConnectPopup kinds source target position error busy onConfirm onCancel />`
  - `kinds`: the array from `GET /api/media-relation/kinds` (`{key, label, inverse_label, family, symmetric, stored_as}`)
  - `source`: `{ key, display_name }` — the node the drag started from
  - `target`: `{ key, display_name }` or `null` — null means the drag ended on empty canvas, which turns on the global search
  - `position`: `{ x, y }` in screen pixels, for absolute placement
  - `error`: string or null — a 409 from the server, shown without closing
  - `onConfirm({ kind, from, to, remark })` — `from`/`to` are node keys, already swapped if the user pressed swap
  - `onCancel()`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/relations/ConnectPopup.test.jsx`:

```jsx
// Frontend: tests for the drag-to-connect popup.
//
// The popup exists so a misdrop costs a keystroke instead of a database row,
// so the tests care most about what it does NOT do: write anything before the
// user confirms.
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConnectPopup from "./ConnectPopup";

const KINDS = [
  { key: "prequel", label: "Prequel", family: "timeline", symmetric: false },
  { key: "sequel", label: "Sequel", family: "timeline", symmetric: false },
  { key: "adaptation", label: "Adaptation", family: "derivation", symmetric: false },
];

function setup(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConnectPopup
      kinds={KINDS}
      source={{ key: "anime:a", display_name: "Fate/Zero" }}
      target={{ key: "anime:b", display_name: "Fate/stay night" }}
      position={{ x: 100, y: 100 }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConnectPopup", () => {
  it("reads the relation as a sentence naming both entries", () => {
    setup();
    const sentence = screen.getByTestId("connect-sentence");
    expect(sentence).toHaveTextContent("Fate/Zero");
    expect(sentence).toHaveTextContent("Fate/stay night");
  });

  it("writes nothing until the user confirms", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /adaptation/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms with the chosen kind and both node keys", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /adaptation/i }));
    await userEvent.click(screen.getByRole("button", { name: /^add relation$/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "adaptation",
      from: "anime:a",
      to: "anime:b",
      remark: null,
    });
  });

  it("swaps which entry is the subject", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /swap/i }));
    await userEvent.click(screen.getByRole("button", { name: /^add relation$/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ from: "anime:b", to: "anime:a" }),
    );
  });

  it("cancels on Escape", () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open showing a server error", () => {
    setup({ error: "That relation already exists." });
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByTestId("connect-sentence")).toBeInTheDocument();
  });

  it("cannot be submitted without a target when the drop was on empty canvas", () => {
    setup({ target: null });
    expect(screen.getByRole("button", { name: /^add relation$/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/relations/ConnectPopup.test.jsx`
Expected: FAIL — "Failed to resolve import ./ConnectPopup".

- [ ] **Step 3: Write the component**

Create `frontend/src/components/relations/ConnectPopup.jsx`:

```jsx
// Frontend: what appears when a dragged connection is dropped.
//
// Nothing is written until the user confirms, so a misdrop costs one keystroke
// rather than a row to find and delete. The kind is picked here rather than
// armed beforehand, so there is no hidden mode to forget.
//
// The sentence matters: `prequel` is stored server-side as a swapped `sequel`
// row, so the node the drag started from is not necessarily the stored row's
// `from`. Reading "A is the ___ of B" is what makes the direction unambiguous
// regardless of how it is stored.
import { useEffect, useMemo, useState } from "react";

import { useGlobalMediaSearch } from "../../hooks/useGlobalMediaSearch";

export default function ConnectPopup({
  kinds,
  source,
  target,
  position,
  error = null,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [kind, setKind] = useState("prequel");
  const [remark, setRemark] = useState("");
  const [swapped, setSwapped] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);

  const needsSearch = !target;
  const { hits, searching } = useGlobalMediaSearch(query, {
    enabled: needsSearch,
  });

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const far = target || picked;
  // Prequel first: "what came before" is the commonest edit.
  const ordered = useMemo(() => {
    const rest = kinds.filter((k) => k.key !== "prequel");
    const prequel = kinds.filter((k) => k.key === "prequel");
    return [...prequel, ...rest];
  }, [kinds]);

  const subject = swapped ? far : source;
  const object = swapped ? source : far;
  const label = ordered.find((k) => k.key === kind)?.label || kind;

  function submit(e) {
    e.preventDefault();
    if (!far) return;
    onConfirm({
      kind,
      from: subject.key,
      to: object.key,
      remark: remark.trim() || null,
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{ left: position.x, top: position.y }}
      className="absolute z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
    >
      <p
        data-testid="connect-sentence"
        className="text-xs font-bold leading-snug text-gray-600"
      >
        <span className="text-gray-900">
          {subject?.display_name || "This entry"}
        </span>{" "}
        is the <span className="text-brand">{label}</span> of{" "}
        <span className="text-gray-900">
          {object?.display_name || "…pick an entry"}
        </span>
      </p>

      {needsSearch && (
        <div className="mt-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every media type…"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {searching ? (
            <p className="mt-1 text-[10px] font-bold text-gray-400">Searching…</p>
          ) : null}
          {hits.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-100">
              {hits.map((hit) => (
                <button
                  key={hit.key}
                  type="button"
                  onClick={() => {
                    setPicked(hit);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-bold hover:bg-gray-50 ${
                    picked?.key === hit.key ? "bg-brand/10 text-brand" : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{hit.display_name}</span>
                  <span className="shrink-0 text-[9px] uppercase text-gray-400">
                    {hit.media_type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {ordered.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
              kind === k.key
                ? "bg-brand text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (optional)"
        className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSwapped((s) => !s)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] font-black uppercase text-gray-500"
        >
          Swap
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1.5 text-[10px] font-black uppercase text-gray-400"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !far}
          className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
        >
          Add relation
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/relations/ConnectPopup.test.jsx`
Expected: PASS — all seven cases.

- [ ] **Step 5: Commit (ask first)**

Show the user: `feat(relations): add the drag-to-connect popup`

```bash
git add frontend/src/components/relations/ConnectPopup.jsx frontend/src/components/relations/ConnectPopup.test.jsx
```

---

### Task 7: Wire drag-to-connect

**Files:**
- Modify: `frontend/src/components/relations/RelationGraph.jsx`
- Modify: `frontend/src/pages/admin/Relations.jsx` (pass `kinds` and an `onWrote` callback down)

**Interfaces:**
- Consumes: `ConnectPopup` (Task 6); `POST /api/media-relation/`.
- Produces: `<RelationGraph … kinds onWrote />` — `kinds` is the `/kinds` array the page already fetches; `onWrote()` fires after a successful write so the page can refresh its left-pane counts.

- [ ] **Step 1: Confirm the connection API for the installed version**

React Flow changed `onConnectEnd`'s signature between v11 and v12. Before writing code, check the docs for the version recorded in Task 2:

Use the context7 MCP tool: `resolve-library-id` for `@xyflow/react`, then `query-docs` for "onConnectEnd connectionState screenToFlowPosition". Confirm whether the handler receives `(event, connectionState)` with `connectionState.fromNode` / `.toNode` / `.isValid`. Adapt Step 2's code to what the docs say — the shape below targets v12.

- [ ] **Step 2: Add the connect state and handlers to `GraphCanvas`**

Add to the imports in `RelationGraph.jsx`:

```jsx
import { useReactFlow } from "@xyflow/react";
import ConnectPopup from "./ConnectPopup";
import { endpoints } from "../../api/endpoints";
```

Add state inside `GraphCanvas`, after the existing `useState` calls:

```jsx
  // The pending connection: set on drop, cleared on confirm or cancel. Holding
  // it here rather than writing immediately is the whole point of the popup.
  const [pending, setPending] = useState(null); // {source, target, position}
  const [connectError, setConnectError] = useState(null);
  const [writing, setWriting] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
```

Add the handlers:

```jsx
  const nodeByKey = useCallback(
    (key) => nodes.find((n) => n.id === key)?.data || null,
    [nodes],
  );

  // Drop on a node: both endpoints are known, so the popup only needs a kind.
  const onConnect = useCallback(
    (connection) => {
      setConnectError(null);
      setPending({
        source: nodeByKey(connection.source),
        target: nodeByKey(connection.target),
        position: lastDropRef.current,
      });
    },
    [nodeByKey],
  );

  // Drop on empty canvas: the far endpoint is unknown, so the popup opens with
  // a global search. This is how a link that leaves the franchise gets made.
  const onConnectEnd = useCallback(
    (event, connectionState) => {
      const point = {
        x: event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0,
        y: event.clientY ?? event.changedTouches?.[0]?.clientY ?? 0,
      };
      lastDropRef.current = point;
      // A valid drop is onConnect's job; only the miss lands here.
      if (connectionState?.isValid) return;
      const fromKey = connectionState?.fromNode?.id;
      if (!fromKey) return;
      setConnectError(null);
      setPending({ source: nodeByKey(fromKey), target: null, position: point });
    },
    [nodeByKey],
  );
```

Add `const lastDropRef = useRef({ x: 0, y: 0 });` next to `positionsRef`. Drop the `useReactFlow` / `screenToFlowPosition` line: the popup is placed in container pixels, not flow coordinates, so nothing needs the conversion. Do not leave the import behind.

The popup is positioned in screen pixels, so its container needs `relative`: add `relative` to the className of the outer `<div className="flex flex-col gap-2">`, and place the popup just inside it:

```jsx
      {pending ? (
        <ConnectPopup
          kinds={kinds}
          source={pending.source}
          target={pending.target}
          position={pending.position}
          error={connectError}
          busy={writing}
          onConfirm={createRelation}
          onCancel={() => {
            setPending(null);
            setConnectError(null);
          }}
        />
      ) : null}
```

Note the popup's `position` is `clientX/clientY` — viewport coordinates. Convert to container-relative coordinates by subtracting the wrapper's bounding rect: hold a `wrapperRef` on the outer div and compute `{ x: point.x - rect.left, y: point.y - rect.top }` when setting `pending.position`. Do this in both handlers.

- [ ] **Step 3: Add the write**

Still in `GraphCanvas`:

```jsx
  // A 409 (duplicate or self-relation) leaves the popup open with the message:
  // closing it back to the canvas would lose the kind and remark just typed.
  async function createRelation({ kind, from, to, remark }) {
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");
    setWriting(true);
    setConnectError(null);
    try {
      const res = await fetch(endpoints.mediaRelation.create(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_type: fromType,
          from_id: fromId,
          kind,
          to_type: toType,
          to_id: toId,
          remark,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConnectError(data?.detail || res.statusText);
        return;
      }
      setPending(null);
      onWrote?.();
      refetch();
    } finally {
      setWriting(false);
    }
  }
```

The fetch-and-layout `useEffect` currently runs off `[scopeType, scopeId, refreshKey]`. Pull its body into a `refetch` callback (`useCallback`, same dependencies) and have the effect call it, so `createRelation` can reuse it. Positions are preserved across the refetch by `mergePositions`, which is exactly why adding a relation will not rearrange the canvas.

Add `kinds` and `onWrote` to `GraphCanvas`'s and `RelationGraph`'s props.

- [ ] **Step 4: Pass the props from the page**

In `frontend/src/pages/admin/Relations.jsx`, the page already fetches `kinds` into state. Extend the mount from Task 4:

```jsx
          <RelationGraph
            scopeType={scopeType}
            scopeId={scopeId}
            kinds={kinds}
            onWrote={() => {
              loadScope();
              loadRelations();
            }}
            onPickGhostFranchise={(franchiseId) => {
              setScopeType("franchise");
              setScopeId(franchiseId);
              setSelected(null);
            }}
          />
```

- [ ] **Step 5: Build and exercise the gesture**

Run: `cd frontend && npm run build && npm run test:run`
Expected: build succeeds, tests PASS.

In the running app, on a franchise with several entries:
1. Drag from one node's right handle onto another node → popup appears at the drop point, reads "A is the Prequel of B", and no row exists yet.
2. Press Escape → popup closes, nothing written.
3. Drag again, pick a kind, confirm → the edge appears and **the rest of the graph does not move**.
4. Drag the same pair again with the same kind → the popup stays open showing the duplicate message.
5. Drag from a node onto empty canvas → popup opens with the global search; pick an entry in another franchise, confirm → a ghost node appears with the new edge.

- [ ] **Step 6: Commit (ask first)**

Show the user: `feat(relations): create relations by dragging a line between entries`

```bash
git add frontend/src/components/relations/RelationGraph.jsx frontend/src/pages/admin/Relations.jsx
```

---

### Task 8: Edge inspector, node panel, and retiring the old right pane

The last piece of editing, and the removal of what the canvas now replaces.

**Files:**
- Create: `frontend/src/components/relations/EdgeInspector.jsx`
- Create: `frontend/src/components/relations/NodePanel.jsx`
- Modify: `frontend/src/components/relations/RelationGraph.jsx` (selection, inspector, node panel, isolate)
- Modify: `frontend/src/pages/admin/Relations.jsx` (delete `AddRelationForm` and the per-family list; the left pane stays)

**Interfaces:**
- Consumes: `PATCH /api/media-relation/{id}`, `DELETE /api/media-relation/{id}`; the `kinds` array.
- Produces:
  - `<EdgeInspector edge kinds busy onPatch onDelete onClose />` where `edge` is the graph edge from Task 1 augmented with `{ sourceName, targetName }`.
  - `<NodePanel node relations isolated onToggleIsolate onClose />` where `node` is a graph node and `relations` is `[{ system_id, label, otherName, family }]` — the edges touching it, already labelled for the side being viewed.

- [ ] **Step 1: Write the inspector**

Create `frontend/src/components/relations/EdgeInspector.jsx`:

```jsx
// Frontend: the panel for one selected edge.
//
// Changing the kind re-normalizes server-side (a `prequel` becomes a swapped
// `sequel` row), so this posts the kind as typed and refetches rather than
// trying to predict the stored direction.
export default function EdgeInspector({
  edge,
  kinds,
  busy = false,
  onPatch,
  onDelete,
  onClose,
}) {
  return (
    <div className="absolute right-3 top-3 z-40 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold leading-snug text-gray-600">
          <span className="text-gray-900">{edge.sourceName}</span> is the{" "}
          <span className="text-brand">{edge.label}</span> of{" "}
          <span className="text-gray-900">{edge.targetName}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-gray-300 hover:text-gray-500"
        >
          <i className="fas fa-xmark"></i>
        </button>
      </div>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-gray-400">
        Kind
      </label>
      <select
        value={edge.relation_type}
        disabled={busy}
        onChange={(e) => onPatch({ kind: e.target.value })}
        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-gray-400">
        Remark
      </label>
      <input
        type="text"
        defaultValue={edge.remark || ""}
        disabled={busy}
        // On blur, not on every keystroke: a remark is a sentence, not a
        // stream of PATCHes.
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== (edge.remark || null)) onPatch({ remark: next });
        }}
        placeholder="Optional"
        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="mt-3 w-full rounded-lg border border-red-200 px-2 py-1.5 text-[11px] font-black uppercase text-red-500 disabled:opacity-40"
      >
        Remove relation
      </button>
    </div>
  );
}
```

- [ ] **Step 1b: Write the node panel**

Create `frontend/src/components/relations/NodePanel.jsx`:

```jsx
// Frontend: the panel for one selected node.
//
// Read-only about the entry itself - this page curates relations, never entry
// fields - so the only affordances are a link out to the detail page and the
// isolate toggle, which is how a node's own story gets read out of a dense
// franchise.
import { Link } from "react-router-dom";

import { getCoverUrl } from "../../lib/covers";
import { mediaTypeChip } from "../../config/mediaTypeColors";

export default function NodePanel({
  node,
  relations,
  isolated,
  onToggleIsolate,
  onClose,
}) {
  return (
    <div className="absolute left-3 top-3 z-40 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <img
          src={getCoverUrl(node.cover_image_file)}
          alt=""
          className="h-16 w-12 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black leading-tight text-gray-900">
            {node.display_name || "Missing entry"}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-1.5 text-[9px] font-black uppercase tracking-wide ${mediaTypeChip(
              node.media_type,
            )}`}
          >
            {node.type_label || node.media_type}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-gray-300 hover:text-gray-500"
        >
          <i className="fas fa-xmark"></i>
        </button>
      </div>

      {relations.length === 0 ? (
        <p className="mt-3 text-[11px] font-bold text-gray-400">
          No relations yet — drag from its handle to add one.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {relations.map((r) => (
            <p key={r.system_id} className="truncate text-[11px] font-bold text-gray-600">
              <span className="text-brand">{r.label}</span> — {r.otherName}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleIsolate}
          className={`rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase ${
            isolated ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-500"
          }`}
        >
          Isolate
        </button>
        {node.nav_path ? (
          <Link
            to={node.nav_path}
            className="ml-auto text-[10px] font-black uppercase text-gray-400 hover:text-brand"
          >
            Open entry <i className="fas fa-arrow-up-right-from-square"></i>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
```

`nav_path` comes from the backend as e.g. `/anime/{id}` (Task 1), which is already the app's route shape — confirm against `mediaRegistry.js`'s `navPath` values before relying on it.

- [ ] **Step 2: Wire selection, isolate, and the writes into the canvas**

In `RelationGraph.jsx`:

```jsx
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState(null);
  const [isolatedKey, setIsolatedKey] = useState(null);

  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedNodeKey(null);
    setSelectedEdgeId(edge.id);
  }, []);
```

Extend `onNodeClick` so a click on an in-scope node opens its panel, while a ghost still follows its franchise:

```jsx
  function onNodeClick(_event, node) {
    if (!node.data.in_scope && node.data.franchise_id) {
      onPickGhostFranchise?.(node.data.franchise_id);
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeKey(node.id);
  }
```

Isolate is toggled from the panel, not by the click itself — a click that both selects and dims the canvas is two actions on one gesture:

```jsx
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeKey)?.data || null,
    [nodes, selectedNodeKey],
  );

  // Labelled for the side being viewed: a row reads "from is the {label} of
  // to", so from this node's side the far entry carries the inverse label.
  const selectedNodeRelations = useMemo(() => {
    if (!selectedNodeKey) return [];
    const name = (key) =>
      nodes.find((n) => n.id === key)?.data?.display_name || "a missing entry";
    return graphEdges
      .filter((e) => e.from === selectedNodeKey || e.to === selectedNodeKey)
      .map((e) => {
        const forward = e.from === selectedNodeKey;
        return {
          system_id: e.system_id,
          label: forward ? e.inverse_label : e.label,
          otherName: name(forward ? e.to : e.from),
          family: e.family,
        };
      });
  }, [graphEdges, selectedNodeKey, nodes]);
```

Render the panel inside the wrapper when `selectedNode` is set, passing `isolated={isolatedKey === selectedNodeKey}`, `onToggleIsolate={() => setIsolatedKey((k) => (k === selectedNodeKey ? null : selectedNodeKey))}` and `onClose={() => setSelectedNodeKey(null)}`.

Isolate dims everything that is not the node or a neighbour. Extend `displayNodes`'s `dimmed` computation:

```jsx
  const neighbours = useMemo(() => {
    if (!isolatedKey) return null;
    const set = new Set([isolatedKey]);
    for (const e of graphEdges) {
      if (e.from === isolatedKey) set.add(e.to);
      if (e.to === isolatedKey) set.add(e.from);
    }
    return set;
  }, [isolatedKey, graphEdges]);
```

and make `dimmed` true when `neighbours && !neighbours.has(n.id)`, or when the search needle misses — either reason dims.

The selected edge, augmented with both endpoint names for the inspector's sentence:

```jsx
  const selectedEdge = useMemo(() => {
    const found = graphEdges.find((e) => String(e.system_id) === selectedEdgeId);
    if (!found) return null;
    const name = (key) =>
      nodes.find((n) => n.id === key)?.data?.display_name || "a missing entry";
    return { ...found, sourceName: name(found.from), targetName: name(found.to) };
  }, [graphEdges, selectedEdgeId, nodes]);
```

The two writes:

```jsx
  async function patchRelation(body) {
    setWriting(true);
    try {
      const res = await fetch(
        endpoints.mediaRelation.patch(selectedEdge.system_id),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError?.(data?.detail || res.statusText);
        return;
      }
      onWrote?.();
      refetch();
    } finally {
      setWriting(false);
    }
  }

  async function deleteRelation() {
    if (
      !window.confirm(
        `Remove the "${selectedEdge.label}" link between ${selectedEdge.sourceName} and ${selectedEdge.targetName}? The entries themselves are not touched.`,
      )
    )
      return;
    setWriting(true);
    try {
      const res = await fetch(
        endpoints.mediaRelation.remove(selectedEdge.system_id),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        onError?.(res.statusText);
        return;
      }
      setSelectedEdgeId(null);
      onWrote?.();
      refetch();
    } finally {
      setWriting(false);
    }
  }
```

Add `onEdgeClick` to the `<ReactFlow>` props, render the inspector inside the wrapper when `selectedEdge` is set, and add an `onError` prop to both `GraphCanvas` and `RelationGraph`. The page passes `onError={(message) => showToast("error", message)}` and extends `onWrote` to `showToast("success", …)` — matching the `busy`/`showToast` pattern the page already uses.

- [ ] **Step 3: Retire the old right pane**

In `frontend/src/pages/admin/Relations.jsx`, delete:
- the whole `AddRelationForm` component,
- the right pane's `{!selected ? … : …}` block including the `FAMILY_ORDER`/`FAMILY_LABELS` list rendering and its `deleteRelation`/`createRelation` handlers,
- `FAMILY_ORDER`, `FAMILY_LABELS`, `byFamily`, `relations`, `loadRelations`, and `selectedEntry`,
- the now-unused `useGlobalMediaSearch` import.

Keep: the header block, the whole left pane (scope toggle, owner ComboBox, entry filter, grouped entry list with count badges), `loadScope`, `counts`, `kinds`, `selected` (now only the left pane's highlight and the canvas's `focusKey`), and `showToast`. `busy` goes with the deleted handlers — the canvas owns its own `writing` state.

The left-pane entry buttons no longer select an entry for the right pane. Repurpose the click to focus that node on the canvas via a new `focusKey` prop on `RelationGraph` (a `"type:id"` string or null), which the canvas honours with:

```jsx
  useEffect(() => {
    if (!focusKey) return;
    setSelectedEdgeId(null);
    setSelectedNodeKey(focusKey);
  }, [focusKey]);
```

The page keeps its existing `selected` state for the left pane's active highlight and passes `focusKey={selected ? `${selected.media_type}:${selected.entry_id}` : null}`. `isolatedKey` stays internal to the canvas.

Also widen the right pane: the two-column grid stays `lg:grid-cols-[20rem_1fr]`, but drop the `max-w-7xl` on the page wrapper so the canvas has room.

- [ ] **Step 4: Build, test, and exercise**

Run: `cd frontend && npm run build && npm run test:run`
Expected: build succeeds, tests PASS.

In the running app:
1. Click an edge → inspector opens with the correct sentence.
2. Change the kind → the edge restyles and reroutes if the family changed; the rest of the graph does not move.
3. Edit the remark and blur → one PATCH, success toast.
4. Remove the relation → confirm dialog names both entries; the edge disappears.
5. Click a node → its panel opens with cover, name, relation list and a link to the entry's detail page.
6. Press Isolate in that panel → everything but the node and its neighbours dims; press again → undimmed.
7. Click an entry in the left pane → that node's panel opens on the canvas.
8. Confirm the old add-form and family list are gone and nothing else on the page broke.

Verify on **both** `:5173` and `:8000` — the build step above is what makes `:8000` current.

- [ ] **Step 5: Commit (ask first)**

Show the user: `feat(relations): edit relations from the canvas and retire the list pane`

```bash
git add frontend/src/components/relations/EdgeInspector.jsx frontend/src/components/relations/NodePanel.jsx frontend/src/components/relations/RelationGraph.jsx frontend/src/pages/admin/Relations.jsx
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/pages.md`
- Modify: `docs/admin-forms.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/reusable-elements.md`

- [ ] **Step 1: Read each file's existing conventions first**

Run: `grep -n "media-relation" docs/*.md`

Match the table shape and heading depth each file already uses. Do not restructure these documents.

- [ ] **Step 2: Write the entries**

- `docs/api.md` — add `GET /api/media-relation/graph` to the Media Relation router table: guest-readable, takes exactly one of `franchise_id` / `collection_id`, returns `{nodes, edges}`; note that nodes include unconnected scope entries and out-of-scope ghosts, and that `missing: true` marks a dangling endpoint.
- `docs/pages.md` — update the Relations page entry: the right pane is a graph canvas (`@xyflow/react`), the left pane is unchanged.
- `docs/admin-forms.md` — replace the Relations add-form description with the drag-to-connect flow: drag from a handle, drop on a node or on empty canvas, pick the kind in the popup, nothing written until confirm, 409 keeps the popup open; edges are edited and deleted through the edge inspector.
- `docs/dependencies.md` — add `@xyflow/react` (relations canvas: pan/zoom, custom nodes, drag-to-connect) and `@dagrejs/dagre` (layered left-to-right layout for the relations graph).
- `docs/reusable-elements.md` — add `useGlobalMediaSearch` (debounced search across the seven media list endpoints) and `MEDIA_TYPE_COLORS` / `mediaTypeChip` in `config/mediaTypeColors.js`.

- [ ] **Step 3: Commit (ask first)**

Show the user: `docs: describe the relations graph endpoint, page and dependencies`

```bash
git add docs/api.md docs/pages.md docs/admin-forms.md docs/dependencies.md docs/reusable-elements.md
```

---

## Verification checklist

Before calling the feature done, run and confirm output for each:

- [ ] `pytest tests/api/test_media_relation.py -v` — all pass, including the seven graph tests.
- [ ] `cd frontend && npm run test:run` — all pass, including `relationLayout.test.js` and `ConnectPopup.test.jsx`.
- [ ] `cd frontend && npm run build` — succeeds, `frontend_dist/` refreshed.
- [ ] `/relations` works on **both** `:5173` and `:8000`.
- [ ] A franchise with a prequel chain, an alternative pair, a spin-off and several unconnected entries renders correctly: left-to-right spine, stacked alternatives, tray below.
- [ ] Drag-to-connect writes nothing before confirm; Escape cancels; a duplicate keeps the popup open with the server's message.
- [ ] Adding a relation does not rearrange the existing nodes.
- [ ] A cross-franchise relation shows as a ghost node; clicking it switches scope.
- [ ] No Alembic migration was created and no model file was touched.
