// Frontend: admin page for building watch orders.
//
// Owner-first: the left pane starts as a search over the franchises,
// series and collections that own orders. Pick one and the pane scopes to
// its orders; a separate name search cuts across every owner at once.
// Right: the editor for whichever order is selected. The Franchise and
// Collection pages only ever read orders; all writing happens here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { buildUrl, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import WatchOrderEditor, {
  LIST_TYPES,
} from "../../components/tracker/WatchOrderEditor";
import { MediaScopeLine } from "../../components/tracker/WatchOrderGuide";

// Every tier that can own an order, widest first: a collection sits above
// franchises, which sit above series. Series own only built-in orders today,
// but they are listed here so those orders stay reachable rather than
// falling through the franchise/collection split as they used to.
const TIERS = ["collection", "franchise", "series"];

// "order" is not a tier, but it is a result kind and a search scope, so it
// carries a label and a pill alongside the three real tiers.
const TIER_LABELS = {
  franchise: "Franchise",
  series: "Series",
  collection: "Collection",
  order: "Order",
};

const TIER_STYLES = {
  franchise: "bg-brand/10 text-brand border-brand/20",
  series: "bg-violet-50 text-violet-600 border-violet-200",
  collection: "bg-amber-50 text-amber-600 border-amber-200",
  order: "bg-gray-100 text-gray-600 border-gray-200",
};

// One bar for everything, the way the universal search in the nav works:
// "all" spans owners and orders, the rest narrow to a single kind.
const SCOPES = ["all", ...TIERS, "order"];

const SCOPE_PLACEHOLDERS = {
  all: "Search owners and orders…",
  collection: "Search collections…",
  franchise: "Search franchises…",
  series: "Search series…",
  order: "Find an order by name…",
};

// The owner of a list as one string, so lists and owners can be joined
// without every call site re-checking which of the three id columns is set.
function ownerKeyOf(list) {
  if (list.franchise_id) return `franchise:${list.franchise_id}`;
  if (list.series_id) return `series:${list.series_id}`;
  if (list.collection_id) return `collection:${list.collection_id}`;
  return "unknown";
}

