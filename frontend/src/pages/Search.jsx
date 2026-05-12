import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AnimeCard from "../components/AnimeCard";
import AnimeMovieCard from "../components/AnimeMovieCard";
import MovieCard from "../components/MovieCard";
import TVCard from "../components/TVCard";
import CartoonCard from "../components/CartoonCard";
import MangaCard from "../components/MangaCard";
import NovelCard from "../components/NovelCard";
import { cleanString } from "../utils/anime";

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    async function doSearch() {
      try {
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

        const fetches = await Promise.all([
          needsFranchise
            ? fetch("/api/franchise/", { credentials: "include" })
            : null,
          needsAnime ? fetch("/api/anime/", { credentials: "include" }) : null,
          needsSeries
            ? fetch("/api/series/", { credentials: "include" })
            : null,
          needsSeasonal
            ? fetch("/api/seasonal/", { credentials: "include" })
            : null,
          needsAnimeMovie
            ? fetch("/api/anime-movie/", { credentials: "include" })
            : null,
          needsMovie ? fetch("/api/movies/", { credentials: "include" }) : null,
          needsTvShow
            ? fetch("/api/tv-shows/", { credentials: "include" })
            : null,
          needsCartoon
            ? fetch("/api/cartoon/", { credentials: "include" })
            : null,
          needsManga ? fetch("/api/manga/", { credentials: "include" }) : null,
          needsNovel ? fetch("/api/novel/", { credentials: "include" }) : null,
        ]);
        const [fRes, aRes, sRes, seaRes, amRes, mvRes, tvRes, cRes, mgRes, nvRes] =
          fetches;
        if (
          (fRes && !fRes.ok) ||
          (aRes && !aRes.ok) ||
          (sRes && !sRes.ok) ||
          (seaRes && !seaRes.ok) ||
          (amRes && !amRes.ok) ||
          (mvRes && !mvRes.ok) ||
          (tvRes && !tvRes.ok) ||
          (cRes && !cRes.ok) ||
          (mgRes && !mgRes.ok) ||
          (nvRes && !nvRes.ok)
        )
          throw new Error("Failed to fetch database");

        const allFranchises = fRes ? await fRes.json() : [];
        const all = aRes ? await aRes.json() : [];
        const allSeries = sRes ? await sRes.json() : [];
        const allSeasonal = seaRes ? await seaRes.json() : [];
        const animeMovieResults = amRes ? await amRes.json() : [];
        const movieResults = mvRes ? await mvRes.json() : [];
        const tvShowResults = tvRes ? await tvRes.json() : [];
        const cartoonResults = cRes ? await cRes.json() : [];
        const mangaResults = mgRes ? await mgRes.json() : [];
        const novelResults = nvRes ? await nvRes.json() : [];
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
            (a.franchise_name_cn || "").localeCompare(
              b.franchise_name_cn || "",
            ),
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
        const pillFIdSet = new Set(
          ma.map((a) => a.franchise_id).filter(Boolean),
        );
        const pillFranchises = allFranchises
          .filter((f) => pillFIdSet.has(f.system_id))
          .sort((a, b) =>
            (a.franchise_name_cn || "").localeCompare(
              b.franchise_name_cn || "",
            ),
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
          .sort((a, b) =>
            (a.tv_name_cn || "").localeCompare(b.tv_name_cn || ""),
          );

        // Cartoons
        const mc = cartoonResults
          .filter((c) =>
            [c.cartoon_name_cn, c.cartoon_name_en, c.cartoon_name_alt].some(
              (n) => cleanString(n).includes(qClean),
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
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    doSearch();
  }, [query, scope]);

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

  const SCOPE_LABELS = {
    all: "All",
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
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Searching...</p>
        </div>
      </div>
    );
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
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Search Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
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
          {showSeasonal && matchedSeasonal.length > 0 && (
            <>
              <span className="font-bold">{matchedSeasonal.length}</span>{" "}
              seasonal ·{" "}
            </>
          )}
          {showFranchise && (
            <>
              <span className="font-bold">{matchedFranchises.length}</span>{" "}
              franchises ·{" "}
            </>
          )}
          {showSeries && displaySeries.length > 0 && (
            <>
              <span className="font-bold">{displaySeries.length}</span> series
              ·{" "}
            </>
          )}
          {showAnime && (
            <>
              <span className="font-bold">{matchedAnime.length}</span> anime
              {showAnimeMovie && matchedAnimeMovies.length > 0 && " · "}
            </>
          )}
          {showAnimeMovie && matchedAnimeMovies.length > 0 && (
            <>
              <span className="font-bold">{matchedAnimeMovies.length}</span>{" "}
              anime movies
              {showMovie && matchedMovies.length > 0 && " · "}
            </>
          )}
          {showMovie && matchedMovies.length > 0 && (
            <>
              <span className="font-bold">{matchedMovies.length}</span> movies
              {showTvShow && matchedTvShows.length > 0 && " · "}
            </>
          )}
          {showTvShow && matchedTvShows.length > 0 && (
            <>
              <span className="font-bold">{matchedTvShows.length}</span> TV
              shows
              {showCartoon && matchedCartoons.length > 0 && " · "}
            </>
          )}
          {showCartoon && matchedCartoons.length > 0 && (
            <>
              <span className="font-bold">{matchedCartoons.length}</span>{" "}
              cartoons
              {showManga && matchedMangas.length > 0 && " · "}
            </>
          )}
          {showManga && matchedMangas.length > 0 && (
            <>
              <span className="font-bold">{matchedMangas.length}</span> manga
              {showNovel && matchedNovels.length > 0 && " · "}
            </>
          )}
          {showNovel && matchedNovels.length > 0 && (
            <>
              <span className="font-bold">{matchedNovels.length}</span> novel
            </>
          )}
        </p>
      </div>

      <div className="space-y-8">
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
                    onClick={() =>
                      s.franchise_id && navigate(`/franchise/${s.franchise_id}`)
                    }
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
        {showAnime && (
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

            {displayAnime.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <i className="fas fa-ghost text-3xl mb-3"></i>
                <p className="font-medium">
                  No anime found
                  {scope === "anime"
                    ? ` for "${query}"`
                    : " matching the current filter"}
                  .
                </p>
              </div>
            ) : (
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
                          <AnimeCard
                            key={a.system_id}
                            anime={a}
                            onUpdated={handleAnimeUpdated}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            )}
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
                <AnimeMovieCard
                  key={m.system_id}
                  movie={m}
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
                <MovieCard
                  key={m.system_id}
                  movie={m}
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
                <TVCard
                  key={t.system_id}
                  show={t}
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
                <CartoonCard
                  key={c.system_id}
                  cartoon={c}
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
                <MangaCard
                  key={m.system_id}
                  manga={m}
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
                <NovelCard
                  key={n.system_id}
                  novel={n}
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
