// Frontend: search every media table at once.
//
// A relation is bound to no tier, so its far endpoint may live in any of the
// eight tables and in any franchise. There is no cross-table search endpoint,
// so this fans out across the eight list endpoints and merges the results.
import { useEffect, useState } from "react";

import { getDisplayName } from "../utils/media";

// Mirrors TYPE_JOBS in components/layout/Nav.jsx, minus the grouping tiers - a
// relation always links two entries, never a franchise or collection.
const SEARCH_ENDPOINTS = [
  ["/api/anime", "anime"],
  ["/api/anime-movie", "anime-movie"],
  ["/api/movies", "movie"],
  ["/api/tv-shows", "tv-show"],
  ["/api/cartoon", "cartoon"],
  ["/api/manga", "manga"],
  ["/api/novel", "novel"],
  ["/api/comic", "comic"],
];

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

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
    // Debounced: eight requests per keystroke would be eight too many.
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        SEARCH_ENDPOINTS.map(([endpoint, type]) =>
          fetch(`${endpoint}/?search_query=${encodeURIComponent(q)}&limit=10`, {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) =>
              rows.map((row) => ({
                media_type: type,
                entry_id: row.system_id,
                key: `${type}:${row.system_id}`,
                display_name: getDisplayName(row, type),
              })),
            )
            .catch(() => []),
        ),
      );
      if (cancelled) return;
      setHits(results.flat());
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
