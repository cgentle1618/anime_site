// Frontend: admin page for building watch orders.
//
// Left: every order, grouped by the franchise or collection that owns it.
// Right: the editor for whichever one is selected. The Franchise and
// Collection pages only ever read orders; all writing happens here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import WatchOrderEditor from "../../components/tracker/WatchOrderEditor";

function NewOrderForm({ owners, onCreate, busy }) {
  const [ownerKey, setOwnerKey] = useState("");
  const [name, setName] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!ownerKey || !name.trim()) return;
    const [type, id] = ownerKey.split(":");
    onCreate({
      list_name: name.trim(),
      ...(type === "franchise" ? { franchise_id: id } : { collection_id: id }),
    });
    setName("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50"
    >
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
        New order
      </p>
      <select
        value={ownerKey}
        onChange={(e) => setOwnerKey(e.target.value)}
        className="border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="">Choose an owner…</option>
        <optgroup label="Franchises">
          {owners.franchises.map((f) => (
            <option key={f.system_id} value={`franchise:${f.system_id}`}>
              {getDisplayName(f, "franchise")}
            </option>
          ))}
        </optgroup>
        <optgroup label="Collections">
          {owners.collections.map((c) => (
            <option key={c.system_id} value={`collection:${c.system_id}`}>
              {getDisplayName(c, "collection")}
            </option>
          ))}
        </optgroup>
      </select>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Order name, e.g. Chronological"
        className="border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <button
        type="submit"
        disabled={busy || !ownerKey || !name.trim()}
        className="bg-brand text-white rounded-lg px-3 py-2 text-xs font-black disabled:opacity-40"
      >
        <i className="fas fa-plus mr-1"></i>Create
      </button>
    </form>
  );
}

export default function WatchOrders() {
  const { showToast } = useToast();

  const [lists, setLists] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(
    () =>
      fetch(endpoints.watchOrder.lists(), { credentials: "include" })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
        .then(setLists)
        .catch(() => showToast("error", "Could not load watch orders.")),
    [showToast]
  );

  useEffect(() => {
    // Owner names come from the franchise and collection lists, which the
    // grouping headers and the new-order picker both need.
    Promise.all([
      loadLists(),
      fetch(endpoints.resource("franchise").list(), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setFranchises),
      fetch(endpoints.resource("collection").list(), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setCollections),
    ]).finally(() => setLoading(false));
  }, [loadLists]);

  const ownerName = useCallback(
    (list) => {
      if (list.franchise_id) {
        const f = franchises.find((x) => x.system_id === list.franchise_id);
        return f ? getDisplayName(f, "franchise") : "Unknown franchise";
      }
      const c = collections.find((x) => x.system_id === list.collection_id);
      return c ? getDisplayName(c, "collection") : "Unknown collection";
    },
    [franchises, collections]
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map();
    lists
      .filter((l) => {
        if (!q) return true;
        return (
          (l.list_name || "").toLowerCase().includes(q) ||
          ownerName(l).toLowerCase().includes(q)
        );
      })
      .forEach((l) => {
        const key = ownerName(l);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(l);
      });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lists, query, ownerName]);

  async function createList(payload) {
    setBusy(true);
    try {
      const res = await fetch(endpoints.watchOrder.createList(), {
        method: "POST",
        credentials: "include",
        ...jsonBody(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      const created = await res.json();
      await loadLists();
      setSelectedId(created.system_id);
      showToast("success", "Watch order created.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteList(id) {
    const target = lists.find((l) => l.system_id === id);
    if (
      !window.confirm(
        `Delete "${target?.list_name || "this order"}"? Its steps go with it. ` +
          "The media entries themselves are not touched."
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(endpoints.watchOrder.removeList(id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      await loadLists();
      if (selectedId === id) setSelectedId(null);
      showToast("success", "Watch order deleted.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <i className="fas fa-list-ol text-brand"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Watch Orders
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            Ordered viewing guides across every media type
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Left: all orders */}
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders or owners…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />

          <NewOrderForm
            owners={{ franchises, collections }}
            onCreate={createList}
            busy={busy}
          />

          {loading ? (
            <div className="py-10 text-center text-gray-400">
              <i className="fas fa-circle-notch fa-spin"></i>
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-center py-8 text-sm font-medium text-gray-400">
              No watch orders yet.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([owner, rows]) => (
                <div key={owner}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    {owner}
                  </p>
                  <div className="flex flex-col gap-1">
                    {rows.map((l) => (
                      <div
                        key={l.system_id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          selectedId === l.system_id
                            ? "border-brand bg-brand/5"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(l.system_id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <span className="block text-sm font-bold text-gray-800 truncate">
                            {l.list_name || "Untitled Order"}
                          </span>
                          <span className="block text-[10px] font-bold text-gray-400">
                            {l.item_count} steps
                            {l.is_default ? " · default" : ""}
                          </span>
                        </button>
                        <Link
                          to={`/watch-order/${l.system_id}`}
                          title="Open public page"
                          className="text-gray-300 hover:text-brand"
                        >
                          <i className="fas fa-arrow-up-right-from-square text-xs"></i>
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteList(l.system_id)}
                          title="Delete order"
                          className="text-gray-300 hover:text-red-600"
                        >
                          <i className="fas fa-trash text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: the editor */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <WatchOrderEditor listId={selectedId} onListChanged={loadLists} />
        </div>
      </div>
    </div>
  );
}
