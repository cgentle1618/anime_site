// Frontend: page component file for SeasonalOverall.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getRatingWeight } from "../../utils/media";
import DashboardCard from "../../components/tracker/DashboardCard";
import RatingDistributionBlock from "../../components/info/RatingDistributionBlock";
import { Chip, Eyebrow, ProgressRule, RatingStamp, Slip } from "../../components/ui/primitives";

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

const NEXT_SECTIONS = [
  {
    key: "when_airs",
    label: "Watch When Airs",
    statuses: ["Watch When Airs"],
  },
  {
    key: "planned",
    label: "Plan to Watch",
    statuses: ["Plan to Watch"],
  },
  {
    key: "might",
    label: "Might Watch",
    statuses: ["Might Watch"],
  },
  {
    key: "other",
    label: "Other",
    statuses: [
      "Active Watching",
      "Passive Watching",
      "Paused",
      "Completed",
      "Completed (解說)",
      "Temp Dropped",
    ],
  },
  {
    key: "wont",
    label: "Won't Watch",
    statuses: ["Won't Watch", "Dropped"],
  },
];

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };
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

// A count as a display figure under a mono label (the ScoreBlock pattern).
function StatFigure({ label, value }) {
  return (
    <div className="pr-6 border-r border-border last:border-r-0 last:pr-0">
      <Eyebrow className="mb-1">{label}</Eyebrow>
      <div className="font-display text-2xl leading-none tabular-nums text-text">{value}</div>
    </div>
  );
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
  showRatingDistribution = false,
}) {
  const [saving, setSaving] = useState(false);

  const totalEntries = animeData.length;
  const completedCount = seasonal?.entry_completed ?? 0;
  const watchingCount = seasonal?.entry_watching ?? 0;
  const plannedCount = seasonal?.entry_planned ?? 0;
  const droppedCount = seasonal?.entry_dropped ?? 0;
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
      <Slip title={blockTitle}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-display text-3xl font-semibold text-text leading-none">
                {seasonalId}
              </h2>
              <RatingStamp rating={seasonal?.my_rating} size="sm" />
              <Link
                to={`/seasonal/${encodeURIComponent(seasonalId)}`}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted hover:text-brand transition"
              >
                View detail →
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
              <StatFigure label="Total" value={totalEntries} />
              <StatFigure label="Planned" value={plannedCount} />
              <StatFigure label="Watching" value={watchingCount} />
              <StatFigure label="Completed" value={completedCount} />
              {droppedCount > 0 && <StatFigure label="Dropped" value={droppedCount} />}
            </div>

            {totalEntries > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <Eyebrow>Completion</Eyebrow>
                  <span className="font-mono text-[10px] text-text tabular-nums">
                    {completionPct}%
                  </span>
                </div>
                <ProgressRule value={completionPct / 100} />
              </div>
            )}
          </div>

          {isAdmin && seasonal && (
            <div className="shrink-0">
              <Eyebrow as="label" className="block mb-1.5">
                Seasonal rating
              </Eyebrow>
              <div className="flex items-center gap-2">
                <select
                  value={seasonal.my_rating || ""}
                  onChange={(e) => handleRating(e.target.value)}
                  disabled={saving}
                  className="bg-surface border border-border-strong text-text text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
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
      </Slip>

      {/* Rating Distribution */}
      {showRatingDistribution && (
        <RatingDistributionBlock animeData={animeData} />
      )}

      {/* Anime sections */}
      {totalEntries === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border-strong">
          <p className="text-text-faint text-sm">
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
                <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted font-normal">
                    {section.label}
                  </h3>
                  <span className="font-mono text-[11px] text-text-faint tabular-nums">
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
        prev.map((a) =>
          a.system_id === sysId
            ? {
                ...a,
                ep_fin: newVal,
                cum_ep_fin: (a.ep_previous || 0) + newVal,
              }
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
        if (!res.ok) throw new Error();
        showToast("success", "Episodes updated!");
      } catch {
        setter((prev) =>
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
          <p className="text-text-faint text-sm">
            Loading seasonal overview...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center border border-danger text-danger p-6">
          <p className="font-bold">Error loading seasonal overview.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page header */}
      <header>
        <Eyebrow className="mb-2">Calendar</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none">
          Seasonal
        </h1>
        {currentSeason && (
          <p className="text-sm text-text-muted mt-2">
            Current season <span className="font-mono text-text">{currentSeason}</span>
          </p>
        )}
      </header>

      {/* Tab bar */}
      <nav className="flex flex-wrap gap-2">
        {[
          { key: "current", label: "Current season" },
          { key: "next", label: "Next season" },
          { key: "all", label: "All seasons" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 border text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-text-muted border-border-strong hover:border-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

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
              showRatingDistribution
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border-strong">
              <p className="text-text-faint text-sm">
                No current season configured.
              </p>
              {isAdmin && (
                <p className="text-xs text-text-faint mt-1">
                  Set one in Admin → System config.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Next Season Tab ── */}
      {activeTab === "next" && (
        <div className="space-y-16">
          {nextSeason ? (
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
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border-strong">
              <p className="text-text-faint text-sm">
                Could not determine next season.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── All Seasons Tab ── */}
      {activeTab === "all" && (
        <Slip title="All seasons" padded={false}>
          {allYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-text-faint text-sm">
                No seasonal data available.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-mono text-[10px] font-normal text-text-faint uppercase tracking-[0.14em] w-20">
                    Year
                  </th>
                  {SEASONS.map((s) => (
                    <th
                      key={s}
                      className="px-4 py-3 text-center font-mono text-[10px] font-normal text-text-faint uppercase tracking-[0.14em]"
                    >
                      {SEASON_LABELS[s]}
                      <span className="block text-[10px] text-text-faint/70 mt-0.5">
                        {s}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allYears.map((year) => (
                  <tr
                    key={year}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-6 py-4 font-display text-xl text-text">
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
                              className={`inline-flex items-center justify-center px-3 py-1.5 border font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                                isCurrent
                                  ? "bg-brand text-on-brand border-brand"
                                  : isNext
                                    ? "border-brand text-brand hover:bg-brand-soft"
                                    : "bg-surface text-text-muted border-border-strong hover:border-text"
                              }`}
                            >
                              {id}
                            </Link>
                          ) : (
                            <Chip tone="muted" className="border-dashed">{id}</Chip>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Slip>
      )}
    </div>
  );
}