function TierPill({ tier }) {
  return (
    <span
      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
        TIER_STYLES[tier] || "bg-gray-100 text-gray-500 border-gray-200"
      }`}
    >
      {TIER_LABELS[tier] || tier}
    </span>
  );
}

// Creating always happens inside a scoped view, so the owner is fixed and
// the form only asks for the two things that are actually per-order.
function NewOrderForm({ owner, onCreate, onCancel, busy }) {
  const [name, setName] = useState("");
  // Matches the column default, so creating without touching this behaves
  // the way it did before the field existed.
  const [listType, setListType] = useState("Custom");

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      list_name: name.trim(),
      list_type: listType,
      [`${owner.tier}_id`]: owner.id,
    });
    setName("");
    setListType("Custom");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50"
    >
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
        New order in {owner.name}
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        placeholder="Order name, e.g. Chronological"
        className="border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <select
        value={listType}
        onChange={(e) => setListType(e.target.value)}
        aria-label="Order type"
        className="border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {LIST_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="flex-1 bg-brand text-white rounded-lg px-3 py-2 text-xs font-black disabled:opacity-40"
        >
          <i className="fas fa-plus mr-1"></i>Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-black text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// One result in the unscoped browse list: who owns orders, and how many. No
// tier pill here — the browse list is sectioned by tier, so the heading above
// the row already says which one this is.
function OwnerRow({ owner, counts, onSelect }) {
  const total = counts?.total || 0;
  const builtIn = counts?.builtIn || 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(owner.key)}
      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-brand hover:bg-brand/5 transition-colors"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-gray-800 truncate">
          {owner.name}
        </span>
        <span className="block text-[10px] font-bold text-gray-400 mt-0.5">
          {total === 0
            ? "No orders yet"
            : `${total} order${total === 1 ? "" : "s"}`}
          {builtIn > 0 ? ` · ${builtIn} built-in` : ""}
        </span>
      </span>
      <i className="fas fa-chevron-right text-[10px] text-gray-300"></i>
    </button>
  );
}

// One order. Unchanged from the flat list this page used to be, so the
// badges and the open/duplicate/delete affordances read the same.
function OrderRow({ list, selected, onSelect, onDuplicate, onDelete, busy }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        selected
          ? "border-brand bg-brand/5"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(list.system_id)}
        className="flex-1 text-left min-w-0"
      >
        <span className="block text-sm font-bold text-gray-800 truncate">
          {list.list_name || "Untitled Order"}
        </span>
        {/* Scope gets its own line here too, rather than being buried in
            the grey subtitle. */}
        <MediaScopeLine mediaTypes={list.media_types} short className="mt-0.5" />
        <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {list.auto_source && (
            <span
              title="Built in: steps generated from release dates"
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200"
            >
              <i className="fas fa-wand-magic-sparkles mr-1"></i>
              Built-in
            </span>
          )}
          {list.list_type && (
            /* Same pill the standalone page uses, so the type is
               recognisable as the same thing. */
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
              {list.list_type}
            </span>
          )}
          <span className="text-[10px] font-bold text-gray-400">
            {list.is_most_recommended && (
              <i className="fas fa-star text-amber-400 mr-1"></i>
            )}
            {list.item_count} steps
            {list.is_default ? " · default" : ""}
            {list.is_most_recommended ? " · most recommended" : ""}
          </span>
        </span>
      </button>
      <Link
        to={`/watch-order/${list.system_id}`}
        title="Open public page"
        className="text-gray-300 hover:text-brand"
      >
        <i className="fas fa-arrow-up-right-from-square text-xs"></i>
      </Link>
      <button
        type="button"
        onClick={() => onDuplicate(list.system_id)}
        disabled={busy}
        title={
          list.auto_source ? "Duplicate as an editable order" : "Duplicate order"
        }
        className="text-gray-300 hover:text-brand disabled:opacity-40"
      >
        <i className="fas fa-copy text-xs"></i>
      </button>
      <button
        type="button"
        onClick={() => onDelete(list.system_id)}
        title="Delete order"
        className="text-gray-300 hover:text-red-600"
      >
        <i className="fas fa-trash text-xs"></i>
      </button>
    </div>
  );
}

export default function WatchOrders() {
  const { showToast } = useToast();

  const [lists, setLists] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [seriesRows, setSeriesRows] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // One search over both owners and orders, narrowed by a scope the way the
  // nav's universal search is — you rarely know in advance whether the name
  // you half-remember belongs to a franchise or to an order.
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState("all");
  const [creating, setCreating] = useState(false);
  // Built-in orders exist for nearly every owner, so showing them by default
  // would bury the hand-built ones this page is really for.
  const [showGenerated, setShowGenerated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // The scoped owner lives in the URL so a reload or a shared link lands
  // back on the same franchise rather than at square one.
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeKey = searchParams.get("owner");

  const setScope = useCallback(
    (key) => {
      setCreating(false);
      // Picking an owner ends the search. The scoped view is skipped while a
      // query is live, so leaving the box filled would swallow the click and
      // keep the result list on screen as if nothing had been selected.
      setQuery("");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key) next.set("owner", key);
          else next.delete("owner");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const loadLists = useCallback(
    () =>
      fetch(
        // limit=2000 (the endpoint's ceiling), not the default 500: there is
        // one built-in order per owner, so with the toggle on they alone
        // overflow the default page and silently truncate the hand-built
        // orders this page exists for.
        buildUrl(endpoints.watchOrder.lists(), {
          auto: showGenerated ? undefined : "exclude",
          limit: 2000,
        }),
        { credentials: "include" }
      )
        .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
        .then(setLists)
        .catch(() => showToast("error", "Could not load watch orders.")),
    [showToast, showGenerated]
  );

  useEffect(() => {
    // Owner names come from the franchise, series and collection lists,
    // which both the browse view and the scoped header need.
    // limit=2000 (the endpoint's ceiling), not the default 500: there are
    // already ~600 franchises, and a truncated list would silently hide
    // owners from the search and render their orders as "Unknown owner".
    const fetchAll = (type, setter) =>
      fetch(buildUrl(endpoints.resource(type).list(), { limit: 2000 }), {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : []))
        .then(setter);

    Promise.all([
      loadLists(),
      fetchAll("franchise", setFranchises),
      fetchAll("series", setSeriesRows),
      fetchAll("collection", setCollections),
    ]).finally(() => setLoading(false));
  }, [loadLists]);

  // Flipping the toggle re-queries rather than filtering locally, so the
  // hidden generated lists are never fetched in the first place.
  useEffect(() => {
    loadLists();
  }, [showGenerated, loadLists]);

  // One flat index of every owner across the three tiers. searchText carries
  // all the name variants, so every alias is typeable, not just the one
  // displayed.
  const owners = useMemo(() => {
    const source = {
      franchise: franchises,
      series: seriesRows,
      collection: collections,
    };
    return TIERS.flatMap((tier) =>
      (source[tier] || []).map((o) => {
        const name = getDisplayName(o, tier);
        return {
          key: `${tier}:${o.system_id}`,
          tier,
          id: o.system_id,
          name,
          searchText: [
            name,
            o[`${tier}_name_cn`],
            o[`${tier}_name_en`],
            o[`${tier}_name_alt`],
            o[`${tier}_name_roman`],
            o[`${tier}_name_jp`],
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      })
    );
  }, [franchises, seriesRows, collections]);

  const ownersByKey = useMemo(
    () => new Map(owners.map((o) => [o.key, o])),
    [owners]
  );

  // How many orders each owner has, from the lists already in memory. These
  // follow the built-in toggle, so the counts always match what a drill-down
  // will actually show.
  const countsByOwner = useMemo(() => {
    const map = new Map();
    lists.forEach((l) => {
      const key = ownerKeyOf(l);
      const entry = map.get(key) || { total: 0, builtIn: 0 };
      entry.total += 1;
      if (l.auto_source) entry.builtIn += 1;
      map.set(key, entry);
    });
    return map;
  }, [lists]);

  const ownerLabel = useCallback(
    (key) => ownersByKey.get(key)?.name || "Unknown owner",
    [ownersByKey]
  );

  const scopedOwner = scopeKey ? ownersByKey.get(scopeKey) : null;

  const scopedLists = useMemo(
    () =>
      lists
        .filter((l) => ownerKeyOf(l) === scopeKey)
        .sort((a, b) => (a.list_name || "").localeCompare(b.list_name || "")),
    [lists, scopeKey]
  );

  // Everything the left pane shows when it is not drilled into one owner:
  // owner rows sectioned by tier, then the matching orders. With no query the
  // owner sections list only the owners that actually have orders; typing
  // widens them to every owner, so a first order can be started for one that
  // has none yet. Orders join in only once there is something to match, or
  // when the scope asks for them outright.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = (kind) => searchScope === "all" || searchScope === kind;

    const ownerSections = TIERS.filter(wanted)
      .map((tier) => [
        tier,
        owners
          .filter((o) => o.tier === tier)
          .filter((o) =>
            q
              ? o.searchText.includes(q)
              : (countsByOwner.get(o.key)?.total || 0) > 0
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      ])
      .filter(([, rows]) => rows.length > 0);

    const orderGroups =
      searchScope === "order" || (wanted("order") && q)
        ? [
            ...lists
              .filter((l) => !q || (l.list_name || "").toLowerCase().includes(q))
              .reduce((groups, l) => {
                const key = ownerKeyOf(l);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(l);
                return groups;
              }, new Map())
              .entries(),
          ].sort((a, b) => ownerLabel(a[0]).localeCompare(ownerLabel(b[0])))
        : [];

    const count =
      ownerSections.reduce((n, [, rows]) => n + rows.length, 0) +
      orderGroups.reduce((n, [, rows]) => n + rows.length, 0);

    return { ownerSections, orderGroups, count };
  }, [owners, lists, query, searchScope, countsByOwner, ownerLabel]);

  // Opening a search hit also scopes to its owner, so clearing the search
  // leaves you where the order lives rather than back at the browse list.
  function openFromSearch(list) {
    setSelectedId(list.system_id);
    setScope(ownerKeyOf(list));
  }

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
      setCreating(false);
      showToast("success", "Watch order created.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  // No confirm dialog: duplicating adds a list and touches nothing else, so
  // the undo is simply deleting the copy.
  async function duplicateList(id) {
    setBusy(true);
    try {
      const res = await fetch(endpoints.watchOrder.duplicateList(id), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      const created = await res.json();
      await loadLists();
      // Select the copy, not the source: duplicating is how you start editing.
      setSelectedId(created.system_id);
      showToast("success", "Watch order duplicated.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function backfillRelease() {
    if (
      !window.confirm(
        "Give every franchise, series and collection its built-in orders? " +
          "Owners that already have them are skipped, and hand-built orders " +
          "are untouched."
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(endpoints.watchOrder.backfillRelease(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      await loadLists();
      showToast("success", `Created ${data.created} built-in orders.`);
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

  // Typing overrides the drilled-in owner; clearing the box returns to it.
  const searching = query.trim().length > 0;

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
        {/* Left: pick an owner, then its orders */}
        <div className="flex flex-col gap-3">
          {/* One bar for owners and orders alike, present in every state so a
              search is always one keystroke away, even while drilled in. */}
          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand">
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value)}
              aria-label="Search scope"
              className="shrink-0 bg-transparent border-r border-gray-200 pl-2.5 pr-1 py-2 text-xs font-bold text-gray-500 focus:outline-none"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All" : TIER_LABELS[s]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={SCOPE_PLACEHOLDERS[searchScope]}
              className="flex-1 min-w-0 px-2.5 py-2 text-sm font-medium bg-transparent focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title="Clear search"
                className="px-2.5 text-gray-300 hover:text-brand"
              >
                <i className="fas fa-xmark text-xs"></i>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-[11px] font-bold text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showGenerated}
                onChange={(e) => setShowGenerated(e.target.checked)}
                className="accent-brand"
              />
              Show built-in
            </label>
            <button
              type="button"
              onClick={backfillRelease}
              disabled={busy}
              title="Give every franchise, series and collection its built-in orders"
              className="text-[11px] font-bold text-gray-500 hover:text-brand disabled:opacity-40"
            >
              <i className="fas fa-wand-magic-sparkles mr-1"></i>Backfill built-in
              orders
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400">
              <i className="fas fa-circle-notch fa-spin"></i>
            </div>
          ) : scopedOwner && !searching ? (
            /* Scoped: one owner and everything it owns. */
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setScope(null)}
                  title="Back to owners"
                  className="mt-0.5 text-gray-400 hover:text-brand"
                >
                  <i className="fas fa-arrow-left text-sm"></i>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900 leading-tight break-words">
                    {scopedOwner.name}
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-1">
                    <TierPill tier={scopedOwner.tier} />
                    <span className="text-[10px] font-bold text-gray-400">
                      {scopedLists.length} order
                      {scopedLists.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                {!creating && (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="shrink-0 bg-brand text-white rounded-lg px-2.5 py-1.5 text-[11px] font-black"
                  >
                    <i className="fas fa-plus mr-1"></i>New order
                  </button>
                )}
              </div>

              {creating && (
                <NewOrderForm
                  owner={scopedOwner}
                  onCreate={createList}
                  onCancel={() => setCreating(false)}
                  busy={busy}
                />
              )}

              {scopedLists.length === 0 ? (
                <p className="text-center py-8 text-sm font-medium text-gray-400">
                  No orders here yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {scopedLists.map((l) => (
                    <OrderRow
                      key={l.system_id}
                      list={l}
                      selected={selectedId === l.system_id}
                      onSelect={setSelectedId}
                      onDuplicate={duplicateList}
                      onDelete={deleteList}
                      busy={busy}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Owners and orders together: browsing with an empty box, search
               results once something is typed. Same sections either way. */
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                {searching
                  ? "Matching"
                  : searchScope === "order"
                    ? "All orders"
                    : "Owners with orders"}
                {results.count > 0 ? ` · ${results.count}` : ""}
              </p>

              {results.count === 0 ? (
                <p className="text-center py-8 text-sm font-medium text-gray-400">
                  {searching
                    ? "Nothing matches that name."
                    : "No watch orders yet. Search for a franchise to start one."}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {results.ownerSections.map(([tier, rows]) => (
                    <div key={tier}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TierPill tier={tier} />
                        <span className="text-[10px] font-black text-gray-400">
                          {rows.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {rows.map((o) => (
                          <OwnerRow
                            key={o.key}
                            owner={o}
                            counts={countsByOwner.get(o.key)}
                            onSelect={setScope}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {results.orderGroups.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-1.5">
                        <TierPill tier="order" />
                        <span className="text-[10px] font-black text-gray-400">
                          {results.orderGroups.reduce(
                            (n, [, rows]) => n + rows.length,
                            0
                          )}
                        </span>
                      </div>
                      {/* Orders stay grouped by owner: two rows with the same
                          name are only telling apart by who owns them. */}
                      {results.orderGroups.map(([key, rows]) => (
                        <div key={key}>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                            {ownerLabel(key)}
                          </p>
                          <div className="flex flex-col gap-1">
                            {rows.map((l) => (
                              <OrderRow
                                key={l.system_id}
                                list={l}
                                selected={selectedId === l.system_id}
                                onSelect={() => openFromSearch(l)}
                                onDuplicate={duplicateList}
                                onDelete={deleteList}
                                busy={busy}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
