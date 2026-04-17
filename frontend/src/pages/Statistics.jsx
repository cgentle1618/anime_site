import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../utils/anime";

const RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function getDisplayName(f) {
  return (
    f.franchise_name_cn ||
    f.franchise_name_en ||
    f.franchise_name_romanji ||
    f.franchise_name_jp ||
    f.franchise_name_alt ||
    "—"
  );
}

function getCoverForSlot(franchise, franchiseAnimeMap) {
  const animes = franchiseAnimeMap[String(franchise.system_id)] || [];
  if (franchise.cover_anime_id) {
    const chosen = animes.find((a) => a.system_id === franchise.cover_anime_id);
    if (chosen?.cover_image_file && chosen.cover_image_file !== "N/A") {
      return getCoverUrl(chosen.cover_image_file);
    }
  }
  const withCover = animes.filter(
    (a) => a.cover_image_file && a.cover_image_file !== "N/A",
  );
  if (withCover.length === 0) return FALLBACK_SVG;
  withCover.sort((a, b) => {
    const yr =
      (parseInt(b.release_year, 10) || 0) - (parseInt(a.release_year, 10) || 0);
    return yr !== 0 ? yr : (b.release_month || 0) - (a.release_month || 0);
  });
  return getCoverUrl(withCover[0].cover_image_file);
}

