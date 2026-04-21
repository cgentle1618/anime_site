import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getRatingWeight } from "../utils/anime";
import DashboardCard from "../components/DashboardCard";

// Section definitions — display order and status membership
const SECTIONS = [
  {
    key: "completed",
    label: "Completed",
    icon: "fa-check-circle",
    statuses: ["Completed"],
  },
  {
    key: "watching",
    label: "Watching",
    icon: "fa-play-circle",
    statuses: ["Active Watching", "Passive Watching", "Paused"],
  },
  {
    key: "planned",
    label: "Planned",
    icon: "fa-bookmark",
    statuses: ["Plan to Watch", "Watch When Airs"],
  },
  {
    key: "might",
    label: "Might Watch",
    icon: "fa-question-circle",
    statuses: ["Might Watch"],
  },
  {
    key: "dropped",
    label: "Dropped",
    icon: "fa-times-circle",
    statuses: ["Dropped", "Temp Dropped", "Won't Watch"],
  },
];

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };
const RATING_OPTIONS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

const SEASONS = ["WIN", "SPR", "SUM", "FAL"];

function getAdjacentSeason(current, direction) {
  const parts = current.split(" ");
  if (parts.length !== 2) return null;
  const [season, year] = parts;
  const idx = SEASONS.indexOf(season);
  if (idx === -1) return null;
  if (direction === "prev") {
    return idx === 0
      ? `FAL ${parseInt(year, 10) - 1}`
      : `${SEASONS[idx - 1]} ${year}`;
  }
  return idx === SEASONS.length - 1
    ? `WIN ${parseInt(year, 10) + 1}`
    : `${SEASONS[idx + 1]} ${year}`;
}

const MY_RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];
const MY_RATING_COLORS = {
  S: "bg-purple-500", "A+": "bg-amber-400", A: "bg-green-500",
  B: "bg-blue-400", C: "bg-orange-400", D: "bg-rose-400",
  E: "bg-red-600", F: "bg-gray-500",
};

const MAL_BUCKETS = [
  { key: "9+",   min: 9,   max: 11,  color: "bg-purple-500" },
  { key: "8.7+", min: 8.7, max: 9,   color: "bg-indigo-400" },
  { key: "8.5+", min: 8.5, max: 8.7, color: "bg-blue-400" },
  { key: "8.2+", min: 8.2, max: 8.5, color: "bg-cyan-400" },
  { key: "7.7+", min: 7.7, max: 8.2, color: "bg-green-400" },
  { key: "7+",   min: 7,   max: 7.7, color: "bg-yellow-400" },
  { key: "4+",   min: 4,   max: 7,   color: "bg-orange-400" },
  { key: "<4",   min: 0,   max: 4,   color: "bg-red-400" },
];

