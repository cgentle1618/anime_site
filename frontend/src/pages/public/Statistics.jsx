// Frontend: page component file for Statistics.
import useStatisticsData from "../statistics/useStatisticsData";
import StatsFavoriteGrids from "../statistics/StatsFavoriteGrids";
import StatsFranchiseSummary from "../statistics/StatsFranchiseSummary";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow } from "../../components/ui/primitives";

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
      <header>
        <Eyebrow className="mb-2">Archive</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
          Statistics
        </h1>
        <p className="text-sm text-text-muted font-mono">
          {franchises.length} franchises tracked
        </p>
      </header>

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

