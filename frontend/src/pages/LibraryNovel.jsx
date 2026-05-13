import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import NovelCard, { getReadingButtonConfig } from "../components/NovelCard";
import { getRatingWeight, cleanString } from "../utils/media";
import { useToast } from "../hooks/useToast";

function getNovelTitle(n) {
  return (
    n.novel_name_cn ||
    n.novel_name_en ||
    n.novel_name_roman ||
    n.novel_name_jp ||
    n.novel_name_alt ||
    ""
  );
}

function getNovelSortKey(n) {
  return (
    n.novel_name_en ||
    n.novel_name_roman ||
    n.novel_name_cn ||
    n.novel_name_jp ||
    n.novel_name_alt ||
    ""
  );
}

function getNovelProgress(n) {
  const pd = n.progress_display;
  if (pd === "vol_tw") {
    return `${n.vol_fin ?? 0} / ${n.vol_total_tw ?? "?"} VOL TW`;
  }
  if (pd === "vol_original") {
    return `${n.vol_fin ?? 0} / ${n.vol_total_original ?? "?"} VOL`;
  }
  if (pd === "arc_ch") {
    return `${n.arc_fin ?? 0}/${n.arc_total ?? "?"} ARC  ${n.ch_fin ?? 0}/${n.ch_total ?? "?"} CH`;
  }
  return `${n.ch_fin ?? 0} / ${n.ch_total ?? "?"} CH`;
}

const READING_STATUS_GROUP = {
  "Plan to Read": "Planned",
  "Active Reading": "Reading",
  "Passive Reading": "Reading",
  Paused: "Reading",
  Completed: "Completed",
  "Temp Dropped": "Dropped",
  Dropped: "Dropped",
  "Won't Read": "Dropped",
  "Might Read": "Might Read",
};

