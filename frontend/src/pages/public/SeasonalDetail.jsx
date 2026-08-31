// Frontend: page component file for SeasonalDetail.
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getRatingWeight } from "../../utils/media";
import DashboardCard from "../../components/tracker/DashboardCard";
import RatingDistributionBlock from "../../components/info/RatingDistributionBlock";
import { Eyebrow, ProgressRule, RatingStamp, Slip } from "../../components/ui/primitives";

// Section definitions — display order and status membership
const SECTIONS = [
  {
    key: "completed",
    label: "Completed",
    statuses: ["Completed", "Completed (解說)"],
  },
  {
    key: "watching",
    label: "Watching",
    statuses: ["Active Watching", "Passive Watching", "Paused"],
  },
  {
    key: "planned",
    label: "Planned",
    statuses: ["Plan to Watch", "Watch When Airs"],
  },
  {
    key: "might",
    label: "Might Watch",
    statuses: ["Might Watch"],
  },
  {
    key: "dropped",
    label: "Dropped",
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

// A count as a display figure under a mono label (the ScoreBlock pattern).
function StatFigure({ label, value }) {
  return (
    <div className="pr-6 border-r border-border last:border-r-0 last:pr-0">
      <Eyebrow className="mb-1">{label}</Eyebrow>
      <div className="font-display text-2xl leading-none tabular-nums text-text">{value}</div>
    </div>
  );
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
      prev.map((a) =>
        a.system_id === sysId
          ? { ...a, ep_fin: newVal, cum_ep_fin: (a.ep_previous || 0) + newVal }
          : a,
      ),
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
          a.system_id === sysId
            ? {
                ...a,
                ep_fin: prevVal,
                cum_ep_fin: (a.ep_previous || 0) + prevVal,
              }
            : a,
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
          <p className="text-text-faint text-sm">Loading seasonal data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center border border-danger text-danger p-6">
          <p className="font-bold">Error loading seasonal page.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const totalEntries = animeData.length;
  const completedCount = seasonal?.entry_completed ?? 0;
  const plannedCount = seasonal?.entry_planned ?? 0;
  const droppedCount = seasonal?.entry_dropped ?? 0;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Hero */}
      <Slip title="Season">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {/* Left: name + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() =>
                  navigate(`/seasonal/${encodeURIComponent(prevSeason)}`)
                }
                className="w-8 h-8 flex items-center justify-center border border-border-strong text-text-faint hover:text-brand hover:border-brand transition shrink-0"
                title={`Previous: ${prevSeason}`}
              >
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <h1 className="font-display text-4xl font-semibold text-text leading-none">
                {seasonalId}
              </h1>
              <button
                onClick={() =>
                  navigate(`/seasonal/${encodeURIComponent(nextSeason)}`)
                }
                className="w-8 h-8 flex items-center justify-center border border-border-strong text-text-faint hover:text-brand hover:border-brand transition shrink-0"
                title={`Next: ${nextSeason}`}
              >
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
              <RatingStamp rating={seasonal?.my_rating} size="md" />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-5">
              <StatFigure label="Total" value={totalEntries} />
              <StatFigure label="Planned" value={plannedCount} />
              <StatFigure label="Watching" value={seasonal?.entry_watching ?? 0} />
              <StatFigure label="Completed" value={completedCount} />
              {droppedCount > 0 && <StatFigure label="Dropped" value={droppedCount} />}
            </div>

            {/* Completion bar */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <Eyebrow>Completion</Eyebrow>
                <span className="font-mono text-[10px] text-text tabular-nums">
                  {completionPct}%
                </span>
              </div>
              <ProgressRule value={completionPct / 100} />
            </div>
          </div>

          {/* Right: admin rating control */}
          {isAdmin && (
            <div className="shrink-0">
              <Eyebrow as="label" className="block mb-1.5">
                Seasonal rating
              </Eyebrow>
              <div className="flex items-center gap-2">
                <select
                  value={seasonal?.my_rating || ""}
                  onChange={(e) => handleRatingChange(e.target.value)}
                  disabled={savingRating}
                  className="bg-surface border border-border-strong text-text text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
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
      </Slip>

      {/* Rating Distribution */}
      <RatingDistributionBlock animeData={animeData} />

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
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-border">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted font-normal">
                  {section.label}
                </h2>
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
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
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border-strong">
            <p className="text-text-faint text-sm">
              No anime entries for this season.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

