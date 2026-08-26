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

  it("hangs an adaptation below its source rather than beside it", () => {
    // An adaptation is not a later work, so it must not consume a rank on the
    // timeline. It shares its source's slot and drops beneath it, which is
    // what the node's top/bottom handles draw.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("manga:a")],
        edges: [edge("manga:a", "anime:a", "derivation", "adaptation")],
      }),
    );
    expect(out["manga:a"].position.x).toBe(out["anime:a"].position.x);
    expect(out["manga:a"].position.y).toBeGreaterThanOrEqual(
      out["anime:a"].position.y + NODE_HEIGHT,
    );
  });

  it("puts the original above the work derived from it", () => {
    // The column is read top to bottom, so input order must not decide which
    // end of a derivation lands on top. "manga:a is the Adaptation of anime:a"
    // is stored manga:a -> anime:a, making anime:a the original.
    const out = byKey(
      layoutGraph({
        nodes: [node("manga:a"), node("anime:a")],
        edges: [edge("manga:a", "anime:a", "derivation", "adaptation")],
      }),
    );
    expect(out["anime:a"].position.y).toBeLessThan(out["manga:a"].position.y);
  });

  it("keeps a spin-off out of the timeline ranking", () => {
    // The spine stays pure timeline: A -> B is the only thing that earns a
    // second column, so the spin-off must not push C to a rank of its own.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("anime:b"), node("anime:c")],
        edges: [
          edge("anime:b", "anime:a"),
          edge("anime:c", "anime:a", "branch", "spin_off"),
        ],
      }),
    );
    expect(out["anime:c"].position.x).toBe(out["anime:a"].position.x);
    expect(out["anime:a"].position.x).toBeLessThan(out["anime:b"].position.x);
  });

  it("keeps an entry linked only by an adaptation out of the tray", () => {
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("manga:a")],
        edges: [edge("manga:a", "anime:a", "derivation", "adaptation")],
      }),
    );
    expect(out["anime:a"].section).toBe("graph");
    expect(out["manga:a"].section).toBe("graph");
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
    // Guards more than the array length: an unknown key must never reach
    // unionFind/dagre, where find() would loop or throw on an undefined
    // parent. The surviving node must still come out fully positioned.
    const out = layoutGraph({
      nodes: [node("anime:a")],
      edges: [edge("anime:a", "anime:ghost-that-was-not-sent")],
    });
    expect(out).toHaveLength(1);
    expect(typeof out[0].position.x).toBe("number");
    expect(typeof out[0].position.y).toBe("number");
    expect(out[0].section).toBe("tray");
  });

  it("is deterministic regardless of input ordering", () => {
    // Two calls on the very same array would agree even without the sort in
    // layoutGraph, since Map/Set iteration is insertion-order-stable within
    // one process. Shuffling the node/edge order is what actually pins the
    // `rankedRoots = [...ranked].sort()` guard against dagre's own
    // insertion-order sensitivity.
    const nodes = [node("anime:a"), node("anime:b"), node("anime:c")];
    const edges = [edge("anime:b", "anime:a"), edge("anime:c", "anime:b")];
    const forward = byKey(layoutGraph({ nodes, edges }));
    const shuffled = byKey(
      layoutGraph({ nodes: [...nodes].reverse(), edges: [...edges].reverse() }),
    );
    for (const key of Object.keys(forward)) {
      expect(shuffled[key].position).toEqual(forward[key].position);
      expect(shuffled[key].section).toBe(forward[key].section);
    }
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
      { "anime:a": { position: { x: 123, y: 456 }, section: "graph" } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 123, y: 456 });
    expect(merged[1].position).toEqual({ x: 400, y: 0 });
  });

  it("lets a node that just left the tray take its new rank", () => {
    // The page's main job: drag a tray entry onto the spine. Preserving its
    // tray coordinate would leave it parked at the bottom on a long tether,
    // which is exactly what the refetch is supposed to fix.
    const positioned = [
      { key: "anime:a", position: { x: 400, y: 20 }, section: "graph" },
    ];
    const merged = mergePositions(
      { "anime:a": { position: { x: 0, y: 900 }, section: "tray" } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 400, y: 20 });
  });

  it("keeps the old position for a node that stays in the graph", () => {
    const positioned = [
      { key: "anime:a", position: { x: 400, y: 20 }, section: "graph" },
    ];
    const merged = mergePositions(
      { "anime:a": { position: { x: 123, y: 456 }, section: "graph" } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 123, y: 456 });
  });

  it("keeps the old position for a node that stays in the tray", () => {
    // A tray entry the admin has hand-dragged somewhere useful must not snap
    // back to its grid slot just because another relation was written.
    const positioned = [
      { key: "anime:a", position: { x: 0, y: 900 }, section: "tray" },
    ];
    const merged = mergePositions(
      { "anime:a": { position: { x: 60, y: 700 }, section: "tray" } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 60, y: 700 });
  });
});
