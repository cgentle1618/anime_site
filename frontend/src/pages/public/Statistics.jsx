// Frontend: page component file for Statistics.
import useStatisticsData from "../statistics/useStatisticsData";
import StatsFavoriteGrids from "../statistics/StatsFavoriteGrids";
import StatsFranchiseSummary from "../statistics/StatsFranchiseSummary";
import MediaLoadingState from "../../components/layout/MediaLoadingState";

export default function Statistics() {
  const {
    franchises,
    allAnime,
    allAnimeMovies,
    allMovies,
    allManga,
    allNovel,
    seasonals,
    currentSeason,
    allEntriesByFranchise,
    loading,
    error,
  } = useStatisticsData();

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading statistics..." />;
  }

  if (error) {
    return (
      <MediaLoadingState
        error={error}
        errorTitle="Error loading statistics."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-chart-bar text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-text tracking-tight leading-none">
            Statistics
          </h1>
          <p className="text-xs text-text-faint font-medium mt-0.5">
            {franchises.length} franchises tracked
          </p>
        </div>
      </div>

      {/* Blocks 1 — Favorite Franchise 3×3 Grids */}
      <StatsFavoriteGrids
        franchises={franchises}
        allEntriesByFranchise={allEntriesByFranchise}
      />

      {/* Blocks 2, 2.5 */}
      <StatsFranchiseSummary
        franchises={franchises}
        allAnime={allAnime}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allManga={allManga}
        allNovel={allNovel}
        seasonals={seasonals}
        currentSeason={currentSeason}
      />

    </div>
  );
}

