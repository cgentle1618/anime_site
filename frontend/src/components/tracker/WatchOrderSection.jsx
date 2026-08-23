// Frontend: the Watch Order tab body for a Franchise or Collection page.
//
// Loads the owner's orders, lets the reader pick one, and hands it to
// WatchOrderGuide. Read-only: editing lives on the admin /watch-orders page.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import WatchOrderGuide, {
  MediaScopeLine,
  mediaScope,
} from "./WatchOrderGuide";

// How many steps a hub page draws before deferring to the order's own page.
const INLINE_STEP_LIMIT = 10;

// Above this many orders the chips give way to a dropdown. Built-in orders are
// bounded by the generator kinds, but hand-written ones are not, so the chip
// row needs a ceiling it will almost never reach.
const CHIP_LIMIT = 6;

/**
 * Hand-written orders first, then generated ones: a curated order is the one a
 * reader most likely wants, and `auto_source` is what the backend stamps on
 * anything it built itself. Backend ordering is preserved inside each group,
 * and an empty group is dropped rather than shown as a bare label.
 */
function splitByOrigin(lists) {
  return [
    { label: "Custom", lists: lists.filter((l) => !l.auto_source) },
    { label: "Built-in", lists: lists.filter((l) => l.auto_source) },
  ].filter((g) => g.lists.length > 0);
}

/**
 * One order. The name truncates at a width no current order comes near - it is
 * a guard against a future long name, not a normal state - while the star and
 * the step count sit outside the truncation so they always survive.
 */
function OrderChip({ list, active, onSelect }) {
  const name = list.list_name || "Untitled Order";
  return (
    <button
      type="button"
      onClick={() => onSelect(list.system_id)}
      title={name}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
        active
          ? "bg-brand text-white border-brand"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
      }`}
    >
      {list.is_most_recommended && (
        <i
          className={`fas fa-star shrink-0 ${active ? "text-white" : "text-amber-500"}`}
        ></i>
      )}
      <span className="truncate max-w-[18rem]">{name}</span>
      <span
        className={`shrink-0 font-bold ${active ? "text-white/70" : "text-gray-400"}`}
      >
        {list.item_count}
      </span>
    </button>
  );
}

/** The chip rendering of the picker: one labelled cluster per origin group. */
function OrderChips({ groups, selectedId, onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {groups.map((group, i) => (
        <div key={group.label} className="flex flex-wrap items-center gap-2">
          {i > 0 && (
            <div
              className="w-px h-5 bg-gray-200 shrink-0 mr-1"
              aria-hidden="true"
            />
          )}
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
            {group.label}
          </span>
          {group.lists.map((l) => (
            <OrderChip
              key={l.system_id}
              list={l}
              active={l.system_id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function WatchOrderSection({ franchiseId, collectionId, seriesId }) {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [lists, setLists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLists = useCallback(() => {
    setLoading(true);
    fetch(
      buildUrl(endpoints.watchOrder.lists(), {
        franchise_id: franchiseId,
        collection_id: collectionId,
        series_id: seriesId,
      }),
      { credentials: "include" }
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        setLists(data);
        // The backend sorts most-recommended first, then default, so the head
        // of the list is the one to open.
        setSelectedId((current) =>
          current && data.some((l) => l.system_id === current)
            ? current
            : data[0]?.system_id ?? null
        );
        setError(null);
      })
      .catch(() => setError("Could not load watch orders."))
      .finally(() => setLoading(false));
  }, [franchiseId, collectionId, seriesId]);

  useEffect(loadLists, [loadLists]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(endpoints.watchOrder.list(selectedId), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setDetail)
      .catch(() => setError("Could not load that watch order."));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-400">
        <i className="fas fa-circle-notch fa-spin text-xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-gray-400 font-medium text-sm">
        {error}
      </div>
    );
  }

  // Release order only: the anime-only variant is built on the admin
  // /watch-orders page, not from a hub.
  async function createRelease() {
    try {
      const res = await fetch(
        buildUrl(endpoints.watchOrder.createRelease(), {
          franchise_id: franchiseId,
          collection_id: collectionId,
          series_id: seriesId,
        }),
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      const created = await res.json();
      loadLists();
      setSelectedId(created.system_id);
      showToast("success", "Built-in order added.");
    } catch (e) {
      showToast("error", e.message);
    }
  }

  const hasRelease = lists.some((l) => l.auto_source === "release");
  const groups = splitByOrigin(lists);

  if (!lists.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <i className="fas fa-list-ol text-3xl mb-3"></i>
        <p className="font-medium">No watch order has been written yet.</p>
        {isAdmin && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => createRelease()}
              className="text-sm font-bold text-brand hover:underline"
            >
              Add built-in order
            </button>
            <Link
              to="/watch-orders"
              className="text-sm font-bold text-gray-500 hover:underline"
            >
              Build one by hand
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Scope of the order currently selected, ahead of the controls. */}
      <MediaScopeLine mediaTypes={detail?.media_types} className="mb-1.5" />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {lists.length > 1 && lists.length <= CHIP_LIMIT && (
          <OrderChips
            groups={groups}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        {lists.length > CHIP_LIMIT && (
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.lists.map((l) => (
                  <option key={l.system_id} value={l.system_id}>
                    {l.is_most_recommended ? "★ " : ""}
                    {l.list_name || "Untitled Order"}
                    {l.is_most_recommended ? " (most recommended)" : ""} —{" "}
                    {l.item_count} steps
                    {mediaScope(l.media_types)
                      ? ` · ${mediaScope(l.media_types).short}`
                      : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {lists.length === 1 && (
          <span className="text-sm font-black text-gray-900">
            {lists[0].list_name || "Untitled Order"}
            {lists[0].is_most_recommended && (
              <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                <i className="fas fa-star mr-1"></i>Most recommended
              </span>
            )}
            <span className="ml-2 text-xs font-bold text-gray-400">
              {lists[0].item_count} steps
            </span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {selectedId && (
            <Link
              to={`/watch-order/${selectedId}`}
              className="text-xs font-bold text-brand hover:underline whitespace-nowrap"
            >
              Open full page <i className="fas fa-arrow-up-right-from-square ml-1"></i>
            </Link>
          )}
          {isAdmin && !hasRelease && (
            <button
              type="button"
              onClick={() => createRelease()}
              className="text-xs font-bold text-gray-500 hover:text-brand whitespace-nowrap"
            >
              <i className="fas fa-wand-magic-sparkles mr-1"></i>Add built-in
            </button>
          )}
          {isAdmin && (
            <Link
              to="/watch-orders"
              className="text-xs font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap"
            >
              <i className="fas fa-pen mr-1"></i>Edit
            </Link>
          )}
        </div>
      </div>

      {/*
        Capped inline: the hub pages are an overview, and a long order belongs
        on its own page rather than pushing the rest of the hub off-screen.
      */}
      <WatchOrderGuide
        list={detail}
        limit={INLINE_STEP_LIMIT}
        fullHref={selectedId ? `/watch-order/${selectedId}` : undefined}
      />
    </div>
  );
}
