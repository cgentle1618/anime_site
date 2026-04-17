import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getRatingWeight } from "../utils/anime";
import DashboardCard from "../components/DashboardCard";

const SEASONS = ["WIN", "SPR", "SUM", "FAL"];
const SEASON_LABELS = {
  WIN: "Winter",
  SPR: "Spring",
  SUM: "Summer",
  FAL: "Fall",
};

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

const NEXT_SECTIONS = [
  {
    key: "when_airs",
    label: "Watch When Airs",
    icon: "fa-clock",
    statuses: ["Watch When Airs"],
  },
  {
    key: "planned",
    label: "Plan to Watch",
    icon: "fa-bookmark",
    statuses: ["Plan to Watch"],
  },
  {
    key: "might",
    label: "Might Watch",
    icon: "fa-question-circle",
    statuses: ["Might Watch"],
  },
  {
    key: "other",
    label: "Other",
    icon: "fa-ellipsis-h",
    statuses: ["Active Watching", "Passive Watching", "Paused", "Completed", "Temp Dropped"],
  },
  {
    key: "wont",
    label: "Won't Watch",
    icon: "fa-ban",
    statuses: ["Won't Watch", "Dropped"],
  },
];

const EXPECTATION_WEIGHT = { High: 0, Medium: 1, Low: 2 };
const RATING_OPTIONS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function getNextSeason(current) {
  if (!current) return null;
  const parts = current.split(" ");
  if (parts.length !== 2) return null;
  const [season, year] = parts;
  const idx = SEASONS.indexOf(season);
  if (idx === -1) return null;
  return idx === SEASONS.length - 1
    ? `WIN ${parseInt(year, 10) + 1}`
    : `${SEASONS[idx + 1]} ${year}`;
}

function sortAnime(items, franchiseMap) {
  return [...items].sort((a, b) => {
    const rA = getRatingWeight(a.my_rating);
    const rB = getRatingWeight(b.my_rating);
    if (rA !== rB) return rA - rB;
    const eA =
      EXPECTATION_WEIGHT[franchiseMap[a.franchise_id]?.franchise_expectation] ??
      99;
    const eB =
      EXPECTATION_WEIGHT[franchiseMap[b.franchise_id]?.franchise_expectation] ??
      99;
    return eA - eB;
  });
}

// ─── Seasonal Block ───────────────────────────────────────────────────────────

