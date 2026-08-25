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
