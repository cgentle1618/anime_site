// Frontend: plan page file for PlanToWatchFuture.
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import MediaCard from "../../components/cards/MediaCard";

const MAIN_TABS = [
  { key: "Watch When Airs", label: "Watch When Airs", icon: "fa-broadcast-tower" },
  { key: "Plan to Watch", label: "Plan to Watch", icon: "fa-calendar-alt" },
];

const TYPE_ORDER = ["anime", "anime_movie", "movie", "tv_show", "cartoon"];
const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 };

function seasonRawToKey(raw) {
  if (!raw || raw === "Not Set") return null;
  const parts = raw.trim().split(" ");
  if (parts.length !== 2) return null;
  const [code, year] = parts;
  const idx = SEASON_ORDER[code];
  if (idx === undefined) return null;
  return `S_${year}_${idx}`;
}

function getAnimeSeasonKey(anime) {
  const { release_year: year, release_season: season } = anime;
  if (year && season && SEASON_ORDER[season] !== undefined)
    return `S_${year}_${SEASON_ORDER[season]}`;
  if (year) return `Y_${year}`;
  return "Z_TBD";
}

function isFutureRelease(entry, currentSeasonKey) {
  if (entry.airing_status !== "Not Yet Aired") return false;
  if (entry._type === "anime" && currentSeasonKey) {
    const key = getAnimeSeasonKey(entry);
    if (key.startsWith("S_") && key < currentSeasonKey) return false;
  }
  return true;
}

function getEntryYear(entry) {
  if (entry._type === "anime") {
    return entry.release_year ? String(entry.release_year) : "TBD";
  }
  if (entry._type === "anime_movie") {
    const d = entry.release_date_jp || entry.release_date_tw;
    if (!d) return "TBD";
    const y = String(d).substring(0, 4);
    return /^\d{4}$/.test(y) ? y : "TBD";
  }
  if (entry._type === "movie") {
    const d = entry.release_date_usa || entry.release_date_tw;
    if (!d) return "TBD";
    const parts = String(d).split(/[\s-]/);
    const yearPart = parts.find((p) => /^\d{4}$/.test(p));
    return yearPart || "TBD";
  }
  if (entry._type === "tv_show" || entry._type === "cartoon") {
    const d = entry.release_date;
    if (!d) return "TBD";
    const y = String(d).substring(0, 4);
    return /^\d{4}$/.test(y) ? y : "TBD";
  }
  return "TBD";
}

function getEntryName(entry) {
  if (entry._type === "anime")
    return entry.anime_name_en || entry.anime_name_cn || "";
  if (entry._type === "anime_movie")
    return entry.anime_movie_name_en || entry.anime_movie_name_cn || "";
  if (entry._type === "movie")
    return entry.movie_name_en || entry.movie_name_cn || "";
  if (entry._type === "tv_show")
    return entry.tv_name_en || entry.tv_name_cn || "";
  if (entry._type === "cartoon")
    return entry.cartoon_name_en || entry.cartoon_name_cn || "";
  return "";
}

export default function PlanToWatchFuture({
  allAnime,
  allAnimeMovies,
  allMovies,
  allTVShows,
  allCartoons,
  franchiseMap,
  onUpdated,
}) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("Watch When Airs");
  const [currentSeasonKey, setCurrentSeasonKey] = useState(null);

  useEffect(() => {
    fetch("/api/system/config/current_season", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setCurrentSeasonKey(seasonRawToKey(data.current_season || "")))
      .catch(() => {});
  }, []);

  const combined = useMemo(
    () => [
      ...allAnime.map((e) => ({ ...e, _type: "anime" })),
      ...allAnimeMovies.map((e) => ({ ...e, _type: "anime_movie" })),
      ...allMovies.map((e) => ({ ...e, _type: "movie" })),
      ...allTVShows.map((e) => ({ ...e, _type: "tv_show" })),
      ...allCartoons.map((e) => ({ ...e, _type: "cartoon" })),
    ],
    [allAnime, allAnimeMovies, allMovies, allTVShows, allCartoons],
  );

  const grouped = useMemo(() => {
    const filtered = combined.filter((e) => {
      if (e.watching_status !== activeTab) return false;
      if (activeTab === "Plan to Watch") return isFutureRelease(e, currentSeasonKey);
      return true;
    });
    const groups = {};
    filtered.forEach((entry) => {
      const year = getEntryYear(entry);
      if (!groups[year]) groups[year] = [];
      groups[year].push(entry);
    });
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => {
        const diff = TYPE_ORDER.indexOf(a._type) - TYPE_ORDER.indexOf(b._type);
        if (diff !== 0) return diff;
        return getEntryName(a).localeCompare(getEntryName(b));
      });
    });
    const sortedYears = Object.keys(groups).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return Number(a) - Number(b);
    });
    return sortedYears.map((year) => ({ year, entries: groups[year] }));
  }, [combined, activeTab, currentSeasonKey]);

  const totalCount = grouped.reduce((sum, g) => sum + g.entries.length, 0);

  const TYPE_MAP = { anime: "anime", anime_movie: "anime-movie", movie: "movie", tv_show: "tv-show", cartoon: "cartoon" };

  function renderCard(entry) {
    const type = TYPE_MAP[entry._type];
    if (!type) return null;
    return (
      <MediaCard
        key={entry.system_id}
        type={type}
        variant="future"
        data={entry}
        franchiseDict={franchiseMap}
        isAdmin={isAdmin}
        onUpdated={onUpdated}
      />
    );
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-calendar-alt text-brand/70"></i>
          Plan to Watch for Future Releases
        </h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={`fas ${tab.icon} text-xs`}></i>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <i className="fas fa-calendar-alt text-3xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 font-medium">
            No entries with &ldquo;{activeTab}&rdquo; status.
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Set watching status on an entry to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ year, entries }) => (
            <div key={year}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-600 uppercase tracking-wider">
                  {year}
                </span>
                <span className="text-xs text-gray-400 font-medium">
                  ({entries.length})
                </span>
                <div className="flex-1 h-px bg-gray-100 ml-1"></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {entries.map((entry) => renderCard(entry))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

