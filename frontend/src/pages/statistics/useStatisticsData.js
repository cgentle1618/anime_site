// Frontend: statistics page file for useStatisticsData.
import { useMemo } from "react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useMediaList } from "../../hooks/useMediaList";

const SEASON_WEIGHT = { FAL: 4, SUM: 3, SPR: 2, WIN: 1 };

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function useStatisticsData() {
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const animeMovieQuery = useMediaList("anime-movie", LIST_OPTIONS);
  const movieQuery = useMediaList("movie", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);
  const seasonalQuery = useApiQuery(["api", "seasonal"], "/api/seasonal/");
  const currentSeasonQuery = useApiQuery(
    ["api", "seasonal", "current-season"],
    "/api/seasonal/current-season",
  );

  const franchises = franchiseQuery.data || [];
  const allAnime = animeQuery.data || [];
  const allAnimeMovies = animeMovieQuery.data || [];
  const allMovies = movieQuery.data || [];
  const allTVShows = tvQuery.data || [];
  const allCartoons = cartoonQuery.data || [];
  const allManga = mangaQuery.data || [];
  const allNovel = novelQuery.data || [];

  const franchiseMap = useMemo(
    () =>
      Object.fromEntries(
        franchises.map((franchise) => [String(franchise.system_id), franchise]),
      ),
    [franchises],
  );

  const allEntriesByFranchise = useMemo(() => {
    const allEntries = [
      ...allAnime.map((entry) => ({ ...entry, _type: "anime" })),
      ...allAnimeMovies.map((entry) => ({ ...entry, _type: "anime_movie" })),
      ...allMovies.map((entry) => ({ ...entry, _type: "movie" })),
      ...allTVShows.map((entry) => ({ ...entry, _type: "tv_show" })),
      ...allCartoons.map((entry) => ({ ...entry, _type: "cartoon" })),
      ...allManga.map((entry) => ({ ...entry, _type: "manga" })),
      ...allNovel.map((entry) => ({ ...entry, _type: "novel" })),
    ];
    const byFranchise = {};
    allEntries.forEach((entry) => {
      const id = String(entry.franchise_id);
      if (!byFranchise[id]) byFranchise[id] = [];
      byFranchise[id].push(entry);
    });
    return byFranchise;
  }, [
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
  ]);

  const seasonals = useMemo(
    () =>
      [...(seasonalQuery.data || [])].sort((a, b) => {
        const [aSeason, aYear] = a.seasonal.split(" ");
        const [bSeason, bYear] = b.seasonal.split(" ");
        const yearDiff = parseInt(bYear, 10) - parseInt(aYear, 10);
        if (yearDiff !== 0) return yearDiff;
        return (SEASON_WEIGHT[bSeason] ?? 0) - (SEASON_WEIGHT[aSeason] ?? 0);
      }),
    [seasonalQuery.data],
  );

  const queries = [
    franchiseQuery,
    animeQuery,
    animeMovieQuery,
    movieQuery,
    tvQuery,
    cartoonQuery,
    mangaQuery,
    novelQuery,
    seasonalQuery,
    currentSeasonQuery,
  ];
  const firstError = queries.find((query) => query.error)?.error;

  return {
    franchises,
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
    seasonals,
    currentSeason: currentSeasonQuery.data?.current_season || null,
    allEntriesByFranchise,
    franchiseMap,
    loading: queries.some((query) => query.isLoading),
    error: firstError?.message || null,
  };
}