export default function LibraryNovel() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [allNovels, setAllNovels] = useState([]);
  const [franchiseDict, setFranchiseDict] = useState({});
  const [seriesDict, setSeriesDict] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("title");
  const [currentView, setCurrentView] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
    region: new Set(),
    type: new Set(),
  });

  useEffect(() => {
    async function fetch_() {
      try {
        const [nRes, fRes, sRes] = await Promise.all([
          fetch("/api/novel/", { credentials: "include" }),
          fetch("/api/franchise/", { credentials: "include" }),
          fetch("/api/series/", { credentials: "include" }),
        ]);
        if (!nRes.ok || !fRes.ok || !sRes.ok)
          throw new Error("Failed to fetch database");
        const [novels, franchises, seriesList] = await Promise.all([
          nRes.json(),
          fRes.json(),
          sRes.json(),
        ]);
        setAllNovels(novels);
        setFranchiseDict(
          Object.fromEntries(franchises.map((f) => [f.system_id, f])),
        );
        setSeriesDict(
          Object.fromEntries(seriesList.map((s) => [s.system_id, s])),
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
    setAllNovels((prev) =>
      prev.map((n) => (n.system_id === updated.system_id ? updated : n)),
    );
  }, []);

  const regionOptions = useMemo(
    () =>
      [...new Set(allNovels.map((n) => n.region).filter(Boolean))].sort(),
    [allNovels],
  );

  const serializationStatusOptions = useMemo(
    () =>
      [
        ...new Set(
          allNovels.map((n) => n.serialization_status).filter(Boolean),
        ),
      ].sort(),
    [allNovels],
  );

  const typeOptions = useMemo(
    () => [...new Set(allNovels.map((n) => n.type).filter(Boolean))].sort(),
    [allNovels],
  );

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    let result = allNovels.filter((n) => {
      if (qClean) {
        const f = franchiseDict[n.franchise_id];
        const s = seriesDict[n.series_id];
        const fields = [
          n.novel_name_cn,
          n.novel_name_en,
          n.novel_name_roman,
          n.novel_name_jp,
          n.novel_name_alt,
          f?.franchise_name_cn,
          f?.franchise_name_en,
          f?.franchise_name_roman,
          s?.series_name_cn,
          s?.series_name_en,
          s?.series_name_alt,
          n.release_year != null ? String(n.release_year) : null,
        ];
        if (
          !fields.some(
            (field) => field && cleanString(String(field)).includes(qClean),
          )
        )
          return false;
      }
      if (
        filters.serializationStatus.size > 0 &&
        !filters.serializationStatus.has(n.serialization_status)
      )
        return false;
      if (filters.region.size > 0 && !filters.region.has(n.region))
        return false;
      if (filters.type.size > 0 && !filters.type.has(n.type)) return false;
      if (filters.readingStatus.size > 0) {
        const group = READING_STATUS_GROUP[n.reading_status] || "Might Read";
        if (!filters.readingStatus.has(group)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (currentSort === "release_year") {
        const dA = a.release_year ?? 0;
        const dB = b.release_year ?? 0;
        if (dA !== dB) return dB - dA;
      } else if (currentSort === "end_year") {
        const dA = a.end_year ?? 0;
        const dB = b.end_year ?? 0;
        if (dA !== dB) return dB - dA;
      } else if (currentSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      } else if (currentSort === "mal_rating") {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
        if (wA !== wB) return wB - wA;
      }
      return getNovelSortKey(a)
        .toLowerCase()
        .localeCompare(getNovelSortKey(b).toLowerCase(), undefined, {
          numeric: true,
        });
    });

    return result;
  }, [
    allNovels,
    franchiseDict,
    seriesDict,
    searchQuery,
    currentSort,
    filters,
  ]);

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
      serializationStatus: new Set(),
      readingStatus: new Set(),
      region: new Set(),
      type: new Set(),
    });
  }

  const activeFilterCount =
    filters.serializationStatus.size +
    filters.readingStatus.size +
    filters.region.size +
    filters.type.size;

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
            placeholder="Search novel, franchise, series, year..."
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
          <option value="release_year">Sort: Release Year</option>
          <option value="end_year">Sort: Ending Year</option>
          <option value="my_rating">Sort: My Rating</option>
          <option value="mal_rating">Sort: MAL Rating</option>
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
          {serializationStatusOptions.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-400 mb-1.5">
                Serialization Status
              </div>
              <div className="flex flex-wrap gap-1.5">
                {serializationStatusOptions.map((v) => (
                  <FilterTag
                    key={v}
                    group="serializationStatus"
                    value={v}
                    label={v}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">
              Reading Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Reading", "Planned", "Completed", "Dropped", "Might Read"].map(
                (v) => (
                  <FilterTag
                    key={v}
                    group="readingStatus"
                    value={v}
                    label={v}
                  />
                ),
              )}
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
          {typeOptions.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-400 mb-1.5">Type</div>
              <div className="flex flex-wrap gap-1.5">
                {typeOptions.map((v) => (
                  <FilterTag key={v} group="type" value={v} label={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-20">
          <i className="fas fa-ghost text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 font-medium">
            No novels match the current filters.
          </p>
        </div>
      ) : currentView === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredAndSorted.map((n) => (
            <NovelCard key={n.system_id} novel={n} onUpdated={handleUpdated} />
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
                  Title CN
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider border-r border-gray-100 hidden md:table-cell">
                  Title EN
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden md:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  Progress
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  My
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">
                  MAL
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden xl:table-cell">
                  Read
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden xl:table-cell">
                  Read Next
                </th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center hidden xl:table-cell">
                  To Reread
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAndSorted.map((n) => {
                const f = franchiseDict[n.franchise_id];
                const fName = f
                  ? f.franchise_name_cn ||
                    f.franchise_name_en ||
                    f.franchise_name_roman ||
                    "Unknown"
                  : null;
                const mainTitle = getNovelTitle(n);
                const titleEN = n.novel_name_en || n.novel_name_roman || "-";
                const btnConfig = getReadingButtonConfig(n.reading_status);
                const progress = getNovelProgress(n);

                async function handleStatusToggle(e) {
                  e.stopPropagation();
                  const res = await fetch(`/api/novel/${n.system_id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      reading_status: btnConfig.target,
                    }),
                    credentials: "include",
                  });
                  if (res.ok) {
                    const updated = await res.json();
                    handleUpdated(updated);
                    showToast("success", `Status → ${btnConfig.target}`);
                  }
                }

                return (
                  <tr
                    key={n.system_id}
                    onClick={() => navigate(`/novel/${n.system_id}`)}
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
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-[10rem] border-r border-gray-100 hidden md:table-cell">
                      {titleEN}
                    </td>
                    <td className="px-4 py-2 text-xs text-center text-gray-500 border-r border-gray-100 hidden md:table-cell">
                      {n.serialization_status || "-"}
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-mono font-bold text-gray-700 border-r border-gray-100 hidden lg:table-cell">
                      {progress}
                    </td>
                    <td className="px-4 py-2 text-center border-r border-gray-100 hidden lg:table-cell">
                      {n.my_rating ? (
                        <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">
                          {n.my_rating}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-center border-r border-gray-100 hidden lg:table-cell">
                      {n.mal_rating != null ? (
                        <span className="font-bold text-blue-600">
                          {n.mal_rating}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-center border-r border-gray-100 hidden xl:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isAdmin ? (
                        <button
                          onClick={handleStatusToggle}
                          className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors mx-auto font-bold text-[13px] leading-none ${btnConfig.cls}`}
                          title={`${n.reading_status || "Might Read"} → ${btnConfig.target}`}
                        >
                          {btnConfig.symbol}
                        </button>
                      ) : n.reading_status ? (
                        <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate">
                          {n.reading_status}
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
                        checked={!!n.read_next}
                        disabled={!isAdmin}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          const res = await fetch(`/api/novel/${n.system_id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ read_next: val }),
                            credentials: "include",
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            handleUpdated(updated);
                            showToast(
                              "success",
                              val
                                ? "Added to Read Next"
                                : "Removed from Read Next",
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
                        checked={!!n.to_reread}
                        disabled={!isAdmin}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          const res = await fetch(`/api/novel/${n.system_id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ to_reread: val }),
                            credentials: "include",
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            handleUpdated(updated);
                            showToast(
                              "success",
                              val
                                ? "Marked for reread"
                                : "Removed from reread",
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
