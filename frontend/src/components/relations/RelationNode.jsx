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
