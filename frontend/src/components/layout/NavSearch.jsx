// Frontend: the universal search field that sits in the nav's ink row.
//
// Split out of Nav so the nav shell stays about navigation. One debounced
// request to /api/search returns a bucket per media type; this file decides how
// many rows of each to show. Enter opens the full results page.
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cleanString } from "../../utils/media";
import { Chip } from "../ui/primitives";

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
  { key: "comic", label: "Comic" },
  { key: "seasonal", label: "Seasonal" },
];

// Short mono labels for the result rows. Text, not colour, names the type.
const TYPE_LABEL = {
  collection: "COLLECT",
  franchise: "FRAN",
  series: "SERIES",
  anime: "ANIME",
  "anime-movie": "A.MOVIE",
  movie: "MOVIE",
  "tv-show": "TV",
  cartoon: "CARTOON",
  manga: "MANGA",
  novel: "NOVEL",
  comic: "COMIC",
  seasonal: "SEASON",
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
  // EN first, then CN, then Alt. Every other type in this list leads with CN;
  // comic does not, because these are Western runs whose English title is the
  // one they are known by.
  if (item.type === "comic")
    return (
      item.comic_name_en || item.comic_name_cn || item.comic_name_alt || "—"
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

  // Universal search. The backend matches; this effect only decides how many
  // rows of each type reach the dropdown. Each type carries a quota so a large
  // table (e.g. anime) can never crowd out the smaller ones, but the quota is a
  // floor, not a ceiling: slots no type claims go back to the types that still
  // have matches waiting, so a query that hits only one or two tables still
  // fills the list.
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
      const scope = searchScope;

      // [bucket key, guaranteed slots when scope === "all"]
      const TYPE_QUOTAS = [
        ["collection", 3],
        ["franchise", 3],
        ["series", 3],
        ["anime", 10],
        ["anime-movie", 3],
        ["movie", 3],
        ["tv-show", 3],
        ["cartoon", 5],
        ["manga", 5],
        ["novel", 5],
        ["comic", 5],
        ["seasonal", 3],
      ];

      let payload;
      try {
        const params = new URLSearchParams({ q, limit: String(MAX_RESULTS) });
        if (scope !== "all") params.set("scope", scope);
        const res = await fetch(`/api/search/?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        payload = await res.json();
      } catch {
        return; // ignore search errors
      }

      // A newer keystroke superseded this request while it was in flight.
      if (reqId !== searchReqIdRef.current) return;

      const active = TYPE_QUOTAS.filter(
        ([type]) => scope === "all" || scope === type,
      );
      const buckets = active.map(([type]) =>
        (payload.results[type] || []).map((r) => ({ ...r, type })),
      );
      const quotas = active.map(([, quota]) =>
        scope === "all" ? quota : MAX_RESULTS,
      );

      const results = mergeBuckets(buckets, quotas);

      // Each bucket already arrives with its own exact matches first, but the
      // merge interleaves the buckets, so the whole-title matches have to be
      // lifted again across types.
      // Every title column is named *_name_*, and seasonal's is the row's only
      // string, so the check needs no per-type table of name columns.
      const isExact = (item) =>
        Object.entries(item).some(
          ([field, value]) =>
            (field.includes("_name_") || field === "seasonal") &&
            typeof value === "string" &&
            cleanString(value) === qClean,
        );
      results.sort((a, b) => Number(isExact(b)) - Number(isExact(a)));

      setSearchResults(results);
      setShowResults(true);
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
    else if (item.type === "comic") navigate(`/comic/${item.system_id}`);
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
    // paper once focused.
    <div
      ref={searchRef}
      className="group relative hidden md:flex items-center w-56 lg:w-80 xl:w-96 bg-ink-text/[0.06] ring-1 ring-inset ring-ink-text/15 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand transition"
    >
      {/* Scope selector */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowScopeMenu((s) => !s)}
          aria-haspopup="listbox"
          aria-expanded={showScopeMenu}
          className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-text/60 hover:text-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition whitespace-nowrap group-focus-within:text-text-muted"
        >
          {scopeLabel}
        </button>
        {showScopeMenu && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-2 bg-surface border border-border shadow-xl z-50 overflow-hidden min-w-[140px] py-1"
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
                    ? "text-brand bg-brand-soft"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-3.5 bg-ink-text/20 group-focus-within:bg-border shrink-0 mx-0.5"></div>

      <i className="fas fa-search pl-2 pr-1 text-ink-text/50 group-focus-within:text-text-faint text-xs pointer-events-none shrink-0"></i>

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
        className="flex-1 min-w-0 bg-transparent pr-3 py-1.5 text-sm text-ink-text placeholder:text-ink-text/50 focus:outline-none focus:text-text focus:placeholder:text-text-faint"
        autoComplete="off"
      />

      {/* Results */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border shadow-xl overflow-hidden max-h-[80vh] overflow-y-auto z-50">
          {searchResults.map((item, i) => {
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
                className="w-full text-left flex items-center px-3 py-2.5 hover:bg-surface-2 transition border-b border-border last:border-0"
              >
                <Chip className="mr-2">{TYPE_LABEL[item.type]}</Chip>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text truncate">
                    {getDisplayName(item)}
                  </div>
                  {secondary && (
                    <div className="font-mono text-[10px] text-text-faint truncate">
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
