// Frontend: page component file for Search.
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import MediaCard from "../../components/cards/MediaCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useApiQuery } from "../../hooks/useApiQuery";
import CollapsibleCardGrid from "../../components/layout/CollapsibleCardGrid";
import CollapsiblePillRow from "../../components/layout/CollapsiblePillRow";

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

/**
 * The plain text card the collection, franchise, and series sections share.
 * Entry types get MediaCard instead; these tiers have no cover of their own.
 */
function TierCard({ icon, label, labelClass, titles, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-xl border border-border p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
    >
      <div>
        <div
          className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${labelClass}`}
        >
          <i className={`fas ${icon} mr-1`}></i>
          {label}
        </div>
        <h3
          className="font-black text-text text-base leading-tight mb-1 line-clamp-2"
          title={titles.main}
        >
          {titles.main}
        </h3>
        {titles.sub && (
          <h4
            className="text-xs font-medium text-text-faint truncate"
            title={titles.sub}
          >
            {titles.sub}
          </h4>
        )}
      </div>
    </div>
  );
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const scope = searchParams.get("scope") || "all";
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const hasQuery = !!query.trim();

  // One request. The backend runs the search - normalising case, whitespace and
  // punctuation in SQL the way cleanString used to in the browser - and returns
  // one bucket per type. This page used to pull up to 2000 rows from each of
  // twelve tables and filter them here, which meant the whole collection
  // crossed the wire to answer a question about a handful of rows.
  const searchQuery = useApiQuery(["api", "search"], "/api/search/", {
    params: { q: query, scope },
    enabled: hasQuery,
  });
  const loading = hasQuery && searchQuery.isLoading;
  const error = searchQuery.error?.message || null;

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
  const [matchedComics, setMatchedComics] = useState([]);
  const [matchedSeasonal, setMatchedSeasonal] = useState([]);
  const [matchedCollections, setMatchedCollections] = useState([]);
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

  // The buckets are held in state, not read straight from the response, because
  // the inline card editors hand back an updated row and expect it to replace
  // the one on screen without a refetch.
  useEffect(() => {
    setSelectedFranchise("all");
    const results = searchQuery.data?.results;
    if (!hasQuery || !results) {
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
      setMatchedComics([]);
      return;
    }
    setMatchedCollections(results.collection);
    setMatchedSeasonal(results.seasonal);
    setMatchedFranchises(results.franchise);
    setMatchedSeries(results.series);
    setMatchedAnime(results.anime);
    setMatchedAnimeMovies(results["anime-movie"]);
    setMatchedMovies(results.movie);
    setMatchedTvShows(results["tv-show"]);
    setMatchedCartoons(results.cartoon);
    setMatchedMangas(results.manga);
    setMatchedNovels(results.novel);
    setMatchedComics(results.comic);
    // Pills are the franchises the anime results belong to, which is not the
    // same set as the franchises whose own name matched.
    setFilterPillFranchises(searchQuery.data.related_franchises);
  }, [searchQuery.data, hasQuery]);

  const handleAnimeUpdated = useCallback((updated) => {
    setMatchedAnime((prev) =>
      prev.map((a) => (a.system_id === updated.system_id ? updated : a)),
    );
  }, []);

  const handleMovieUpdated = useCallback((updated) => {
    setMatchedAnimeMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleLiveMovieUpdated = useCallback((updated) => {
    setMatchedMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleTvShowUpdated = useCallback((updated) => {
    setMatchedTvShows((prev) =>
      prev.map((t) => (t.system_id === updated.system_id ? updated : t)),
    );
  }, []);

  const handleCartoonUpdated = useCallback((updated) => {
    setMatchedCartoons((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
    );
  }, []);

  const handleMangaUpdated = useCallback((updated) => {
    setMatchedMangas((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  const handleNovelUpdated = useCallback((updated) => {
    setMatchedNovels((prev) =>
      prev.map((n) => (n.system_id === updated.system_id ? updated : n)),
    );
  }, []);

  const handleComicUpdated = useCallback((updated) => {
    setMatchedComics((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
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
  const showComic = scope === "all" || scope === "comic";
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
    showComic && ["comics", matchedComics.length],
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
    comic: "Comic",
    seasonal: "Seasonal",
  };

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Searching..." />;
  }

  if (!query.trim()) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <i className="fas fa-search text-4xl text-text-faint/60 mb-4"></i>
        <p className="text-text-faint font-bold">No Search Query</p>
        <p className="text-sm text-text-faint mt-1">
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
        className="sticky top-16 z-30 bg-canvas pb-4 mb-8 border-b border-border"
      >
        <h1 className="text-xl font-black text-text">
          Search Results for "<span className="text-brand">{query}</span>"
        </h1>
        <p className="text-sm text-text-faint mt-1">
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
          <div className="text-center py-16 text-text-faint">
            <i className="fas fa-ghost text-4xl mb-3"></i>
            <p className="font-bold text-text-faint">No results for "{query}"</p>
            <p className="text-sm mt-1">Try a different term or scope.</p>
          </div>
        )}

        {/* Collection cards */}
        {showCollection && matchedCollections.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-text-faint uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-boxes-stacked text-brand/70"></i> Collections
            </h2>
            <CollapsibleCardGrid
              items={matchedCollections}
              renderItem={(c) => (
                <TierCard
                  key={c.system_id}
                  icon="fa-boxes-stacked"
                  label="Collection"
                  labelClass="text-fuchsia-600"
                  titles={getCollectionTitles(c)}
                  onClick={() => navigate(`/collection/${c.system_id}`)}
                />
              )}
            />
          </div>
        )}

        {/* Seasonal entries */}
        {showSeasonal && matchedSeasonal.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-text-faint uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-calendar-alt text-brand/70"></i> Seasonal
            </h2>
            <div className="flex flex-wrap gap-2">
              {matchedSeasonal.map((s) => (
                <button
                  key={s.seasonal}
                  onClick={() =>
                    navigate(`/seasonal/${encodeURIComponent(s.seasonal)}`)
                  }
                  className="px-4 py-1.5 rounded-full border border-border bg-surface text-sm font-bold text-text-muted hover:bg-brand hover:text-white hover:border-brand transition-colors shadow-sm"
                >
                  {s.seasonal}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Franchise filter pills */}
        {showFranchisePills && (
          <CollapsiblePillRow>
            <button
              onClick={() => setSelectedFranchise("all")}
              className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === "all" ? "bg-brand text-white border-brand" : "bg-surface text-text-muted border-border hover:bg-surface-2"}`}
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
                  className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === f.system_id ? "bg-brand text-white border-brand" : "bg-surface text-text-muted border-border hover:bg-surface-2"}`}
                >
                  {titles.main}
                </button>
              );
            })}
          </CollapsiblePillRow>
        )}

        {/* Franchise cards */}
        {showFranchise && displayFranchises.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-text-faint uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-sitemap text-brand/70"></i> Franchises
            </h2>
            <CollapsibleCardGrid
              items={displayFranchises}
              renderItem={(f) => (
                <TierCard
                  key={f.system_id}
                  icon="fa-sitemap"
                  label={
                    f.franchise_type
                      ? `${f.franchise_type} Franchise`
                      : "Franchise"
                  }
                  labelClass="text-brand"
                  titles={getFranchiseTitles(f)}
                  onClick={() => navigate(`/franchise/${f.system_id}`)}
                />
              )}
            />
          </div>
        )}

        {/* Series cards */}
        {showSeries && displaySeries.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-text-faint uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-layer-group text-brand/70"></i> Series
            </h2>
            <CollapsibleCardGrid
              items={displaySeries}
              renderItem={(s) => (
                <TierCard
                  key={s.system_id}
                  icon="fa-layer-group"
                  label="Series"
                  labelClass="text-brand/70"
                  titles={getSeriesTitles(s)}
                  onClick={() => navigate(`/series/${s.system_id}`)}
                />
              )}
            />
          </div>
        )}

        {/* Anime */}
        {showAnime && displayAnime.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-tv text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Anime
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
                      <h3 className="text-sm font-black text-text-faint uppercase tracking-widest flex items-center gap-1.5">
                        <i className={`fas ${icon} text-brand/70`}></i>
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-text-faint bg-surface-2 px-2 py-0.5 rounded-full">
                        {items.length}
                      </span>
                      <div className="flex-1 border-t border-border"></div>
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-film text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Anime Movies
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-ticket-alt text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Movies
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-video text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  TV Shows
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-paint-brush text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Cartoons
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Manga
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book-open text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Novel
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
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

        {/* Comic */}
        {showComic && matchedComics.length > 0 && (
          <div>
            <div
              className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book-bookmark text-brand"></i>
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight leading-none">
                  Comic
                </h2>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
                {matchedComics.length} results
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {matchedComics.map((c) => (
                <MediaCard
                  key={c.system_id}
                  type="comic"
                  data={c}
                  onUpdated={handleComicUpdated}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
