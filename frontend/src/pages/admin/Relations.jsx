// Frontend: admin page for curating media relations.
//
// Left: pick a franchise or collection, then one of its entries. Right: the
// scope's relations as a canvas, which is where every edit now happens -
// selecting, connecting, inspecting and deleting all live on the graph.
//
// The franchise/collection picker is a browsing lens, not ownership: unlike a
// watch order, a relation belongs to no tier - it links two entries. Collection
// works as the wider lens because it sits strictly above Franchise, which is
// also where most cross-franchise relations live.
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";
import FittedName from "../../components/layout/FittedName";
import RelationGraph from "../../components/relations/RelationGraph";

export default function Relations() {
  const { showToast } = useToast();

  const [scopeType, setScopeType] = useState("franchise");
  const [scopeId, setScopeId] = useState(null);
  const [owners, setOwners] = useState({ franchises: [], collections: [] });

  const [kinds, setKinds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  // The left pane's highlight, and the canvas's focus target.
  const [selected, setSelected] = useState(null); // {media_type, entry_id}
  const [query, setQuery] = useState("");

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

  function switchScope(type) {
    if (type === scopeType) return;
    setScopeType(type);
    // The previous pick belongs to the other tier and cannot carry over.
    setScopeId(null);
    setSelected(null);
  }

  return (
    <div className="mx-auto px-4 py-6">
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
                            // The nonce climbs on every click, including a
                            // repeat of the entry already selected: closing
                            // the canvas panel and clicking the same row
                            // again has to reopen it, and the key alone
                            // would not have changed.
                            setSelected((current) => ({
                              media_type: c.media_type,
                              entry_id: c.entry_id,
                              nonce: (current?.nonce ?? 0) + 1,
                            }))
                          }
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors ${
                            active
                              ? "bg-brand/10 text-brand"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <FittedName
                            name={c.display_name}
                            className="min-w-0 flex-1 truncate"
                          />
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

        {/* Right: the scope's relations, as a canvas */}
        <div className="flex flex-col gap-4">
          <RelationGraph
            scopeType={scopeType}
            scopeId={scopeId}
            kinds={kinds}
            // The canvas refetches itself; the page only has to re-tally the
            // left pane's relation counts.
            onWrote={() => {
              loadScope();
              showToast("success", "Relations updated.");
            }}
            onError={(message) => showToast("error", message)}
            focusKey={
              selected ? `${selected.media_type}:${selected.entry_id}` : null
            }
            focusNonce={selected?.nonce}
            onPickGhostFranchise={(franchiseId) => {
              // A ghost lives in another franchise; following it moves the lens.
              setScopeType("franchise");
              setScopeId(franchiseId);
              setSelected(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
