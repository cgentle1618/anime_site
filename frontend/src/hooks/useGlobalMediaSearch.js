// Frontend: search every media table at once.
//
// A relation is bound to no tier, so its far endpoint may live in any of the
// eight tables and in any franchise. /api/search searches them all in one
// request, so this hook debounces the keystrokes and flattens the buckets it
// gets back.
import { useEffect, useState } from "react";

import { getDisplayName } from "../utils/media";

// The buckets this hook cares about - a relation always links two entries,
// never a franchise, collection, or season.
const ENTRY_TYPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
];

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const PER_TYPE = 10;

/**
 * Hits from every media table for `query`, or an empty list while the query is
 * too short or the hook is disabled.
 */
export function useGlobalMediaSearch(query, { enabled = true } = {}) {
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = (query || "").trim();
    if (!enabled || q.length < MIN_QUERY) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // Debounced: one request per keystroke is one too many.
    const timer = setTimeout(async () => {
      let results = {};
      try {
        const res = await fetch(
          `/api/search/?q=${encodeURIComponent(q)}&limit=${PER_TYPE}`,
          { credentials: "include" },
        );
        if (res.ok) results = (await res.json()).results || {};
      } catch {
        results = {};
      }
      if (cancelled) return;
      setHits(
        ENTRY_TYPES.flatMap((type) =>
          (results[type] || []).map((row) => ({
            media_type: type,
            entry_id: row.system_id,
            key: `${type}:${row.system_id}`,
            display_name: getDisplayName(row, type),
          })),
        ),
      );
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { hits, searching };
}

export default useGlobalMediaSearch;
