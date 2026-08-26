// Frontend: the panel for one selected edge.
//
// Changing the kind re-normalizes server-side (a `prequel` becomes a swapped
// `sequel` row), so this posts the kind as typed and refetches rather than
// trying to predict the stored direction.
import { useEffect, useState } from "react";

export default function EdgeInspector({
  edge,
  kinds,
  busy = false,
  onPatch,
  onDelete,
  onClose,
}) {
  // Controlled, like the kind select above: an uncontrolled box would keep
  // showing text a rejected PATCH never saved, so the panel would claim a
  // remark the row does not have. Re-seeds whenever the saved remark changes,
  // which is how a successful write's refetch lands here.
  const [remark, setRemark] = useState(edge.remark || "");
  useEffect(() => {
    setRemark(edge.remark || "");
  }, [edge.system_id, edge.remark]);

  async function commitRemark() {
    const next = remark.trim();
    if (next === (edge.remark || "")) return;
    const saved = await onPatch({ remark: next });
    // Nothing was stored, so nothing should be shown as stored.
    if (!saved) setRemark(edge.remark || "");
  }

  return (
    <div className="absolute right-3 top-3 z-40 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold leading-snug text-gray-600">
          <span className="text-gray-900">{edge.sourceName}</span> is the{" "}
          <span className="text-brand">{edge.label}</span> of{" "}
          <span className="text-gray-900">{edge.targetName}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-gray-300 hover:text-gray-500"
        >
          <i className="fas fa-xmark"></i>
        </button>
      </div>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-gray-400">
        Kind
      </label>
      <select
        value={edge.relation_type}
        disabled={busy}
        onChange={(e) => onPatch({ kind: e.target.value })}
        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </select>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-gray-400">
        Remark
      </label>
      <input
        type="text"
        value={remark}
        disabled={busy}
        onChange={(e) => setRemark(e.target.value)}
        // On blur, not on every keystroke: a remark is a sentence, not a
        // stream of PATCHes.
        //
        // Cleared to "" rather than null: MediaRelationUpdate ignores a null
        // remark (`if payload.remark is not None`), so posting null would
        // silently leave the old text in the row.
        onBlur={commitRemark}
        placeholder="Optional"
        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="mt-3 w-full rounded-lg border border-red-200 px-2 py-1.5 text-[11px] font-black uppercase text-red-500 disabled:opacity-40"
      >
        Remove relation
      </button>
    </div>
  );
}
