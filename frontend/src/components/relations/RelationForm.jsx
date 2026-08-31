// Frontend: the form under the relations canvas.
//
// The same three writes the canvas makes - create, edit, delete - reached by
// picking from lists instead of dragging between nodes. Dragging is quick once
// both entries are on screen and awkward when they are not: a franchise of
// forty entries puts them a scroll apart, and the pair you want may be at
// opposite ends of the canvas. The form has no geometry to fight.
//
// It reads /for-entry rather than sharing the canvas's graph, because the
// question it answers is a different one - "what is related to THIS entry",
// both directions, each labelled for the side being viewed - and that endpoint
// already answers it for the detail pages.
//
// SENTENCES ARE WRITTEN IN THE STORED DIRECTION. A row means "`from` is the
// {label} of `to`", and the kind select here posts a kind against that stored
// pair. Reading a row from the selected entry's side instead - which is how
// /for-entry labels it - would mean every kind chosen had to be inverted
// before being sent, since "make the far entry the Sequel of this one" stores
// as a prequel from this side. That inversion is real (see restoringKind in
// lib/relationUndo) and it is not worth a second implementation, so the row is
// turned around here once and the select speaks the server's language.
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { mediaTypeChip } from "../../config/mediaTypeColors";

const nodeKey = (mediaType, entryId) => `${mediaType}:${entryId}`;

/**
 * One /for-entry row, turned back into the stored row it came from.
 *
 * `direction` is "forward" when the viewed entry is the stored `from`, so this
 * is all it takes - but it is the whole reason the sentence below reads the
 * right way round, so it is named rather than inlined.
 */
function storedPair(row, entry) {
  const viewed = {
    media_type: entry.media_type,
    entry_id: entry.entry_id,
    display_name: entry.display_name,
  };
  return row.direction === "forward"
    ? { from: viewed, to: row.other }
    : { from: row.other, to: viewed };
}

