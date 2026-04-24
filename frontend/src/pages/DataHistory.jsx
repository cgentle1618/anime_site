import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTitle(item, type) {
  if (type === "anime")
    return (
      item.anime_name_cn ||
      item.anime_name_en ||
      item.anime_name_roman ||
      item.anime_name_jp ||
      item.anime_name_alt ||
      "Unknown"
    );
  if (type === "franchise")
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_roman ||
      item.franchise_name_jp ||
      item.franchise_name_alt ||
      "Unknown"
    );
  if (type === "series")
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown"
    );
  return "Unknown";
}

function getDeletedDisplayData(d) {
  if (d.type === "System Options")
    return {
      name: d.anime_en || "Unknown Value",
      context: d.anime_cn || "Unknown Category",
    };
  if (d.type === "Franchise")
    return {
      name: d.franchise || "Unknown Franchise",
      context: "Top Level Hub",
    };
  if (d.type === "Series")
    return {
      name: d.series || "Unknown Series",
      context: d.franchise || "No Franchise",
    };
  return {
    name: d.anime_cn || d.anime_en || "Unknown Anime",
    context: d.series || d.franchise || "Independent",
  };
}

function DeletedTable({ records, onRefresh }) {
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const totalPages = Math.ceil(records.length / pageSize) || 1;
  const slice = records.slice((page - 1) * pageSize, page * pageSize);

  async function handleDeleteRecord(recordId) {
    await fetch(`/api/system/deleted/${recordId}`, {
      method: "DELETE",
      credentials: "include",
    });
    onRefresh();
  }

  async function handleClearOld() {
    if (!confirm("Delete old records? The 5 most recent entries will be kept."))
      return;
    await fetch("/api/system/deleted", {
      method: "DELETE",
      credentials: "include",
    });
    onRefresh();
  }

  function renderAdditional(d) {
    if (d.type === "System Options" && d.category) {
      return (
        <span className="text-gray-500 text-xs">Category: {d.category}</span>
      );
    }
    if (d.type === "Franchise" && d.franchise_type) {
      return (
        <span className="text-gray-500 text-xs">Type: {d.franchise_type}</span>
      );
    }
    if (d.type === "Anime") {
      return (
        <div className="text-xs text-gray-500 space-y-0.5">
          {d.franchise_cn && <div>Franchise: {d.franchise_cn}</div>}
          {d.series_cn && <div>Series: {d.series_cn}</div>}
        </div>
      );
    }
    if (d.type === "Series" && d.franchise_cn) {
      return (
        <span className="text-gray-500 text-xs">
          Franchise: {d.franchise_cn}
        </span>
      );
    }
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="bg-red-50/50 border-b border-red-100 px-5 py-3 flex items-center justify-between">
        <span className="font-bold text-red-900">
          <i className="fas fa-trash-alt mr-2 text-red-500"></i> Recently
          Deleted Records
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearOld}
            className="text-xs font-bold text-red-400 hover:text-red-600 transition"
            title="Delete old records, keep 5 most recent"
          >
            <i className="fas fa-trash mr-1"></i>Clear Old
          </button>
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-red-500 transition"
          >
            <i className="fas fa-redo"></i>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider bg-white sticky top-0 border-b border-gray-100 shadow-sm z-10">
            <tr>
              <th className="px-5 py-2.5 whitespace-nowrap">Time</th>
              <th className="px-5 py-2.5">Type</th>
              <th className="px-5 py-2.5">Name (CN)</th>
              <th className="px-5 py-2.5">Name (EN)</th>
              <th className="px-5 py-2.5">Additional Info</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {slice.map((d, i) => (
              <tr key={i} className="hover:bg-red-50/30 transition group">
                <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                  {formatDate(d.timestamp)}
                </td>
                <td className="px-5 py-2.5">
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-red-50 text-red-600 border-red-200">
                    {d.type}
                  </span>
                </td>
                <td
                  className="px-5 py-2.5 font-bold text-gray-800 max-w-[160px] truncate"
                  title={d.name_cn}
                >
                  {d.name_cn || "-"}
                </td>
                <td
                  className="px-5 py-2.5 text-gray-600 max-w-[160px] truncate text-xs"
                  title={d.name_en}
                >
                  {d.name_en || ""}
                </td>
                <td className="px-5 py-2.5 max-w-[180px]">
                  {renderAdditional(d)}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => handleDeleteRecord(d.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"
                    title="Delete this record"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-6 text-gray-400 italic"
                >
                  No deleted entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
        <div className="text-xs font-bold text-gray-500">
          Total Deleted: <span className="text-gray-800">{records.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <div className="text-xs font-black text-gray-700 uppercase tracking-tighter">
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

function airingBadgeCls(status) {
  if (status === "Airing") return "text-green-700 bg-green-100";
  if (status === "Finished Airing") return "text-blue-700 bg-blue-100";
  if (status === "Not Yet Aired") return "text-orange-700 bg-orange-100";
  return "text-gray-500 bg-gray-100";
}

export default function DataHistory() {
  const [deleted, setDeleted] = useState([]);
  const [historyData, setHistoryData] = useState({
    anime: [],
    franchises: [],
    series: [],
  });

  const loadDeleted = useCallback(async () => {
    try {
      const res = await fetch("/api/system/deleted", {
        credentials: "include",
      });
      if (res.ok) setDeleted(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const [aRes, fRes, sRes] = await Promise.all([
        fetch("/api/anime/", { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
      ]);
      const anime = aRes.ok ? await aRes.json() : [];
      const franchises = fRes.ok ? await fRes.json() : [];
      const series = sRes.ok ? await sRes.json() : [];
      setHistoryData({ anime, franchises, series });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadDeleted();
    loadHistory();
  }, [loadDeleted, loadHistory]);

  const modFranchise = [...historyData.franchises]
    .filter((f) => f.updated_at)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 15);

  const addFranchise = [...historyData.franchises]
    .filter((f) => f.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 15);

  const modAnime = [...historyData.anime]
    .filter((a) => a.updated_at)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 15);

  const addedEntries = [
    ...historyData.series.map((s) => ({
      ...s,
      __type: "Series",
      __name: getTitle(s, "series"),
      __link: `/series/${s.system_id}`,
    })),
    ...historyData.anime.map((a) => ({
      ...a,
      __type: "Anime",
      __name: getTitle(a, "anime"),
      __link: `/anime/${a.system_id}`,
    })),
  ]
    .filter((i) => i.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 15);

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Data History
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Recent additions, modifications, and deletions across the database.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/system"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition shadow-sm flex items-center"
          >
            <i className="fas fa-cog mr-2 text-gray-500"></i> Control Center
          </Link>
          <Link
            to="/add"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-plus mr-2 text-emerald-500"></i> New Entry
          </Link>
        </div>
      </div>

      {/* Database Record History */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Database Record History
          </h2>
          <button
            onClick={() => {
              loadHistory();
              loadDeleted();
            }}
            className="text-gray-400 hover:text-brand transition text-sm font-bold"
          >
            <i className="fas fa-redo mr-1"></i> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Modified Franchise */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="bg-purple-50/50 border-b border-purple-100 px-5 py-3 font-bold text-purple-900">
              <i className="fas fa-sitemap mr-2 text-purple-500"></i> Modified
              Franchise
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-50">
                  {modFranchise.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-6 text-gray-400 italic"
                      >
                        No modified franchises
                      </td>
                    </tr>
                  )}
                  {modFranchise.map((f, i) => (
                    <tr
                      key={i}
                      className="hover:bg-purple-50/30 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/franchise/${f.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDate(f.updated_at)}
                      </td>
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                        <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {f.franchise_type || "-"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[250px]"
                        title={getTitle(f, "franchise")}
                      >
                        {getTitle(f, "franchise")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Added Franchise */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="bg-emerald-50/50 border-b border-emerald-100 px-5 py-3 font-bold text-emerald-900">
              <i className="fas fa-plus-circle mr-2 text-emerald-500"></i> Added
              Franchise
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-50">
                  {addFranchise.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-6 text-gray-400 italic"
                      >
                        No recently added franchises
                      </td>
                    </tr>
                  )}
                  {addFranchise.map((f, i) => (
                    <tr
                      key={i}
                      className="hover:bg-emerald-50/30 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/franchise/${f.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDate(f.created_at)}
                      </td>
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                        <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {f.franchise_type || "-"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[250px]"
                        title={getTitle(f, "franchise")}
                      >
                        {getTitle(f, "franchise")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modified Anime */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="bg-blue-50/50 border-b border-blue-100 px-5 py-3 font-bold text-blue-900">
              <i className="fas fa-tv mr-2 text-blue-500"></i> Modified Anime
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-50">
                  {modAnime.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-gray-400 italic"
                      >
                        No modified anime
                      </td>
                    </tr>
                  )}
                  {modAnime.map((a, i) => (
                    <tr
                      key={i}
                      className="hover:bg-blue-50/30 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/anime/${a.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDate(a.updated_at)}
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]"
                        title={getTitle(a, "anime")}
                      >
                        {getTitle(a, "anime")}
                      </td>
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                        <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {a.airing_type || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 inline-flex text-[9px] leading-4 font-bold rounded-full ${airingBadgeCls(a.airing_status)}`}
                        >
                          {a.airing_status || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap text-xs font-medium">
                        {a.watching_status || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Added Entry */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="bg-indigo-50/50 border-b border-indigo-100 px-5 py-3 font-bold text-indigo-900">
              <i className="fas fa-star mr-2 text-indigo-500"></i> Added Entry
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-50">
                  {addedEntries.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-gray-400 italic"
                      >
                        No recently added entries
                      </td>
                    </tr>
                  )}
                  {addedEntries.map((item, i) => {
                    const badgeCls =
                      item.__type === "Anime"
                        ? "bg-blue-50 text-blue-600 border-blue-200"
                        : "bg-indigo-50 text-indigo-600 border-indigo-200";
                    return (
                      <tr
                        key={i}
                        className="hover:bg-indigo-50/30 transition cursor-pointer"
                        onClick={() => (window.location.href = item.__link)}
                      >
                        <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badgeCls}`}
                          >
                            {item.__type}
                          </span>
                        </td>
                        <td
                          className="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]"
                          title={item.__name}
                        >
                          {item.__name}
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                          {item.__type === "Anime" ? (
                            <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                              {item.airing_type || "-"}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                          {item.season_part || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recently Deleted Records */}
        <DeletedTable records={deleted} onRefresh={loadDeleted} />
      </div>
    </div>
  );
}
