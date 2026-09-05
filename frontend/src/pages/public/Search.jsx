// Frontend: page component file for Search.
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import MediaCard from "../../components/cards/MediaCard";
import { PersonCard, StudioCard } from "../../components/cards/StaffCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useApiQuery } from "../../hooks/useApiQuery";
import CollapsibleCardGrid from "../../components/layout/CollapsibleCardGrid";
import CollapsiblePillRow from "../../components/layout/CollapsiblePillRow";
import { Chip, Eyebrow } from "../../components/ui/primitives";

const GRID_CLS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

const PILL_ON = "bg-brand text-on-brand border-brand";
const PILL_OFF = "bg-surface text-text-muted border-border-strong hover:border-text";
const PILL_CLS = "shrink-0 px-3 py-1 border font-mono text-[11px] uppercase tracking-[0.12em] transition-colors";

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
function TierCard({ label, titles, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border p-4 cursor-pointer hover:border-text transition-colors flex flex-col justify-between"
    >
      <div>
        <Eyebrow className="mb-1.5">{label}</Eyebrow>
        <h3
          className="font-display text-lg font-semibold text-text leading-tight mb-1 line-clamp-2"
          title={titles.main}
        >
          {titles.main}
        </h3>
        {titles.sub && (
          <h4 className="text-xs text-text-faint truncate" title={titles.sub}>
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
  const [matchedPeople, setMatchedPeople] = useState([]);
  const [matchedStudios, setMatchedStudios] = useState([]);
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
      setMatchedPeople([]);
      setMatchedStudios([]);
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
    setMatchedPeople(results.person);
    setMatchedStudios(results.studio);
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
  const showPerson = scope === "all" || scope === "person";
  const showStudio = scope === "all" || scope === "studio";
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
    showPerson && ["people", matchedPeople.length],
    showStudio && ["studios", matchedStudios.length],
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
    person: "Person",
    studio: "Studio",
  };

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Searching..." />;
  }

  if (!query.trim()) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="max-w-md mx-auto border border-dashed border-border-strong px-6 py-8 text-center">
          <Eyebrow className="mb-1">Search</Eyebrow>
          <p className="text-sm text-text-muted">
            No search term yet. Enter one in the search bar at the top.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <MediaLoadingState error={error} errorTitle="Search error" />;
  }

  const sectionHeaderTop = `calc(var(--nav-h) + ${stickyBarHeight}px)`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Sticky header: title + count summary */}
      <div
        ref={stickyBarRef}
        className="sticky top-[var(--nav-h)] z-30 bg-canvas pb-4 mb-8 border-b border-border"
      >
        <Eyebrow className="mb-1">Search results</Eyebrow>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none">
          “{query}”
        </h1>
        <p className="font-mono text-xs text-text-muted mt-2 flex items-center flex-wrap gap-x-1">
          {scope !== "all" && (
            <Chip className="mr-2">{SCOPE_LABELS[scope]}</Chip>
          )}
          {summaryCounts.length === 0 ? (
            <span>No results</span>
          ) : (
            summaryCounts.map(([label, count], i) => (
              <span key={label}>
                {i > 0 && " · "}
                <span className="text-text">{count}</span> {label}
              </span>
            ))
          )}
        </p>
      </div>

      <div className="space-y-8">
        {summaryCounts.length === 0 && (
          <div className="border border-dashed border-border-strong px-4 py-10 text-center">
            <Eyebrow className="mb-1">No results</Eyebrow>
            <p className="text-sm text-text-muted">
              Nothing matches “{query}”. Try a different term or scope.
            </p>
          </div>
        )}

        {/* Collection cards */}
        {showCollection && matchedCollections.length > 0 && (
          <div>
            <Eyebrow as="h2" className="mb-3">Collections</Eyebrow>
            <CollapsibleCardGrid
              items={matchedCollections}
              renderItem={(c) => (
                <TierCard
                  key={c.system_id}
                  label="Collection"
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
            <Eyebrow as="h2" className="mb-3">Seasonal</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {matchedSeasonal.map((s) => (
                <button
                  key={s.seasonal}
                  onClick={() =>
                    navigate(`/seasonal/${encodeURIComponent(s.seasonal)}`)
                  }
                  className={`${PILL_CLS} ${PILL_OFF}`}
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
              className={`${PILL_CLS} ${selectedFranchise === "all" ? PILL_ON : PILL_OFF}`}
            >
              All results
            </button>
            {filterPillFranchises.map((f) => {
              const titles = getFranchiseTitles(f);
              return (
                <button
                  key={f.system_id}
                  onClick={() => setSelectedFranchise(f.system_id)}
                  title={titles.main}
                  className={`${PILL_CLS} ${selectedFranchise === f.system_id ? PILL_ON : PILL_OFF}`}
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
            <Eyebrow as="h2" className="mb-3">Franchises</Eyebrow>
            <CollapsibleCardGrid
              items={displayFranchises}
              renderItem={(f) => (
                <TierCard
                  key={f.system_id}
                  label={
                    f.franchise_type
                      ? `${f.franchise_type} Franchise`
                      : "Franchise"
                  }
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
            <Eyebrow as="h2" className="mb-3">Series</Eyebrow>
            <CollapsibleCardGrid
              items={displaySeries}
              renderItem={(s) => (
                <TierCard
                  key={s.system_id}
                  label="Series"
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Anime
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {displayAnime.length} results
              </span>
            </div>

            <div className="space-y-8">
              {[
                { label: "TV / ONA", items: tvOna },
                { label: "Movies", items: movies },
                { label: "Other", items: others },
              ].map(({ label, items }) =>
                items.length > 0 ? (
                  <div key={label}>
                    <div className="flex items-center gap-3 mb-4">
                      <Eyebrow as="h3">
                        {label} · {items.length}
                      </Eyebrow>
                      <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                    </div>
                    <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Anime movies
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedAnimeMovies.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Movies
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedMovies.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                TV shows
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedTvShows.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Cartoons
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedCartoons.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Manga
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedMangas.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Novel
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedNovels.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Comic
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedComics.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
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

        {/* People and studios, last: a search is usually about a title, so a
            name match on a credited person or studio is the weaker answer and
            sits below every media section. Characters are not searchable. */}
        {showPerson && matchedPeople.length > 0 && (
          <div>
            <div
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                People
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedPeople.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
              {matchedPeople.map((p) => (
                <PersonCard key={p.system_id} person={p} />
              ))}
            </div>
          </div>
        )}

        {showStudio && matchedStudios.length > 0 && (
          <div>
            <div
              className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
              style={{ top: sectionHeaderTop }}
            >
              <h2 className="font-display text-2xl font-semibold text-text leading-none">
                Studios
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {matchedStudios.length} results
              </span>
            </div>
            <div className={GRID_CLS}>
              {matchedStudios.map((st) => (
                <StudioCard key={st.system_id} studio={st} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
