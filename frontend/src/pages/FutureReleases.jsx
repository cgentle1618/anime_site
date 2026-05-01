import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import AnimeCardFuture from "../components/AnimeCardFuture";
import AnimeMovieCardFuture from "../components/AnimeMovieCardFuture";
import MovieCardFuture from "../components/MovieCardFuture";
import TVCardFuture from "../components/TVCardFuture";
import CartoonCardFuture from "../components/CartoonCardFuture";

const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 };
const SEASON_LABEL = {
  WIN: "Winter",
  SPR: "Spring",
  SUM: "Summer",
  FAL: "Fall",
};
const WATCHING_PRIORITY = {
  "Watch When Airs": 0,
  "Plan to Watch": 1,
  "Might Watch": 2,
};
const EXPECTATION_PRIORITY = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function getGroupKey(anime) {
  const { release_year: year, release_season: season } = anime;
  if (year && season && SEASON_ORDER[season] !== undefined)
    return `S_${year}_${SEASON_ORDER[season]}`;
  if (year) return `Y_${year}`;
  return "Z_TBD";
}

function getGroupLabel(key) {
  if (key === "Z_TBD") return "TBD";
  if (key.startsWith("Y_")) return key.slice(2);
  const parts = key.split("_");
  const seasonCode = Object.keys(SEASON_ORDER).find(
    (k) => SEASON_ORDER[k] === Number(parts[2]),
  );
  return `${SEASON_LABEL[seasonCode] || "?"} ${parts[1]}`;
}

function seasonRawToKey(raw) {
  if (!raw || raw === "Not Set") return null;
  const parts = raw.trim().split(" ");
  if (parts.length !== 2) return null;
  const [code, year] = parts;
  const idx = SEASON_ORDER[code];
  if (idx === undefined) return null;
  return `S_${year}_${idx}`;
}

function getNextSeasonKey(currentKey) {
  if (!currentKey || !currentKey.startsWith("S_")) return null;
  const parts = currentKey.split("_");
  const year = Number(parts[1]);
  const idx = Number(parts[2]);
  return idx < 3 ? `S_${year}_${idx + 1}` : `S_${year + 1}_0`;
}

function sortGroup(entries, franchiseDict) {
  return [...entries].sort((a, b) => {
    const wa = WATCHING_PRIORITY[a.watching_status] ?? 9;
    const wb = WATCHING_PRIORITY[b.watching_status] ?? 9;
    if (wa !== wb) return wa - wb;
    const fa = franchiseDict[a.franchise_id];
    const fb = franchiseDict[b.franchise_id];
    const ea = EXPECTATION_PRIORITY[fa?.franchise_expectation] ?? 9;
    const eb = EXPECTATION_PRIORITY[fb?.franchise_expectation] ?? 9;
    return ea - eb;
  });
}

function getMovieReleaseYear(movie) {
  const d = movie.release_date_jp || movie.release_date_tw;
  if (!d) return "TBD";
  const year = String(d).substring(0, 4);
  return /^\d{4}$/.test(year) ? year : "TBD";
}

const SPECIFIC_TYPES = ["TV", "ONA", "Movie"];

