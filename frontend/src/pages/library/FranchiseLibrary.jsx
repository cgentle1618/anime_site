// Frontend: page component file for FranchiseLibrary.
import { useState, useEffect, useMemo } from "react";
import {
  getSortName,
  getRatingWeight,
  cleanString,
  parseTypes,
} from "../../utils/media";
import { getFranchiseCover } from "../../lib/covers";
import FranchiseCard from "../../components/cards/FranchiseCard";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function getExpectationWeight(exp) {
  return EXPECTATION_WEIGHT[exp] ?? 4;
}

function getFilterCategories(franchise, animeSet, mangaSet) {
  const types = parseTypes(franchise.franchise_type);
  const isACG = types.includes("ACG");
  const cats = [];
  if (isACG && animeSet.has(franchise.system_id)) cats.push("Anime");
  if (isACG && mangaSet.has(franchise.system_id)) cats.push("Manga");
  if (types.includes("Novel")) cats.push("Novel");
  if (types.includes("Anime Movie")) cats.push("Anime Movie");
  if (types.includes("Movie")) cats.push("Movie");
  if (types.includes("TV")) cats.push("TV");
  if (types.includes("Cartoon")) cats.push("Cartoon");
  if (types.includes("Comic")) cats.push("Comic");
  if (cats.length === 0) cats.push("Other");
  return cats;
}

const EMPTY_FILTERS = { franchiseType: new Set() };

