import useStatisticsData from "./statistics/useStatisticsData";
import StatsFavoriteGrids from "./statistics/StatsFavoriteGrids";
import StatsFranchiseSummary from "./statistics/StatsFranchiseSummary";
import StatsWatchNext from "./statistics/StatsWatchNext";
import StatsToRewatch from "./statistics/StatsToRewatch";
import StatsCompletions from "./statistics/StatsCompletions";

export default function Statistics() {
  const {
    franchises,
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
    seasonals,
    currentSeason,
    allEntriesByFranchise,
    franchiseMap,
    loading,
    error,
  } = useStatisticsData();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading statistics.</p>
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
          <i className="fas fa-chart-bar text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Statistics
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
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
        seasonals={seasonals}
        currentSeason={currentSeason}
      />

      {/* Block 3 — Watch Next */}
      <StatsWatchNext
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

      {/* Block 3.5 — To Rewatch */}
      <StatsToRewatch
        franchises={franchises}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        allManga={allManga}
        allNovel={allNovel}
        allEntriesByFranchise={allEntriesByFranchise}
      />

      {/* Block 4 — Recent Completions */}
      <StatsCompletions
        allAnime={allAnime}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        allManga={allManga}
        allNovel={allNovel}
        franchiseMap={franchiseMap}
      />
    </div>
  );
}
