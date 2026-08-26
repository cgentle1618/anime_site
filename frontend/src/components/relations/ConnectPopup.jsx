// Frontend: what appears when a dragged connection is dropped.
//
// Nothing is written until the user confirms, so a misdrop costs one keystroke
// rather than a row to find and delete. The kind is picked here rather than
// armed beforehand, so there is no hidden mode to forget.
//
// The sentence matters: `prequel` is stored server-side as a swapped `sequel`
// row, so the node the drag started from is not necessarily the stored row's
// `from`. Reading "A is the ___ of B" is what makes the direction unambiguous
// regardless of how it is stored.
import { useEffect, useMemo, useState } from "react";

import { useGlobalMediaSearch } from "../../hooks/useGlobalMediaSearch";
import FittedName from "../layout/FittedName";

export default function ConnectPopup({
  kinds,
  source,
  target,
  position,
  error = null,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [kind, setKind] = useState("prequel");
  const [remark, setRemark] = useState("");
  const [swapped, setSwapped] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);

  const needsSearch = !target;
  const { hits, searching } = useGlobalMediaSearch(query, {
    enabled: needsSearch,
  });

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const far = target || picked;
  // Prequel first: "what came before" is the commonest edit.
  const ordered = useMemo(() => {
    const rest = kinds.filter((k) => k.key !== "prequel");
    const prequel = kinds.filter((k) => k.key === "prequel");
    return [...prequel, ...rest];
  }, [kinds]);

  const subject = swapped ? far : source;
  const object = swapped ? source : far;
  const label = ordered.find((k) => k.key === kind)?.label || kind;

  function submit(e) {
    e.preventDefault();
    if (!far) return;
    onConfirm({
      kind,
      from: subject.key,
      to: object.key,
      remark: remark.trim() || null,
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{ left: position.x, top: position.y }}
      className="absolute z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
    >
      <p
        data-testid="connect-sentence"
        className="text-xs font-bold leading-snug text-gray-600"
      >
        <span className="text-gray-900">
          {subject?.display_name || "This entry"}
        </span>{" "}
        is the <span className="text-brand">{label}</span> of{" "}
        <span className="text-gray-900">
          {object?.display_name || "…pick an entry"}
        </span>
      </p>

      {needsSearch && (
        <div className="mt-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every media type…"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {searching ? (
            <p className="mt-1 text-[10px] font-bold text-gray-400">Searching…</p>
          ) : null}
          {hits.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-100">
              {hits.map((hit) => (
                <button
                  key={hit.key}
                  type="button"
                  onClick={() => {
                    setPicked(hit);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-bold hover:bg-gray-50 ${
                    picked?.key === hit.key ? "bg-brand/10 text-brand" : "text-gray-700"
                  }`}
                >
                  <FittedName
                    name={hit.display_name}
                    className="min-w-0 flex-1 truncate"
                  />
                  <span className="shrink-0 text-[9px] uppercase text-gray-400">
                    {hit.media_type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {ordered.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
              kind === k.key
                ? "bg-brand text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (optional)"
        className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSwapped((s) => !s)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] font-black uppercase text-gray-500"
        >
          Swap
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1.5 text-[10px] font-black uppercase text-gray-400"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !far}
          className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
        >
          Add relation
        </button>
      </div>
    </form>
  );
}
