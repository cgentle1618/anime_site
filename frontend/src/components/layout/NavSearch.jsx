// Frontend: the universal search field that sits in the nav's ink row.
//
// Split out of Nav so the nav shell stays about navigation. The search
// behaviour is unchanged: debounced server-side lookup per media type, a
// client-side pass for seasonal, exact matches floated to the top, Enter to
// open the full results page.
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cleanString } from "../../utils/media";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "collection", label: "Collection" },
  { key: "franchise", label: "Franchise" },
  { key: "series", label: "Series" },
  { key: "anime", label: "Anime" },
  { key: "anime-movie", label: "Anime Movie" },
  { key: "movie", label: "Movie" },
  { key: "tv-show", label: "TV Show" },
  { key: "cartoon", label: "Cartoon" },
  { key: "manga", label: "Manga" },
  { key: "novel", label: "Novel" },
  { key: "seasonal", label: "Seasonal" },
];

const TYPE_BADGE = {
  collection: { label: "COLLECT", cls: "bg-fuchsia-50 text-fuchsia-600" },
  franchise: { label: "FRAN", cls: "bg-brand/10 text-brand" },
  series: { label: "SERIES", cls: "bg-purple-50 text-purple-600" },
  anime: { label: "ANIME", cls: "bg-gray-100 text-gray-500" },
  "anime-movie": { label: "A.MOVIE", cls: "bg-blue-50 text-blue-600" },
  movie: { label: "MOVIE", cls: "bg-amber-50 text-amber-600" },
  "tv-show": { label: "TV", cls: "bg-indigo-50 text-indigo-600" },
  cartoon: { label: "CARTOON", cls: "bg-orange-50 text-orange-600" },
  manga: { label: "MANGA", cls: "bg-rose-50 text-rose-600" },
  novel: { label: "NOVEL", cls: "bg-teal-50 text-teal-600" },
  seasonal: { label: "SEASON", cls: "bg-emerald-50 text-emerald-600" },
};

function getDisplayName(item) {
  if (item.type === "collection")
    return (
      item.collection_name_cn ||
      item.collection_name_en ||
      item.collection_name_roman ||
      item.collection_name_jp ||
      "—"
    );
  if (item.type === "franchise")
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_roman ||
      item.franchise_name_jp ||
      "—"
    );
  if (item.type === "series")
    return (
      item.series_name_cn || item.series_name_en || item.series_name_alt || "—"
    );
  if (item.type === "cartoon")
    return (
      item.cartoon_name_cn ||
      item.cartoon_name_en ||
      item.cartoon_name_alt ||
      "—"
    );
  if (item.type === "manga")
    return (
      item.manga_name_cn ||
      item.manga_name_en ||
      item.manga_name_roman ||
      item.manga_name_jp ||
      "—"
    );
  if (item.type === "novel")
    return (
      item.novel_name_cn ||
      item.novel_name_en ||
      item.novel_name_roman ||
      item.novel_name_jp ||
      "—"
    );
  if (item.type === "anime-movie")
    return (
      item.anime_movie_name_cn ||
      item.anime_movie_name_en ||
      item.anime_movie_name_roman ||
      item.anime_movie_name_jp ||
      "—"
    );
  if (item.type === "movie")
    return (
      item.movie_name_cn || item.movie_name_en || item.movie_name_alt || "—"
    );
  if (item.type === "tv-show")
    return item.tv_name_cn || item.tv_name_en || item.tv_name_alt || "—";
  if (item.type === "seasonal") return item.seasonal || "—";
  return (
    item.anime_name_cn ||
    item.anime_name_en ||
    item.anime_name_roman ||
    item.anime_name_jp ||
    "—"
  );
}

// Rows one query may put in the dropdown. The panel scrolls, so this caps the
// result list, not the panel height.
const MAX_RESULTS = 20;

/**
 * Flattens the per-type result buckets into at most MAX_RESULTS rows.
 *
 * Each type first draws up to its quota, which stops a big table from burying
 * the small ones. The slots left over are then filled round-robin from the
 * buckets that still have rows, so quota no type claimed is not wasted — a
 * query matching only movies gets all of them, not just the movie quota.
 */
function mergeBuckets(buckets, quotas) {
  const cursors = buckets.map(() => 0);
  const out = [];
  buckets.forEach((bucket, i) => {
    const take = Math.min(quotas[i], bucket.length, MAX_RESULTS - out.length);
    out.push(...bucket.slice(0, take));
    cursors[i] = take;
  });
  let progressed = true;
  while (out.length < MAX_RESULTS && progressed) {
    progressed = false;
    for (let i = 0; i < buckets.length && out.length < MAX_RESULTS; i++) {
      if (cursors[i] < buckets[i].length) {
        out.push(buckets[i][cursors[i]++]);
        progressed = true;
      }
    }
  }
  return out;
}