function BarChart({ items, label }) {
  const max = Math.max(...items.map((d) => d.count), 1);
  const hasData = items.some((d) => d.count > 0);
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">{label}</p>
      {!hasData ? (
        <p className="text-xs text-gray-400 italic">No data</p>
      ) : (
        <div className="flex items-end gap-2 h-28">
          {items.map(({ key, count, color }) => (
            <div key={key} className="flex flex-col items-center flex-1 min-w-0">
              <span className="text-[10px] font-bold text-gray-700 mb-1">{count > 0 ? count : ""}</span>
              <div
                className={`w-full rounded-t-sm transition-all ${color} ${count === 0 ? "opacity-15" : ""}`}
                style={{ height: `${Math.max((count / max) * 80, count > 0 ? 4 : 2)}px` }}
              />
              <span className="text-[9px] font-semibold text-gray-500 mt-1.5 truncate w-full text-center">{key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function sortAnime(items, franchiseMap) {
  return [...items].sort((a, b) => {
    // 1. My Rating (lower weight = better)
    const rA = getRatingWeight(a.my_rating);
    const rB = getRatingWeight(b.my_rating);
    if (rA !== rB) return rA - rB;

    // 2. Franchise Expectation
    const fA = franchiseMap[a.franchise_id];
    const fB = franchiseMap[b.franchise_id];
    const eA = EXPECTATION_WEIGHT[fA?.franchise_expectation] ?? 99;
    const eB = EXPECTATION_WEIGHT[fB?.franchise_expectation] ?? 99;
    return eA - eB;
  });
}

export default function SeasonalDetail() {
  const { seasonal_id } = useParams();
  const seasonalId = decodeURIComponent(seasonal_id);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const prevSeason = getAdjacentSeason(seasonalId, "prev");
  const nextSeason = getAdjacentSeason(seasonalId, "next");

  const [seasonal, setSeasonal] = useState(null);
  const [animeData, setAnimeData] = useState([]);
  const [franchiseMap, setFranchiseMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [sRes, aRes, fRes] = await Promise.all([
          fetch(`/api/seasonal/${encodeURIComponent(seasonalId)}`, {
            credentials: "include",
          }),
          fetch(`/api/anime/?airing_season=${encodeURIComponent(seasonalId)}`, {
            credentials: "include",
          }),
          fetch("/api/franchise/", { credentials: "include" }),
        ]);
        if (!sRes.ok) throw new Error(`Seasonal '${seasonalId}' not found.`);
        if (!aRes.ok || !fRes.ok)
          throw new Error("Failed to load seasonal data.");

        const [s, anime, franchises] = await Promise.all([
          sRes.json(),
          aRes.json(),
          fRes.json(),
        ]);
        setSeasonal(s);
        setAnimeData(anime);
        const map = {};
        franchises.forEach((f) => {
          map[f.system_id] = f;
        });
        setFranchiseMap(map);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [seasonalId]);

  async function handleRatingChange(newRating) {
    const value = newRating === "" ? null : newRating;
    setSeasonal((prev) => ({ ...prev, my_rating: value }));
    setSavingRating(true);
    try {
      const res = await fetch(
        `/api/seasonal/${encodeURIComponent(seasonalId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ my_rating: value }),
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to save rating.");
      showToast("success", "Seasonal rating saved.");
    } catch {
      showToast("error", "Failed to save rating.");
    } finally {
      setSavingRating(false);
    }
  }

  async function handleEpChange(sysId, newVal, prevVal) {
    setAnimeData((prev) =>
      prev.map((a) => (a.system_id === sysId ? { ...a, ep_fin: newVal } : a)),
    );
    try {
      const res = await fetch(`/api/anime/${sysId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ep_fin: newVal }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync");
      showToast("success", "Episodes updated!");
    } catch {
      setAnimeData((prev) =>
        prev.map((a) =>
          a.system_id === sysId ? { ...a, ep_fin: prevVal } : a,
        ),
      );
      showToast("error", "Network error. Progress reverted.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading seasonal data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading seasonal page.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const totalEntries = animeData.length;
  const completedCount = animeData.filter(
    (a) => a.watching_status === "Completed",
  ).length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  const myRatingData = MY_RATING_ORDER.map((r) => ({
    key: r,
    count: animeData.filter((a) => a.my_rating === r).length,
    color: MY_RATING_COLORS[r],
  }));

  const malRatingData = MAL_BUCKETS.map((b) => ({
    key: b.key,
    count: animeData.filter(
      (a) => a.mal_rating != null && a.mal_rating >= b.min && a.mal_rating < b.max,
    ).length,
    color: b.color,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Hero */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {/* Left: name + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-calendar-alt text-brand text-lg"></i>
              </div>
              <button
                onClick={() => navigate(`/seasonal/${encodeURIComponent(prevSeason)}`)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-brand hover:border-brand transition shrink-0"
                title={`Previous: ${prevSeason}`}
              >
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                {seasonalId}
              </h1>
              <button
                onClick={() => navigate(`/seasonal/${encodeURIComponent(nextSeason)}`)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-brand hover:border-brand transition shrink-0"
                title={`Next: ${nextSeason}`}
              >
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
              {seasonal?.my_rating && (
                <span className="bg-yellow-400 text-yellow-900 text-sm font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <i className="fas fa-star text-xs"></i>
                  {seasonal.my_rating}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">
                {totalEntries} Entries
              </span>
              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-bold border border-blue-200">
                {completedCount} Completed
              </span>
            </div>

            {/* Completion bar */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Completion
                </span>
                <span className="text-xs font-bold text-brand">
                  {completionPct}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-brand h-2 rounded-full transition-all duration-700"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: admin rating control */}
          {isAdmin && (
            <div className="shrink-0">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Seasonal Rating
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={seasonal?.my_rating || ""}
                  onChange={(e) => handleRatingChange(e.target.value)}
                  disabled={savingRating}
                  className="bg-white border border-gray-300 text-gray-900 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:opacity-50"
                >
                  <option value="">—</option>
                  {RATING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {savingRating && (
                  <i className="fas fa-spinner fa-spin text-brand text-sm"></i>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rating Distributions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-6 flex items-center gap-2">
          <i className="fas fa-chart-bar text-brand"></i>
          Rating Distribution
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <BarChart items={myRatingData} label="My Rating" />
          <BarChart items={malRatingData} label="MAL Rating" />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-12">
        {SECTIONS.map((section) => {
          const items = animeData.filter((a) =>
            section.statuses.includes(a.watching_status),
          );
          if (items.length === 0) return null;
          const sorted = sortAnime(items, franchiseMap);

          return (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-gray-200">
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                  <i className={`fas ${section.icon} text-brand/70`}></i>
                  {section.label}
                </h2>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">
                  {sorted.length}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {sorted.map((anime) => (
                  <DashboardCard
                    key={anime.system_id}
                    anime={anime}
                    franchise={franchiseMap[anime.franchise_id]}
                    isAdmin={isAdmin}
                    onEpChange={handleEpChange}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {totalEntries === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
            <i className="fas fa-ghost text-3xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 font-medium">
              No anime entries for this season.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
