// Frontend: positions for the relations canvas.
//
// Pure functions, no DOM: layout is what decides whether a franchise reads as
// a story or as a hairball, so it is testable on its own.
//
// The model is a GRID OF SLOTS - every node takes one (rank, row), rank
// running left to right and row top to bottom - and two rules fill it:
//
//   - Timeline stays in its row and steps a rank. A sequel is a later work,
//     so the spine of a franchise is one straight horizontal line.
//   - Every other family - a version of the same work, a branch off it, a
//     work derived from it - steps a ROW instead, up towards an original and
//     down towards a work derived from it. None of them is a later work, so
//     none may consume the timeline.
//
// That is the same split the canvas draws, where left/right handles carry the
// timeline and top/bottom handles carry the rest. See lib/relationHandles.
//
// The consequence worth stating, because it is what the layout is really for:
// the timeline runs horizontally in EVERY row, not only along the main spine.
// A side story drops out of the spine and then continues rightwards at its own
// height, and its own sequel belongs beside it rather than back up on the
// spine it came from.
//
// SIBLINGS SHARE A ROW. Everything hanging off one work goes into a single row
// and fans out across ranks, rather than stacking into a vertical pile. That
// is not a matter of taste: a connector is drawn from a bottom handle to a top
// handle and turns at the midpoint between the two, so as long as its target
// is exactly one row away that turn happens in the empty gutter between rows
// and crosses nothing. Stack a second branch two rows down and the turn lands
// inside the node in between - which is a line drawn straight through an
// unrelated entry, at every branch count above one.
//
// ROWS ARE OPENED, NOT SKIPPED. A work that is itself a branch has branches of
// its own - a novel adapted into an anime, with its own side stories - and the
// row it would hang them from is already the anime's. Scanning on for the next
// free row puts them on the far side of the anime's whole spine and draws
// their connectors across it, so the row is made instead: everything from
// there outwards moves over by one.
//
// That stretches the relations which already spanned the row - the novel is
// now two rows above the anime, not one - so before anything is placed in a
// newly opened row, the column each of those connectors passes down is
// reserved. It is why a fan of side stories starts one column right of the
// work it hangs off rather than directly beneath it.
//
// No layout library: ranks come out of the traversal below, and the one thing
// dagre was still doing - centring a column on its rank - is exactly what bent
// the spine out of line.

// The lattice every position lands on. Shared with the canvas, which draws it
// as the Background dots and snaps dragging to it - so a hand-placed node and
// a computed one sit on the same rhythm instead of two unrelated ones.
export const GRID = 24;

// Nodes are fixed-size because the slot pitch is computed from these numbers -
// RelationNode must render at exactly them or the spacing lies.
export const NODE_WIDTH = 192; // 8 * GRID
export const NODE_HEIGHT = 72; // 3 * GRID

// Slot pitch. Both are whole multiples of GRID, which is what makes the
// distance between two nodes a fixed number rather than an incidental one.
//
// The row gap is 96 rather than something tight, and that is the gutter every
// branch connector is drawn through. One work can have half a dozen branches
// fanning out across it; through a 24px gap those lines all leave at the same
// near-zero angle and are drawn on top of each other, which is a picture of
// six relations that reads as one. The height is what lets the fan open.
export const ROW_PITCH = NODE_HEIGHT + 96; // 168
const RANK_PITCH = NODE_WIDTH + 96; // 288

// The gap between one cluster and the next, measured edge to edge rather than
// in rows. No connector ever runs between two clusters, so none of the gutter
// a fan needs applies there - spacing them by whole rows left a scope of three
// unrelated sequel pairs reading as if each had branches hanging off it, with
// the empty rows to prove it. Still wider than the 96px gutter inside a
// cluster, which is the floor: at or below it the last row of one cluster and
// the first row of the next are spaced like two rows of the same one.
const CLUSTER_GAP = 120; // 5 * GRID

/**
 * Where a relation kind sits in a fan, lowest first.
 *
 * Mirrors the key order of RELATION_KINDS in app/utils/relation_kinds.py, so
 * this is the vocabulary's own ordering rather than a second opinion about it:
 * another version of the same work first, then a story told beside it, then
 * the work it was adapted from. A Director's Cut is a version of the anime and
 * a Side Story is not, so the cut is the nearer of the two.
 *
 * Exported because the canvas numbers its connectors in this same order (see
 * fanPositions) - the lines and the nodes have to agree or the fan crosses
 * over itself. An unknown kind sorts last rather than throwing, so a kind
 * added server-side lands at the end of a fan until it is listed here.
 */
