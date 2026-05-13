import { useState, useEffect, useMemo } from "react";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getSortName,
  getRatingWeight,
  cleanString,
  parseTypes,
} from "../utils/media";
import FranchiseCard from "../components/FranchiseCard";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function getExpectationWeight(exp) {
  return EXPECTATION_WEIGHT[exp] ?? 4;
}

const KNOWN_TYPES = ["ACG", "Anime Movie", "TV", "Movie", "Cartoon"];

function getEntryYear(entry) {
  if (entry.release_year != null) return parseInt(entry.release_year, 10) || 0;
  const d =
    entry.release_date_jp ||
    entry.release_date_tw ||
    entry.release_date_usa ||
    entry.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

function getFranchiseCover(franchise, allEntriesDict, allEntriesByFranchise) {
  if (franchise.cover_anime_id) {
    const coverEntry = allEntriesDict[franchise.cover_anime_id];
    if (coverEntry?.cover_image_file && coverEntry.cover_image_file !== "N/A") {
      return getCoverUrl(coverEntry.cover_image_file);
    }
  }
  const entries = allEntriesByFranchise[franchise.system_id] || [];
  const withCovers = entries.filter(
    (e) => e.cover_image_file && e.cover_image_file !== "N/A",
  );
  if (withCovers.length === 0) return FALLBACK_SVG;
  withCovers.sort((a, b) => getEntryYear(b) - getEntryYear(a));
  return getCoverUrl(withCovers[0].cover_image_file);
}

const EMPTY_FILTERS = { franchiseType: new Set() };

export default function FranchiseLibrary() {
  const [allFranchises, setAllFranchises] = useState([]);
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
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
        const [fRes, aRes, amRes, mRes, tvRes, cRes, mgRes] = await Promise.all(
          [
            fetch("/api/franchise/", { credentials: "include" }),
            fetch("/api/anime/", { credentials: "include" }),
            fetch("/api/anime-movie/", { credentials: "include" }),
            fetch("/api/movies/", { credentials: "include" }),
            fetch("/api/tv-shows/", { credentials: "include" }),
            fetch("/api/cartoon/", { credentials: "include" }),
            fetch("/api/manga/", { credentials: "include" }),
          ],
        );
        if (
          !fRes.ok ||
          !aRes.ok ||
          !amRes.ok ||
          !mRes.ok ||
          !tvRes.ok ||
          !cRes.ok ||
          !mgRes.ok
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
        ] = await Promise.all([
          fRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
        ]);
        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
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
        const tokens = parseTypes(f.franchise_type);
        const matchesKnown = tokens.some((t) => filters.franchiseType.has(t));
        const isOther =
          tokens.length === 0 || tokens.every((t) => !KNOWN_TYPES.includes(t));
        if (!matchesKnown && !(isOther && filters.franchiseType.has("Other")))
          return false;
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
  }, [allFranchises, searchQuery, currentSort, filters]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading franchises...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
        className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${active ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky toolbar */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-gray-900 leading-none">
                Franchise Library
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {filteredAndSorted.length} franchise
                {filteredAndSorted.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                <input
                  type="text"
                  placeholder="Search franchises..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-gray-100 border border-transparent rounded-full text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand transition w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>

              {/* Sort */}
              <select
                value={currentSort}
                onChange={(e) => setCurrentSort(e.target.value)}
                className="bg-gray-100 border border-transparent rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand transition"
              >
                <option value="title">Sort: Title</option>
                <option value="my_rating">Sort: My Rating</option>
                <option value="franchise_expectation">Sort: Expectation</option>
              </select>

              {/* Filters button */}
              <button
                onClick={() => setShowFilters((o) => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${showFilters ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
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
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setCurrentView("grid")}
                  title="Grid view"
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${currentView === "grid" ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <i className="fas fa-th-large"></i>
                </button>
                <button
                  onClick={() => setCurrentView("table")}
                  title="Table view"
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${currentView === "table" ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <i className="fas fa-list"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="border-t border-gray-100 mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">
                Type
              </span>
              <div className="flex flex-wrap gap-1.5">
                <FilterTag value="ACG" label="ACG" />
                <FilterTag value="Anime Movie" label="Anime Movie" />
                <FilterTag value="TV" label="TV" />
                <FilterTag value="Movie" label="Movie" />
                <FilterTag value="Cartoon" label="Cartoon" />
                <FilterTag value="Other" label="Other" />
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs font-bold text-gray-400 hover:text-red-500 transition flex items-center gap-1"
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
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="fas fa-tools text-gray-400 text-2xl"></i>
            </div>
            <h2 className="text-lg font-bold text-gray-700 mb-1">
              Table View Under Development
            </h2>
            <p className="text-sm text-gray-400">
              Switch to grid view to browse franchises.
            </p>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-24">
            <i className="fas fa-search text-gray-300 text-4xl mb-4"></i>
            <p className="text-gray-500 font-medium">No franchises found</p>
            <p className="text-sm text-gray-400 mt-1">
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