export default function FranchiseLibrary() {
  const [allFranchises, setAllFranchises] = useState([]);
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [animesByFranchise, setAnimesByFranchise] = useState(new Set());
  const [mangasByFranchise, setMangasByFranchise] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("title");
  const [currentView, setCurrentView] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    async function load() {
      try {
        const [fRes, aRes, amRes, mRes, tvRes, cRes, mgRes, nvRes] = await Promise.all(
          [
            fetch("/api/franchise/?limit=2000", { credentials: "include" }),
            fetch("/api/anime/?limit=2000", { credentials: "include" }),
            fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
            fetch("/api/movies/?limit=2000", { credentials: "include" }),
            fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
            fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
            fetch("/api/manga/?limit=2000", { credentials: "include" }),
            fetch("/api/novel/?limit=2000", { credentials: "include" }),
          ],
        );
        if (
          !fRes.ok ||
          !aRes.ok ||
          !amRes.ok ||
          !mRes.ok ||
          !tvRes.ok ||
          !cRes.ok ||
          !mgRes.ok ||
          !nvRes.ok
        )
          throw new Error("Failed to load data");
        const [
          franchises,
          anime,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          novels,
        ] = await Promise.all([
          fRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
        ]);
        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
          ...novels,
        ];
        setAllFranchises(franchises);
        setAllEntriesDict(
          Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
        );
        const byFranchise = {};
        for (const e of allEntries) {
          if (!e.franchise_id) continue;
          if (!byFranchise[e.franchise_id]) byFranchise[e.franchise_id] = [];
          byFranchise[e.franchise_id].push(e);
        }
        setAllEntriesByFranchise(byFranchise);
        setAnimesByFranchise(
          new Set(anime.filter((a) => a.franchise_id).map((a) => a.franchise_id)),
        );
        setMangasByFranchise(
          new Set(mangas.filter((m) => m.franchise_id).map((m) => m.franchise_id)),
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleFilter(value) {
    setFilters((prev) => {
      const next = new Set(prev.franchiseType);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { franchiseType: next };
    });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const activeFilterCount = filters.franchiseType.size;

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    let result = allFranchises.filter((f) => {
      if (qClean) {
        const match = [
          f.franchise_name_cn,
          f.franchise_name_en,
          f.franchise_name_roman,
          f.franchise_name_jp,
          f.franchise_name_alt,
        ].some((n) => n && cleanString(n).includes(qClean));
        if (!match) return false;
      }

      if (filters.franchiseType.size > 0) {
        const cats = getFilterCategories(f, animesByFranchise, mangasByFranchise);
        if (!cats.some((c) => filters.franchiseType.has(c))) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      if (currentSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      } else if (currentSort === "franchise_expectation") {
        const diff =
          getExpectationWeight(a.franchise_expectation) -
          getExpectationWeight(b.franchise_expectation);
        if (diff !== 0) return diff;
      }
      return getSortName(a, "franchise").localeCompare(
        getSortName(b, "franchise"),
      );
    });

    return result;
  }, [allFranchises, searchQuery, currentSort, filters, animesByFranchise, mangasByFranchise]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint font-medium">Loading franchises...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2">
        <div className="text-center text-red-500">
          <i className="fas fa-exclamation-circle text-2xl mb-2"></i>
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const FilterTag = ({ value, label }) => {
    const active = filters.franchiseType.has(value);
    return (
      <button
        onClick={() => toggleFilter(value)}
        className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${active ? "bg-brand text-white border-brand" : "bg-surface text-text-faint border-border hover:bg-surface-2"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-surface-2">
      {/* Sticky toolbar */}
      <div className="bg-surface border-b border-border sticky top-16 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-text leading-none">
                Franchise Library
              </h1>
              <p className="text-xs text-text-faint mt-0.5">
                {filteredAndSorted.length} franchise
                {filteredAndSorted.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-xs pointer-events-none"></i>
                <input
                  type="text"
                  placeholder="Search franchises..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-surface-2 border border-transparent rounded-full text-sm focus:outline-none focus:bg-surface focus:ring-2 focus:ring-brand transition w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>

              {/* Sort */}
              <select
                value={currentSort}
                onChange={(e) => setCurrentSort(e.target.value)}
                className="bg-surface-2 border border-transparent rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand transition"
              >
                <option value="title">Sort: Title</option>
                <option value="my_rating">Sort: My Rating</option>
                <option value="franchise_expectation">Sort: Expectation</option>
              </select>

              {/* Filters button */}
              <button
                onClick={() => setShowFilters((o) => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${showFilters ? "bg-surface-2 border-border-strong text-text-muted" : "bg-surface border-border text-text-faint hover:bg-surface-2"}`}
              >
                <i className="fas fa-filter text-xs"></i>
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-brand text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* View toggle */}
              <div className="flex bg-surface-2 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setCurrentView("grid")}
                  title="Grid view"
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${currentView === "grid" ? "bg-surface text-brand shadow-sm" : "text-text-faint hover:text-text-muted"}`}
                >
                  <i className="fas fa-th-large"></i>
                </button>
                <button
                  onClick={() => setCurrentView("table")}
                  title="Table view"
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${currentView === "table" ? "bg-surface text-brand shadow-sm" : "text-text-faint hover:text-text-muted"}`}
                >
                  <i className="fas fa-list"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="border-t border-border mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs font-bold text-text-faint uppercase tracking-wider shrink-0">
                Type
              </span>
              <div className="flex flex-wrap gap-1.5">
                <FilterTag value="Anime" label="Anime" />
                <FilterTag value="Manga" label="Manga" />
                <FilterTag value="Novel" label="Novel" />
                <FilterTag value="Anime Movie" label="Anime Movie" />
                <FilterTag value="Movie" label="Movie" />
                <FilterTag value="TV" label="TV" />
                <FilterTag value="Cartoon" label="Cartoon" />
                <FilterTag value="Comic" label="Comic" />
                <FilterTag value="Other" label="Other" />
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs font-bold text-text-faint hover:text-red-500 transition flex items-center gap-1"
                >
                  <i className="fas fa-times"></i> Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === "table" ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mb-4">
              <i className="fas fa-tools text-text-faint text-2xl"></i>
            </div>
            <h2 className="text-lg font-bold text-text-muted mb-1">
              Table View Under Development
            </h2>
            <p className="text-sm text-text-faint">
              Switch to grid view to browse franchises.
            </p>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-24">
            <i className="fas fa-search text-text-faint/60 text-4xl mb-4"></i>
            <p className="text-text-faint font-medium">No franchises found</p>
            <p className="text-sm text-text-faint mt-1">
              {activeFilterCount > 0 || searchQuery ? (
                <>
                  Try adjusting your filters or{" "}
                  <button
                    onClick={() => {
                      clearFilters();
                      setSearchQuery("");
                    }}
                    className="text-brand hover:underline"
                  >
                    reset all
                  </button>
                </>
              ) : (
                "No franchises in the database yet."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((franchise) => (
              <FranchiseCard
                key={franchise.system_id}
                franchise={franchise}
                coverUrl={getFranchiseCover(
                  franchise,
                  allEntriesDict,
                  allEntriesByFranchise,
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