export default function RelationForm({
  entry,
  kinds = [],
  candidates = [],
  onWrote,
  onError,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);

  // The add row. Kept as one object so switching entry can clear it in one go.
  const [draft, setDraft] = useState({ other: "", kind: "", remark: "", swapped: false });

  const load = useCallback(() => {
    if (!entry) {
      setRows([]);
      return;
    }
    setLoading(true);
    fetch(
      buildUrl(endpoints.mediaRelation.forEntry(), {
        media_type: entry.media_type,
        entry_id: entry.entry_id,
      }),
      { credentials: "include" },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((body) => setRows(Array.isArray(body) ? body : []))
      .catch((e) => onError?.(e?.message || "Could not reach the server."))
      .finally(() => setLoading(false));
    // onError is a fresh closure on every page render; depending on it would
    // re-request on every keystroke elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.media_type, entry?.entry_id]);

  useEffect(() => {
    load();
    setDraft({ other: "", kind: "", remark: "", swapped: false });
  }, [load]);

  // Neither the entry itself nor one it is already linked to: the server
  // refuses both (409 self-relation, 409 duplicate), so offering them would
  // only be offering a mistake.
  const pickable = useMemo(() => {
    if (!entry) return [];
    const taken = new Set(
      rows.map((r) => nodeKey(r.other.media_type, r.other.entry_id)),
    );
    const self = nodeKey(entry.media_type, entry.entry_id);
    return candidates.filter((c) => {
      const key = nodeKey(c.media_type, c.entry_id);
      return key !== self && !taken.has(key);
    });
  }, [candidates, rows, entry]);

  const kind = draft.kind || kinds[0]?.key || "";
  const kindLabel = kinds.find((k) => k.key === kind)?.label || kind;
  const picked = pickable.find(
    (c) => nodeKey(c.media_type, c.entry_id) === draft.other,
  );
  // The sentence, and the endpoints, in one place: swapping trades the two
  // rather than rewriting the kind, exactly as ConnectPopup does it.
  const subject = draft.swapped ? picked : entry;
  const object = draft.swapped ? entry : picked;

  async function write(request) {
    if (writing) return false;
    setWriting(true);
    try {
      const res = await fetch(request.url, {
        method: request.method,
        credentials: "include",
        ...(request.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.body),
            }
          : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError?.(data?.detail || res.statusText);
        return false;
      }
      load();
      onWrote?.();
      return true;
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
      return false;
    } finally {
      setWriting(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!subject || !object || !kind) return;
    const saved = await write({
      method: "POST",
      url: endpoints.mediaRelation.create(),
      body: {
        from_type: subject.media_type,
        from_id: String(subject.entry_id),
        kind,
        to_type: object.media_type,
        to_id: String(object.entry_id),
        remark: draft.remark.trim() || null,
      },
    });
    if (saved) setDraft({ other: "", kind: "", remark: "", swapped: false });
  }

  if (!entry) {
    return (
      <div className="rounded-2xl border border-border bg-surface-2 p-6">
        <p className="text-center text-sm font-medium text-text-faint">
          Pick an entry on the left to edit its relations as a form.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-black text-text">{entry.display_name}</h2>
        <span
          className={`px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] ${mediaTypeChip(
            entry.media_type,
          )}`}
        >
          {entry.media_type}
        </span>
        <span className="ml-auto text-[10px] font-black uppercase tracking-wider text-text-faint">
          {rows.length} relation{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-text-faint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-text-faint">
          No relations yet — add one below, or drag from its handle on the canvas.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <ExistingRow
              key={row.system_id}
              row={row}
              entry={entry}
              kinds={kinds}
              busy={writing}
              onWrite={write}
            />
          ))}
        </div>
      )}

      <form onSubmit={add} className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-bold leading-snug text-text-muted">
          <span className="text-text">
            {subject?.display_name || "…pick an entry"}
          </span>{" "}
          is the <span className="text-brand">{kindLabel}</span> of{" "}
          <span className="text-text">
            {object?.display_name || "…pick an entry"}
          </span>
        </p>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
              Other entry
            </span>
            <select
              value={draft.other}
              disabled={writing}
              onChange={(e) => setDraft((d) => ({ ...d, other: e.target.value }))}
              className="rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Pick an entry…</option>
              {pickable.map((c) => (
                <option
                  key={nodeKey(c.media_type, c.entry_id)}
                  value={nodeKey(c.media_type, c.entry_id)}
                >
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
              Kind
            </span>
            <select
              value={kind}
              disabled={writing}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
              className="rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
              Remark
            </span>
            <input
              type="text"
              value={draft.remark}
              disabled={writing}
              onChange={(e) => setDraft((d) => ({ ...d, remark: e.target.value }))}
              placeholder="Optional"
              className="rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>

          <button
            type="button"
            disabled={writing}
            onClick={() => setDraft((d) => ({ ...d, swapped: !d.swapped }))}
            title="Turn the sentence around"
            className="rounded-lg border border-border px-2 py-2 text-[10px] font-black uppercase text-text-faint disabled:opacity-40"
          >
            Swap
          </button>

          <button
            type="submit"
            disabled={writing || !picked || !kind}
            className="rounded-lg bg-brand px-3 py-2 text-[11px] font-black text-on-brand disabled:opacity-40"
          >
            Add relation
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * One stored relation, editable in place.
 *
 * Its own component so the remark can be held as local state: a box shared
 * across rows would re-seed every row on every keystroke in any of them.
 */
function ExistingRow({ row, entry, kinds, busy, onWrite }) {
  const { from, to } = storedPair(row, entry);
  const [remark, setRemark] = useState(row.remark || "");
  // Re-seeds when the saved text changes, which is how a refused PATCH's
  // reload puts the stored remark back in the box.
  useEffect(() => {
    setRemark(row.remark || "");
  }, [row.system_id, row.remark]);

  const label =
    kinds.find((k) => k.key === row.relation_type)?.label || row.relation_type;
  // A symmetric kind sorts its endpoints server-side, so a swap comes back as
  // the row that went in. Disabled rather than appearing to work.
  const symmetric =
    kinds.find((k) => k.key === row.relation_type)?.symmetric === true;

  function patch(body) {
    return onWrite({
      method: "PATCH",
      url: endpoints.mediaRelation.patch(row.system_id),
      body,
    });
  }

  async function commitRemark() {
    const next = remark.trim();
    if (next === (row.remark || "")) return;
    const saved = await patch({ remark: next });
    if (!saved) setRemark(row.remark || "");
  }

  function remove() {
    if (
      !window.confirm(
        `Remove the "${label}" link between ${from.display_name} and ${to.display_name}? The entries themselves are not touched.`,
      )
    )
      return;
    onWrite({
      method: "DELETE",
      url: endpoints.mediaRelation.remove(row.system_id),
    });
  }

  return (
    <div
      data-testid={`relation-row-${row.system_id}`}
      className="rounded-xl border border-border bg-surface-2/60 p-2"
    >
      <p className="text-xs font-bold leading-snug text-text-muted">
        <span className="text-text">{from.display_name}</span> is the{" "}
        <span className="text-brand">{label}</span> of{" "}
        <span className="text-text">{to.display_name}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
            Kind
          </span>
          <select
            value={row.relation_type}
            disabled={busy}
            onChange={(e) => patch({ kind: e.target.value })}
            className="rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
            Remark
          </span>
          <input
            type="text"
            value={remark}
            disabled={busy}
            onChange={(e) => setRemark(e.target.value)}
            // On blur, not per keystroke: a remark is a sentence, not a stream
            // of PATCHes.
            onBlur={commitRemark}
            placeholder="Optional"
            className="rounded-lg border border-border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <button
          type="button"
          disabled={busy || symmetric}
          onClick={() => patch({ swap: true })}
          title={
            symmetric
              ? `A ${label} reads the same both ways, so there is nothing to swap`
              : `Make ${to.display_name} the ${label} of ${from.display_name} instead`
          }
          className="rounded-lg border border-border px-2 py-2 text-[10px] font-black uppercase text-text-faint disabled:opacity-40"
        >
          Swap
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="rounded-lg border border-danger/40 px-2 py-2 text-[10px] font-black uppercase text-danger disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
