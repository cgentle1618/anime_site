// Frontend: which side of a node a relation attaches to.
//
// A node has four handles in two groups, and the group carries meaning rather
// than decoration. Left/right is the timeline: a sequel is a later work, so it
// belongs to the right of its prequel and the graph reads as a story. Top and
// bottom are everything else - an alternative, a spin-off, an adaptation - all
// of which share their source's place on that timeline instead of extending
// it, so they hang beneath it.
//
// The ids live here rather than inline in RelationNode because three modules
// need to agree on them: the node renders them, toFlowEdges points existing
// edges at them, and the connect popup reads the group back off a drag to
// decide which kinds to offer.
export const TIMELINE_TARGET = "timeline-target";
export const TIMELINE_SOURCE = "timeline-source";
export const MIDDLE_TARGET = "middle-target";
export const MIDDLE_SOURCE = "middle-source";

export const TIMELINE = "timeline";
export const MIDDLE = "middle";

/**
 * The group a handle id belongs to.
 *
 * Prefix-matched rather than compared against the four constants, so it
 * answers for a target and a source handle alike - a drag started from the top
 * handle reports `middle-target`, one started from the bottom `middle-source`,
 * and both mean the same thing here.
 */
export function handleGroup(handleId) {
  return String(handleId || "").startsWith(MIDDLE) ? MIDDLE : TIMELINE;
}

/**
 * The group a relation family draws through.
 *
 * `timeline` is the only family that ranks left to right; the other three are
 * all vertical, which is what makes this a two-way split rather than four.
 */
export function familyGroup(family) {
  return family === TIMELINE ? TIMELINE : MIDDLE;
}

/**
 * The kinds a drag off this group is allowed to become.
 *
 * Filtered on `family` rather than a hardcoded key list because
 * GET /api/media-relation/kinds already returns `prequel` with
 * `family: "timeline"` - so the two-vs-seven split falls out of the server's
 * own vocabulary and cannot drift from it.
 */
export function kindsForGroup(kinds, group) {
  return (kinds || []).filter((k) => familyGroup(k.family) === group);
}
