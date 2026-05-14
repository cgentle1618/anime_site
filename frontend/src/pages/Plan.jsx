import { useState } from "react";
import usePlanData from "./plan/usePlanData";
import PlanWatchNext from "./plan/PlanWatchNext";
import PlanToRewatch from "./plan/PlanToRewatch";
import PlanToWatchFuture from "./plan/PlanToWatchFuture";

export default function Plan() {
  const [reloadKey, setReloadKey] = useState(0);
  const {
    franchises,
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
    allEntriesByFranchise,
    franchiseMap,
    loading,
    error,
  } = usePlanData(reloadKey);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading plan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading plan.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-clipboard-list text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Plan
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Watch Next, To Rewatch &amp; Future Plans
          </p>
        </div>
      </div>

      {/* Watch Next */}
      <PlanWatchNext
        franchises={franchises}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        allManga={allManga}
        allNovel={allNovel}
        allEntriesByFranchise={allEntriesByFranchise}
        franchiseMap={franchiseMap}
      />

      {/* To Rewatch */}
      <PlanToRewatch
        franchises={franchises}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        allManga={allManga}
        allNovel={allNovel}
        allEntriesByFranchise={allEntriesByFranchise}
      />

      {/* Plan to Watch for Future Releases */}
      <PlanToWatchFuture
        allAnime={allAnime}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        franchiseMap={franchiseMap}
        onUpdated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
