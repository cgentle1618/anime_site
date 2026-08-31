// Frontend: page component file for Completions.
import StatsCompletions from "../statistics/StatsCompletions";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useMediaList } from "../../hooks/useMediaList";
import { Eyebrow } from "../../components/ui/primitives";

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
  const comicQuery = useMediaList("comic", LIST_OPTIONS);
  const queries = [
    franchiseQuery,
    animeQuery,
    animeMovieQuery,
    movieQuery,
    tvQuery,
    cartoonQuery,
    mangaQuery,
    novelQuery,
    comicQuery,
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
      <header>
        <Eyebrow className="mb-2">Archive</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
          Completions
        </h1>
        <p className="text-sm text-text-muted">All completed entries by media type</p>
      </header>

      <StatsCompletions
        allAnime={animeQuery.data || []}
        allAnimeMovies={animeMovieQuery.data || []}
        allMovies={movieQuery.data || []}
        allTVShows={tvQuery.data || []}
        allCartoons={cartoonQuery.data || []}
        allManga={mangaQuery.data || []}
        allNovel={novelQuery.data || []}
        allComic={comicQuery.data || []}
        franchiseMap={franchiseMap}
      />
    </div>
  );
}

