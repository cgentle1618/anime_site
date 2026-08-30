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
//
// `group` is which pair of handles the drag came off, and it gates the kinds
// on offer: a drag along the left/right spine can only become a Sequel or a
// Prequel, and one off the top/bottom handles can become anything else. The
// handle is therefore a real choice made before the popup opens, which is why
// there is no "wrong kind for this direction" error to recover from.
import { useEffect, useMemo, useState } from "react";

import { useGlobalMediaSearch } from "../../hooks/useGlobalMediaSearch";
import { kindsForGroup, TIMELINE } from "../../lib/relationHandles";
import FittedName from "../layout/FittedName";

export default function ConnectPopup({
  kinds,
  source,
  target,
  position,
  group = TIMELINE,
  error = null,
  busy = false,
  onConfirm,
  onCancel,
}) {
  // Null until the user picks, so the default can follow the group rather than
  // being frozen at mount - a hardcoded "prequel" would submit a kind the
  // middle group never even displays.
  const [chosenKind, setChosenKind] = useState(null);
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
  // Prequel first: "what came before" is the commonest edit. It only survives
  // the filter in the timeline group, so the middle group simply falls through
  // to its own first kind.
  const ordered = useMemo(() => {
    const allowed = kindsForGroup(kinds, group);
    const rest = allowed.filter((k) => k.key !== "prequel");
    const prequel = allowed.filter((k) => k.key === "prequel");
    return [...prequel, ...rest];
  }, [kinds, group]);

  const kind = chosenKind ?? ordered[0]?.key ?? "";
  const subject = swapped ? far : source;
  const object = swapped ? source : far;
  const label = ordered.find((k) => k.key === kind)?.label || kind;

  function submit(e) {
    e.preventDefault();
    if (!far || !kind) return;
    // The labels ride along because only the popup knows them: the far entry
    // may have come from the global search and so is not on the canvas yet,
    // which leaves the undo stack no way to name what it would reverse.
    onConfirm({
      kind,
      from: subject.key,
      to: object.key,
      remark: remark.trim() || null,
      label,
      fromName: subject.display_name,
      toName: object.display_name,
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{ left: position.x, top: position.y }}
      className="absolute z-50 w-72 rounded-xl border border-border bg-surface p-3 shadow-xl"
    >
      <p
        data-testid="connect-sentence"
        className="text-xs font-bold leading-snug text-text-muted"
      >
        <span className="text-text">
          {subject?.display_name || "This entry"}
        </span>{" "}
        is the <span className="text-brand">{label}</span> of{" "}
        <span className="text-text">
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
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {searching ? (
            <p className="mt-1 text-[10px] font-bold text-text-faint">Searching…</p>
          ) : null}
          {hits.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border">
              {hits.map((hit) => (
                <button
                  key={hit.key}
                  type="button"
                  onClick={() => {
                    setPicked(hit);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-bold hover:bg-surface-2 ${
                    picked?.key === hit.key ? "bg-brand/10 text-brand" : "text-text-muted"
                  }`}
                >
                  <FittedName
                    name={hit.display_name}
                    className="min-w-0 flex-1 truncate"
                  />
                  <span className="shrink-0 text-[9px] uppercase text-text-faint">
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
            onClick={() => setChosenKind(k.key)}
            className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
              kind === k.key
                ? "bg-brand text-white"
                : "bg-surface-2 text-text-muted hover:bg-surface-3"
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
        className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
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
          className="rounded-lg border border-border px-2 py-1.5 text-[10px] font-black uppercase text-text-faint"
        >
          Swap
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1.5 text-[10px] font-black uppercase text-text-faint"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !far || !kind}
          className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
        >
          Add relation
        </button>
      </div>
    </form>
  );
}
