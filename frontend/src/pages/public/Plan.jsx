// Frontend: page component file for Plan.
import { useState } from "react";
import usePlanData from "../plan/usePlanData";
import PlanWatchNext from "../plan/PlanWatchNext";
import PlanToRewatch from "../plan/PlanToRewatch";
import PlanToWatchFuture from "../plan/PlanToWatchFuture";
import MediaLoadingState from "../../components/layout/MediaLoadingState";

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
    planRows,
    loading,
    error,
  } = usePlanData(reloadKey);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading plan..." />;
  }

  if (error) {
    return (
      <MediaLoadingState error={error} errorTitle="Error loading plan." />
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
      <PlanWatchNext planRows={planRows} />

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

