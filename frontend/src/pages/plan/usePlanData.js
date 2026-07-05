// Frontend: plan page file for usePlanData.
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMediaList } from "../../hooks/useMediaList";

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function usePlanData(reloadKey = 0) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (reloadKey > 0) {
      // When the plan page triggers a refresh, invalidate every media list query at once.
      queryClient.invalidateQueries({ queryKey: ["media-list"] });
    }
  }, [queryClient, reloadKey]);

  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const animeMovieQuery = useMediaList("anime-movie", LIST_OPTIONS);
  const movieQuery = useMediaList("movie", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);

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
      // Turn the franchise array into a fast lookup table keyed by system_id.
      Object.fromEntries(
        franchises.map((franchise) => [String(franchise.system_id), franchise]),
      ),
    [franchises],
  );

  const allEntriesByFranchise = useMemo(() => {
    // Merge all media types into one array so we can regroup them by franchise id.
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
      // The grouped object ends up looking like { [franchiseId]: [items...] }.
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

  const queries = [
    franchiseQuery,
    animeQuery,
    animeMovieQuery,
    movieQuery,
    tvQuery,
    cartoonQuery,
    mangaQuery,
    novelQuery,
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
    allEntriesByFranchise,
    franchiseMap,
    loading: queries.some((query) => query.isLoading),
    error: firstError?.message || null,
  };
}