export default function FutureReleases() {
  const { isAdmin } = useAuth();
  const [allAnime, setAllAnime] = useState([]);
  const [franchiseDict, setFranchiseDict] = useState({});
  const [currentSeasonKey, setCurrentSeasonKey] = useState(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mainTab, setMainTab] = useState("anime");

  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [movieLoading, setMovieLoading] = useState(false);
  const [movieLoaded, setMovieLoaded] = useState(false);
  const [movieError, setMovieError] = useState(null);

  const [allLiveMovies, setAllLiveMovies] = useState([]);
  const [liveMovieLoading, setLiveMovieLoading] = useState(false);
  const [liveMovieLoaded, setLiveMovieLoaded] = useState(false);
  const [liveMovieError, setLiveMovieError] = useState(null);

  const [allTvShows, setAllTvShows] = useState([]);
  const [tvShowLoading, setTvShowLoading] = useState(false);
  const [tvShowLoaded, setTvShowLoaded] = useState(false);
  const [tvShowError, setTvShowError] = useState(null);

  const [allCartoons, setAllCartoons] = useState([]);
  const [cartoonLoading, setCartoonLoading] = useState(false);
  const [cartoonLoaded, setCartoonLoaded] = useState(false);
  const [cartoonError, setCartoonError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [animeRes, franchiseRes, seasonRes] = await Promise.all([
          fetch("/api/anime/", { credentials: "include" }),
          fetch("/api/franchise/", { credentials: "include" }),
          fetch("/api/system/config/current_season", {
            credentials: "include",
          }),
        ]);
        if (!animeRes.ok || !franchiseRes.ok) throw new Error("API error");
        const [animeData, franchiseData, seasonData] = await Promise.all([
          animeRes.json(),
          franchiseRes.json(),
          seasonRes.ok ? seasonRes.json() : Promise.resolve({}),
        ]);

        const fDict = Object.fromEntries(
          franchiseData.map((f) => [f.system_id, f]),
        );
        setFranchiseDict(fDict);

        const csKey = seasonRawToKey(seasonData.current_season || "");
        setCurrentSeasonKey(csKey);

        const filtered = animeData.filter((a) => {
          if (a.airing_status !== "Not Yet Aired") return false;
          if (csKey) {
            const key = getGroupKey(a);
            if (key.startsWith("S_") && key < csKey) return false;
          }
          return true;
        });
        setAllAnime(filtered);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (mainTab === "anime-movie" && !movieLoaded) {
      setMovieLoading(true);
      setMovieError(null);
      fetch("/api/anime-movie/", { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("API error");
          return r.json();
        })
        .then((data) => {
          setAllAnimeMovies(
            data.filter((m) => m.airing_status === "Not Yet Aired"),
          );
          setMovieLoaded(true);
        })
        .catch((e) => setMovieError(e.message))
        .finally(() => setMovieLoading(false));
    }
  }, [mainTab, movieLoaded]);

  useEffect(() => {
    if (mainTab === "movie" && !liveMovieLoaded) {
      setLiveMovieLoading(true);
      setLiveMovieError(null);
      fetch("/api/movies/?airing_status=Not+Yet+Aired", {
        credentials: "include",
      })
        .then((r) => {
          if (!r.ok) throw new Error("API error");
          return r.json();
        })
        .then((data) => {
          setAllLiveMovies(
            data.filter((m) => m.release_date_usa || m.release_date_tw),
          );
          setLiveMovieLoaded(true);
        })
        .catch((e) => setLiveMovieError(e.message))
        .finally(() => setLiveMovieLoading(false));
    }
  }, [mainTab, liveMovieLoaded]);

  useEffect(() => {
    if (mainTab === "tv-show" && !tvShowLoaded) {
      setTvShowLoading(true);
      setTvShowError(null);
      fetch("/api/tv-shows/", { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("API error");
          return r.json();
        })
        .then((data) => {
          setAllTvShows(
            data.filter(
              (t) =>
                t.airing_status === "Not Yet Aired" ||
                t.airing_status === "Airing",
            ),
          );
          setTvShowLoaded(true);
        })
        .catch((e) => setTvShowError(e.message))
        .finally(() => setTvShowLoading(false));
    }
  }, [mainTab, tvShowLoaded]);

  useEffect(() => {
    if (mainTab === "cartoon" && !cartoonLoaded) {
      setCartoonLoading(true);
      setCartoonError(null);
      fetch("/api/cartoon/", { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("API error");
          return r.json();
        })
        .then((data) => {
          setAllCartoons(
            data.filter((c) => c.airing_status === "Not Yet Aired"),
          );
          setCartoonLoaded(true);
        })
        .catch((e) => setCartoonError(e.message))
        .finally(() => setCartoonLoading(false));
    }
  }, [mainTab, cartoonLoaded]);

  const handleUpdated = useCallback((updated) => {
    setAllAnime((prev) => {
      const idx = prev.findIndex((a) => a.system_id === updated.system_id);
      if (idx < 0) return prev;
      if (updated.airing_status === "Airing") {
        return prev.filter((a) => a.system_id !== updated.system_id);
      }
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const handleMovieUpdated = useCallback((updated) => {
    setAllAnimeMovies((prev) => {
      if (updated.airing_status === "Airing") {
        return prev.filter((m) => m.system_id !== updated.system_id);
      }
      return prev.map((m) => (m.system_id === updated.system_id ? updated : m));
    });
  }, []);

  const handleLiveMovieUpdated = useCallback((updated) => {
    setAllLiveMovies((prev) => {
      if (updated.airing_status === "Airing") {
        return prev.filter((m) => m.system_id !== updated.system_id);
      }
      return prev.map((m) => (m.system_id === updated.system_id ? updated : m));
    });
  }, []);

  const handleTvShowUpdated = useCallback((updated) => {
    setAllTvShows((prev) => {
      if (
        updated.airing_status !== "Not Yet Aired" &&
        updated.airing_status !== "Airing"
      ) {
        return prev.filter((t) => t.system_id !== updated.system_id);
      }
      return prev.map((t) => (t.system_id === updated.system_id ? updated : t));
    });
  }, []);

  const handleCartoonUpdated = useCallback((updated) => {
    setAllCartoons((prev) => {
      if (updated.airing_status !== "Not Yet Aired") {
        return prev.filter((c) => c.system_id !== updated.system_id);
      }
      return prev.map((c) => (c.system_id === updated.system_id ? updated : c));
    });
  }, []);

  const filtered = allAnime.filter((a) => {
    const t = a.airing_type || "";
    if (activeTypeFilter === "all") return true;
    if (activeTypeFilter === "other") return !SPECIFIC_TYPES.includes(t);
    return t === activeTypeFilter;
  });

  const groups = {};
  for (const anime of filtered) {
    const key = getGroupKey(anime);
    if (!groups[key]) groups[key] = [];
    groups[key].push(anime);
  }
  const sortedKeys = Object.keys(groups).sort();
  const nextSeasonKey = getNextSeasonKey(currentSeasonKey);

  const movieGroups = {};
  for (const movie of allAnimeMovies) {
    const year = getMovieReleaseYear(movie);
    if (!movieGroups[year]) movieGroups[year] = [];
    movieGroups[year].push(movie);
  }
  const movieYears = Object.keys(movieGroups).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });

  function getLiveMovieYear(m) {
    const d = m.release_date_usa || m.release_date_tw || "";
    if (!d) return "TBD";
    const parts = String(d).trim().split(/[\s-]/);
    const year = parts[parts.length - 1];
    return /^\d{4}$/.test(year) ? year : "TBD";
  }
  const liveMovieGroups = {};
  for (const movie of allLiveMovies) {
    const year = getLiveMovieYear(movie);
    if (!liveMovieGroups[year]) liveMovieGroups[year] = [];
    liveMovieGroups[year].push(movie);
  }
  const liveMovieYears = Object.keys(liveMovieGroups).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });

  function getCartoonReleaseYear(cartoon) {
    const d = cartoon.release_date;
    if (!d) return "TBD";
    const year = String(d).substring(0, 4);
    return /^\d{4}$/.test(year) ? year : "TBD";
  }
  const cartoonGroups = {};
  for (const cartoon of allCartoons) {
    const year = getCartoonReleaseYear(cartoon);
    if (!cartoonGroups[year]) cartoonGroups[year] = [];
    cartoonGroups[year].push(cartoon);
  }
  const cartoonYears = Object.keys(cartoonGroups).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });

  const typeFilters = [
    { key: "all", label: "All" },
    { key: "TV", label: "TV" },
    { key: "ONA", label: "ONA" },
    { key: "Movie", label: "Movie" },
    { key: "other", label: "Other" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">
            Loading future releases...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Failed to load releases</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <i className="fas fa-calendar-plus text-brand"></i>
          Future Releases
        </h1>
        <p className="text-gray-500 mt-1 text-sm font-medium">
          Upcoming titles yet to release
        </p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {[
          { key: "anime", icon: "fa-tv", label: "Anime" },
          { key: "anime-movie", icon: "fa-film", label: "Anime Movies" },
          { key: "movie", icon: "fa-ticket-alt", label: "Movies" },
          { key: "tv-show", icon: "fa-video", label: "TV Shows" },
          { key: "cartoon", icon: "fa-paint-brush", label: "Cartoons" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-black whitespace-nowrap transition-all ${mainTab === t.key ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ANIME TAB ── */}
      {mainTab === "anime" && (
        <>
          {/* Type filter chips */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {typeFilters.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTypeFilter(key)}
                className={`px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${
                  activeTypeFilter === key
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sortedKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 font-medium">
                No upcoming releases found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {sortedKeys.map((key) => {
                const label = getGroupLabel(key);
                const sorted = sortGroup(groups[key], franchiseDict);
                let badge = null;
                if (key === currentSeasonKey) {
                  badge = (
                    <span className="text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                      Current
                    </span>
                  );
                } else if (key === nextSeasonKey) {
                  badge = (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Next
                    </span>
                  );
                }

                return (
                  <section key={key}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-base font-black text-gray-800">
                        {label}
                      </h2>
                      {badge}
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {sorted.length}
                      </span>
                      <div className="flex-1 border-t border-gray-100"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sorted.map((anime) => (
                        <AnimeCardFuture
                          key={anime.system_id}
                          anime={anime}
                          franchiseDict={franchiseDict}
                          isAdmin={isAdmin}
                          onUpdated={handleUpdated}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── ANIME MOVIES TAB ── */}
      {mainTab === "anime-movie" && (
        <>
          {movieLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-gray-500 font-medium">
                  Loading anime movies...
                </p>
              </div>
            </div>
          ) : movieError ? (
            <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
              <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
              <p className="font-bold">Failed to load anime movies</p>
              <p className="text-sm mt-1">{movieError}</p>
            </div>
          ) : movieYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 font-medium">
                No upcoming anime movies found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {movieYears.map((year) => {
                const sorted = sortGroup(movieGroups[year], franchiseDict);
                return (
                  <section key={year}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-base font-black text-gray-800">
                        {year}
                      </h2>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {sorted.length}
                      </span>
                      <div className="flex-1 border-t border-gray-100"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sorted.map((movie) => (
                        <AnimeMovieCardFuture
                          key={movie.system_id}
                          movie={movie}
                          isAdmin={isAdmin}
                          onUpdated={handleMovieUpdated}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {/* ── MOVIE TAB ── */}
      {mainTab === "movie" && (
        <>
          {liveMovieLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-gray-500 font-medium">Loading movies...</p>
              </div>
            </div>
          ) : liveMovieError ? (
            <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
              <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
              <p className="font-bold">Failed to load movies</p>
              <p className="text-sm mt-1">{liveMovieError}</p>
            </div>
          ) : liveMovieYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 font-medium">
                No upcoming movies found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {liveMovieYears.map((year) => (
                <section key={year}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-base font-black text-gray-800">
                      {year}
                    </h2>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {liveMovieGroups[year].length}
                    </span>
                    <div className="flex-1 border-t border-gray-100"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {liveMovieGroups[year].map((movie) => (
                      <MovieCardFuture
                        key={movie.system_id}
                        movie={movie}
                        isAdmin={isAdmin}
                        onUpdated={handleLiveMovieUpdated}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── CARTOON TAB ── */}
      {mainTab === "cartoon" && (
        <>
          {cartoonLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-gray-500 font-medium">Loading cartoons...</p>
              </div>
            </div>
          ) : cartoonError ? (
            <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
              <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
              <p className="font-bold">Failed to load cartoons</p>
              <p className="text-sm mt-1">{cartoonError}</p>
            </div>
          ) : cartoonYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 font-medium">
                No upcoming cartoons found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {cartoonYears.map((year) => (
                <section key={year}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-base font-black text-gray-800">
                      {year}
                    </h2>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {cartoonGroups[year].length}
                    </span>
                    <div className="flex-1 border-t border-gray-100"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {cartoonGroups[year].map((cartoon) => (
                      <CartoonCardFuture
                        key={cartoon.system_id}
                        cartoon={cartoon}
                        isAdmin={isAdmin}
                        onUpdated={handleCartoonUpdated}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TV SHOW TAB ── */}
      {mainTab === "tv-show" && (
        <>
          {tvShowLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-gray-500 font-medium">Loading TV shows...</p>
              </div>
            </div>
          ) : tvShowError ? (
            <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
              <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
              <p className="font-bold">Failed to load TV shows</p>
              <p className="text-sm mt-1">{tvShowError}</p>
            </div>
          ) : allTvShows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 font-medium">
                No upcoming TV shows found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {allTvShows
                .sort((a, b) => {
                  if (!a.release_date && !b.release_date) return 0;
                  if (!a.release_date) return 1;
                  if (!b.release_date) return -1;
                  return a.release_date.localeCompare(b.release_date);
                })
                .map((show) => (
                  <TVCardFuture
                    key={show.system_id}
                    show={show}
                    isAdmin={isAdmin}
                    onUpdated={handleTvShowUpdated}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
