// Frontend: admin page for curating media relations.
//
// Left: pick a franchise or collection, then one of its entries. Right: that
// entry's relations, from both directions, plus the form that adds one.
//
// The franchise/collection picker is a browsing lens, not ownership: unlike a
// watch order, a relation belongs to no tier - it links two entries. Collection
// works as the wider lens because it sits strictly above Franchise, which is
// also where most cross-franchise relations live.
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { useGlobalMediaSearch } from "../../hooks/useGlobalMediaSearch";
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";
import RelationGraph from "../../components/relations/RelationGraph";

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Only the display
// order and headings live here; the kinds themselves come from the API.
const FAMILY_ORDER = ["timeline", "equivalence", "branch", "derivation"];
const FAMILY_LABELS = {
  timeline: "Timeline",
  equivalence: "Equivalence",
  branch: "Branch",
  derivation: "Derivation",
};

function AddRelationForm({ kinds, candidates, onCreate, busy }) {
  // Prequel first: adding "what came before" is the commonest edit, and the
  // API stores it as a swapped sequel row.
  const [kind, setKind] = useState("prequel");
  const [targetKey, setTargetKey] = useState(null);
  const [remark, setRemark] = useState("");
  // A relation is bound to no tier - it links two entries - so the target need
  // not share the browsing scope. This widens the picker to the whole library
  // for a link that crosses franchises, or whose far entry belongs to a
  // franchise with no collection at all.
  const [searchAll, setSearchAll] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const { hits: globalHits } = useGlobalMediaSearch(globalQuery, {
    enabled: searchAll,
  });

  // Candidates are keyed by "type:id" because entry_id alone is ambiguous -
  // each media table has its own system_id space.
  const source = searchAll ? globalHits : candidates;
  const items = useMemo(
    () =>
      source.map((c) => ({
        id: `${c.media_type}:${c.entry_id}`,
        // The type is worth showing once the list spans every table: two
        // entries can share a title across anime and manga.
        label: searchAll
          ? `${c.display_name} · ${c.media_type}`
          : c.display_name,
        searchText: (c.search_names || []).join(" "),
      })),
    [source, searchAll]
  );

  function submit(e) {
    e.preventDefault();
    if (!targetKey) return;
    const [toType, toId] = targetKey.split(":");
    onCreate({
      kind,
      to_type: toType,
      to_id: toId,
      remark: remark.trim() || null,
    });
    setTargetKey(null);
    setRemark("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50"
    >
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
        Add relation
      </p>

      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>
            This entry is the {k.label} of…
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-2 text-[11px] font-bold text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={searchAll}
          onChange={(e) => {
            setSearchAll(e.target.checked);
            // The previous pick came from the other list and may not be in
            // this one; clearing avoids a selection the box cannot display.
            setTargetKey(null);
            setGlobalQuery("");
          }}
          className="accent-brand"
        />
        Search all media (link across franchises)
      </label>

      {searchAll && (
        <input
          type="text"
          value={globalQuery}
          onChange={(e) => setGlobalQuery(e.target.value)}
          placeholder="Type at least 2 characters…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
        />
      )}

      <ComboBox
        items={items}
        selectedId={targetKey}
        onSelect={(id) => setTargetKey(id)}
        onClear={() => setTargetKey(null)}
        placeholder={
          searchAll
            ? globalQuery.trim().length < 2
              ? "Type in the box above first…"
              : `${items.length} match${items.length === 1 ? "" : "es"} — pick one`
            : "Search entries in this scope…"
        }
      />

      <input
        type="text"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (optional)"
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <button
        type="submit"
        disabled={busy || !targetKey}
        className="rounded-lg bg-brand px-3 py-2 text-xs font-black text-white disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}

export default function Relations() {
  const { showToast } = useToast();

  const [scopeType, setScopeType] = useState("franchise");
  const [scopeId, setScopeId] = useState(null);
  const [owners, setOwners] = useState({ franchises: [], collections: [] });

  const [kinds, setKinds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(null); // {media_type, entry_id}
  const [relations, setRelations] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // The vocabulary and the owner lists never change while the page is open.
  useEffect(() => {
    fetch(endpoints.mediaRelation.kinds(), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setKinds);

    // limit=2000 (the endpoint's ceiling), not the default 500: there are
    // already ~600 franchises, and a truncated list would silently hide owners
    // from the picker. Same reasoning as WatchOrders.jsx.
    Promise.all([
      fetch(buildUrl(endpoints.resource("franchise").list(), { limit: 2000 }), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildUrl(endpoints.resource("collection").list(), { limit: 2000 }), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([franchises, collections]) =>
      setOwners({ franchises, collections })
    );
  }, []);

  const ownerItems = useMemo(() => {
    const source =
      scopeType === "franchise" ? owners.franchises : owners.collections;
    const prefix = scopeType === "franchise" ? "franchise" : "collection";
    return source.map((o) => ({
      id: o.system_id,
      label: getDisplayName(o, scopeType),
      searchText: [
        o[`${prefix}_name_cn`],
        o[`${prefix}_name_en`],
        o[`${prefix}_name_alt`],
        o[`${prefix}_name_roman`],
        o[`${prefix}_name_jp`],
      ]
        .filter(Boolean)
        .join(" "),
    }));
  }, [owners, scopeType]);

  // One entries request and one relations request per scope, never per row.
  const loadScope = useCallback(async () => {
    if (!scopeId) {
      setCandidates([]);
      setCounts({});
      return;
    }
    const scopeParam =
      scopeType === "franchise"
        ? { franchise_id: scopeId }
        : { collection_id: scopeId };

    const [entries, rows] = await Promise.all([
      fetch(buildUrl(endpoints.watchOrder.candidates(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildUrl(endpoints.mediaRelation.inScope(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    setCandidates(entries);

    // Count both endpoints: an entry with only inbound relations still has
    // relations, and the badge would otherwise read zero.
    const tally = {};
    for (const row of rows) {
      for (const key of [
        `${row.from_type}:${row.from_id}`,
        `${row.to_type}:${row.to_id}`,
      ]) {
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    setCounts(tally);
  }, [scopeId, scopeType]);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  const loadRelations = useCallback(async () => {
    if (!selected) {
      setRelations([]);
      return;
    }
    const res = await fetch(
      buildUrl(endpoints.mediaRelation.forEntry(), {
        media_type: selected.media_type,
        entry_id: selected.entry_id,
      }),
      { credentials: "include" }
    );
    setRelations(res.ok ? await res.json() : []);
  }, [selected]);

  useEffect(() => {
    loadRelations();
  }, [loadRelations]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((c) =>
      (c.search_names || [c.display_name || ""])
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [candidates, query]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    for (const c of visible) {
      if (!buckets.has(c.media_type)) buckets.set(c.media_type, []);
      buckets.get(c.media_type).push(c);
    }
    return [...buckets.entries()];
  }, [visible]);

  const byFamily = useMemo(() => {
    const buckets = {};
    for (const r of relations) {
      (buckets[r.family] = buckets[r.family] || []).push(r);
    }
    return buckets;
  }, [relations]);

  function switchScope(type) {
    if (type === scopeType) return;
    setScopeType(type);
    // The previous pick belongs to the other tier and cannot carry over.
    setScopeId(null);
    setSelected(null);
  }

  async function createRelation({ kind, to_type, to_id, remark }) {
    setBusy(true);
    try {
      const res = await fetch(endpoints.mediaRelation.create(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_type: selected.media_type,
          from_id: selected.entry_id,
          kind,
          to_type,
          to_id,
          remark,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      await Promise.all([loadRelations(), loadScope()]);
      showToast("success", "Relation added.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRelation(row) {
    const other = row.other.display_name || "a missing entry";
    if (
      !window.confirm(
        `Remove the "${row.label}" link to ${other}? The entries themselves are not touched.`
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(endpoints.mediaRelation.remove(row.system_id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      await Promise.all([loadRelations(), loadScope()]);
      showToast("success", "Relation removed.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedEntry = candidates.find(
    (c) =>
      selected &&
      c.media_type === selected.media_type &&
      c.entry_id === selected.entry_id
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <i className="fas fa-diagram-project text-brand"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Relations
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            Prequels, alternatives, side stories and adaptations across every
            media type
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Left: pick a scope, then an entry */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg bg-gray-200/70">
            {[
              ["franchise", "Franchise"],
              ["collection", "Collection"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchScope(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-black transition-colors ${
                  scopeType === value
                    ? "bg-white text-brand shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <ComboBox
            items={ownerItems}
            selectedId={scopeId}
            onSelect={(id) => {
              setScopeId(id);
              setSelected(null);
            }}
            onClear={() => {
              setScopeId(null);
              setSelected(null);
            }}
            placeholder={`Search ${scopeType}s…`}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter entries…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />

          {!scopeId ? (
            <p className="text-center py-8 text-sm font-medium text-gray-400">
              Pick a {scopeType} to begin.
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-center py-8 text-sm font-medium text-gray-400">
              No entries in this {scopeType}.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([mediaType, rows]) => (
                <div key={mediaType}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    {mediaType}
                  </p>
                  <div className="flex flex-col gap-1">
                    {rows.map((c) => {
                      const key = `${c.media_type}:${c.entry_id}`;
                      const active =
                        selected &&
                        selected.media_type === c.media_type &&
                        selected.entry_id === c.entry_id;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setSelected({
                              media_type: c.media_type,
                              entry_id: c.entry_id,
                            })
                          }
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors ${
                            active
                              ? "bg-brand/10 text-brand"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <span className="truncate">{c.display_name}</span>
                          {counts[key] ? (
                            <span className="shrink-0 rounded-full bg-gray-200 px-2 text-[10px] font-black text-gray-600">
                              {counts[key]}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: the selected entry's relations */}
        <div className="flex flex-col gap-4">
          <RelationGraph
            scopeType={scopeType}
            scopeId={scopeId}
            onPickGhostFranchise={(franchiseId) => {
              // A ghost lives in another franchise; following it moves the lens.
              setScopeType("franchise");
              setScopeId(franchiseId);
              setSelected(null);
            }}
          />

          {!selected ? (
            <p className="py-16 text-center text-sm font-medium text-gray-400">
              Select an entry to see and edit its relations.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-black text-gray-900">
                {selectedEntry?.display_name || "Selected entry"}
              </h2>

              <AddRelationForm
                kinds={kinds}
                candidates={candidates.filter(
                  (c) =>
                    !(
                      c.media_type === selected.media_type &&
                      c.entry_id === selected.entry_id
                    )
                )}
                onCreate={createRelation}
                busy={busy}
              />

              {relations.length === 0 ? (
                <p className="text-sm font-medium text-gray-400">
                  No relations yet.
                </p>
              ) : (
                FAMILY_ORDER.filter((f) => byFamily[f]).map((family) => (
                  <div key={family}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      {FAMILY_LABELS[family]}
                    </p>
                    <div className="flex flex-col gap-1">
                      {byFamily[family].map((row) => (
                        <div
                          key={row.system_id}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                            row.other.missing
                              ? "border-red-200 bg-red-50"
                              : "border-gray-200"
                          }`}
                        >
                          <span className="shrink-0 text-xs font-black text-brand">
                            {row.label}
                          </span>
                          <span className="truncate text-sm font-bold text-gray-800">
                            {row.other.missing
                              ? `Missing entry ${row.other.entry_id}`
                              : row.other.display_name}
                          </span>
                          {row.other.label ? (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 text-[10px] font-black text-gray-500">
                              {row.other.label}
                            </span>
                          ) : null}
                          {row.remark ? (
                            <span className="truncate text-xs font-medium text-gray-400">
                              {row.remark}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => deleteRelation(row)}
                            disabled={busy}
                            className="ml-auto shrink-0 text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-40"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
