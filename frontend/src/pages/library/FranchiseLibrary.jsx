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
import { Eyebrow } from "../../components/ui/primitives";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading franchises...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center border border-danger bg-danger/10 px-6 py-4 text-danger">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  const PILL_ON = "bg-brand text-on-brand border-brand";
  const PILL_OFF =
    "bg-surface border-border-strong text-text-muted hover:border-text hover:text-text";

  const FilterTag = ({ value, label }) => {
    const active = filters.franchiseType.has(value);
    return (
      <button
        onClick={() => toggleFilter(value)}
        className={`px-3 py-1 border text-xs font-medium transition-colors ${active ? PILL_ON : PILL_OFF}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow className="mb-1">Library</Eyebrow>
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                Franchises
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length} franchise
                {filteredAndSorted.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search franchises..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-surface border border-border-strong text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand transition w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>

              {/* Sort */}
              <label className="flex items-center gap-2">
                <Eyebrow>Sort</Eyebrow>
                <select
                  value={currentSort}
                  onChange={(e) => setCurrentSort(e.target.value)}
                  className="bg-surface border border-border-strong px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="title">Title</option>
                  <option value="my_rating">My rating</option>
                  <option value="franchise_expectation">Expectation</option>
                </select>
              </label>

              {/* Filters button */}
              <button
                onClick={() => setShowFilters((o) => !o)}
                className={`px-3 py-1.5 border text-sm font-medium transition-colors ${showFilters ? PILL_ON : PILL_OFF}`}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 font-mono text-[10px] tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* View toggle */}
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentView("grid")}
                  title="Grid view"
                  aria-label="Grid view"
                  className={`px-3 py-1.5 border text-sm transition-colors ${currentView === "grid" ? PILL_ON : PILL_OFF}`}
                >
                  <i className="fas fa-th-large"></i>
                </button>
                <button
                  onClick={() => setCurrentView("table")}
                  title="Table view"
                  aria-label="Table view"
                  className={`px-3 py-1.5 border text-sm transition-colors ${currentView === "table" ? PILL_ON : PILL_OFF}`}
                >
                  <i className="fas fa-list"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="border-t border-border mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Eyebrow className="shrink-0">Type</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                <FilterTag value="Anime" label="Anime" />
                <FilterTag value="Manga" label="Manga" />
                <FilterTag value="Novel" label="Novel" />
                <FilterTag value="Anime Movie" label="Anime movie" />
                <FilterTag value="Movie" label="Movie" />
                <FilterTag value="TV" label="TV" />
                <FilterTag value="Cartoon" label="Cartoon" />
                <FilterTag value="Comic" label="Comic" />
                <FilterTag value="Other" label="Other" />
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint hover:text-text transition"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === "table" ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Table view</Eyebrow>
            <p className="text-text-muted text-sm">
              Not built yet — switch to grid view to browse franchises.
            </p>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No franchises found</p>
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

