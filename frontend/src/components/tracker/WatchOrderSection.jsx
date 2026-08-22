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

export default function WatchOrderSection({ franchiseId, collectionId }) {
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
  }, [franchiseId, collectionId]);

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

  async function createRelease() {
    try {
      const res = await fetch(
        buildUrl(endpoints.watchOrder.createRelease(), {
          franchise_id: franchiseId,
          collection_id: collectionId,
        }),
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error(res.statusText);
      const created = await res.json();
      loadLists();
      setSelectedId(created.system_id);
      showToast("success", "Release order added.");
    } catch (e) {
      showToast("error", e.message);
    }
  }

  const hasRelease = lists.some((l) => l.auto_source === "release");

  if (!lists.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <i className="fas fa-list-ol text-3xl mb-3"></i>
        <p className="font-medium">No watch order has been written yet.</p>
        {isAdmin && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              type="button"
              onClick={createRelease}
              className="text-sm font-bold text-brand hover:underline"
            >
              Add release order
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
        {lists.length > 1 && (
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {lists.map((l) => (
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
              onClick={createRelease}
              className="text-xs font-bold text-gray-500 hover:text-brand whitespace-nowrap"
            >
              <i className="fas fa-wand-magic-sparkles mr-1"></i>Add release order
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

      <WatchOrderGuide list={detail} />
    </div>
  );
}
