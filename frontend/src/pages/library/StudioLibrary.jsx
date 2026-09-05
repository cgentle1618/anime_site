// Frontend: page component file for StudioLibrary.
//
// Studios are a public entity, not a media type — this sits at
// /library/studio as a standalone component, outside LIBRARY_CONFIGS,
// mirroring CollectionLibrary.jsx and FranchiseLibrary.jsx.
import { useState, useEffect, useMemo } from "react";
import { StudioCard } from "../../components/cards/StaffCard";
import { cleanString, getRatingWeight } from "../../utils/media";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { Eyebrow } from "../../components/ui/primitives";

export default function StudioLibrary() {
  const [allStudios, setAllStudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("name");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/studio/", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load data");
        const studios = await res.json();
        setAllStudios(studios);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    const result = allStudios.filter((s) => {
      if (!qClean) return true;
      return STUDIO_NAME_FIELDS.some(
        ({ field }) => s[field] && cleanString(s[field]).includes(qClean),
      );
    });

    result.sort((a, b) => {
      if (currentSort === "credit_count") {
        const diff = (b.credit_count ?? 0) - (a.credit_count ?? 0);
        if (diff !== 0) return diff;
      } else if (currentSort === "my_rating") {
        const diff = getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    return result;
  }, [allStudios, searchQuery, currentSort]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading studios...</p>
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

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow className="mb-1">Library</Eyebrow>
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                Studios
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length} studio
                {filteredAndSorted.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search studios..."
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
                  <option value="name">Name</option>
                  <option value="credit_count">Credits</option>
                  <option value="my_rating">My rating</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No studios found</p>
            <p className="text-sm text-text-faint mt-1">
              {searchQuery ? (
                <>
                  Try a different search or{" "}
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-brand hover:underline"
                  >
                    reset
                  </button>
                </>
              ) : (
                "No studios in the database yet."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((studio) => (
              <StudioCard key={studio.system_id} studio={studio} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
