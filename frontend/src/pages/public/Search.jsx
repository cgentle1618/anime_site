// Frontend: page component file for Search.
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import MediaCard from "../../components/cards/MediaCard";
import { cleanString } from "../../utils/media";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useMediaList } from "../../hooks/useMediaList";

function getFranchiseTitles(f) {
  const raw = [
    f.franchise_name_cn,
    f.franchise_name_en,
    f.franchise_name_alt,
    f.franchise_name_roman,
    f.franchise_name_jp,
  ];
  const valid = [...new Set(raw.filter((t) => t && t.trim() !== ""))];
  return { main: valid[0] || "Unknown Franchise", sub: valid[1] || "" };
}

function getCollectionTitles(c) {
  const raw = [
    c.collection_name_cn,
    c.collection_name_en,
    c.collection_name_alt,
    c.collection_name_roman,
    c.collection_name_jp,
  ];
  const valid = [...new Set(raw.filter((t) => t && t.trim() !== ""))];
  return { main: valid[0] || "Unknown Collection", sub: valid[1] || "" };
}

function getSeriesTitles(s) {
  const raw = [s.series_name_cn, s.series_name_en, s.series_name_alt];
  const valid = [...new Set(raw.filter((t) => t && t.trim() !== ""))];
  return { main: valid[0] || "Unknown Series", sub: valid[1] || "" };
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const scope = searchParams.get("scope") || "all";
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const hasQuery = !!query.trim();
  const needsFranchise =
    scope === "all" || scope === "franchise" || scope === "anime";
  const needsAnime = scope === "all" || scope === "anime";
  const needsAnimeMovie = scope === "all" || scope === "anime-movie";
  const needsMovie = scope === "all" || scope === "movie";
  const needsTvShow = scope === "all" || scope === "tv-show";
  const needsCartoon = scope === "all" || scope === "cartoon";
  const needsManga = scope === "all" || scope === "manga";
  const needsNovel = scope === "all" || scope === "novel";
  const needsSeries = scope === "all" || scope === "series";
  const needsSeasonal = scope === "all" || scope === "seasonal";
  const needsCollection = scope === "all" || scope === "collection";

  const franchiseQuery = useMediaList("franchise", {
    params: { limit: 2000 },
    enabled: hasQuery && needsFranchise,
  });
  const animeQuery = useMediaList("anime", {
    params: { limit: 2000 },
    enabled: hasQuery && needsAnime,
  });
  const seriesQuery = useMediaList("series", {
    params: { limit: 2000 },
    enabled: hasQuery && needsSeries,
  });
  const seasonalQuery = useApiQuery(["api", "seasonal"], "/api/seasonal/", {
    enabled: hasQuery && needsSeasonal,
  });
  const collectionQuery = useApiQuery(
    ["api", "collection"],
    "/api/collection/",
    {
      params: { limit: 2000 },
      enabled: hasQuery && needsCollection,
    },
  );
  const animeMovieQuery = useMediaList("anime-movie", {
    params: { limit: 2000 },
    enabled: hasQuery && needsAnimeMovie,
  });
  const movieQuery = useMediaList("movie", {
    params: { limit: 2000 },
    enabled: hasQuery && needsMovie,
  });
  const tvQuery = useMediaList("tv-show", {
    params: { limit: 2000 },
    enabled: hasQuery && needsTvShow,
  });
  const cartoonQuery = useMediaList("cartoon", {
    params: { limit: 2000 },
    enabled: hasQuery && needsCartoon,
  });
  const mangaQuery = useMediaList("manga", {
    params: { limit: 2000 },
    enabled: hasQuery && needsManga,
  });
  const novelQuery = useMediaList("novel", {
    params: { limit: 2000 },
    enabled: hasQuery && needsNovel,
  });
  const activeQueries = [
    needsFranchise && franchiseQuery,
    needsAnime && animeQuery,
    needsSeries && seriesQuery,
    needsSeasonal && seasonalQuery,
    needsCollection && collectionQuery,
    needsAnimeMovie && animeMovieQuery,
    needsMovie && movieQuery,
    needsTvShow && tvQuery,
    needsCartoon && cartoonQuery,
    needsManga && mangaQuery,
    needsNovel && novelQuery,
  ].filter(Boolean);
  const loading =
    hasQuery && activeQueries.some((queryResult) => queryResult.isLoading);
  const error =
    activeQueries.find((queryResult) => queryResult.error)?.error?.message ||
    null;
  const [matchedFranchises, setMatchedFranchises] = useState([]);
  const [filterPillFranchises, setFilterPillFranchises] = useState([]);
  const [matchedSeries, setMatchedSeries] = useState([]);
  const [matchedAnime, setMatchedAnime] = useState([]);
  const [matchedAnimeMovies, setMatchedAnimeMovies] = useState([]);
  const [matchedMovies, setMatchedMovies] = useState([]);
  const [matchedTvShows, setMatchedTvShows] = useState([]);
  const [matchedCartoons, setMatchedCartoons] = useState([]);
  const [matchedMangas, setMatchedMangas] = useState([]);
  const [matchedNovels, setMatchedNovels] = useState([]);
  const [matchedSeasonal, setMatchedSeasonal] = useState([]);
  const [matchedCollections, setMatchedCollections] = useState([]);
  const [allAnime, setAllAnime] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTvShows, setAllTvShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allMangas, setAllMangas] = useState([]);
  const [allNovels, setAllNovels] = useState([]);
  const [selectedFranchise, setSelectedFranchise] = useState("all");

  const stickyBarRef = useRef(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(0);

  useEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStickyBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSelectedFranchise("all");
    if (!query.trim()) {
      setMatchedSeasonal([]);
      setMatchedCollections([]);
      setMatchedFranchises([]);
      setFilterPillFranchises([]);
      setMatchedAnime([]);
      setMatchedSeries([]);
      setMatchedAnimeMovies([]);
      setMatchedMovies([]);
      setMatchedTvShows([]);
      setMatchedCartoons([]);
      setMatchedMangas([]);
      setMatchedNovels([]);
      return;
    }
    if (loading || error) return;

    const allFranchises = franchiseQuery.data || [];
    const all = animeQuery.data || [];
    const allSeries = seriesQuery.data || [];
    const allSeasonal = seasonalQuery.data || [];
    const allCollections = collectionQuery.data || [];
    const animeMovieResults = animeMovieQuery.data || [];
    const movieResults = movieQuery.data || [];
    const tvShowResults = tvQuery.data || [];
    const cartoonResults = cartoonQuery.data || [];
    const mangaResults = mangaQuery.data || [];
    const novelResults = novelQuery.data || [];
    setAllAnime(all);
    setAllAnimeMovies(animeMovieResults);
    setAllMovies(movieResults);
    setAllTvShows(tvShowResults);
    setAllCartoons(cartoonResults);
    setAllMangas(mangaResults);
    setAllNovels(novelResults);

    const qClean = cleanString(query);

    // Seasonal
    const msea = allSeasonal
      .filter((s) => cleanString(s.seasonal).includes(qClean))
      .sort((a, b) => b.seasonal.localeCompare(a.seasonal));

    // Collection
    const mcol = allCollections
      .filter((c) =>
        [
          c.collection_name_cn,
          c.collection_name_en,
          c.collection_name_roman,
          c.collection_name_jp,
          c.collection_name_alt,
        ].some((n) => cleanString(n).includes(qClean)),
      )
      .sort((a, b) =>
        (a.collection_name_cn || "").localeCompare(b.collection_name_cn || ""),
      );

    // Franchise (direct name match + franchises of matched anime)
    const directF = allFranchises.filter((f) =>
      [
        f.franchise_name_cn,
        f.franchise_name_en,
        f.franchise_name_roman,
        f.franchise_name_jp,
        f.franchise_name_alt,
      ].some((n) => cleanString(n).includes(qClean)),
    );
    const directA = all.filter((a) =>
      [
        a.anime_name_cn,
        a.anime_name_en,
        a.anime_name_roman,
        a.anime_name_jp,
        a.anime_name_alt,
      ].some((n) => cleanString(n).includes(qClean)),
    );
    const fIdSet = new Set(directF.map((f) => f.system_id));
    const mf = allFranchises
      .filter((f) => fIdSet.has(f.system_id))
      .sort((a, b) =>
        (a.franchise_name_cn || "").localeCompare(b.franchise_name_cn || ""),
      );

    // Anime (direct + all anime in matched franchises when scope=all)
    const directFIdSet = new Set(directF.map((f) => f.system_id));
    const aIdSet = new Set(directA.map((a) => a.system_id));
    if (scope === "all")
      all.forEach((a) => {
        if (a.franchise_id && directFIdSet.has(a.franchise_id))
          aIdSet.add(a.system_id);
      });
    const ma = all
      .filter((a) => aIdSet.has(a.system_id))
      .sort((a, b) =>
        (a.anime_name_cn || "").localeCompare(b.anime_name_cn || ""),
      );

    // Franchise filter pills — derived from anime results
    const pillFIdSet = new Set(ma.map((a) => a.franchise_id).filter(Boolean));
    const pillFranchises = allFranchises
      .filter((f) => pillFIdSet.has(f.system_id))
      .sort((a, b) =>
        (a.franchise_name_cn || "").localeCompare(b.franchise_name_cn || ""),
      );

    // Series
    const ms = allSeries
      .filter((s) =>
        [s.series_name_cn, s.series_name_en, s.series_name_alt].some((n) =>
          cleanString(n).includes(qClean),
        ),
      )
      .sort((a, b) =>
        (a.series_name_cn || "").localeCompare(b.series_name_cn || ""),
      );

    // Anime Movies
    const mam = animeMovieResults
      .filter((m) =>
        [
          m.anime_movie_name_cn,
          m.anime_movie_name_en,
          m.anime_movie_name_roman,
          m.anime_movie_name_jp,
          m.anime_movie_name_alt,
        ].some((n) => cleanString(n).includes(qClean)),
      )
      .sort((a, b) =>
        (a.anime_movie_name_cn || "").localeCompare(
          b.anime_movie_name_cn || "",
        ),
      );

    // Movies
    const mmv = movieResults
      .filter((m) =>
        [m.movie_name_cn, m.movie_name_en, m.movie_name_alt].some((n) =>
          cleanString(n).includes(qClean),
        ),
      )
      .sort((a, b) =>
        (a.movie_name_cn || "").localeCompare(b.movie_name_cn || ""),
      );

    // TV Shows
    const mtv = tvShowResults
      .filter((t) =>
        [t.tv_name_cn, t.tv_name_en, t.tv_name_alt].some((n) =>
          cleanString(n).includes(qClean),
        ),
      )
      .sort((a, b) => (a.tv_name_cn || "").localeCompare(b.tv_name_cn || ""));

    // Cartoons
    const mc = cartoonResults
      .filter((c) =>
        [c.cartoon_name_cn, c.cartoon_name_en, c.cartoon_name_alt].some((n) =>
          cleanString(n).includes(qClean),
        ),
      )
      .sort((a, b) =>
        (a.cartoon_name_cn || "").localeCompare(b.cartoon_name_cn || ""),
      );

    // Manga
    const mm = mangaResults
      .filter((m) =>
        [
          m.manga_name_cn,
          m.manga_name_en,
          m.manga_name_roman,
          m.manga_name_jp,
          m.manga_name_alt,
        ].some((n) => cleanString(n).includes(qClean)),
      )
      .sort((a, b) =>
        (a.manga_name_cn || "").localeCompare(b.manga_name_cn || ""),
      );

    // Novel
    const mnv = novelResults
      .filter((n) =>
        [
          n.novel_name_cn,
          n.novel_name_en,
          n.novel_name_roman,
          n.novel_name_jp,
          n.novel_name_alt,
        ].some((v) => cleanString(v).includes(qClean)),
      )
      .sort((a, b) =>
        (a.novel_name_cn || "").localeCompare(b.novel_name_cn || ""),
      );

    setMatchedSeasonal(msea);
    setMatchedCollections(mcol);
    setMatchedFranchises(mf);
    setFilterPillFranchises(pillFranchises);
    setMatchedAnime(ma);
    setMatchedSeries(ms);
    setMatchedAnimeMovies(mam);
    setMatchedMovies(mmv);
    setMatchedTvShows(mtv);
    setMatchedCartoons(mc);
    setMatchedMangas(mm);
    setMatchedNovels(mnv);
  }, [
    animeMovieQuery.data,
    animeQuery.data,
    cartoonQuery.data,
    collectionQuery.data,
    error,
    franchiseQuery.data,
    loading,
    mangaQuery.data,
    movieQuery.data,
    novelQuery.data,
    query,
    scope,
    seasonalQuery.data,
    seriesQuery.data,
    tvQuery.data,
  ]);

  const handleAnimeUpdated = useCallback((updated) => {
    setMatchedAnime((prev) =>
      prev.map((a) => (a.system_id === updated.system_id ? updated : a)),
    );
    setAllAnime((prev) =>
      prev.map((a) => (a.system_id === updated.system_id ? updated : a)),
    );
  }, []);

  const handleMovieUpdated = useCallback((updated) => {
    setMatchedAnimeMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setAllAnimeMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleLiveMovieUpdated = useCallback((updated) => {
    setMatchedMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setAllMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleTvShowUpdated = useCallback((updated) => {
    setMatchedTvShows((prev) =>
      prev.map((t) => (t.system_id === updated.system_id ? updated : t)),
    );
    setAllTvShows((prev) =>
      prev.map((t) => (t.system_id === updated.system_id ? updated : t)),
    );
  }, []);

  const handleCartoonUpdated = useCallback((updated) => {
    setMatchedCartoons((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
    );
    setAllCartoons((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
    );
  }, []);

  const handleMangaUpdated = useCallback((updated) => {
    setMatchedMangas((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setAllMangas((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleNovelUpdated = useCallback((updated) => {
    setMatchedNovels((prev) =>
      prev.map((n) => (n.system_id === updated.system_id ? updated : n)),
    );
    setAllNovels((prev) =>
      prev.map((n) => (n.system_id === updated.system_id ? updated : n)),
    );
  }, []);

  const showSeasonal = scope === "all" || scope === "seasonal";
  const showCollection = scope === "all" || scope === "collection";
  const showFranchise = scope === "all" || scope === "franchise";
  const showSeries = scope === "all" || scope === "series";
  const showAnime = scope === "all" || scope === "anime";
  const showAnimeMovie = scope === "all" || scope === "anime-movie";
  const showMovie = scope === "all" || scope === "movie";
  const showTvShow = scope === "all" || scope === "tv-show";
  const showCartoon = scope === "all" || scope === "cartoon";
  const showManga = scope === "all" || scope === "manga";
  const showNovel = scope === "all" || scope === "novel";
  const showFranchisePills =
    (scope === "all" ||
      scope === "anime" ||
      scope === "series" ||
      scope === "franchise") &&
    filterPillFranchises.length > 0;

  const displayFranchises =
    selectedFranchise === "all"
      ? matchedFranchises
      : matchedFranchises.filter((f) => f.system_id === selectedFranchise);
  const displaySeries =
    selectedFranchise === "all"
      ? matchedSeries
      : matchedSeries.filter((s) => s.franchise_id === selectedFranchise);
  const displayAnime =
    selectedFranchise === "all"
      ? matchedAnime
      : matchedAnime.filter((a) => a.franchise_id === selectedFranchise);
  const tvOna = displayAnime.filter(
    (a) => a.airing_type === "TV" || a.airing_type === "ONA",
  );
  const movies = displayAnime.filter((a) => a.airing_type === "Movie");
  const others = displayAnime.filter(
    (a) =>
      a.airing_type !== "TV" &&
      a.airing_type !== "ONA" &&
      a.airing_type !== "Movie",
  );

  // Only sections with at least one match are rendered, so the count summary is
  // built from the same non-empty list the sections use.
  const summaryCounts = [
    showCollection && ["collections", matchedCollections.length],
    showSeasonal && ["seasonal", matchedSeasonal.length],
    showFranchise && ["franchises", displayFranchises.length],
    showSeries && ["series", displaySeries.length],
    showAnime && ["anime", displayAnime.length],
    showAnimeMovie && ["anime movies", matchedAnimeMovies.length],
    showMovie && ["movies", matchedMovies.length],
    showTvShow && ["TV shows", matchedTvShows.length],
    showCartoon && ["cartoons", matchedCartoons.length],
    showManga && ["manga", matchedMangas.length],
    showNovel && ["novel", matchedNovels.length],
  ].filter((entry) => entry && entry[1] > 0);

  const SCOPE_LABELS = {
    all: "All",
    collection: "Collection",
    franchise: "Franchise",
    series: "Series",
    anime: "Anime",
    "anime-movie": "Anime Movie",
    movie: "Movie",
    "tv-show": "TV Show",
    cartoon: "Cartoon",
    manga: "Manga",
    novel: "Novel",
    seasonal: "Seasonal",
  };

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Searching..." />;
  }

  if (!query.trim()) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
        <p className="text-gray-500 font-bold">No Search Query</p>
        <p className="text-sm text-gray-400 mt-1">
          Please enter a term in the top search bar.
        </p>
      </div>
    );
  }

  if (error) {
    return <MediaLoadingState error={error} errorTitle="Search Error" />;
  }

  const sectionHeaderTop = `${64 + stickyBarHeight}px`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Sticky header: title + count summary */}
      <div
        ref={stickyBarRef}
        className="sticky top-16 z-30 bg-gray-50 pb-4 mb-8 border-b border-gray-200"
      >
        <h1 className="text-xl font-black text-gray-900">
          Search Results for "<span className="text-brand">{query}</span>"
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {scope !== "all" && (
            <span className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs font-bold px-2 py-0.5 rounded mr-2">
              {SCOPE_LABELS[scope]}
            </span>
          )}
          {summaryCounts.length === 0 ? (
            <span>No results</span>
          ) : (
            summaryCounts.map(([label, count], i) => (
              <span key={label}>
                {i > 0 && " · "}
                <span className="font-bold">{count}</span> {label}
              </span>
            ))
          )}
        </p>
      </div>

      <div className="space-y-8">
        {summaryCounts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <i className="fas fa-ghost text-4xl mb-3"></i>
            <p className="font-bold text-gray-500">No results for "{query}"</p>
            <p className="text-sm mt-1">Try a different term or scope.</p>
          </div>
        )}

        {/* Collection cards */}
        {showCollection && matchedCollections.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-boxes-stacked text-brand/70"></i> Collections
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {matchedCollections.map((c) => {
                const t = getCollectionTitles(c);
                return (
                  <div
                    key={c.system_id}
                    onClick={() => navigate(`/collection/${c.system_id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-[9px] font-bold text-fuchsia-600 uppercase tracking-widest mb-1.5">
                        <i className="fas fa-boxes-stacked mr-1"></i>Collection
                      </div>
                      <h3
                        className="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2"
                        title={t.main}
                      >
                        {t.main}
                      </h3>
                      {t.sub && (
                        <h4
                          className="text-xs font-medium text-gray-500 truncate"
                          title={t.sub}
                        >
                          {t.sub}
                        </h4>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Seasonal entries */}
        {showSeasonal && matchedSeasonal.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-calendar-alt text-brand/70"></i> Seasonal
            </h2>
            <div className="flex flex-wrap gap-2">
              {matchedSeasonal.map((s) => (
                <button
                  key={s.seasonal}
                  onClick={() =>
                    navigate(`/seasonal/${encodeURIComponent(s.seasonal)}`)
                  }
                  className="px-4 py-1.5 rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-brand hover:text-white hover:border-brand transition-colors shadow-sm"
                >
                  {s.seasonal}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Franchise filter pills */}
        {showFranchisePills && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedFranchise("all")}
              className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === "all" ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              All Results
            </button>
            {filterPillFranchises.map((f) => {
              const titles = getFranchiseTitles(f);
              return (
                <button
                  key={f.system_id}
                  onClick={() => setSelectedFranchise(f.system_id)}
                  title={titles.main}
                  className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === f.system_id ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                >
                  {titles.main}
                </button>
              );
            })}
          </div>
        )}

        {/* Franchise cards */}
        {showFranchise && displayFranchises.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-sitemap text-brand/70"></i> Franchises
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayFranchises.map((f) => {
                const t = getFranchiseTitles(f);
                return (
                  <div
                    key={f.system_id}
                    onClick={() => navigate(`/franchise/${f.system_id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-[9px] font-bold text-brand uppercase tracking-widest mb-1.5">
                        <i className="fas fa-sitemap mr-1"></i>
                        {f.franchise_type + " Franchise" || "Franchise"}
                      </div>
                      <h3
                        className="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2"
                        title={t.main}
                      >
                        {t.main}
                      </h3>
                      {t.sub && (
                        <h4
                          className="text-xs font-medium text-gray-500 truncate"
                          title={t.sub}
                        >
                          {t.sub}
                        </h4>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Series cards */}
        {showSeries && displaySeries.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-layer-group text-brand/70"></i> Series
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displaySeries.map((s) => {
                const t = getSeriesTitles(s);
                return (
                  <div
                    key={s.system_id}
                    onClick={() => navigate(`/series/${s.system_id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-[9px] font-bold text-brand/70 uppercase tracking-widest mb-1.5">
                        <i className="fas fa-layer-group mr-1"></i>Series
                      </div>
                      <h3
                        className="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2"
                        title={t.main}
                      >
                        {t.main}
                      </h3>
                      {t.sub && (
                        <h4
                          className="text-xs font-medium text-gray-500 truncate"
                          title={t.sub}
                        >
                          {t.sub}
                        </h4>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Anime */}
        {showAnime && displayAnime.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-tv text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Anime
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {displayAnime.length} results
              </span>
            </div>

            <div className="space-y-8">
              {[
                { label: "TV / ONA", icon: "fa-tv", items: tvOna },
                { label: "Movies", icon: "fa-film", items: movies },
                { label: "Other", icon: "fa-shapes", items: others },
              ].map(({ label, icon, items }) =>
                items.length > 0 ? (
                  <div key={label}>
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <i className={`fas ${icon} text-brand/70`}></i>
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {items.length}
                      </span>
                      <div className="flex-1 border-t border-gray-100"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {items.map((a) => (
                        <MediaCard
                          key={a.system_id}
                          type="anime"
                          data={a}
                          onUpdated={handleAnimeUpdated}
                        />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        )}

        {/* Anime Movies */}
        {showAnimeMovie && matchedAnimeMovies.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-film text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Anime Movies
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedAnimeMovies.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedAnimeMovies.map((m) => (
                <MediaCard
                  key={m.system_id}
                  type="anime-movie"
                  data={m}
                  onUpdated={handleMovieUpdated}
                />
              ))}
            </div>
          </div>
        )}

        {/* Movies */}
        {showMovie && matchedMovies.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-ticket-alt text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Movies
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedMovies.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedMovies.map((m) => (
                <MediaCard
                  key={m.system_id}
                  type="movie"
                  data={m}
                  onUpdated={handleLiveMovieUpdated}
                />
              ))}
            </div>
          </div>
        )}

        {/* TV Shows */}
        {showTvShow && matchedTvShows.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-video text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  TV Shows
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedTvShows.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedTvShows.map((t) => (
                <MediaCard
                  key={t.system_id}
                  type="tv-show"
                  data={t}
                  onUpdated={handleTvShowUpdated}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cartoons */}
        {showCartoon && matchedCartoons.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-paint-brush text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Cartoons
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedCartoons.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedCartoons.map((c) => (
                <MediaCard
                  key={c.system_id}
                  type="cartoon"
                  data={c}
                  onUpdated={handleCartoonUpdated}
                />
              ))}
            </div>
          </div>
        )}

        {/* Manga */}
        {showManga && matchedMangas.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Manga
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedMangas.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedMangas.map((m) => (
                <MediaCard
                  key={m.system_id}
                  type="manga"
                  data={m}
                  isAdmin={isAdmin}
                  onUpdated={handleMangaUpdated}
                />
              ))}
            </div>
          </div>
        )}

        {/* Novel */}
        {showNovel && matchedNovels.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200 sticky z-20 bg-gray-50"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book-open text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                  Novel
                </h2>
              </div>
              <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                {matchedNovels.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedNovels.map((n) => (
                <MediaCard
                  key={n.system_id}
                  type="novel"
                  data={n}
                  onUpdated={handleNovelUpdated}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