function SeasonalBlock({
  blockTitle,
  seasonalId,
  seasonal,
  animeData,
  franchiseMap,
  isAdmin,
  onEpChange,
  onRatingChange,
  sections = SECTIONS,
}) {
  const [saving, setSaving] = useState(false);

  const totalEntries = animeData.length;
  const completedCount = animeData.filter(
    (a) => a.watching_status === "Completed",
  ).length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  async function handleRating(val) {
    const value = val === "" ? null : val;
    setSaving(true);
    await onRatingChange(seasonalId, value);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Block header card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">
              {blockTitle}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black text-gray-900">
                {seasonalId}
              </h2>
              {seasonal?.my_rating && (
                <span className="bg-yellow-400 text-yellow-900 text-sm font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <i className="fas fa-star text-xs"></i>
                  {seasonal.my_rating}
                </span>
              )}
              <Link
                to={`/seasonal/${encodeURIComponent(seasonalId)}`}
                className="text-xs text-brand font-bold hover:underline"
              >
                View Detail →
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold border border-gray-200">
                {totalEntries} Entries
              </span>
              <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-200">
                {completedCount} Completed
              </span>
            </div>

            {totalEntries > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Completion
                  </span>
                  <span className="text-[10px] font-bold text-brand">
                    {completionPct}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-brand h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {isAdmin && seasonal && (
            <div className="shrink-0">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1.5">
                Seasonal Rating
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={seasonal.my_rating || ""}
                  onChange={(e) => handleRating(e.target.value)}
                  disabled={saving}
                  className="bg-white border border-gray-300 text-gray-900 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:opacity-50"
                >
                  <option value="">—</option>
                  {RATING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {saving && (
                  <i className="fas fa-spinner fa-spin text-brand text-sm"></i>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anime sections */}
      {totalEntries === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 bg-white rounded-xl border border-gray-200 border-dashed">
          <i className="fas fa-ghost text-3xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 font-medium">
            No anime entries for this season yet.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => {
            const items = animeData.filter((a) =>
              section.statuses.includes(a.watching_status),
            );
            if (items.length === 0) return null;
            const sorted = sortAnime(items, franchiseMap);
            return (
              <div key={section.key}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
                  <h3 className="text-base font-black text-gray-700 flex items-center gap-2">
                    <i className={`fas ${section.icon} text-brand/60`}></i>
                    {section.label}
                  </h3>
                  <span className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-xs font-bold border border-gray-200">
                    {sorted.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                  {sorted.map((anime) => (
                    <DashboardCard
                      key={anime.system_id}
                      anime={anime}
                      franchise={franchiseMap[anime.franchise_id]}
                      isAdmin={isAdmin}
                      onEpChange={onEpChange}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SeasonalOverall() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("current");

  const [currentSeason, setCurrentSeason] = useState(null);
  const [allSeasonals, setAllSeasonals] = useState([]);
  const [seasonalMap, setSeasonalMap] = useState({});
  const [thisAnime, setThisAnime] = useState([]);
  const [nextAnime, setNextAnime] = useState([]);
  const [franchiseMap, setFranchiseMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [csRes, allRes, fRes] = await Promise.all([
          fetch("/api/seasonal/current-season", { credentials: "include" }),
          fetch("/api/seasonal/", { credentials: "include" }),
          fetch("/api/franchise/", { credentials: "include" }),
        ]);
        if (!csRes.ok || !allRes.ok || !fRes.ok)
          throw new Error("Failed to load seasonal data.");

        const [csData, seasonals, franchises] = await Promise.all([
          csRes.json(),
          allRes.json(),
          fRes.json(),
        ]);

        const cs = csData.current_season;
        const next = getNextSeason(cs);

        const sMap = {};
        seasonals.forEach((s) => {
          sMap[s.seasonal] = s;
        });
        const fMap = {};
        franchises.forEach((f) => {
          fMap[f.system_id] = f;
        });

        setCurrentSeason(cs);
        setAllSeasonals(seasonals);
        setSeasonalMap(sMap);
        setFranchiseMap(fMap);

        // Fetch anime for this season and next season in parallel
        const animeFetches = [
          cs
            ? fetch(`/api/anime/?airing_season=${encodeURIComponent(cs)}`, {
                credentials: "include",
              })
            : Promise.resolve(null),
          next
            ? fetch(`/api/anime/?airing_season=${encodeURIComponent(next)}`, {
                credentials: "include",
              })
            : Promise.resolve(null),
        ];
        const [thisRes, nextRes] = await Promise.all(animeFetches);
        setThisAnime(thisRes && thisRes.ok ? await thisRes.json() : []);
        setNextAnime(nextRes && nextRes.ok ? await nextRes.json() : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRatingChange(seasonalId, value) {
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
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSeasonalMap((prev) => ({ ...prev, [seasonalId]: updated }));
      showToast("success", "Rating saved.");
    } catch {
      showToast("error", "Failed to save rating.");
    }
  }

  function handleEpChange(setter) {
    return async (sysId, newVal, prevVal) => {
      setter((prev) =>
        prev.map((a) => (a.system_id === sysId ? { ...a, ep_fin: newVal } : a)),
      );
      try {
        const res = await fetch(`/api/anime/${sysId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ep_fin: newVal }),
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        showToast("success", "Episodes updated!");
      } catch {
        setter((prev) =>
          prev.map((a) =>
            a.system_id === sysId ? { ...a, ep_fin: prevVal } : a,
          ),
        );
        showToast("error", "Network error. Progress reverted.");
      }
    };
  }

  const nextSeason = getNextSeason(currentSeason);

  // All-seasons table: years that have at least one seasonal entry
  const allYears = [
    ...new Set(allSeasonals.map((s) => s.seasonal.split(" ")[1])),
  ].sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const seasonSet = new Set(allSeasonals.map((s) => s.seasonal));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">
            Loading seasonal overview...
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
          <p className="font-bold">Error loading seasonal overview.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-calendar text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Seasonal
          </h1>
          {currentSeason && (
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Current Season:{" "}
              <span className="text-brand font-bold">{currentSeason}</span>
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {[
            {
              key: "current",
              label: "Current Season",
              icon: "fa-calendar-day",
            },
            { key: "all", label: "All Seasons", icon: "fa-calendar-alt" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={`fas ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Current Season Tab ── */}
      {activeTab === "current" && (
        <div className="space-y-16">
          {currentSeason ? (
            <SeasonalBlock
              blockTitle="This Season"
              seasonalId={currentSeason}
              seasonal={seasonalMap[currentSeason]}
              animeData={thisAnime}
              franchiseMap={franchiseMap}
              isAdmin={isAdmin}
              onEpChange={handleEpChange(setThisAnime)}
              onRatingChange={handleRatingChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
              <i className="fas fa-calendar-times text-3xl text-gray-300 mb-3"></i>
              <p className="text-gray-500 font-medium">
                No current season configured.
              </p>
              {isAdmin && (
                <p className="text-xs text-gray-400 mt-1">
                  Set one in the Admin → System Config panel.
                </p>
              )}
            </div>
          )}

          {nextSeason && (
            <SeasonalBlock
              blockTitle="Next Season"
              seasonalId={nextSeason}
              seasonal={seasonalMap[nextSeason]}
              animeData={nextAnime}
              franchiseMap={franchiseMap}
              isAdmin={isAdmin}
              onEpChange={handleEpChange(setNextAnime)}
              onRatingChange={handleRatingChange}
              sections={NEXT_SECTIONS}
            />
          )}
        </div>
      )}

      {/* ── All Seasons Tab ── */}
      {activeTab === "all" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {allYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <i className="fas fa-ghost text-3xl text-gray-300 mb-3"></i>
              <p className="text-gray-500 font-medium">
                No seasonal data available.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider w-20">
                    Year
                  </th>
                  {SEASONS.map((s) => (
                    <th
                      key={s}
                      className="px-4 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-wider"
                    >
                      {SEASON_LABELS[s]}
                      <span className="block text-[10px] font-bold text-gray-400 normal-case tracking-normal mt-0.5">
                        {s}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allYears.map((year) => (
                  <tr
                    key={year}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-black text-gray-900 text-base">
                      {year}
                    </td>
                    {SEASONS.map((season) => {
                      const id = `${season} ${year}`;
                      const hasEntries = seasonSet.has(id);
                      const isCurrent = id === currentSeason;
                      const isNext = id === nextSeason;

                      return (
                        <td key={season} className="px-4 py-4 text-center">
                          {hasEntries ? (
                            <Link
                              to={`/seasonal/${encodeURIComponent(id)}`}
                              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                isCurrent
                                  ? "bg-brand text-white shadow-sm hover:shadow-md hover:scale-105"
                                  : isNext
                                    ? "bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20"
                                    : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                              }`}
                            >
                              {isCurrent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse shrink-0" />
                              )}
                              {id}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold text-gray-300 border border-dashed border-gray-200 cursor-default select-none">
                              {id}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
