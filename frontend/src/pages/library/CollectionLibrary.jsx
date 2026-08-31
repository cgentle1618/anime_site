// Frontend: page component file for CollectionLibrary.
//
// Collections are the optional umbrella tier above Franchise. Unlike the
// Franchise library there is no type filter, because a collection has no type.
import { useState, useEffect, useMemo } from "react";
import { getSortName, getRatingWeight, cleanString } from "../../utils/media";
import { getCollectionCover } from "../../lib/covers";
import CollectionCard from "../../components/cards/CollectionCard";
import { Eyebrow } from "../../components/ui/primitives";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function getExpectationWeight(exp) {
  return EXPECTATION_WEIGHT[exp] ?? 4;
}

export default function CollectionLibrary() {
  const [allCollections, setAllCollections] = useState([]);
  const [franchisesByCollection, setFranchisesByCollection] = useState({});
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("my_rating");

  useEffect(() => {
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/collection/?limit=2000", { credentials: "include" }),
          fetch("/api/franchise/?limit=2000", { credentials: "include" }),
          fetch("/api/anime/?limit=2000", { credentials: "include" }),
          fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
          fetch("/api/movies/?limit=2000", { credentials: "include" }),
          fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
          fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
          fetch("/api/manga/?limit=2000", { credentials: "include" }),
          fetch("/api/novel/?limit=2000", { credentials: "include" }),
          fetch("/api/comic/?limit=2000", { credentials: "include" }),
        ]);
        if (responses.some((r) => !r.ok)) throw new Error("Failed to load data");

        const [
          collections,
          franchises,
          anime,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          novels,
          comics,
        ] = await Promise.all(responses.map((r) => r.json()));

        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
          ...novels,
          ...comics,
        ];

        setAllCollections(collections);
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

        // Member franchises per collection, name-sorted so cover fallback and
        // the member count are stable between renders.
        const byCollection = {};
        for (const f of franchises) {
          if (!f.collection_id) continue;
          if (!byCollection[f.collection_id]) byCollection[f.collection_id] = [];
          byCollection[f.collection_id].push(f);
        }
        for (const list of Object.values(byCollection)) {
          list.sort((a, b) =>
            getSortName(a, "franchise").localeCompare(
              getSortName(b, "franchise"),
            ),
          );
        }
        setFranchisesByCollection(byCollection);
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

    const result = allCollections.filter((c) => {
      if (!qClean) return true;
      return [
        c.collection_name_cn,
        c.collection_name_en,
        c.collection_name_roman,
        c.collection_name_jp,
        c.collection_name_alt,
      ].some((n) => n && cleanString(n).includes(qClean));
    });

    result.sort((a, b) => {
      if (currentSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      } else if (currentSort === "collection_expectation") {
        const diff =
          getExpectationWeight(a.collection_expectation) -
          getExpectationWeight(b.collection_expectation);
        if (diff !== 0) return diff;
      }
      return getSortName(a, "collection").localeCompare(
        getSortName(b, "collection"),
      );
    });

    return result;
  }, [allCollections, searchQuery, currentSort]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading collections...</p>
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
                Collections
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length} collection
                {filteredAndSorted.length !== 1 ? "s" : ""}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search collections..."
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
                  <option value="collection_expectation">Expectation</option>
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
            <p className="text-text-muted text-sm">No collections found</p>
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
                "Collections group related franchises, like Marvel or Type-Moon."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((collection) => {
              const members = franchisesByCollection[collection.system_id] || [];
              return (
                <CollectionCard
                  key={collection.system_id}
                  collection={collection}
                  memberCount={members.length}
                  coverUrl={getCollectionCover(
                    collection,
                    members,
                    allEntriesDict,
                    allEntriesByFranchise,
                  )}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
