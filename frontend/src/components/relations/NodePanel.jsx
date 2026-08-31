// Frontend: the panel for one selected node.
//
// Read-only about the entry itself - this page curates relations, never entry
// fields - so the only affordances are a link out to the detail page and the
// isolate toggle, which is how a node's own story gets read out of a dense
// franchise.
import { Link } from "react-router-dom";

import { getCoverUrl } from "../../lib/covers";
import { mediaTypeChip } from "../../config/mediaTypeColors";

export default function NodePanel({
  node,
  relations,
  isolated,
  onToggleIsolate,
  onClose,
}) {
  return (
    <div className="absolute left-3 top-3 z-40 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <img
          src={getCoverUrl(node.cover_image_file)}
          alt=""
          className="h-16 w-12 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black leading-tight text-text">
            {node.display_name || "Missing entry"}
          </p>
          <span
            className={`mt-1 inline-block px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] ${mediaTypeChip(
              node.media_type,
            )}`}
          >
            {node.type_label || node.media_type}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-text-faint/60 hover:text-text-faint"
        >
          <i className="fas fa-xmark"></i>
        </button>
      </div>

      {relations.length === 0 ? (
        <p className="mt-3 text-[11px] font-bold text-text-faint">
          No relations yet — drag from its handle to add one.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {relations.map((r) => (
            <p
              key={r.system_id}
              className="truncate text-[11px] font-bold text-text-muted"
            >
              <span className="text-brand">{r.label}</span> — {r.otherName}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleIsolate}
          className={`rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase ${
            isolated
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-text-faint"
          }`}
        >
          Isolate
        </button>
        {node.nav_path ? (
          <Link
            to={node.nav_path}
            className="ml-auto text-[10px] font-black uppercase text-text-faint hover:text-brand"
          >
            Open entry <i className="fas fa-arrow-up-right-from-square"></i>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
