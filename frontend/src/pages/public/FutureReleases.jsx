// Frontend: page component file for FutureReleases.
import { useState, useCallback, useMemo } from "react";
import { releaseYear } from "../../lib/releaseDate";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import MediaCard from "../../components/cards/MediaCard";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useMediaList } from "../../hooks/useMediaList";

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
  const year = releaseYear(anime.release_date) || null;
  const season = anime.release_season;
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

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function FutureReleases() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");

  const [mainTab, setMainTab] = useState("anime");

  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seasonQuery = useApiQuery(
    ["api", "system", "current-season-config"],
    "/api/system/config/current_season",
  );
  const animeMovieQuery = useMediaList("anime-movie", {
    params: { limit: 2000 },
    enabled: mainTab === "anime-movie",
  });
  const liveMovieQuery = useMediaList("movie", {
    enabled: mainTab === "movie",
    params: { limit: 2000, airing_status: "Not Yet Aired" },
  });
  const tvShowQuery = useMediaList("tv-show", {
    params: { limit: 2000 },
    enabled: mainTab === "tv-show",
  });
  const cartoonQuery = useMediaList("cartoon", {
    params: { limit: 2000 },
    enabled: mainTab === "cartoon",
  });

  const franchiseDict = useMemo(
    () =>
      Object.fromEntries(
        (franchiseQuery.data || []).map((franchise) => [
          franchise.system_id,
          franchise,
        ]),
      ),
    [franchiseQuery.data],
  );
  const currentSeasonKey = seasonRawToKey(seasonQuery.data?.current_season || "");
  const allAnime = useMemo(
    () =>
      (animeQuery.data || []).filter((anime) => {
        if (anime.airing_status !== "Not Yet Aired") return false;
        if (currentSeasonKey) {
          const key = getGroupKey(anime);
          if (key.startsWith("S_") && key < currentSeasonKey) return false;
        }
        return true;
      }),
    [animeQuery.data, currentSeasonKey],
  );
  const allAnimeMovies = useMemo(
    () =>
      (animeMovieQuery.data || []).filter(
        (movie) => movie.airing_status === "Not Yet Aired",
      ),
    [animeMovieQuery.data],
  );
  const allLiveMovies = useMemo(
    () =>
      (liveMovieQuery.data || []).filter(
        (movie) => movie.release_date_usa || movie.release_date_tw,
      ),
    [liveMovieQuery.data],
  );
  const allTvShows = useMemo(
    () =>
      (tvShowQuery.data || []).filter(
        (show) =>
          show.airing_status === "Not Yet Aired" ||
          show.airing_status === "Airing",
      ),
    [tvShowQuery.data],
  );
  const allCartoons = useMemo(
    () =>
      (cartoonQuery.data || []).filter(
        (cartoon) => cartoon.airing_status === "Not Yet Aired",
      ),
    [cartoonQuery.data],
  );
  const loading =
    animeQuery.isLoading || franchiseQuery.isLoading || seasonQuery.isLoading;
  const error =
    animeQuery.error?.message ||
    franchiseQuery.error?.message ||
    seasonQuery.error?.message ||
    null;
  const movieLoading = animeMovieQuery.isLoading;
  const movieError = animeMovieQuery.error?.message || null;
  const liveMovieLoading = liveMovieQuery.isLoading;
  const liveMovieError = liveMovieQuery.error?.message || null;
  const tvShowLoading = tvShowQuery.isLoading;
  const tvShowError = tvShowQuery.error?.message || null;
  const cartoonLoading = cartoonQuery.isLoading;
  const cartoonError = cartoonQuery.error?.message || null;

  const handleUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "anime"] }, (old) =>
      Array.isArray(old)
        ? old.map((anime) =>
            anime.system_id === updated.system_id ? updated : anime,
          )
        : old,
    );
  }, [queryClient]);

  const handleMovieUpdated = useCallback((updated) => {
    queryClient.setQueriesData(
      { queryKey: ["media-list", "anime-movie"] },
      (old) =>
        Array.isArray(old)
          ? old.map((movie) =>
              movie.system_id === updated.system_id ? updated : movie,
            )
          : old,
    );
  }, [queryClient]);

  const handleLiveMovieUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "movie"] }, (old) =>
      Array.isArray(old)
        ? old.map((movie) =>
            movie.system_id === updated.system_id ? updated : movie,
          )
        : old,
    );
  }, [queryClient]);

  const handleTvShowUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "tv-show"] }, (old) =>
      Array.isArray(old)
        ? old.map((show) =>
            show.system_id === updated.system_id ? updated : show,
          )
        : old,
    );
  }, [queryClient]);

  const handleCartoonUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "cartoon"] }, (old) =>
      Array.isArray(old)
        ? old.map((cartoon) =>
            cartoon.system_id === updated.system_id ? updated : cartoon,
          )
        : old,
    );
  }, [queryClient]);

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
                        <MediaCard
                          key={anime.system_id}
                          type="anime"
                          variant="future"
                          data={anime}
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
                        <MediaCard
                          key={movie.system_id}
                          type="anime-movie"
                          variant="future"
                          data={movie}
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
                      <MediaCard
                        key={movie.system_id}
                        type="movie"
                        variant="future"
                        data={movie}
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
                      <MediaCard
                        key={cartoon.system_id}
                        type="cartoon"
                        variant="future"
                        data={cartoon}
                        franchiseDict={franchiseDict}
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
                  <MediaCard
                    key={show.system_id}
                    type="tv-show"
                    variant="future"
                    data={show}
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