export default function NavSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState("all");
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchReqIdRef = useRef(0);
  // Seasonal has no server-side search and is a tiny table, so it is fetched
  // once and filtered client-side. All other types are searched server-side.
  const seasonalCacheRef = useRef({ loaded: false, seasonal: [] });

  // Universal search — server-side substring search, one request per type.
  // Each type carries a quota so a large table (e.g. anime) can never crowd out
  // the smaller ones, but the quota is a floor, not a ceiling: slots no type
  // claims go back to the types that still have matches waiting, so a query
  // that hits only one or two tables still fills the list.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      const reqId = ++searchReqIdRef.current;
      const q = searchQuery.trim();
      const qClean = cleanString(q);
      const qParam = encodeURIComponent(q);
      const scope = searchScope;

      // [endpoint, type, guaranteed slots when scope === "all"]
      const TYPE_JOBS = [
        ["/api/collection", "collection", 3],
        ["/api/franchise", "franchise", 3],
        ["/api/series", "series", 3],
        ["/api/anime", "anime", 10],
        ["/api/anime-movie", "anime-movie", 3],
        ["/api/movies", "movie", 3],
        ["/api/tv-shows", "tv-show", 3],
        ["/api/cartoon", "cartoon", 5],
        ["/api/manga", "manga", 5],
        ["/api/novel", "novel", 5],
      ];

      const fetchType = async (endpoint, type) => {
        try {
          const res = await fetch(
            `${endpoint}/?search_query=${qParam}&limit=${MAX_RESULTS}`,
            { credentials: "include" },
          );
          if (!res.ok) return [];
          const rows = await res.json();
          return rows.map((r) => ({ ...r, type }));
        } catch {
          return [];
        }
      };

      try {
        const activeJobs = TYPE_JOBS.filter(
          ([, type]) => scope === "all" || scope === type,
        );
        const buckets = await Promise.all(
          activeJobs.map(([endpoint, type]) => fetchType(endpoint, type)),
        );
        const quotas = activeJobs.map(([, , quota]) =>
          scope === "all" ? quota : MAX_RESULTS,
        );

        // Seasonal: no server-side search; fetch the small table once, cache it,
        // and filter client-side.
        if (scope === "all" || scope === "seasonal") {
          if (!seasonalCacheRef.current.loaded) {
            try {
              const res = await fetch("/api/seasonal/", {
                credentials: "include",
              });
              seasonalCacheRef.current.seasonal = res.ok ? await res.json() : [];
            } catch {
              seasonalCacheRef.current.seasonal = [];
            }
            seasonalCacheRef.current.loaded = true;
          }
          const seasonalHits = seasonalCacheRef.current.seasonal
            .filter((s) => cleanString(s.seasonal).includes(qClean))
            .map((s) => ({ ...s, type: "seasonal" }));
          buckets.push(seasonalHits);
          quotas.push(scope === "all" ? 3 : MAX_RESULTS);
        }

        const results = mergeBuckets(buckets, quotas);

        // A newer keystroke superseded this request while it was in flight.
        if (reqId !== searchReqIdRef.current) return;

        // Exact match floats to top
        results.sort((a, b) => {
          const names = (item) => {
            if (item.type === "franchise")
              return [
                item.franchise_name_cn,
                item.franchise_name_en,
                item.franchise_name_roman,
              ];
            if (item.type === "series")
              return [
                item.series_name_cn,
                item.series_name_en,
                item.series_name_alt,
              ];
            if (item.type === "cartoon")
              return [
                item.cartoon_name_cn,
                item.cartoon_name_en,
                item.cartoon_name_alt,
              ];
            if (item.type === "manga")
              return [
                item.manga_name_cn,
                item.manga_name_en,
                item.manga_name_roman,
              ];
            if (item.type === "novel")
              return [
                item.novel_name_cn,
                item.novel_name_en,
                item.novel_name_roman,
              ];
            if (item.type === "anime-movie")
              return [
                item.anime_movie_name_cn,
                item.anime_movie_name_en,
                item.anime_movie_name_roman,
              ];
            if (item.type === "movie")
              return [
                item.movie_name_cn,
                item.movie_name_en,
                item.movie_name_alt,
              ];
            if (item.type === "tv-show")
              return [item.tv_name_cn, item.tv_name_en, item.tv_name_alt];
            if (item.type === "seasonal") return [item.seasonal];
            return [
              item.anime_name_cn,
              item.anime_name_en,
              item.anime_name_roman,
            ];
          };
          const aExact = names(a).some((n) => n && cleanString(n) === qClean);
          const bExact = names(b).some((n) => n && cleanString(n) === qClean);
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });

        setSearchResults(results);
        setShowResults(true);
      } catch {
        // ignore search errors
      }
    }, 250);
  }, [searchQuery, searchScope]);

  // Close the results and scope menus on an outside click.
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
        setShowScopeMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearchKey(e) {
    if (e.key === "Escape") {
      setShowResults(false);
      setShowScopeMenu(false);
      return;
    }
    if (e.key === "Enter" && searchQuery.trim()) {
      clearTimeout(searchDebounceRef.current);
      const q = searchQuery.trim();
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      const params = new URLSearchParams({ q });
      if (searchScope !== "all") params.set("scope", searchScope);
      navigate(`/search?${params.toString()}`);
    }
  }

  function handleResultClick(item) {
    setShowResults(false);
    setSearchQuery("");
    if (item.type === "collection") navigate(`/collection/${item.system_id}`);
    else if (item.type === "franchise") navigate(`/franchise/${item.system_id}`);
    else if (item.type === "series") navigate(`/series/${item.system_id}`);
    else if (item.type === "cartoon") navigate(`/cartoon/${item.system_id}`);
    else if (item.type === "manga") navigate(`/manga/${item.system_id}`);
    else if (item.type === "novel") navigate(`/novel/${item.system_id}`);
    else if (item.type === "anime-movie")
      navigate(`/anime-movie/${item.system_id}`);
    else if (item.type === "movie") navigate(`/movie/${item.system_id}`);
    else if (item.type === "tv-show") navigate(`/tv-show/${item.system_id}`);
    else if (item.type === "seasonal")
      navigate(`/seasonal/${encodeURIComponent(item.seasonal)}`);
    else navigate(`/anime/${item.system_id}`);
  }

  const scopeLabel = SCOPES.find((s) => s.key === searchScope)?.label;

  return (
    // A slot recessed into the ink row: dark and inset at rest, lifting to
    // white paper once focused.
    <div
      ref={searchRef}
      className="relative hidden md:flex items-center w-56 lg:w-80 xl:w-96 rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/10 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand transition"
    >
      {/* Scope selector */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowScopeMenu((s) => !s)}
          aria-haspopup="listbox"
          aria-expanded={showScopeMenu}
          className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-l-lg transition whitespace-nowrap group-focus-within:text-slate-500"
        >
          {scopeLabel}
          <i
            className={`fas fa-chevron-down text-[8px] transition-transform ${showScopeMenu ? "rotate-180" : ""}`}
          ></i>
        </button>
        {showScopeMenu && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-xl ring-1 ring-slate-900/10 z-50 overflow-hidden min-w-[140px] py-1"
          >
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="option"
                aria-selected={searchScope === s.key}
                onClick={() => {
                  setSearchScope(s.key);
                  setShowScopeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition ${
                  searchScope === s.key
                    ? "text-brand bg-brand/5"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-3.5 bg-white/15 shrink-0 mx-0.5"></div>

      <i className="fas fa-search pl-2 pr-1 text-slate-500 text-xs pointer-events-none shrink-0"></i>

      <input
        type="text"
        aria-label="Search the collection"
        placeholder={
          searchScope === "all" ? "Search…" : `Search ${scopeLabel}…`
        }
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleSearchKey}
        onFocus={() => searchResults.length > 0 && setShowResults(true)}
        className="flex-1 min-w-0 bg-transparent pr-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:text-slate-900 focus:placeholder:text-slate-400"
        autoComplete="off"
      />

      {/* Results */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl ring-1 ring-slate-900/10 overflow-hidden max-h-[80vh] overflow-y-auto z-50">
          {searchResults.map((item, i) => {
            const badge = TYPE_BADGE[item.type];
            const secondary =
              item.type === "franchise"
                ? item.franchise_type
                : item.type === "anime"
                  ? item.airing_type
                  : null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleResultClick(item)}
                className="w-full text-left flex items-center px-3 py-2.5 hover:bg-slate-50 transition border-b border-slate-50 last:border-0"
              >
                <span
                  className={`font-mono text-[10px] tracking-[0.06em] px-1.5 py-0.5 rounded mr-2 shrink-0 ${badge.cls}`}
                >
                  {badge.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {getDisplayName(item)}
                  </div>
                  {secondary && (
                    <div className="text-[10px] text-slate-400 truncate">
                      {secondary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
