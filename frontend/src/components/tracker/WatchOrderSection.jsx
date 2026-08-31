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
import { Button, Chip, Eyebrow } from "../ui/primitives";
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
 * What an order covers, collapsed to one key: a single media type by slug, or
 * "cross" for an order spanning several. Mirrors how mediaScope reads a list,
 * so the filter's wording matches the scope line above it.
 */
function scopeKey(list) {
  const types = list.media_types || [];
  if (!types.length) return "none";
  return types.length > 1 ? "cross" : types[0];
}

/**
 * The scopes actually present among an owner's orders, cross-type first. Only
 * worth offering when more than one exists - filtering to the single scope
 * every order already has would narrow nothing.
 */
function scopeOptions(lists) {
  const seen = new Map();
  for (const l of lists) {
    const key = scopeKey(l);
    if (!seen.has(key)) {
      seen.set(key, mediaScope(l.media_types)?.short || "Unscoped");
    }
  }
  const opts = [...seen].map(([key, label]) => ({ key, label }));
  opts.sort((a, b) =>
    a.key === "cross" ? -1 : b.key === "cross" ? 1 : a.label.localeCompare(b.label)
  );
  return opts;
}

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
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-2.5 py-1 border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "bg-brand text-on-brand border-brand"
          : "bg-surface text-text-muted border-border-strong hover:border-text hover:text-text"
      }`}
    >
      {list.is_most_recommended && (
        <span
          className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${
            active ? "text-on-brand/80" : "text-brand"
          }`}
        >
          Rec
        </span>
      )}
      <span className="truncate max-w-[18rem]">{name}</span>
      <span
        className={`shrink-0 font-mono text-[11px] ${active ? "text-on-brand/70" : "text-text-faint"}`}
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
              className="w-px h-5 bg-border-strong shrink-0 mr-1"
              aria-hidden="true"
            />
          )}
          <Eyebrow className="whitespace-nowrap">{group.label}</Eyebrow>
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
  const [scope, setScope] = useState("all");
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
      <div className="py-10 text-center text-text-faint" aria-busy="true">
        <i className="fas fa-circle-notch fa-spin text-xl" aria-label="Loading"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-text-muted text-sm">{error}</div>
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
  const scopes = scopeOptions(lists);
  const visibleLists =
    scope === "all" ? lists : lists.filter((l) => scopeKey(l) === scope);
  const groups = splitByOrigin(visibleLists);

  // Narrowing can hide whatever was open, so the filter moves the selection
  // to the first order it still offers rather than blanking the guide.
  function selectScope(next) {
    setScope(next);
    const kept =
      next === "all" ? lists : lists.filter((l) => scopeKey(l) === next);
    if (kept.length && !kept.some((l) => l.system_id === selectedId)) {
      setSelectedId(kept[0].system_id);
    }
  }

  if (!lists.length) {
    return (
      <div className="text-center py-12 border border-dashed border-border-strong">
        <Eyebrow>Watch order</Eyebrow>
        <p className="mt-2 text-sm text-text-muted">
          No watch order has been written yet.
        </p>
        {isAdmin && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button kind="primary" size="sm" onClick={() => createRelease()}>
              Add built-in order
            </Button>
            <Link
              to="/watch-orders"
              className="inline-flex items-center px-2.5 py-1 text-xs font-medium border border-border-strong text-text hover:border-text bg-surface"
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

      {/*
        Narrows which orders the picker offers, by what each one covers. Drawn
        only when the owner's orders actually differ in scope: an owner whose
        orders are all cross-type has nothing to narrow to.
      */}
      {scopes.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          {/*
            Labelled because the guide below carries its own All/Hide optional
            row: two unlabelled segmented controls, each opening on "All", would
            not say which one narrows the orders and which narrows the steps.
          */}
          <Eyebrow className="whitespace-nowrap">Scope</Eyebrow>
          <div className="inline-flex items-center border border-border-strong divide-x divide-border-strong">
            {[{ key: "all", label: "All" }, ...scopes].map((opt) => (
              <button
                key={opt.key}
                type="button"
                aria-pressed={scope === opt.key}
                onClick={() => selectScope(opt.key)}
                className={`font-mono text-[11px] uppercase tracking-[0.12em] px-2.5 py-1 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  scope === opt.key
                    ? "bg-brand-soft text-brand"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {visibleLists.length > 1 && visibleLists.length <= CHIP_LIMIT && (
          <OrderChips
            groups={groups}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        {visibleLists.length > CHIP_LIMIT && (
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-border-strong px-3 py-1.5 text-sm text-text bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
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

        {visibleLists.length === 1 && (
          <span className="flex items-center gap-2 font-display font-bold text-base text-text">
            {visibleLists[0].list_name || "Untitled Order"}
            {visibleLists[0].is_most_recommended && (
              <Chip tone="brand">Most recommended</Chip>
            )}
            <span className="font-mono text-[11px] text-text-faint">
              {visibleLists[0].item_count} steps
            </span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {selectedId && (
            <Link
              to={`/watch-order/${selectedId}`}
              className="text-xs font-medium text-text-muted hover:text-brand whitespace-nowrap"
            >
              Open full page <i className="fas fa-arrow-up-right-from-square ml-1"></i>
            </Link>
          )}
          {isAdmin && !hasRelease && (
            <Button kind="ghost" size="sm" onClick={() => createRelease()}>
              Add built-in
            </Button>
          )}
          {isAdmin && (
            <Link
              to="/watch-orders"
              className="text-xs font-medium text-text-muted hover:text-text whitespace-nowrap"
            >
              Edit
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
