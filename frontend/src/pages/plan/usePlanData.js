// Frontend: plan page file for usePlanData.
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMediaList } from "../../hooks/useMediaList";
import { fetchJson } from "../../hooks/queryUtils";
import { entryBucket } from "../../utils/planNext";

const LIST_OPTIONS = { params: { limit: 2000 } };

// Media types the Plan page's "Watch Next" section can hold, keyed the same
// hyphenated way as plan_next.media_type and MEDIA_CONFIG.
function withBucket(row, { franchiseMap, seriesMap, entriesById }) {
  if (row.missing) return { ...row, bucket: null };

  if (row.scope === "franchise") {
    const f = franchiseMap[String(row.target_id)];
    return { ...row, bucket: entryBucket(row.media_type, null, null, f) };
  }
  if (row.scope === "series") {
    const s = seriesMap[String(row.target_id)];
    return { ...row, bucket: entryBucket(row.media_type, null, s, null) };
  }
  const entry = entriesById[row.media_type]?.[String(row.target_id)];
  return {
    ...row,
    bucket: entryBucket(
      row.media_type,
      entry?.issue_total ?? null,
      seriesMap[String(entry?.series_id)],
      franchiseMap[String(entry?.franchise_id)],
    ),
  };
}

export default function usePlanData(reloadKey = 0) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (reloadKey > 0) {
      // When the plan page triggers a refresh, invalidate every media list query at once.
      queryClient.invalidateQueries({ queryKey: ["media-list"] });
    }
  }, [queryClient, reloadKey]);

  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const animeMovieQuery = useMediaList("anime-movie", LIST_OPTIONS);
  const movieQuery = useMediaList("movie", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);
  const comicQuery = useMediaList("comic", LIST_OPTIONS);

  // Not a media type - plan_next has no MEDIA_CONFIG entry, so this is a plain
  // useQuery rather than useMediaList. Nested under the "media-list" key so
  // the reloadKey invalidation above still reaches it.
  const planNextQuery = useQuery({
    queryKey: ["media-list", "plan-next"],
    queryFn: () => fetchJson("/api/plan-next/"),
    staleTime: 30_000,
  });

  const franchises = franchiseQuery.data || [];
  const series = seriesQuery.data || [];
  const allAnime = animeQuery.data || [];
  const allAnimeMovies = animeMovieQuery.data || [];
  const allMovies = movieQuery.data || [];
  const allTVShows = tvQuery.data || [];
  const allCartoons = cartoonQuery.data || [];
  const allManga = mangaQuery.data || [];
  const allNovel = novelQuery.data || [];
  const allComics = comicQuery.data || [];
  const planNextRows = planNextQuery.data || [];

  const franchiseMap = useMemo(
    () =>
      // Turn the franchise array into a fast lookup table keyed by system_id.
      Object.fromEntries(
        franchises.map((franchise) => [String(franchise.system_id), franchise]),
      ),
    [franchises],
  );

  const seriesMap = useMemo(
    () =>
      Object.fromEntries(
        series.map((s) => [String(s.system_id), s]),
      ),
    [series],
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

  // Per-type arrays keyed the same hyphenated way as plan_next.media_type, for
  // resolving entry-scope plan rows and for the Plan page's per-tab rendering.
  const entriesByType = useMemo(
    () => ({
      anime: allAnime,
      "anime-movie": allAnimeMovies,
      movie: allMovies,
      "tv-show": allTVShows,
      cartoon: allCartoons,
      manga: allManga,
      novel: allNovel,
      comic: allComics,
    }),
    [
      allAnime,
      allAnimeMovies,
      allMovies,
      allTVShows,
      allCartoons,
      allManga,
      allNovel,
      allComics,
    ],
  );

  const entriesById = useMemo(() => {
    const byType = {};
    Object.entries(entriesByType).forEach(([type, entries]) => {
      byType[type] = Object.fromEntries(
        entries.map((entry) => [String(entry.system_id), entry]),
      );
    });
    return byType;
  }, [entriesByType]);

  const planRows = useMemo(
    () =>
      planNextRows.map((row) =>
        withBucket(row, { franchiseMap, seriesMap, entriesById }),
      ),
    [planNextRows, franchiseMap, seriesMap, entriesById],
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
    seriesQuery,
    comicQuery,
    planNextQuery,
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
    // Added for the plan_next rewrite (Task 10). Nothing above this line was
    // removed or renamed - PlanToRewatch and PlanToWatchFuture still get the
    // exact same twelve values they always did.
    series,
    allComics,
    seriesMap,
    entriesByType,
    planRows,
  };
}
