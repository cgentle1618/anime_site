// Frontend: page component file for Completions.
import StatsCompletions from "../statistics/StatsCompletions";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useMediaList } from "../../hooks/useMediaList";

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Completions() {
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const animeMovieQuery = useMediaList("anime-movie", LIST_OPTIONS);
  const movieQuery = useMediaList("movie", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);
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
  const isLoading = queries.some((query) => query.isLoading);
  if (isLoading || firstError) {
    return (
      <MediaLoadingState
        isLoading={isLoading}
        error={firstError}
        loadingText="Loading completions..."
        errorTitle="Error loading completions."
      />
    );
  }

  const franchiseMap = Object.fromEntries(
    (franchiseQuery.data || []).map((franchise) => [
      String(franchise.system_id),
      franchise,
    ]),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-history text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Completions
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            All completed entries by media type
          </p>
        </div>
      </div>

      <StatsCompletions
        allAnime={animeQuery.data || []}
        allAnimeMovies={animeMovieQuery.data || []}
        allMovies={movieQuery.data || []}
        allTVShows={tvQuery.data || []}
        allCartoons={cartoonQuery.data || []}
        allManga={mangaQuery.data || []}
        allNovel={novelQuery.data || []}
        franchiseMap={franchiseMap}
      />
    </div>
  );
}

