// Frontend: the pure half of the relations canvas's undo stack.
//
// Every write on the canvas records the one request that reverses it, so undo
// is a replay of inverses rather than a snapshot restore - the API has no way
// to write a row's endpoints directly, so a snapshot could not be applied.
//
// The stack lives in memory on the admin page and dies with the page: these
// are single API calls against rows anyone else can also be editing, so
// persisting a stack across a reload would let it act on a world that had
// moved on beneath it.

// Whether a write left the row pointing the same way. Both halves of an
// endpoint count: each media table has its own system_id space, so an id
// alone cannot identify one.
function sameOrientation(before, after) {
  return (
    before.from_type === after.from_type &&
    String(before.from_id) === String(after.from_id) &&
    before.to_type === after.to_type &&
    String(before.to_id) === String(after.to_id)
  );
}

/**
 * The row as it sits in the table, read off the edge the canvas already holds.
 *
 * The graph speaks in "type:id" node keys because that is what React Flow
 * needs for an endpoint; the write endpoints want the two halves separately.
 */
export function storedTupleFromEdge(edge) {
  const [fromType, fromId] = String(edge.from).split(":");
  const [toType, toId] = String(edge.to).split(":");
  return {
    from_type: fromType,
    from_id: fromId,
    to_type: toType,
    to_id: toId,
    relation_type: edge.relation_type ?? null,
    remark: edge.remark ?? null,
  };
}

/**
 * The kind to PATCH so an edited row reads the way it did before.
 *
 * Not simply the old kind: changing Sequel to Prequel is stored by flipping
 * the row's endpoints and keeping `sequel`, so replaying `sequel` against the
 * flipped row would normalize to the flipped row again and the undo would do
 * nothing visible. When the endpoints moved, the answer is the input kind that
 * stores as the old one from the other side - `prequel` for a stored `sequel`.
 *
 * A symmetric kind never flips, and has no second key storing as it, so the
 * lookup misses and the old kind is returned unchanged.
 */
export function restoringKind(before, after, kinds = []) {
  if (sameOrientation(before, after)) return before.relation_type;
  const inverse = kinds.find(
    (k) => k.stored_as === before.relation_type && k.key !== before.relation_type,
  );
  return inverse ? inverse.key : before.relation_type;
}

/**
 * The single request that reverses one stack entry.
 *
 * Shapes, not fetches: keeping this pure is what makes the flipped-endpoint
 * rule above testable without a server.
 */
export function undoRequest(entry) {
  if (!entry) return null;

  if (entry.action === "create") {
    return { method: "DELETE", id: String(entry.created.system_id) };
  }

  if (entry.action === "delete") {
    const { before } = entry;
    return {
      method: "POST",
      body: {
        from_type: before.from_type,
        from_id: String(before.from_id),
        // The stored type is always a valid input kind, so posting it back
        // reproduces the row in the orientation it was deleted in.
        kind: before.relation_type,
        to_type: before.to_type,
        to_id: String(before.to_id),
        remark: before.remark || "",
      },
    };
  }

  // A swap reverses itself. Replaying the kind cannot do it: only Sequel has
  // a second name that stores flipped, so patching a swapped Adaptation with
  // `adaptation` would normalize to the flipped row again and the press would
  // appear to do nothing.
  if (entry.swap) {
    return {
      method: "PATCH",
      id: String(entry.id),
      body: { swap: true, remark: entry.before.remark || "" },
    };
  }

  // Kind and remark go back together: an edit that changed both would
  // otherwise take two presses to fully reverse, which is not what the button
  // claims to do.
  //
  // "" rather than null, because MediaRelationUpdate ignores a null remark
  // (`if payload.remark is not None`) - undoing a newly typed remark would
  // silently leave it in the row.
  return {
    method: "PATCH",
    id: String(entry.id),
    body: { kind: entry.kind, remark: entry.before.remark || "" },
  };
}

/**
 * What the button says it will do, for its tooltip.
 *
 * Named endpoints rather than "undo last change": the stack outlives a scope
 * switch, so the row being undone is not always one you can see.
 */
export function describeEntry(entry) {
  if (!entry) return "Nothing to undo";
  const { action, label, sourceName, targetName } = entry;
  if (action === "create") {
    return `Undo: linked ${sourceName} as the ${label} of ${targetName}`;
  }
  if (action === "delete") {
    return `Undo: removed the ${label} link between ${sourceName} and ${targetName}`;
  }
  return `Undo: edited the link between ${sourceName} and ${targetName}`;
}
