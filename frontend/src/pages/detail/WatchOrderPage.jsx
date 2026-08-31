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
  MediaScopeLine,
} from "../../components/tracker/WatchOrderGuide";
import { getDisplayName } from "../../utils/media";
import { Chip, Slip } from "../../components/ui/primitives";

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
      <div className="flex items-center justify-center py-24 text-text-faint">
        <i className="fas fa-circle-notch fa-spin text-2xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24">
        <section className="border border-dashed border-border-strong px-4 py-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
            Watch order
          </div>
          <p className="text-sm text-text-faint">{error}</p>
          <Link
            to="/"
            className="inline-block mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted hover:text-brand transition"
          >
            Back home
          </Link>
        </section>
      </div>
    );
  }

  const ownerName = owner ? getDisplayName(owner.data, owner.type) : null;
  const ownerLabel = owner?.type === "collection" ? "Collection" : "Franchise";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb: the owner, then this order */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3 flex-wrap"
        aria-label="Breadcrumb"
      >
        {owner && (
          <>
            <span>{ownerLabel}</span>
            <span aria-hidden="true">/</span>
            <Link
              to={`/${owner.type}/${owner.id}`}
              className="hover:text-brand transition normal-case tracking-normal truncate max-w-xs"
            >
              {ownerName}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span className="text-text-muted">Watch order</span>
      </nav>

      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Admin
          </div>
          <Link
            to="/watch-orders"
            className="border border-border-strong text-text bg-surface px-3 py-1.5 text-sm font-medium hover:border-text transition"
          >
            Edit this order
          </Link>
        </div>
      )}

      <header className="mb-8">
        {/*
          Scope leads: it sits on its own line above the title, so what kind of
          order this is registers before the name. The remaining marks drop
          below the title rather than competing with it.
        */}
        <MediaScopeLine mediaTypes={list.media_types} className="mb-3" />

        <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-3">
          {list.list_name || "Untitled order"}
        </h1>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          {list.list_type && <Chip>{list.list_type}</Chip>}
          {list.is_most_recommended && <Chip tone="brand">Most recommended</Chip>}
          {list.is_default && <Chip tone="muted">Default</Chip>}
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            {list.item_count} steps
          </span>
        </div>
      </header>

      <WatchOrderGuide list={list} roomy />

      {siblings.length > 0 && (
        <Slip
          title={`Other orders for ${ownerName || "this title"}`}
          padded={false}
          className="mt-10"
        >
          <ul className="divide-y divide-border">
            {siblings.map((s) => (
              <li key={s.system_id}>
                <Link
                  to={`/watch-order/${s.system_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition"
                >
                  <span className="text-sm text-text">
                    {s.list_name || "Untitled order"}
                  </span>
                  <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                    {s.item_count} steps
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Slip>
      )}
    </div>
  );
}
