// Frontend: tests for the relations canvas layout.
//
// Layout is where the graph either reads as a story or reads as a hairball, so
// it lives in pure functions and gets tested directly rather than through the
// canvas.
import {
  GRID,
  layoutGraph,
  mergePositions,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./relationLayout";

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
    // unionFind or the adjacency maps, where find() would loop and the walk
    // would read an entry that was never built. The surviving node must still
    // come out fully positioned.
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
    // sorts the walk relies on to pick the same start node and the same
    // sibling order every time.
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

  it("packs single-row clusters tightly, since neither has a row to be confused with", () => {
    // Three sequel pairs that share nothing, none with a branch. Nothing is
    // ever drawn in the gap between two clusters, and a one-row cluster has no
    // internal row gutter for the next cluster to be mistaken for - so the gap
    // only has to separate two lines of nodes. Spacing them by whole rows read
    // as if each pair had branches nobody had added.
    const pairs = ["a", "b", "c"];
    const out = byKey(
      layoutGraph({
        nodes: pairs.flatMap((p) => [node(`tv:${p}1`), node(`tv:${p}2`)]),
        edges: pairs.map((p) => edge(`tv:${p}2`, `tv:${p}1`)),
      }),
    );
    const tops = pairs.map((p) => out[`tv:${p}1`].position.y).sort((x, y) => x - y);
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i] - tops[i - 1] - NODE_HEIGHT).toBe(48);
    }
    // Both members of a pair stay level: the gap goes between clusters only.
    for (const p of pairs) {
      expect(out[`tv:${p}2`].position.y).toBe(out[`tv:${p}1`].position.y);
    }
  });

  it("keeps the wider gap around a cluster that does have branches", () => {
    // The tight gap only holds where neither neighbour has a second row. Give
    // one cluster a side story and its own rows are 96px apart, so a 48px gap
    // below it would space the next cluster more tightly than that cluster
    // spaces itself - and the two would read as one.
    const out = byKey(
      layoutGraph({
        nodes: [
          node("tv:a1"),
          node("tv:a2"),
          node("tv:side"),
          node("tv:b1"),
          node("tv:b2"),
        ],
        edges: [
          edge("tv:a2", "tv:a1"),
          edge("tv:side", "tv:a1", "branch", "side_story"),
          edge("tv:b2", "tv:b1"),
        ],
      }),
    );
    const branched = [out["tv:a1"], out["tv:a2"], out["tv:side"]];
    const plain = [out["tv:b1"], out["tv:b2"]];
    const bottom = Math.max(...branched.map((n) => n.position.y)) + NODE_HEIGHT;
    const top = Math.min(...plain.map((n) => n.position.y));
    expect(top - bottom).toBe(120);
    // And the branched cluster really does have a second row, or the two
    // clusters above are not the shapes this test claims to compare.
    expect(new Set(branched.map((n) => n.position.y)).size).toBe(2);
  });

  // One realistic franchise, asserted from several angles: a spine with a
  // manga above it, two branches below, and a side story that has a sequel of
  // its own. Every earlier bug in this layout showed up on a shape like this
  // and on none of the two-node cases above.
  describe("a spine with branches hanging off it", () => {
    const GRAPH = {
      nodes: [
        node("anime:lost1"),
        node("anime:lost2"),
        node("anime:s1"),
        node("anime:s2"),
        node("manga:t"),
        node("anime:school"),
        node("anime:wall1"),
        node("anime:wall2"),
      ],
      edges: [
        edge("anime:lost2", "anime:lost1"),
        edge("anime:s1", "anime:lost2"),
        edge("anime:s2", "anime:s1"),
        edge("anime:s1", "manga:t", "derivation", "adaptation"),
        edge("anime:school", "anime:s1", "branch", "spin_off"),
        edge("anime:wall1", "anime:s1", "branch", "side_story"),
        edge("anime:wall2", "anime:wall1"),
      ],
    };

    it("runs the whole spine along one straight line", () => {
      // The failure this pins: a column is as tall as its branches, so
      // centring it on the rank drops the spine member below the neighbours
      // it should line up with, and the timeline stair-steps across the page.
      const out = byKey(layoutGraph(GRAPH));
      const spine = ["anime:lost1", "anime:lost2", "anime:s1", "anime:s2"];
      const ys = new Set(spine.map((k) => out[k].position.y));
      expect([...ys]).toHaveLength(1);
    });

    it("puts the source above the spine and the branches below it", () => {
      const out = byKey(layoutGraph(GRAPH));
      const spineY = out["anime:s1"].position.y;
      expect(out["manga:t"].position.y).toBeLessThan(spineY);
      expect(out["anime:school"].position.y).toBeGreaterThan(spineY);
      expect(out["anime:wall1"].position.y).toBeGreaterThan(spineY);
      // None of them earns a rank of its own; the first of each fan takes the
      // spine member's. First is by kind, not by key - wall1 is a side story
      // and school a spin-off, so wall1 leads and school follows it.
      expect(out["manga:t"].position.x).toBe(out["anime:s1"].position.x);
      expect(out["anime:wall1"].position.x).toBe(out["anime:s1"].position.x);
      expect(out["anime:school"].position.x).toBeGreaterThan(
        out["anime:wall1"].position.x,
      );
    });

    it("keeps a side story's own sequel in the side story's lane", () => {
      // Ranking can only join columns, so "Part Two is the sequel of Part
      // One" used to read as "the sequel of the whole spine column" and threw
      // Part Two up beside the spine, with its edge cutting across the graph.
      const out = byKey(layoutGraph(GRAPH));
      expect(out["anime:wall2"].position.y).toBe(out["anime:wall1"].position.y);
      expect(out["anime:wall2"].position.y).not.toBe(out["anime:s1"].position.y);
      expect(out["anime:wall2"].position.x).toBeGreaterThan(
        out["anime:wall1"].position.x,
      );
    });

    it("overlaps nothing", () => {
      // The lane sweep is the only thing keeping two branches that want the
      // same height at the same rank apart.
      const out = layoutGraph(GRAPH);
      for (const a of out) {
        for (const b of out) {
          if (a.key >= b.key) continue;
          const apart =
            Math.abs(a.position.x - b.position.x) >= NODE_WIDTH ||
            Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT;
          expect(apart, `${a.key} overlaps ${b.key}`).toBe(true);
        }
      }
    });
  });

  // The case the vertical stack could not survive: one work that many others
  // hang off, which is the normal shape for the anime a franchise is named
  // after. Stacking put the fourth branch four rows down and drew its
  // connector straight through the three above it.
  describe("many branches off one work", () => {
    const GRAPH = {
      nodes: [
        node("anime:s1"),
        node("manga:t"),
        node("anime:school"),
        node("anime:wall1"),
        node("anime:ova"),
        node("anime:short"),
      ],
      edges: [
        edge("anime:s1", "manga:t", "derivation", "adaptation"),
        edge("anime:school", "anime:s1", "branch", "spin_off"),
        edge("anime:wall1", "anime:s1", "branch", "side_story"),
        edge("anime:ova", "anime:s1", "branch", "side_story"),
        edge("anime:short", "anime:s1", "branch", "spin_off"),
      ],
    };
    const BRANCHES = ["anime:school", "anime:wall1", "anime:ova", "anime:short"];

    it("fans siblings across one row instead of stacking them", () => {
      const out = byKey(layoutGraph(GRAPH));
      const ys = new Set(BRANCHES.map((k) => out[k].position.y));
      const xs = new Set(BRANCHES.map((k) => out[k].position.x));
      expect([...ys]).toHaveLength(1);
      expect([...xs]).toHaveLength(BRANCHES.length);
    });

    it("leaves no node between a work and its branches", () => {
      // This is the whole reason siblings share a row. A connector turns at
      // the midpoint between its two ends, so as long as nothing sits in
      // between, that turn happens in an empty gutter and crosses nothing.
      const out = layoutGraph(GRAPH);
      const byName = byKey(out);
      const sourceY = byName["anime:s1"].position.y;
      const branchY = byName["anime:school"].position.y;
      expect(branchY).toBeGreaterThan(sourceY);
      const between = out.filter(
        (n) => n.position.y > sourceY && n.position.y < branchY,
      );
      expect(between).toEqual([]);
    });

    it("keeps the first branch directly under its source", () => {
      // The fan starts at the source's own rank, so the common case - a work
      // with exactly one branch - still reads as a plain vertical drop.
      const out = byKey(layoutGraph(GRAPH));
      const first = BRANCHES.map((k) => out[k].position.x).sort((a, b) => a - b)[0];
      expect(first).toBe(out["anime:s1"].position.x);
    });

    it("puts the source it was adapted from above, not in the fan", () => {
      const out = byKey(layoutGraph(GRAPH));
      expect(out["manga:t"].position.y).toBeLessThan(out["anime:s1"].position.y);
      expect(out["manga:t"].position.x).toBe(out["anime:s1"].position.x);
    });
  });

  // Re:Zero's shape: a web novel adapted into a novel, the novel adapted into
  // the anime, and BOTH of them carrying their own side stories. The novel's
  // branches are the hard part - the row below the novel is the anime's, so
  // there is nowhere to put them without opening a row first.
  describe("a branch of a branch", () => {
    const GRAPH = {
      nodes: [
        ...["a1", "a2", "a3", "a4"].map((k) => node(`anime:${k}`)),
        node("anime:cut"),
        node("anime:snow"),
        node("novel:web"),
        node("novel:main"),
        node("novel:bonus"),
        node("novel:ex"),
        node("novel:short"),
      ],
      edges: [
        edge("anime:a2", "anime:a1"),
        edge("anime:a3", "anime:a2"),
        edge("anime:a4", "anime:a3"),
        edge("anime:a2", "novel:main", "derivation", "adaptation"),
        edge("novel:main", "novel:web", "derivation", "adaptation"),
        edge("novel:bonus", "novel:main", "branch", "side_story"),
        edge("novel:ex", "novel:main", "branch", "side_story"),
        edge("novel:short", "novel:main", "branch", "side_story"),
        edge("anime:snow", "anime:a2", "branch", "side_story"),
        edge("anime:cut", "anime:a2", "equivalence", "alternative"),
      ],
    };
    const SIDE = ["novel:bonus", "novel:ex", "novel:short"];

    it("opens a row for the novel's side stories rather than skipping past", () => {
      // The bug this pins: the row below the novel belongs to the anime, so
      // scanning for the first FREE row dropped these three on the far side
      // of the whole anime spine, with their connectors drawn across it.
      const out = byKey(layoutGraph(GRAPH));
      const novelY = out["novel:main"].position.y;
      const spineY = out["anime:a2"].position.y;
      for (const key of SIDE) {
        expect(out[key].position.y).toBeGreaterThan(novelY);
        expect(out[key].position.y).toBeLessThan(spineY);
      }
    });

    it("stacks the five rows in the order the relations read", () => {
      const out = byKey(layoutGraph(GRAPH));
      const y = (k) => out[k].position.y;
      expect(y("novel:web")).toBeLessThan(y("novel:main"));
      expect(y("novel:main")).toBeLessThan(y("novel:ex"));
      expect(y("novel:ex")).toBeLessThan(y("anime:a2"));
      expect(y("anime:a2")).toBeLessThan(y("anime:snow"));
      // The three side stories are one row, not three.
      expect(new Set(SIDE.map(y)).size).toBe(1);
    });

    it("keeps the column clear for the connector passing through", () => {
      // Opening a row stretched the novel -> anime adaptation to span two, so
      // its line now crosses the side-story row. The slot it passes through
      // has to stay empty, which is what pushes the fan one column right.
      const out = layoutGraph(GRAPH);
      const at = byKey(out);
      const lane = at["novel:ex"].position.y;
      const column = at["novel:main"].position.x;
      expect(
        out.find((n) => n.position.y === lane && n.position.x === column),
      ).toBeUndefined();
      for (const key of SIDE) {
        expect(at[key].position.x).toBeGreaterThan(column);
      }
    });

    it("puts a director's cut nearer the work than a side story", () => {
      // Re:Zero: 新編輯版 is another version of the anime, Memory Snow is a
      // story told beside it, so the cut is the closer of the two whichever
      // way their keys happen to sort. Sorting the fan alphabetically made
      // that an accident of naming.
      const out = byKey(layoutGraph(GRAPH));
      expect(out["anime:cut"].position.x).toBeLessThan(
        out["anime:snow"].position.x,
      );
      expect(out["anime:cut"].position.y).toBe(out["anime:snow"].position.y);
    });

    it("orders a fan by kind even when the keys disagree", () => {
      // The same graph with the two branch keys swapped, so alphabetical order
      // and kind order pull opposite ways. Without kindRank this passes only
      // by luck of the naming.
      const swapped = {
        nodes: GRAPH.nodes.map((n) =>
          n.key === "anime:cut"
            ? node("anime:zzz-cut")
            : n.key === "anime:snow"
              ? node("anime:aaa-snow")
              : n,
        ),
        edges: GRAPH.edges.map((e) =>
          e.from === "anime:cut"
            ? { ...e, from: "anime:zzz-cut" }
            : e.from === "anime:snow"
              ? { ...e, from: "anime:aaa-snow" }
              : e,
        ),
      };
      const out = byKey(layoutGraph(swapped));
      expect(out["anime:zzz-cut"].position.x).toBeLessThan(
        out["anime:aaa-snow"].position.x,
      );
    });

    it("draws no relation through an unrelated entry", () => {
      // The invariant stated as geometry rather than as row arithmetic: walk
      // each connector from the source's bottom edge to the target's top and
      // assert nothing else is standing on it. Independent of how the layout
      // decides to space things, so it survives the next rewrite.
      const out = layoutGraph(GRAPH);
      const at = byKey(out);
      for (const e of GRAPH.edges) {
        if (e.family === "timeline") continue;
        const a = at[e.to].position;
        const b = at[e.from].position;
        const from = { x: a.x + NODE_WIDTH / 2, y: a.y + NODE_HEIGHT };
        const to = { x: b.x + NODE_WIDTH / 2, y: b.y };
        for (let step = 1; step < 50; step += 1) {
          const t = step / 50;
          const px = from.x + (to.x - from.x) * t;
          const py = from.y + (to.y - from.y) * t;
          const hit = out.find(
            (n) =>
              n.key !== e.to &&
              n.key !== e.from &&
              px >= n.position.x &&
              px <= n.position.x + NODE_WIDTH &&
              py >= n.position.y &&
              py <= n.position.y + NODE_HEIGHT,
          );
          expect(hit?.key, `${e.to} -> ${e.from} crosses ${hit?.key}`).toBeUndefined();
        }
      }
    });
  });

  it("puts every node on the grid, ranked and trayed alike", () => {
    // Slot pitches are whole multiples of GRID, so this holds by construction -
    // it is pinned because the canvas snaps dragging to this same GRID, and a
    // computed position off the lattice could never be matched by hand.
    const out = layoutGraph({
      nodes: [node("anime:a"), node("anime:b"), node("manga:a"), node("movie:z")],
      edges: [
        edge("anime:b", "anime:a"),
        edge("manga:a", "anime:a", "derivation", "adaptation"),
      ],
    });
    // movie:z is trayed and the other three are ranked, so this covers both
    // blocks rather than only the graph.
    expect(out.map((n) => n.section)).toContain("tray");
    for (const n of out) {
      expect(n.position.x % GRID).toBe(0);
      expect(n.position.y % GRID).toBe(0);
    }
  });

  it("spaces a column by a fixed pitch", () => {
    // Three deep, so the gap is checked across two consecutive pairs rather
    // than one: snapping each member on its own would round them apart.
    const out = byKey(
      layoutGraph({
        nodes: [node("anime:a"), node("manga:a"), node("novel:a")],
        edges: [
          edge("manga:a", "anime:a", "derivation", "adaptation"),
          edge("novel:a", "manga:a", "derivation", "adaptation"),
        ],
      }),
    );
    const ys = ["anime:a", "manga:a", "novel:a"]
      .map((k) => out[k].position.y)
      .sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBe(ys[2] - ys[1]);
    expect((ys[1] - ys[0]) % GRID).toBe(0);
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

  it("keeps the coordinate of a node that just left the tray", () => {
    // This used to be the one exception - a connected entry took its fresh
    // rank. It could not work: the fresh position comes from a layout of the
    // whole canvas, in which every other node also moved, while those other
    // nodes are still holding their old coordinates. Two trayed entries
    // connected to each other landed at the top of the screen, on top of an
    // unrelated cluster. Where the node ends up is Tidy's decision now.
    const positioned = [
      { key: "anime:a", position: { x: 400, y: 20 }, section: "graph" },
    ];
    const merged = mergePositions(
      { "anime:a": { position: { x: 0, y: 900 }, section: "tray" } },
      positioned,
    );
    expect(merged[0].position).toEqual({ x: 0, y: 900 });
  });

  it("leaves a whole new cluster clear of the nodes already placed", () => {
    // The reported bug, as the two calls the page actually makes: A and B sit
    // where they were put, C and D are connected out of the tray, and the
    // fresh layout would hand C and D the first band - y=0 - straight through
    // A and B. Neither pair may move, so neither pair can collide.
    const before = {
      "anime:a": { position: { x: 0, y: 0 }, section: "graph" },
      "anime:b": { position: { x: 288, y: 0 }, section: "graph" },
      "anime:c": { position: { x: 0, y: 800 }, section: "tray" },
      "anime:d": { position: { x: 216, y: 800 }, section: "tray" },
    };
    // What layoutGraph returns once C-D is a cluster of its own: sorted first,
    // so it takes the top band and A-B is pushed below it.
    const positioned = [
      { key: "anime:a", position: { x: 0, y: 216 }, section: "graph" },
      { key: "anime:b", position: { x: 288, y: 216 }, section: "graph" },
      { key: "anime:c", position: { x: 0, y: 0 }, section: "graph" },
      { key: "anime:d", position: { x: 288, y: 0 }, section: "graph" },
    ];
    const merged = mergePositions(before, positioned);
    for (const n of merged) {
      expect(n.position).toEqual(before[n.key].position);
    }
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
