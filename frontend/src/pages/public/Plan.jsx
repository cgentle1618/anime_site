// Frontend: page component file for Plan.
import { useState } from "react";
import usePlanData from "../plan/usePlanData";
import PlanWatchNext from "../plan/PlanWatchNext";
import PlanToRewatch from "../plan/PlanToRewatch";
import PlanToWatchFuture from "../plan/PlanToWatchFuture";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow } from "../../components/ui/primitives";

export default function Plan() {
  const [reloadKey, setReloadKey] = useState(0);
  const {
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
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
      <header>
        <Eyebrow className="mb-3">Plan</Eyebrow>
        <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
          Plan
        </h1>
        <p className="text-text-muted">
          Watch next, to rewatch and future releases.
        </p>
      </header>

      {/* Watch Next */}
      <PlanWatchNext planRows={planRows} />

      {/* To Rewatch */}
      <PlanToRewatch planRows={planRows} />

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