const KIND_ORDER = [
  "sequel",
  "alternative",
  "renew",
  "directors_cut",
  "extended",
  "side_story",
  "spin_off",
  "setting",
  "adaptation",
];

export function kindRank(kind) {
  const at = KIND_ORDER.indexOf(kind);
  return at === -1 ? KIND_ORDER.length : at;
}

// Where the unconnected tray starts, below the deepest placed node.
const TRAY_TOP_GAP = 120;
const TRAY_COLUMNS = 4;
const TRAY_GAP_X = 24;
const TRAY_GAP_Y = 24;

function unionFind(keys) {
  const parent = new Map(keys.map((k) => [k, k]));
  function find(k) {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression, so a long chain stays cheap.
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
 * Splits the usable edges into the three adjacencies the traversal walks.
 *
 * Every stored row reads "`from` is the {label} of `to`", which always makes
 * `to` the earlier, parent or source work: B is the Sequel of A, X is the
 * Adaptation of Y. So a timeline edge runs to->from, and the canvas draws the
 * same reversal (see toFlowEdges): one rule holds throughout, an arrow runs
 * from the original to the work derived from it.
 *
 * A non-timeline edge is recorded from BOTH ends, because which of the two is
 * the branch depends on which one the traversal reaches first - the other is
 * the one that gets displaced, upwards if it is the original and downwards if
 * it is the work derived from it.
 */
function adjacency(keys, usable) {
  const forward = new Map(keys.map((k) => [k, []]));
  const backward = new Map(keys.map((k) => [k, []]));
  const sideways = new Map(keys.map((k) => [k, []]));
  const linked = new Set();

  for (const e of usable) {
    linked.add(e.from);
    linked.add(e.to);
    if (e.family === "timeline") {
      forward.get(e.to).push(e.from);
      backward.get(e.from).push(e.to);
    } else {
      sideways.get(e.to).push({ other: e.from, dir: 1, kind: e.relation_type });
      sideways.get(e.from).push({ other: e.to, dir: -1, kind: e.relation_type });
    }
  }
  return { forward, backward, sideways, linked };
}

/**
 * Longest run of sequels leaving each node.
 *
 * Used only to choose where a cluster's walk begins, which is what decides
 * which chain of works ends up as the straight row-0 spine. A cycle the user
 * managed to build counts as 0 rather than recursing forever.
 */
function chainLengths(keys, forward) {
  const chain = new Map();
  const measuring = new Set();

  function from(key) {
    if (chain.has(key)) return chain.get(key);
    if (measuring.has(key)) return 0;
    measuring.add(key);
    let best = 0;
    for (const next of forward.get(key)) best = Math.max(best, 1 + from(next));
    measuring.delete(key);
    chain.set(key, best);
    return best;
  }

  for (const key of keys) from(key);
  return chain;
}

/**
 * Walks one connected cluster, assigning every member a (rank, row) slot.
 *
 * Depth first rather than breadth first, and that matters: a branch's whole
 * subtree is placed before its next sibling is, so the sibling can simply take
 * the first rank still free in their shared row. Breadth first would hand out
 * ranks before knowing how wide each branch turned out to be.
 *
 * Returns a Map of key -> {rank, row}, in coordinates local to this cluster.
 */
function walkCluster(cluster, { forward, backward, sideways }, chain) {
  const slots = new Map();
  // Columns kept clear for a connector to pass down, rather than for a node.
  const reserved = [];
  const taken = new Set();
  const slotKey = (row, rank) => `${row}:${rank}`;
  const free = (row, rank) => !taken.has(slotKey(row, rank));

  function remember() {
    taken.clear();
    for (const { rank, row } of slots.values()) taken.add(slotKey(row, rank));
    for (const { rank, row } of reserved) taken.add(slotKey(row, rank));
  }

  function take(key, rank, row) {
    slots.set(key, { rank, row });
    taken.add(slotKey(row, rank));
  }

  // Everything from `from` outwards in `dir` moves one row further out,
  // leaving `from` itself empty.
  function shiftRows(from, dir) {
    for (const slot of [...slots.values(), ...reserved]) {
      if (dir > 0 ? slot.row >= from : slot.row <= from) slot.row += dir;
    }
    remember();
  }

  /**
   * Keeps a column of `row` clear for every connector that now crosses it.
   *
   * Opening a row stretches the relations that already spanned it - the novel
   * a series was adapted from stops being one row above it and becomes two -
   * and their connectors are then drawn straight through whatever the new row
   * puts in the way. So the rank each of them passes through is reserved
   * before anything is placed there, which is what moves a fan of side stories
   * one column right of the work they hang off instead of on top of the line
   * running down past them.
   */
  function reserveCrossings(row) {
    for (const [key, at] of slots) {
      for (const { other } of sideways.get(key)) {
        const far = slots.get(other);
        // One end each side of the new row, and counted once per pair.
        if (!far || key > other) continue;
        if (at.row === far.row || at.row > row === far.row > row) continue;
        const along = (row - at.row) / (far.row - at.row);
        reserved.push({
          row,
          rank: Math.round(at.rank + (far.rank - at.rank) * along),
        });
      }
    }
    remember();
  }

  /**
   * The row one step in `dir`, opened up first if something is already there.
   *
   * Not "the first free row in that direction". A branch has to land exactly
   * one row from the work it hangs off: a connector turns at the midpoint
   * between its two ends, so at one row that turn falls in the empty gutter,
   * and at two it falls inside whatever row was skipped over. Skipping is how
   * a novel's side stories ended up on the far side of the anime spine, with
   * their connectors drawn straight across it.
   */
  function openRow(row, dir, rank) {
    const candidate = row + dir;
    if (free(candidate, rank)) return candidate;
    shiftRows(candidate, dir);
    reserveCrossings(candidate);
    return candidate;
  }

  // The first rank at or after `rank` still empty in `row`.
  function freeRank(row, rank) {
    let candidate = rank;
    while (!free(row, candidate)) candidate += 1;
    return candidate;
  }

  // The spine: the longest run of sequels, started from a work that is nobody's
  // sequel, so row 0 is the story the franchise is mostly about.
  //
  // The last tie-break earns its place. Branches are fanned out by the work
  // they hang off, all at once, so a branch reached before that work is
  // already committed to a row of its own and its siblings fan out somewhere
  // else - stranding it in the gutter the connectors need. Starting from the
  // work with the most branches is what keeps a cluster with no timeline at
  // all, where nothing else distinguishes its members, from beginning at a
  // leaf and pulling its own hub sideways.
  const start = [...cluster].sort(
    (a, b) =>
      backward.get(a).length - backward.get(b).length ||
      chain.get(b) - chain.get(a) ||
      sideways.get(b).length - sideways.get(a).length ||
      (a < b ? -1 : 1),
  )[0];

  // A node's own row is read back rather than remembered. Opening a row for
  // something further down the walk moves every row beyond it, this work's
  // included, so a row captured before recursing is stale afterwards - and
  // placing a branch against a stale row is how it lands in the wrong lane.
  // Ranks are never shifted, so those are safe to carry.
  const rowOf = (key) => slots.get(key).row;

  function place(key, rank, row) {
    take(key, rank, row);

    // The timeline continues in the same row. Two sequels to one work cannot
    // both have that slot, so the second starts a row of its own.
    forward
      .get(key)
      .filter((k) => !slots.has(k))
      .sort()
      .forEach((next, i) => {
        if (slots.has(next)) return; // placed by an earlier sibling's subtree
        const at = rank + 1;
        const here = rowOf(key);
        place(next, at, i === 0 && free(here, at) ? here : openRow(here, 1, at));
      });

    // A prequel reached from its sequel, which happens when the walk started
    // partway along a chain or two chains merge into one work.
    for (const prev of backward.get(key).filter((k) => !slots.has(k)).sort()) {
      if (slots.has(prev)) continue;
      const at = rank - 1;
      const here = rowOf(key);
      place(prev, at, free(here, at) ? here : openRow(here, 1, at));
    }

    // Branches. One row per direction, however many there are, fanned across
    // it from this work's own rank rightwards - see the header: a sibling two
    // rows down would have its connector drawn through the node between them.
    for (const dir of [-1, 1]) {
      // Ordered by kind before key, so the fan reads outwards from the closest
      // relation to the loosest rather than alphabetically: a Director's Cut
      // of a work sits nearer to it than a side story does.
      const kids = sideways
        .get(key)
        .filter((s) => s.dir === dir && !slots.has(s.other))
        .sort(
          (a, b) =>
            kindRank(a.kind) - kindRank(b.kind) || (a.other < b.other ? -1 : 1),
        )
        .map((s) => s.other);
      if (!kids.length) continue;
      let lane = openRow(rowOf(key), dir, rank);
      let first = null;
      for (const kid of kids) {
        if (slots.has(kid)) continue;
        // Read back off a sibling already in the lane, for the same reason
        // rowOf exists: one kid's own subtree can open a row underneath it.
        if (first) lane = rowOf(first);
        place(kid, freeRank(lane, rank), lane);
        first = first ?? kid;
      }
    }
  }

  place(start, 0, 0);
  // A cluster is connected, so the walk reaches all of it - but a node dropped
  // by a filter must still come out positioned rather than undefined.
  for (const key of [...cluster].sort()) {
    if (!slots.has(key)) place(key, freeRank(0, 0), 0);
  }
  return slots;
}

/**
 * Positions every node, splitting them into the placed graph and the tray of
 * entries no relation touches.
 *
 * Returns each input node with `position` and `section` added; input order is
 * preserved so the caller can rely on it.
 */
export function layoutGraph({ nodes, edges }) {
  const keys = nodes.map((n) => n.key);
  const known = new Set(keys);
  // A ghost node is only sent when an edge needs it, but a client-side filter
  // can still hide one - drop edges we cannot place rather than walk into an
  // adjacency entry that does not exist. A self-edge would loop the walk.
  const usable = (edges || []).filter(
    (e) => known.has(e.from) && known.has(e.to) && e.from !== e.to,
  );

  const { forward, backward, sideways, linked } = adjacency(keys, usable);
  const chain = chainLengths(keys, forward);

  // Clusters: a scope can hold several unrelated groups of relations, and each
  // gets its own band of rows rather than being interleaved with the others.
  const { find, union } = unionFind(keys);
  for (const e of usable) union(e.from, e.to);
  const clusters = new Map();
  for (const key of keys) {
    if (!linked.has(key)) continue;
    const root = find(key);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(key);
  }

  const positions = new Map();
  let bandTop = 0;
  // Sorted so the same input always produces the same canvas.
  for (const root of [...clusters.keys()].sort()) {
    const slots = walkCluster(clusters.get(root), { forward, backward, sideways }, chain);
    // Local coordinates can run negative - a row above the spine, a prequel
    // found late - so each cluster is normalised to its own top-left and then
    // dropped below the one before it.
    const rows = [...slots.values()].map((s) => s.row);
    const ranks = [...slots.values()].map((s) => s.rank);
    const topRow = Math.min(...rows);
    const firstRank = Math.min(...ranks);
    for (const [key, { rank, row }] of slots) {
      positions.set(key, {
        x: (rank - firstRank) * RANK_PITCH,
        y: bandTop + (row - topRow) * ROW_PITCH,
      });
    }
    // A fixed gap below this cluster's own last row, so a cluster one row tall
    // is not spaced as though it had a fan to make room for.
    bandTop +=
      (Math.max(...rows) - topRow) * ROW_PITCH + NODE_HEIGHT + CLUSTER_GAP;
  }

  let deepest = 0;
  for (const p of positions.values()) {
    deepest = Math.max(deepest, p.y + NODE_HEIGHT);
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
 * A node the canvas has seen before keeps its coordinate, whatever the write
 * was. Only nodes genuinely new to it get a freshly computed position, so the
 * automatic layout runs on a canvas exactly once - at load, and again when
 * Tidy empties the map. Adding, editing or removing a relation draws a line
 * and moves nothing.
 *
 * That rule used to have an exception: an entry connected out of the tray took
 * the fresh position, on the grounds that its old coordinate was a tray slot
 * far below the spine. The exception was unsound. layoutGraph recomputes the
 * WHOLE canvas - it re-derives every cluster, sorts them, and stacks them in
 * bands from y=0 - while every node already placed is holding a coordinate
 * from a layout of a different graph. So the fresh position was right relative
 * to the other nodes in the fresh layout and meaningless relative to the
 * canvas: connecting two trayed entries moved the pair to the top of the
 * screen, on top of an unrelated cluster that had not moved. Nothing
 * reconciled the two coordinate systems, and nothing here could - this
 * function sees positions, not the graph they came from.
 *
 * So a connected entry now stays where it sits and the relation is drawn to it
 * where it is. Reaching a tidy arrangement is Tidy's job, which recomputes
 * every node at once and therefore has one coordinate system to be right in.
 *
 * `previousByKey` maps key -> {position, section}. Only `position` is read
 * now; the shape is kept because the page stores the section alongside it.
 */
export function mergePositions(previousByKey, positioned) {
  return positioned.map((n) => {
    const previous = previousByKey[n.key];
    if (!previous?.position) return n;
    return { ...n, position: previous.position };
  });
}
