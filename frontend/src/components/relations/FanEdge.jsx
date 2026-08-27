// Frontend: the connector drawn for every non-timeline relation.
//
// One work can have half a dozen branches hanging off it - a manga it was
// adapted from, two spin-offs, a side story, an OVA - and the layout fans
// those across a row (see lib/relationLayout). Left to React Flow's built-in
// edges, all of them leave the same handle at the centre of the node's bottom
// edge, turn at the same height, and are drawn along the same line for most of
// their length: six relations that read as one.
//
// So this edge spreads the fan at BOTH ends. The far end is already apart,
// because each branch sits at its own rank; the near end is spread here, by
// starting each line at its own point across the parent's bottom edge. Two
// distinct endpoints give two distinct angles, and the angle is what tells you
// which line goes where - which is why these are drawn straight rather than
// stepped. A step would put every line back on the one gutter height.
//
// The label is placed by the same index, at its own fraction along its own
// line, so two of them cannot land on the same spot. It is rendered through
// EdgeLabelRenderer rather than as SVG, which puts it above every edge instead
// of under the next one drawn.
import { BaseEdge, EdgeLabelRenderer } from "@xyflow/react";

// How far apart the lines start, and the most the fan may ever spread. Capped
// well inside NODE_WIDTH so the outermost line still leaves from under the
// node rather than from thin air beside it.
const FAN_STEP = 26;
const FAN_SPAN = 132;

// Labels are placed between these two fractions of their line. Kept away from
// both ends: at 0 a label sits on the parent, at 1 on the child.
const LABEL_FROM = 0.3;
const LABEL_TO = 0.68;

/**
 * Spreads `count` items symmetrically about 0, `index` picking one of them.
 * A lone connector gets 0 - dead centre, and so a plain vertical drop.
 */
export function spread(index, count, step, max) {
  if (count < 2) return 0;
  const width = Math.min(max, (count - 1) * step);
  return -width / 2 + (index * width) / (count - 1);
}

export default function FanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  label,
  labelStyle,
  data,
}) {
  const count = data?.fanCount ?? 1;
  const index = data?.fanIndex ?? 0;

  const startX = sourceX + spread(index, count, FAN_STEP, FAN_SPAN);
  const path = `M ${startX},${sourceY} L ${targetX},${targetY}`;

  // Along its own line rather than at a fixed height, so the labels of one fan
  // land at a different point each - the lines descend, so this separates them
  // vertically as well as horizontally.
  const at =
    count < 2
      ? (LABEL_FROM + LABEL_TO) / 2
      : LABEL_FROM + ((LABEL_TO - LABEL_FROM) * index) / (count - 1);
  const labelX = startX + (targetX - startX) * at;
  const labelY = sourceY + (targetY - sourceY) * at;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            // The chip is opaque on purpose: a label sitting on one of its own
            // fan's lines has to stay readable, and this is the text the whole
            // relation is named by.
            className="pointer-events-none absolute rounded bg-white/95 px-1 leading-tight shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