export default function Statistics() {
  const [franchises, setFranchises] = useState([]);
  const [allAnime, setAllAnime] = useState([]);
  const [franchiseAnimeMap, setFranchiseAnimeMap] = useState({});
  const [franchiseMap, setFranchiseMap] = useState({});
  const [completionsTab, setCompletionsTab] = useState("anime");
  const [groupPages, setGroupPages] = useState({
    TV: 0,
    Movie: 0,
    ONA: 0,
    Others: 0,
  });
  const [watchNextTab, setWatchNextTab] = useState("anime");
  const [rewatchTab, setRewatchTab] = useState("anime");
  const [seasonals, setSeasonals] = useState([]);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [seasonalPage, setSeasonalPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [fRes, aRes, sRes, csRes] = await Promise.all([
          fetch("/api/franchise/", { credentials: "include" }),
          fetch("/api/anime/", { credentials: "include" }),
          fetch("/api/seasonal/", { credentials: "include" }),
          fetch("/api/seasonal/current-season", { credentials: "include" }),
        ]);
        if (!fRes.ok || !aRes.ok || !sRes.ok || !csRes.ok)
          throw new Error("Failed to load data.");
        const [fData, aData, sData, csData] = await Promise.all([
          fRes.json(),
          aRes.json(),
          sRes.json(),
          csRes.json(),
        ]);
        setCurrentSeason(csData.current_season);
        setFranchises(fData);
        setAllAnime(aData);
        const fMap = {};
        fData.forEach((f) => {
          fMap[String(f.system_id)] = f;
        });
        setFranchiseMap(fMap);
        const map = {};
        aData.forEach((a) => {
          const id = String(a.franchise_id);
          if (!map[id]) map[id] = [];
          map[id].push(a);
        });
        setFranchiseAnimeMap(map);
        // Sort seasonals newest-first by year then season weight
        const SEASON_WEIGHT = { FAL: 4, SUM: 3, SPR: 2, WIN: 1 };
        const sorted = [...sData].sort((a, b) => {
          const [aSeason, aYear] = a.seasonal.split(" ");
          const [bSeason, bYear] = b.seasonal.split(" ");
          const yearDiff = parseInt(bYear, 10) - parseInt(aYear, 10);
          if (yearDiff !== 0) return yearDiff;
          return (SEASON_WEIGHT[bSeason] ?? 0) - (SEASON_WEIGHT[aSeason] ?? 0);
        });
        setSeasonals(sorted);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading statistics.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // Build slot map (slots 1–9)
  const slotMap = {};
  franchises.forEach((f) => {
    if (f.favorite_3x3_slot >= 1 && f.favorite_3x3_slot <= 9) {
      slotMap[f.favorite_3x3_slot] = f;
    }
  });

  // Rating distribution
  const ratingCounts = {};
  RATING_ORDER.forEach((r) => {
    ratingCounts[r] = 0;
  });
  ratingCounts["Unrated"] = 0;
  franchises.forEach((f) => {
    const r = f.my_rating;
    if (r && RATING_ORDER.includes(r)) {
      ratingCounts[r]++;
    } else {
      ratingCounts["Unrated"]++;
    }
  });
  const allRows = [...RATING_ORDER, "Unrated"];
  const maxCount = Math.max(...allRows.map((r) => ratingCounts[r]), 1);
  const totalFranchises = franchises.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-chart-bar text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Statistics
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            {totalFranchises} franchises tracked
          </p>
        </div>
      </div>

      {/* Block 1 — Favorite ACG Franchise 3×3 Grid */}
      <section>
        <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <i className="fas fa-th text-brand/70"></i>
            Favorite ACG Franchise
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((slot) => {
            const f = slotMap[slot];
            if (f) {
              const coverUrl = getCoverForSlot(f, franchiseAnimeMap);
              return (
                <Link
                  key={slot}
                  to={`/franchise/${f.system_id}`}
                  className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="aspect-[3/4] bg-gray-100">
                    <img
                      src={coverUrl}
                      alt={getDisplayName(f)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = FALLBACK_SVG;
                      }}
                    />
                  </div>
                  {/* Name + rating overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                    <p className="text-white text-xs font-bold leading-tight truncate">
                      {getDisplayName(f)}
                    </p>
                    {f.my_rating && (
                      <span className="text-yellow-300 text-[10px] font-black">
                        {f.my_rating}
                      </span>
                    )}
                  </div>
                  {/* Slot number badge */}
                  <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/50 rounded-md flex items-center justify-center">
                    <span className="text-white text-[10px] font-black">
                      {slot}
                    </span>
                  </div>
                </Link>
              );
            }
            // Empty slot
            return (
              <div
                key={slot}
                className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50/50"
              >
                <span className="text-2xl font-black text-gray-200">
                  {slot}
                </span>
                <span className="text-[10px] text-gray-300 font-medium mt-1">
                  Empty
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Block 2 — My Rating Distribution */}
      <section>
        <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <i className="fas fa-star text-brand/70"></i>
            My Rating Distribution
          </h2>
          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">
            ACG Franchise
          </span>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3 max-w-2xl">
          {allRows.map((rating) => {
            const count = ratingCounts[rating];
            const pct =
              totalFranchises > 0
                ? Math.round((count / totalFranchises) * 100)
                : 0;
            const barWidth = (count / maxCount) * 100;
            const isUnrated = rating === "Unrated";
            return (
              <div key={rating} className="flex items-center gap-3">
                <span
                  className={`w-10 text-right text-sm font-black shrink-0 ${
                    isUnrated ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  {rating}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-5 rounded-full transition-all duration-700 ${
                      isUnrated ? "bg-gray-300" : "bg-brand"
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-bold text-gray-700 shrink-0">
                  {count}
                </span>
                <span className="w-10 text-right text-xs text-gray-400 font-medium shrink-0">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Block 2.5 — Anime Seasonal Overview */}
      <section>
        <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <i className="fas fa-calendar-alt text-brand/70"></i>
            Anime Seasonal Overview
          </h2>
        </div>
        {seasonals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <i className="fas fa-calendar-times text-3xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 font-medium">No seasonal data available.</p>
          </div>
        ) : (() => {
          const PAGE_SIZE = 12;
          const totalPages = Math.ceil(seasonals.length / PAGE_SIZE);
          const pageItems = seasonals.slice(seasonalPage * PAGE_SIZE, (seasonalPage + 1) * PAGE_SIZE);
          return (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Season</th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Rating</th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                        <span className="text-green-600">Completed</span>
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                        <span className="text-blue-600">Watching</span>
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                        <span className="text-red-500">Dropped</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((s, idx) => {
                      const isCurrent = s.seasonal === currentSeason;
                      return (
                        <tr
                          key={s.seasonal}
                          className={`border-b transition-colors ${isCurrent ? "bg-brand/5 border-brand/20 hover:bg-brand/10" : `border-gray-50 hover:bg-gray-50 ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}`}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/seasonal/${encodeURIComponent(s.seasonal)}`}
                                className={`font-black tracking-wide hover:text-brand transition-colors ${isCurrent ? "text-brand" : "text-gray-900"}`}
                              >
                                {s.seasonal}
                              </Link>
                              {isCurrent && (
                                <span className="bg-brand text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
                                  Current
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {s.my_rating ? (
                              <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-md">
                                {s.my_rating}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs font-medium">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${s.entry_completed > 0 ? "text-green-600" : "text-gray-300"}`}>
                              {s.entry_completed}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${s.entry_watching > 0 ? "text-blue-600" : "text-gray-300"}`}>
                              {s.entry_watching}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${s.entry_dropped > 0 ? "text-red-500" : "text-gray-300"}`}>
                              {s.entry_dropped}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 px-1">
                  <button
                    onClick={() => setSeasonalPage((p) => p - 1)}
                    disabled={seasonalPage === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <i className="fas fa-chevron-left text-[10px]"></i>
                    Prev
                  </button>
                  <span className="text-xs text-gray-400 font-medium">
                    Page {seasonalPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setSeasonalPage((p) => p + 1)}
                    disabled={seasonalPage >= totalPages - 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    Next
                    <i className="fas fa-chevron-right text-[10px]"></i>
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* Block 3 — Watch Next */}
      {(() => {
        const EXPECTATION_WEIGHT = { High: 0, Medium: 1, Low: 2 };
        const WATCH_NEXT_GROUPS = [
          { key: "12ep", label: "12 EP" },
          { key: "24ep", label: "24 EP" },
          { key: "30ep_plus", label: "30+ EP" },
        ];
        const WATCH_NEXT_TABS = [
          { key: "anime", label: "Anime", icon: "fa-tv", dev: false },
          {
            key: "anime-movie",
            label: "Anime Movie",
            icon: "fa-film",
            dev: true,
          },
          { key: "movie", label: "Movie", icon: "fa-ticket-alt", dev: true },
          {
            key: "tv-show",
            label: "TV Show",
            icon: "fa-broadcast-tower",
            dev: true,
          },
          {
            key: "cartoon",
            label: "Cartoon",
            icon: "fa-laugh-squint",
            dev: true,
          },
          { key: "manga", label: "Manga", icon: "fa-book", dev: true },
          { key: "novel", label: "Novel", icon: "fa-book-open", dev: true },
        ];

        const grouped = {};
        WATCH_NEXT_GROUPS.forEach(({ key }) => {
          grouped[key] = [];
        });
        franchises.forEach((f) => {
          if (f.watch_next_group && grouped[f.watch_next_group]) {
            grouped[f.watch_next_group].push(f);
          }
        });
        WATCH_NEXT_GROUPS.forEach(({ key }) => {
          grouped[key].sort(
            (a, b) =>
              (EXPECTATION_WEIGHT[a.franchise_expectation] ?? 99) -
              (EXPECTATION_WEIGHT[b.franchise_expectation] ?? 99),
          );
        });
        const hasAny = WATCH_NEXT_GROUPS.some(
          ({ key }) => grouped[key].length > 0,
        );

        return (
          <section>
            <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <i className="fas fa-list-ol text-brand/70"></i>
                Watch Next
              </h2>
            </div>

            {/* Tab bar */}
            <div className="border-b border-gray-200 mb-6 overflow-x-auto">
              <nav className="flex gap-1 min-w-max">
                {WATCH_NEXT_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setWatchNextTab(tab.key)}
                    className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                      watchNextTab === tab.key
                        ? "border-brand text-brand"
                        : tab.dev
                          ? "border-transparent text-gray-300 hover:text-gray-400"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <i className={`fas ${tab.icon} text-xs`}></i>
                    {tab.label}
                    {tab.dev && (
                      <span className="text-[9px] font-black text-gray-300 uppercase tracking-wide">
                        DEV
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Anime tab */}
            {watchNextTab === "anime" &&
              (!hasAny ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                  <i className="fas fa-list-ol text-3xl text-gray-300 mb-3"></i>
                  <p className="text-gray-500 font-medium">
                    No franchises in watch list.
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Assign franchises to a Watch Next Group in Modify.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {WATCH_NEXT_GROUPS.map(({ key, label }) => {
                    const items = grouped[key];
                    if (items.length === 0) return null;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                          <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                            {label}
                          </h3>
                          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                            {items.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {items.map((f) => {
                            const coverUrl = getCoverForSlot(
                              f,
                              franchiseAnimeMap,
                            );
                            return (
                              <Link
                                key={f.system_id}
                                to={`/franchise/${f.system_id}`}
                                className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                              >
                                <div className="aspect-[3/4] bg-gray-100">
                                  <img
                                    src={coverUrl}
                                    alt={getDisplayName(f)}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.target.src = FALLBACK_SVG;
                                    }}
                                  />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                                  <p className="text-white text-xs font-bold leading-tight truncate">
                                    {getDisplayName(f)}
                                  </p>
                                  {f.franchise_expectation &&
                                    f.franchise_expectation !== "Low" && (
                                      <span
                                        className={`text-[10px] font-black ${f.franchise_expectation === "High" ? "text-yellow-300" : "text-blue-300"}`}
                                      >
                                        {f.franchise_expectation}
                                      </span>
                                    )}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

            {/* Under-development tabs */}
            {watchNextTab !== "anime" && (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                  <i className="fas fa-list-ol text-brand text-xl"></i>
                </div>
                <p className="text-gray-700 font-bold">Under Development</p>
                <p className="text-gray-400 text-sm font-medium mt-1">
                  This section is coming soon.
                </p>
              </div>
            )}
          </section>
        );
      })()}

      {/* Block 3.5 — To Rewatch */}
      {(() => {
        const EXPECTATION_WEIGHT = { High: 0, Medium: 1, Low: 2 };
        const REWATCH_TABS = [
          { key: "anime", label: "Anime", icon: "fa-tv", dev: false },
          {
            key: "anime-movie",
            label: "Anime Movie",
            icon: "fa-film",
            dev: true,
          },
          { key: "movie", label: "Movie", icon: "fa-ticket-alt", dev: true },
          {
            key: "tv-show",
            label: "TV Show",
            icon: "fa-broadcast-tower",
            dev: true,
          },
          {
            key: "cartoon",
            label: "Cartoon",
            icon: "fa-laugh-squint",
            dev: true,
          },
          { key: "manga", label: "Manga", icon: "fa-book", dev: true },
          { key: "novel", label: "Novel", icon: "fa-book-open", dev: true },
        ];

        const rewatchItems = franchises
          .filter((f) => f.to_rewatch)
          .sort(
            (a, b) =>
              (EXPECTATION_WEIGHT[a.franchise_expectation] ?? 99) -
              (EXPECTATION_WEIGHT[b.franchise_expectation] ?? 99),
          );

        return (
          <section>
            <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                <i className="fas fa-redo text-brand/70"></i>
                To Rewatch
              </h2>
            </div>

            {/* Tab bar */}
            <div className="border-b border-gray-200 mb-6 overflow-x-auto">
              <nav className="flex gap-1 min-w-max">
                {REWATCH_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setRewatchTab(tab.key)}
                    className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                      rewatchTab === tab.key
                        ? "border-brand text-brand"
                        : tab.dev
                          ? "border-transparent text-gray-300 hover:text-gray-400"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <i className={`fas ${tab.icon} text-xs`}></i>
                    {tab.label}
                    {tab.dev && (
                      <span className="text-[9px] font-black text-gray-300 uppercase tracking-wide">
                        DEV
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Anime tab */}
            {rewatchTab === "anime" &&
              (rewatchItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                  <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                  <p className="text-gray-500 font-medium">
                    No franchises marked for rewatch.
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Toggle "To Rewatch" on a franchise page or in Modify.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {rewatchItems.map((f) => {
                    const coverUrl = getCoverForSlot(f, franchiseAnimeMap);
                    return (
                      <Link
                        key={f.system_id}
                        to={`/franchise/${f.system_id}`}
                        className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                      >
                        <div className="aspect-[3/4] bg-gray-100">
                          <img
                            src={coverUrl}
                            alt={getDisplayName(f)}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = FALLBACK_SVG;
                            }}
                          />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                          <p className="text-white text-xs font-bold leading-tight truncate">
                            {getDisplayName(f)}
                          </p>
                          {f.my_rating && (
                            <span className="text-yellow-300 text-[10px] font-black">
                              {f.my_rating}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}

            {/* Under-development tabs */}
            {rewatchTab !== "anime" && (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                  <i className="fas fa-redo text-brand text-xl"></i>
                </div>
                <p className="text-gray-700 font-bold">Under Development</p>
                <p className="text-gray-400 text-sm font-medium mt-1">
                  This section is coming soon.
                </p>
              </div>
            )}
          </section>
        );
      })()}

      {/* Block 4 — Recent Completions */}
      <section>
        <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <i className="fas fa-history text-brand/70"></i>
            Recent Completions
          </h2>
        </div>

        {/* Tab bar */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
          <nav className="flex gap-1 min-w-max">
            {[
              { key: "anime", label: "Anime", icon: "fa-tv", dev: false },
              {
                key: "anime-movie",
                label: "Anime Movie",
                icon: "fa-film",
                dev: true,
              },
              {
                key: "movie",
                label: "Movie",
                icon: "fa-ticket-alt",
                dev: true,
              },
              {
                key: "tv-show",
                label: "TV Show",
                icon: "fa-broadcast-tower",
                dev: true,
              },
              {
                key: "cartoon",
                label: "Cartoon",
                icon: "fa-laugh-squint",
                dev: true,
              },
              { key: "manga", label: "Manga", icon: "fa-book", dev: true },
              { key: "novel", label: "Novel", icon: "fa-book-open", dev: true },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCompletionsTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                  completionsTab === tab.key
                    ? "border-brand text-brand"
                    : tab.dev
                      ? "border-transparent text-gray-300 hover:text-gray-400"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <i className={`fas ${tab.icon} text-xs`}></i>
                {tab.label}
                {tab.dev && (
                  <span className="text-[9px] font-black text-gray-300 uppercase tracking-wide">
                    DEV
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Anime tab */}
        {completionsTab === "anime" &&
          (() => {
            const AIRING_TYPE_ORDER = ["TV", "Movie", "ONA", "Others"];
            const completed = allAnime
              .filter(
                (a) => a.watching_status === "Completed" && a.completed_at,
              )
              .sort(
                (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
              );

            const grouped = { TV: [], Movie: [], ONA: [], Others: [] };
            completed.forEach((a) => {
              const t = ["TV", "Movie", "ONA"].includes(a.airing_type)
                ? a.airing_type
                : "Others";
              grouped[t].push(a);
            });

            const hasAny = completed.length > 0;

            if (!hasAny) {
              return (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                  <i className="fas fa-check-circle text-3xl text-gray-300 mb-3"></i>
                  <p className="text-gray-500 font-medium">
                    No completions recorded yet.
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Completions are tracked when watching status is set to
                    Completed.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-8">
                {AIRING_TYPE_ORDER.map((type) => {
                  const items = grouped[type];
                  if (items.length === 0) return null;
                  const PAGE_SIZE = 10;
                  const page = groupPages[type];
                  const totalPages = Math.ceil(items.length / PAGE_SIZE);
                  const pageItems = items.slice(
                    page * PAGE_SIZE,
                    (page + 1) * PAGE_SIZE,
                  );
                  const setPage = (p) =>
                    setGroupPages((prev) => ({ ...prev, [type]: p }));

                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                        <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                          {type}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                          {items.length}
                        </span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {pageItems.map((anime, idx) => {
                          const globalIdx = page * PAGE_SIZE + idx;
                          const franchise =
                            franchiseMap[String(anime.franchise_id)];
                          const coverUrl = getCoverUrl(anime.cover_image_file);
                          const name =
                            anime.anime_name_cn ||
                            anime.anime_name_en ||
                            anime.anime_name_romanji ||
                            "—";
                          const franchiseName = franchise
                            ? franchise.franchise_name_cn ||
                              franchise.franchise_name_en ||
                              franchise.franchise_name_romanji
                            : null;
                          const dateStr = new Date(
                            anime.completed_at,
                          ).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });

                          return (
                            <Link
                              key={anime.system_id}
                              to={`/anime/${anime.system_id}`}
                              className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors ${
                                idx < pageItems.length - 1
                                  ? "border-b border-gray-100"
                                  : ""
                              }`}
                            >
                              <span className="text-xs font-black text-gray-300 w-6 text-center shrink-0">
                                {globalIdx + 1}
                              </span>
                              <div className="w-9 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0">
                                <img
                                  src={coverUrl}
                                  alt={name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.src = FALLBACK_SVG;
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">
                                  {name}
                                </p>
                                {franchiseName && (
                                  <p className="text-xs text-gray-400 font-medium truncate">
                                    {franchiseName}
                                  </p>
                                )}
                              </div>
                              {anime.my_rating && (
                                <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-md shrink-0">
                                  {anime.my_rating}
                                </span>
                              )}
                              <span className="text-xs text-gray-400 font-medium shrink-0 hidden sm:block">
                                {dateStr}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <button
                            onClick={() => setPage(page - 1)}
                            disabled={page === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                          >
                            <i className="fas fa-chevron-left text-[10px]"></i>
                            Prev
                          </button>
                          <span className="text-xs text-gray-400 font-medium">
                            Page {page + 1} of {totalPages}
                          </span>
                          <button
                            onClick={() => setPage(page + 1)}
                            disabled={page >= totalPages - 1}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                          >
                            Next
                            <i className="fas fa-chevron-right text-[10px]"></i>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

        {/* Under-development tabs */}
        {completionsTab !== "anime" && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mb-4">
              <i className="fas fa-history text-brand text-xl"></i>
            </div>
            <p className="text-gray-700 font-bold">Under Development</p>
            <p className="text-gray-400 text-sm font-medium mt-1">
              This section is coming soon.
            </p>
          </div>
        )}
      </section>

    </div>
  );
}
