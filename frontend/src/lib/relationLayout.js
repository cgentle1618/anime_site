// Frontend: positions for the relations canvas.
//
// Pure functions, no DOM: layout is what decides whether a franchise reads as
// a story or as a hairball, so it is testable on its own.
//
// Three passes, because only one of the four relation families is horizontal.
// Timeline is the spine and the only thing that ranks left to right: a sequel
// is a later work and earns a column of its own. The other three - a version
// of the same work, a branch off it, a work derived from it - all share their
// source's place on that timeline rather than extending it, so they are
// contracted into one layout node and re-expanded beneath it as a column.
//
// That split is the same one the canvas draws: a column is exactly the set of
// nodes joined through the top/bottom handles, and a rank is what the
// left/right handles connect. See lib/relationHandles.
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
 * Orders one column so an original sits above the work derived from it.
 *
 * Every row reads "`from` is the {label} of `to`", which makes `to` the
 * earlier, parent or source work - so within a column an edge points to->from
 * and `to` belongs on top. Without this the order is whatever the server sent,
 * and an adaptation could render above its own source while the edge drawn
 * between them still runs downwards.
 *
 * Kahn's algorithm rather than a walk from the roots, so a node with two
 * parents cannot be placed above one of them. The queue is kept sorted so the
 * same column always comes out the same way, and anything left unvisited - a
 * cycle the user managed to build - is appended rather than dropped, because a
 * node missing from `members` would never be positioned at all.
 */
function orderColumn(memberKeys, edges) {
  const set = new Set(memberKeys);
  const children = new Map(memberKeys.map((k) => [k, []]));
  const indegree = new Map(memberKeys.map((k) => [k, 0]));
  for (const e of edges) {
    // Timeline edges rank the columns; they say nothing about order inside one.
    if (e.family === "timeline") continue;
    if (!set.has(e.from) || !set.has(e.to) || e.from === e.to) continue;
    children.get(e.to).push(e.from);
    indegree.set(e.from, indegree.get(e.from) + 1);
  }

  const queue = memberKeys.filter((k) => indegree.get(k) === 0).sort();
  const ordered = [];
  while (queue.length) {
    const key = queue.shift();
    ordered.push(key);
    for (const child of children.get(key)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  for (const key of memberKeys) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
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

  // Pass 1: contract every non-timeline link into a column. An alternative, a
  // spin-off and an adaptation are all "not a later work", so none of them may
  // consume a rank - they belong under whatever they came from.
  const { find, union } = unionFind(keys);
  for (const e of usable) {
    if (e.family !== "timeline") union(e.from, e.to);
  }
  const members = new Map();
  for (const key of keys) {
    const root = find(key);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(key);
  }
  // Ordered so the column reads top to bottom, rather than in whatever order
  // the server happened to send the nodes.
  for (const [root, group] of members) {
    if (group.length > 1) members.set(root, orderColumn(group, usable));
  }

  // Cross-group edges are the only ones that rank, which after the contraction
  // above means exactly the timeline edges: every other family has had its two
  // endpoints merged into one group already.
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
    g.setEdge(to, from);
  }
  dagre.layout(g);

  // Pass 3: expand each group back into its column of real nodes, in the order
  // pass 1 settled. dagre reports centres; React Flow wants top-left corners.
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
 *
 * The one exception is the page's main job: an entry that was parked in the
 * tray and has just been connected. Its old coordinate is a tray slot far
 * below the spine, so keeping it would leave the node down there on a long
 * tether instead of at the rank it just earned. A node whose `section` moved
 * from "tray" to "graph" therefore takes the freshly computed position.
 *
 * `previousByKey` maps key -> {position, section} - the section is what makes
 * that exception detectable, so a plain {key: position} map is not enough.
 */
export function mergePositions(previousByKey, positioned) {
  return positioned.map((n) => {
    const previous = previousByKey[n.key];
    if (!previous?.position) return n;
    // Rejoined the spine: let the new rank win.
    if (previous.section === "tray" && n.section !== "tray") return n;
    return { ...n, position: previous.position };
  });
}
