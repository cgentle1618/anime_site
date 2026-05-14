import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import TVCard from "../components/cards/TVCard";
import {
  getRatingWeight,
  cleanString,
  getStatusButtonConfig,
} from "../utils/media";
import { useToast } from "../hooks/useToast";

function getTVTitle(s) {
  return s.tv_name_cn || s.tv_name_en || s.tv_name_alt || "";
}

function getTVSortKey(s) {
  return s.tv_name_en || s.tv_name_alt || s.tv_name_cn || "";
}

const WATCHING_STATUS_GROUP = {
  "Plan to Watch": "Planned",
  "Watch When Airs": "Planned",
  "Active Watching": "Watching",
  "Passive Watching": "Watching",
  Paused: "Watching",
  Completed: "Completed",
  "Temp Dropped": "Dropped",
  Dropped: "Dropped",
  "Won't Watch": "Dropped",
  "Might Watch": "Might Watch",
};

export default function LibraryTV() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [allShows, setAllShows] = useState([]);
  const [franchiseDict, setFranchiseDict] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("title");
  const [currentView, setCurrentView] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
    region: new Set(),
  });

  useEffect(() => {
    async function fetch_() {
      try {
        const [sRes, fRes] = await Promise.all([
          fetch("/api/tv-shows/", { credentials: "include" }),
          fetch("/api/franchise/", { credentials: "include" }),
        ]);
        if (!sRes.ok || !fRes.ok) throw new Error("Failed to fetch database");
        const [shows, franchises] = await Promise.all([
          sRes.json(),
          fRes.json(),
        ]);
        setAllShows(shows);
        setFranchiseDict(
          Object.fromEntries(franchises.map((f) => [f.system_id, f])),
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, []);

  const handleUpdated = useCallback((updated) => {
    setAllShows((prev) =>
      prev.map((s) => (s.system_id === updated.system_id ? updated : s)),
    );
  }, []);

  const regionOptions = useMemo(
    () => [...new Set(allShows.map((s) => s.region).filter(Boolean))].sort(),
    [allShows],
  );

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    let result = allShows.filter((s) => {
      if (qClean) {
        const f = franchiseDict[s.franchise_id];
        const fields = [
          s.tv_name_cn,
          s.tv_name_en,
          s.tv_name_alt,
          f?.franchise_name_cn,
          f?.franchise_name_en,
          f?.franchise_name_roman,
          s.season_part,
          s.region,
        ];
        if (
          !fields.some(
            (field) => field && cleanString(String(field)).includes(qClean),
          )
        )
          return false;
      }
      if (
        filters.airingStatus.size > 0 &&
        !filters.airingStatus.has(s.airing_status)
      )
        return false;
      if (filters.region.size > 0 && !filters.region.has(s.region))
        return false;
      if (filters.watchingStatus.size > 0) {
        const group = WATCHING_STATUS_GROUP[s.watching_status] || "Might Watch";
        if (!filters.watchingStatus.has(group)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (currentSort === "release_date") {
        const dA = a.release_date ? new Date(a.release_date).getTime() : 0;
        const dB = b.release_date ? new Date(b.release_date).getTime() : 0;
        if (dA !== dB) return dB - dA;
      } else if (currentSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      } else if (currentSort === "imdb_rating") {
        const wA =
          a.imdb_rating && a.imdb_rating !== "N/A"
            ? parseFloat(a.imdb_rating)
            : -1;
        const wB =
          b.imdb_rating && b.imdb_rating !== "N/A"
            ? parseFloat(b.imdb_rating)
            : -1;
        if (wA !== wB) return wB - wA;
      }
      return getTVSortKey(a)
        .toLowerCase()
        .localeCompare(getTVSortKey(b).toLowerCase());
    });

    return result;
  }, [allShows, franchiseDict, searchQuery, currentSort, filters]);

  function toggleFilter(group, value) {
    setFilters((prev) => {
      const next = { ...prev, [group]: new Set(prev[group]) };
      if (next[group].has(value)) next[group].delete(value);
      else next[group].add(value);
      return next;
    });
  }

  function clearFilters() {
    setFilters({
      airingStatus: new Set(),
      watchingStatus: new Set(),
      region: new Set(),
    });
  }

  const activeFilterCount =
    filters.airingStatus.size +
    filters.watchingStatus.size +
    filters.region.size;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading library...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Database Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const FilterTag = ({ group, value, label }) => {
    const active = filters[group].has(value);
    return (
      <button
        onClick={() => toggleFilter(group, value)}
        className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${active ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <i className="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm pointer-events-none"></i>
          <input
            type="text"
            placeholder="Search TV shows, franchise, season..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
          )}
        </div>
        <select
          value={currentSort}
          onChange={(e) => setCurrentSort(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
        >
          <option value="title">Sort: Title</option>
          <option value="release_date">Sort: Release Date</option>
          <option value="my_rating">Sort: My Rating</option>
          <option value="imdb_rating">Sort: IMDb Rating</option>
        </select>
        <button
          onClick={() => setShowFilters((o) => !o)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${showFilters ? "bg-gray-100 border-gray-300" : "bg-white border-gray-200 hover:bg-gray-50"}`}
        >
          <i className="fas fa-filter"></i> Filters
          {activeFilterCount > 0 && (
            <span className="bg-brand text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setCurrentView("grid")}
            className={`px-3 py-2 text-sm transition-colors ${currentView === "grid" ? "bg-brand text-white" : "bg-white text-gray-400 hover:text-gray-600"}`}
          >
            <i className="fas fa-th-large"></i>
          </button>
          <button
            onClick={() => setCurrentView("table")}
            className={`px-3 py-2 text-sm transition-colors ${currentView === "table" ? "bg-brand text-white" : "bg-white text-gray-400 hover:text-gray-600"}`}
          >
            <i className="fas fa-list"></i>
          </button>
        </div>
        <span className="text-sm font-bold text-gray-500">
          {filteredAndSorted.length} results
        </span>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
              Filters
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold text-red-500 hover:text-red-700"
              >
                Clear All
              </button>
            )}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">
              Airing Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Finished Airing", "Airing", "Not Yet Aired"].map((v) => (
                <FilterTag key={v} group="airingStatus" value={v} label={v} />
              ))}
            </div>
          </div>
          {regionOptions.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-400 mb-1.5">
                Region
              </div>
              <div className="flex flex-wrap gap-1.5">
                {regionOptions.map((v) => (
                  <FilterTag key={v} group="region" value={v} label={v} />
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">
              Watch Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Watching",
                "Planned",
                "Completed",
                "Dropped",
                "Might Watch",
              ].map((v) => (
                <FilterTag key={v} group="watchingStatus" value={v} label={v} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-20">
          <i className="fas fa-ghost text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 font-medium">
            No TV shows match the current filters.
          </p>
        </div>
      ) : currentView === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredAndSorted.map((s) => (
            <TVCard key={s.system_id} show={s} onUpdated={handleUpdated} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider border-r border-gray-100">
                  Franchise
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider border-r border-gray-100">
                  Title
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden md:table-cell">
                  Season
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden md:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  EP
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  My
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  IMDb
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100">
                  Watch
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden xl:table-cell">
                  Watch Next
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center hidden xl:table-cell">
                  To Rewatch
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAndSorted.map((s) => {
                const f = franchiseDict[s.franchise_id];
                const fName = f
                  ? f.franchise_name_cn ||
                    f.franchise_name_en ||
                    f.franchise_name_roman ||
                    "Unknown"
                  : null;
                const mainTitle = getTVTitle(s);
                const subTitle = s.tv_name_en || "";
                const btnConfig = getStatusButtonConfig(s.watching_status);
                const epFin = s.ep_fin ?? 0;
                const epTotal = s.ep_total ?? "?";

                async function handleStatusToggle(e) {
                  e.stopPropagation();
                  const res = await fetch(`/api/tv-shows/${s.system_id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ watching_status: btnConfig.target }),
                    credentials: "include",
                  });
                  if (res.ok) {
                    const updated = await res.json();
                    handleUpdated(updated);
                    showToast("success", `Status → ${btnConfig.target}`);
                  }
                }

                let airStatusColor = "text-gray-500 bg-gray-100";
                if (s.airing_status === "Airing")
                  airStatusColor = "text-green-700 bg-green-100";
                else if (s.airing_status === "Finished Airing")
                  airStatusColor = "text-blue-700 bg-blue-100";
                else if (s.airing_status === "Not Yet Aired")
                  airStatusColor = "text-orange-700 bg-orange-100";

                return (
                  <tr
                    key={s.system_id}
                    onClick={() => navigate(`/tv-show/${s.system_id}`)}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2 text-xs text-gray-600 font-medium truncate max-w-[12rem] border-r border-gray-100">
                      {fName || (
                        <span className="text-gray-300 italic">None</span>
                      )}
                    </td>
                    <td className="px-4 py-2 border-r border-gray-100">
                      <div className="text-xs font-bold text-gray-900 leading-tight line-clamp-1">
                        {mainTitle}
                      </div>
                      {subTitle && subTitle !== mainTitle && (
                        <div className="text-[9px] text-gray-400 line-clamp-1">
                          {subTitle}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-center text-gray-500 border-r border-gray-100 hidden md:table-cell">
                      {s.season_part || "-"}
                    </td>
                    <td className="px-4 py-2 text-center border-r border-gray-100 hidden md:table-cell">
                      <span
                        className={`px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${airStatusColor}`}
                      >
                        {s.airing_status || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-mono font-bold text-gray-700 border-r border-gray-100 hidden lg:table-cell">
                      {epFin} / {epTotal}
                    </td>
                    <td className="px-4 py-2 text-center border-r border-gray-100 hidden lg:table-cell">
                      {s.my_rating ? (
                        <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">
                          {s.my_rating}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-center border-r border-gray-100 hidden lg:table-cell">
                      {s.imdb_rating && s.imdb_rating !== "N/A" ? (
                        <span className="font-bold text-yellow-600">
                          {s.imdb_rating}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-center border-r border-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isAdmin ? (
                        <button
                          onClick={handleStatusToggle}
                          className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors mx-auto font-bold text-[13px] leading-none ${btnConfig.cls}`}
                          title={`${s.watching_status || "Might Watch"} → ${btnConfig.target}`}
                        >
                          {btnConfig.symbol}
                        </button>
                      ) : s.watching_status ? (
                        <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate">
                          {s.watching_status}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-center border-r border-gray-100 hidden xl:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={!!s.watch_next}
                        disabled={!isAdmin}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          const res = await fetch(
                            `/api/tv-shows/${s.system_id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ watch_next: val }),
                              credentials: "include",
                            },
                          );
                          if (res.ok) {
                            const updated = await res.json();
                            handleUpdated(updated);
                            showToast(
                              "success",
                              val
                                ? "Added to Watch Next"
                                : "Removed from Watch Next",
                            );
                          }
                        }}
                        className="w-4 h-4 rounded accent-brand disabled:opacity-40"
                      />
                    </td>
                    <td
                      className="px-4 py-2 text-center hidden xl:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={!!s.to_rewatch}
                        disabled={!isAdmin}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          const res = await fetch(
                            `/api/tv-shows/${s.system_id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ to_rewatch: val }),
                              credentials: "include",
                            },
                          );
                          if (res.ok) {
                            const updated = await res.json();
                            handleUpdated(updated);
                            showToast(
                              "success",
                              val
                                ? "Marked for rewatch"
                                : "Removed from rewatch",
                            );
                          }
                        }}
                        className="w-4 h-4 rounded accent-brand disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
