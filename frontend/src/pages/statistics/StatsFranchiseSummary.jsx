import { useState } from "react";
import { Link } from "react-router-dom";

const RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];

const MY_RATING_COLORS = {
  S: "bg-purple-500",
  "A+": "bg-amber-400",
  A: "bg-green-500",
  B: "bg-blue-400",
  C: "bg-orange-400",
  D: "bg-rose-400",
  E: "bg-red-600",
  F: "bg-gray-500",
  Unrated: "bg-gray-300",
};

const MAL_BUCKETS = [
  { key: "9+", min: 9, max: 11, color: "bg-purple-500" },
  { key: "8.7+", min: 8.7, max: 9, color: "bg-indigo-400" },
  { key: "8.5+", min: 8.5, max: 8.7, color: "bg-blue-400" },
  { key: "8.2+", min: 8.2, max: 8.5, color: "bg-cyan-400" },
  { key: "7.7+", min: 7.7, max: 8.2, color: "bg-green-400" },
  { key: "7+", min: 7, max: 7.7, color: "bg-yellow-400" },
  { key: "4+", min: 4, max: 7, color: "bg-orange-400" },
  { key: "<4", min: 0, max: 4, color: "bg-red-400" },
];

export default function StatsFranchiseSummary({
  franchises,
  allAnime,
  seasonals,
  currentSeason,
}) {
  const [seasonalPage, setSeasonalPage] = useState(0);

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
  const maxCount = Math.max(...RATING_ORDER.map((r) => ratingCounts[r]), 1);
  const totalFranchises = franchises.length;

  const malRatingRows = MAL_BUCKETS.map((b) => ({
    ...b,
    count: allAnime.filter(
      (a) =>
        a.mal_rating != null && a.mal_rating >= b.min && a.mal_rating < b.max,
    ).length,
  }));
  const malMaxCount = Math.max(...malRatingRows.map((r) => r.count), 1);
  const totalWithMal = allAnime.filter((a) => a.mal_rating != null).length;

  const seasonalRatingCounts = {};
  RATING_ORDER.forEach((r) => {
    seasonalRatingCounts[r] = 0;
  });
  seasonalRatingCounts["Unrated"] = 0;
  seasonals.forEach((s) => {
    const r = s.my_rating;
    if (r && RATING_ORDER.includes(r)) {
      seasonalRatingCounts[r]++;
    } else {
      seasonalRatingCounts["Unrated"]++;
    }
  });
  const seasonalMaxCount = Math.max(
    ...RATING_ORDER.map((r) => seasonalRatingCounts[r]),
    1,
  );
  const totalSeasonals = seasonals.length;

  return (
    <>
      {/* Block 2 — Rating Distribution */}
      <section>
        <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-gray-200">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <i className="fas fa-star text-brand/70"></i>
            Rating Distribution
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Rating */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>My Rating</span>
              <span className="text-gray-400 font-medium normal-case">
                ACG Franchise
              </span>
            </p>
            <div className="space-y-3">
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
                          MY_RATING_COLORS[rating] || "bg-gray-300"
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
          </div>

          {/* MAL Rating */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>MAL Rating</span>
              <span className="text-gray-400 font-medium normal-case">
                All Anime
              </span>
            </p>
            <div className="space-y-3">
              {malRatingRows.map(({ key, count, color }) => {
                const pct =
                  totalWithMal > 0
                    ? Math.round((count / totalWithMal) * 100)
                    : 0;
                const barWidth = (count / malMaxCount) * 100;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-10 text-right text-sm font-black shrink-0 text-gray-700">
                      {key}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-5 rounded-full transition-all duration-700 ${color}`}
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
          </div>

          {/* Seasonal Rating */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Seasonal Rating</span>
              <span className="text-gray-400 font-medium normal-case">
                Per Season
              </span>
            </p>
            <div className="space-y-3">
              {allRows.map((rating) => {
                const count = seasonalRatingCounts[rating];
                const pct =
                  totalSeasonals > 0
                    ? Math.round((count / totalSeasonals) * 100)
                    : 0;
                const barWidth = (count / seasonalMaxCount) * 100;
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
                          MY_RATING_COLORS[rating] || "bg-gray-300"
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
          </div>
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
            <p className="text-gray-500 font-medium">
              No seasonal data available.
            </p>
          </div>
        ) : (() => {
            const PAGE_SIZE = 12;
            const totalPages = Math.ceil(seasonals.length / PAGE_SIZE);
            const pageItems = seasonals.slice(
              seasonalPage * PAGE_SIZE,
              (seasonalPage + 1) * PAGE_SIZE,
            );
            return (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                          Season
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                          Rating
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                          <span className="text-green-600">Completed</span>
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">
                          <span className="text-violet-600">Planned</span>
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
                                <span className="text-gray-300 text-xs font-medium">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`text-sm font-bold ${s.entry_completed > 0 ? "text-green-600" : "text-gray-300"}`}
                              >
                                {s.entry_completed}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`text-sm font-bold ${s.entry_planned > 0 ? "text-violet-600" : "text-gray-300"}`}
                              >
                                {s.entry_planned}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`text-sm font-bold ${s.entry_watching > 0 ? "text-blue-600" : "text-gray-300"}`}
                              >
                                {s.entry_watching}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`text-sm font-bold ${s.entry_dropped > 0 ? "text-red-500" : "text-gray-300"}`}
                              >
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
    </>
  );
}
