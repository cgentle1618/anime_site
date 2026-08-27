// Frontend: one entry as it appears on the relations canvas.
//
// Fixed-size on purpose: the layout computes its slot pitch from the numbers in
// relationLayout, so a node that renders taller than NODE_HEIGHT would overlap
// its neighbours. Width and height are set inline rather than in Tailwind
// classes so the two numbers cannot drift apart.
//
// Four handles in two groups, see lib/relationHandles: left/right carry the
// timeline, top/bottom carry everything else. The pairing is what makes a
// sequel read across and an adaptation read down.
import { Handle, Position } from "@xyflow/react";

import { getCoverUrl } from "../../lib/covers";
import {
  MIDDLE_SOURCE,
  MIDDLE_TARGET,
  TIMELINE_SOURCE,
  TIMELINE_TARGET,
} from "../../lib/relationHandles";
import { mediaTypeChip } from "../../config/mediaTypeColors";
import FittedName from "../layout/FittedName";
import { NODE_HEIGHT, NODE_WIDTH } from "../../lib/relationLayout";

// The title gets the two lines line-clamp-2 allows.
const TITLE_LINES = 2;

// `isConnectable` comes from React Flow, and is false for every node once the
// canvas is rendered read-only. The handles then go invisible and inert rather
// than unmounting: React Flow resolves each edge's endpoints from the mounted
// handle carrying that id, so a node with no handles drops every edge attached
// to it - the relations would vanish along with the dots.
export default function RelationNode({ data, selected, isConnectable = true }) {
  // Kept in the layout either way, so the edges still land where they did.
  const handleCls = isConnectable
    ? ""
    : " !pointer-events-none !opacity-0";
  const { display_name, media_type, type_label, cover_image_file } = data;

  const label = data.missing
    ? `Missing ${media_type} ${String(data.entry_id).slice(0, 8)}…`
    : display_name || "";

  // Three states, three treatments: a scope entry is solid, a ghost from
  // another franchise is dashed and dimmed, and an endpoint whose row is gone
  // is red - visible so it can be found and deleted, rather than silently
  // absent.
  const tone = data.missing
    ? "border-red-300 bg-red-50"
    : data.in_scope
      ? "border-gray-200 bg-white"
      : "border-dashed border-gray-300 bg-gray-50";

  // Opacity is decided in one place, not two: a ghost's own opacity-70 and a
  // dimmed node's opacity-20 are the same Tailwind specificity, so having both
  // in the class list would let stylesheet order pick the winner - and a
  // filtered-out ghost would likely stay bright, making isolate look broken.
  const opacity = data.dimmed
    ? "opacity-20"
    : !data.missing && !data.in_scope
      ? "opacity-70"
      : "";

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`flex items-center gap-2 rounded-xl border px-2 shadow-sm transition-opacity ${tone} ${
        selected ? "ring-2 ring-brand" : ""
      } ${opacity}`}
    >
      {/* The timeline pair is brand-coloured because a sequel is the spine of
          the graph. The middle pair is deliberately neutral: it stands for
          three families drawn in three different colours, so borrowing any
          one of them would be a lie about the other two. */}
      <Handle
        id={TIMELINE_TARGET}
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className={`!h-3 !w-3 !bg-brand${handleCls}`}
      />
      <Handle
        id={MIDDLE_TARGET}
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`!h-3 !w-3 !bg-gray-400${handleCls}`}
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
        <FittedName
          name={label}
          lines={TITLE_LINES}
          className="line-clamp-2 text-xs font-black leading-tight text-gray-800"
        />
        <span
          className={`mt-1 inline-block rounded-full px-1.5 text-[9px] font-black uppercase tracking-wide ${mediaTypeChip(
            media_type,
          )}`}
        >
          {type_label || media_type}
        </span>
      </div>

      <Handle
        id={TIMELINE_SOURCE}
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={`!h-3 !w-3 !bg-brand${handleCls}`}
      />
      <Handle
        id={MIDDLE_SOURCE}
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`!h-3 !w-3 !bg-gray-400${handleCls}`}
      />
    </div>
  );
}
