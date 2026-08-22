// Frontend: page component file for WatchOrderPage.
//
// The shareable, full-page view of one watch order. Same guide the Franchise /
// Collection tab renders, given more room: bigger posters, notes always shown,
// and links back to the owner and to the owner's other orders.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import WatchOrderGuide, {
  mediaScope,
} from "../../components/tracker/WatchOrderGuide";
import { getDisplayName } from "../../utils/media";

export default function WatchOrderPage() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();

  const [list, setList] = useState(null);
  const [owner, setOwner] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(endpoints.watchOrder.list(system_id), { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              res.status === 404 ? "Watch order not found." : res.statusText
            )
      )
      .then(async (data) => {
        if (cancelled) return;
        setList(data);
        setError(null);

        // The owner's name and its other orders are two extra round trips, so
        // they load after the guide itself rather than blocking it.
        const ownerType = data.franchise_id ? "franchise" : "collection";
        const ownerId = data.franchise_id || data.collection_id;

        const [ownerRes, siblingRes] = await Promise.all([
          fetch(endpoints.resource(ownerType).detail(ownerId), {
            credentials: "include",
          }).then((r) => (r.ok ? r.json() : null)),
          fetch(
            buildUrl(endpoints.watchOrder.lists(), {
              franchise_id: data.franchise_id,
              collection_id: data.collection_id,
            }),
            { credentials: "include" }
          ).then((r) => (r.ok ? r.json() : [])),
        ]);

        if (cancelled) return;
        setOwner(ownerRes ? { type: ownerType, id: ownerId, data: ownerRes } : null);
        setSiblings(siblingRes.filter((l) => l.system_id !== system_id));
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [system_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <i className="fas fa-circle-notch fa-spin text-2xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <i className="fas fa-ghost text-3xl text-gray-300 mb-3"></i>
        <p className="font-bold text-gray-500">{error}</p>
        <Link
          to="/"
          className="inline-block mt-4 text-sm font-bold text-brand hover:underline"
        >
          Back home
        </Link>
      </div>
    );
  }

  const ownerName = owner ? getDisplayName(owner.data, owner.type) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        {owner && (
          <Link
            to={`/${owner.type}/${owner.id}`}
            className="text-xs font-bold text-gray-400 hover:text-brand"
          >
            <i className="fas fa-arrow-left mr-1.5"></i>
            {ownerName}
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            {list.list_name || "Untitled Order"}
          </h1>
          {list.list_type && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
              {list.list_type}
            </span>
          )}
          {mediaScope(list.media_types) && (
            <span
              className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${
                mediaScope(list.media_types).cross
                  ? "bg-sky-50 text-sky-600 border-sky-200"
                  : "bg-gray-100 text-gray-500 border-gray-200"
              }`}
            >
              {mediaScope(list.media_types).full}
            </span>
          )}
          {list.is_most_recommended && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
              <i className="fas fa-star mr-1"></i>Most recommended
            </span>
          )}
          {list.is_default && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              Default
            </span>
          )}
          <span className="ml-auto text-xs font-bold text-gray-400">
            {list.item_count} steps
          </span>
        </div>

        {isAdmin && (
          <Link
            to="/watch-orders"
            className="inline-block mt-2 text-xs font-bold text-gray-500 hover:text-gray-700"
          >
            <i className="fas fa-pen mr-1"></i>Edit this order
          </Link>
        )}
      </div>

      <WatchOrderGuide list={list} roomy />

      {siblings.length > 0 && (
        <div className="mt-10 pt-5 border-t border-gray-200">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">
            Other orders for {ownerName || "this title"}
          </p>
          <div className="flex flex-col gap-2">
            {siblings.map((s) => (
              <Link
                key={s.system_id}
                to={`/watch-order/${s.system_id}`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-brand/40 transition-colors"
              >
                <i className="fas fa-list-ol text-gray-300"></i>
                <span className="text-sm font-bold text-gray-800">
                  {s.list_name || "Untitled Order"}
                </span>
                <span className="ml-auto text-xs font-bold text-gray-400">
                  {s.item_count} steps
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
