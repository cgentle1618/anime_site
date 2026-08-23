// Frontend: page component file for CollectionLibrary.
//
// Collections are the optional umbrella tier above Franchise. Unlike the
// Franchise library there is no type filter, because a collection has no type.
import { useState, useEffect, useMemo } from "react";
import { getSortName, getRatingWeight, cleanString } from "../../utils/media";
import { getCollectionCover } from "../../lib/covers";
import CollectionCard from "../../components/cards/CollectionCard";

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
        ] = await Promise.all(responses.map((r) => r.json()));

        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
          ...novels,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading collections...</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky toolbar */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-gray-900 leading-none">
                Collection Library
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {filteredAndSorted.length} collection
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
                  placeholder="Search collections..."
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
                <option value="collection_expectation">
                  Sort: Expectation
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-24">
            <i className="fas fa-boxes-stacked text-gray-300 text-4xl mb-4"></i>
            <p className="text-gray-500 font-medium">No collections found</p>
            <p className="text-sm text-gray-400 mt-1">
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
