// Frontend: page component file for DataHistory.
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
  if (type === "novel")
    return (
      item.novel_name_cn ||
      item.novel_name_en ||
      item.novel_name_roman ||
      item.novel_name_jp ||
      item.novel_name_alt ||
      "Unknown"
    );
  // EN first, unlike every other type above: Western comic runs are known by
  // their English titles.
  if (type === "comic")
    return (
      item.comic_name_en ||
      item.comic_name_cn ||
      item.comic_name_alt ||
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
        <span className="text-text-faint text-xs">Category: {d.category}</span>
      );
    }
    if (d.type === "Franchise" && d.franchise_type) {
      return (
        <span className="text-text-faint text-xs">Type: {d.franchise_type}</span>
      );
    }
    if (["Anime", "TV Show", "Movie", "Cartoon", "Manga", "Novel"].includes(d.type)) {
      return (
        <div className="text-xs text-text-faint space-y-0.5">
          {d.franchise_cn && <div>Franchise: {d.franchise_cn}</div>}
          {d.series_cn && <div>Series: {d.series_cn}</div>}
        </div>
      );
    }
    if (d.type === "Anime Movie" && d.franchise_cn) {
      return (
        <span className="text-text-faint text-xs">
          Franchise: {d.franchise_cn}
        </span>
      );
    }
    if (d.type === "Series" && d.franchise_cn) {
      return (
        <span className="text-text-faint text-xs">
          Franchise: {d.franchise_cn}
        </span>
      );
    }
    return null;
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          Recently deleted records
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearOld}
            className="text-xs font-bold text-danger/70 hover:text-danger transition"
            title="Delete old records, keep 5 most recent"
          >
            <i className="fas fa-trash mr-1"></i>Clear Old
          </button>
          <button
            onClick={onRefresh}
            className="text-text-faint hover:text-danger transition"
          >
            <i className="fas fa-redo"></i>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-text-faint uppercase tracking-wider bg-surface sticky top-0 border-b border-border shadow-sm z-10">
            <tr>
              <th className="px-5 py-2.5 whitespace-nowrap">Time</th>
              <th className="px-5 py-2.5">Type</th>
              <th className="px-5 py-2.5">Name (CN)</th>
              <th className="px-5 py-2.5">Name (EN)</th>
              <th className="px-5 py-2.5">Additional Info</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slice.map((d, i) => (
              <tr key={i} className="hover:bg-danger/10 transition group">
                <td className="px-5 py-2.5 text-text-faint whitespace-nowrap text-xs">
                  {formatDate(d.timestamp)}
                </td>
                <td className="px-5 py-2.5">
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-danger/10 text-danger border-danger/40">
                    {d.type}
                  </span>
                </td>
                <td
                  className="px-5 py-2.5 font-bold text-text max-w-[160px] truncate"
                  title={d.name_cn}
                >
                  {d.name_cn || "-"}
                </td>
                <td
                  className="px-5 py-2.5 text-text-muted max-w-[160px] truncate text-xs"
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
                    className="opacity-0 group-hover:opacity-100 text-text-faint/60 hover:text-danger transition"
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
                  className="text-center py-6 text-text-faint italic"
                >
                  No deleted entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-surface-2 px-6 py-3 border-t border-border flex items-center justify-between shrink-0">
        <div className="text-xs font-bold text-text-faint">
          Total Deleted: <span className="text-text">{records.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 text-text-faint hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <div className="text-xs font-black text-text-muted uppercase tracking-tighter">
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 text-text-faint hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

function airingBadgeCls(status) {
  if (status === "Airing") return "text-text border border-border-strong";
  if (status === "Finished Airing") return "text-text-muted border border-border-strong";
  if (status === "Not Yet Aired") return "text-text-muted border border-border-strong";
  if (status === "Canceled") return "text-danger border border-danger";
  if (status === "Rumored") return "text-text-faint border border-border";
  return "text-text-faint border border-border";
}

export default function DataHistory() {
  const [deleted, setDeleted] = useState([]);
  const [historyData, setHistoryData] = useState({
    anime: [],
    franchises: [],
    series: [],
    novels: [],
    comics: [],
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
      const [aRes, fRes, sRes, nvRes, cmRes] = await Promise.all([
        fetch("/api/anime/", { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
        fetch("/api/novel/", { credentials: "include" }),
        fetch("/api/comic/", { credentials: "include" }),
      ]);
      const anime = aRes.ok ? await aRes.json() : [];
      const franchises = fRes.ok ? await fRes.json() : [];
      const series = sRes.ok ? await sRes.json() : [];
      const novels = nvRes.ok ? await nvRes.json() : [];
      const comics = cmRes.ok ? await cmRes.json() : [];
      setHistoryData({ anime, franchises, series, novels, comics });
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
    ...(historyData.novels || []).map((n) => ({
      ...n,
      __type: "Novel",
      __name: getTitle(n, "novel"),
      __link: `/novel/${n.system_id}`,
    })),
    ...(historyData.comics || []).map((c) => ({
      ...c,
      __type: "Comic",
      __name: getTitle(c, "comic"),
      __link: `/comic/${c.system_id}`,
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
          <h1 className="text-3xl font-black text-text tracking-tight">
            Data History
          </h1>
          <p className="text-sm text-text-faint mt-1">
            Recent additions, modifications, and deletions across the database.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/system"
            className="bg-surface border border-border-strong text-text-muted px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-surface-2 hover:text-text hover:border-border-strong transition shadow-sm flex items-center"
          >
            <i className="fas fa-cog mr-2 text-text-faint"></i> Control Center
          </Link>
        </div>
      </div>

      {/* Database Record History */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-border pb-2">
          <h2 className="text-2xl font-black text-text tracking-tight">
            Database Record History
          </h2>
          <button
            onClick={() => {
              loadHistory();
              loadDeleted();
            }}
            className="text-text-faint hover:text-brand transition text-sm font-bold"
          >
            <i className="fas fa-redo mr-1"></i> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Modified Franchise */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="border-b border-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Modified
              Franchise
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-border">
                  {modFranchise.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-6 text-text-faint italic"
                      >
                        No modified franchises
                      </td>
                    </tr>
                  )}
                  {modFranchise.map((f, i) => (
                    <tr
                      key={i}
                      className="hover:bg-surface-2 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/franchise/${f.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-text-faint whitespace-nowrap">
                        {formatDate(f.updated_at)}
                      </td>
                      <td className="px-5 py-2.5 text-text-muted whitespace-nowrap">
                        <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
                          {f.franchise_type || "-"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-text truncate max-w-[250px]"
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
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="border-b border-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Added
              Franchise
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-border">
                  {addFranchise.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-6 text-text-faint italic"
                      >
                        No recently added franchises
                      </td>
                    </tr>
                  )}
                  {addFranchise.map((f, i) => (
                    <tr
                      key={i}
                      className="hover:bg-surface-2 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/franchise/${f.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-text-faint whitespace-nowrap">
                        {formatDate(f.created_at)}
                      </td>
                      <td className="px-5 py-2.5 text-text-muted whitespace-nowrap">
                        <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
                          {f.franchise_type || "-"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-text truncate max-w-[250px]"
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
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="border-b border-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Modified Anime
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-border">
                  {modAnime.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-text-faint italic"
                      >
                        No modified anime
                      </td>
                    </tr>
                  )}
                  {modAnime.map((a, i) => (
                    <tr
                      key={i}
                      className="hover:bg-surface-2 transition cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/anime/${a.system_id}`)
                      }
                    >
                      <td className="px-5 py-2.5 text-text-faint whitespace-nowrap">
                        {formatDate(a.updated_at)}
                      </td>
                      <td
                        className="px-5 py-2.5 font-bold text-text truncate max-w-[200px]"
                        title={getTitle(a, "anime")}
                      >
                        {getTitle(a, "anime")}
                      </td>
                      <td className="px-5 py-2.5 text-text-muted whitespace-nowrap">
                        <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
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
                      <td className="px-5 py-2.5 text-text-muted whitespace-nowrap text-xs font-medium">
                        {a.watching_status || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Added Entry */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="border-b border-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Added Entry
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-border">
                  {addedEntries.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-6 text-text-faint italic"
                      >
                        No recently added entries
                      </td>
                    </tr>
                  )}
                  {addedEntries.map((item, i) => {
                    const badgeCls =
                      item.__type === "Anime"
                        ? "text-text-muted border-border-strong"
                        : item.__type === "Novel"
                          ? "text-text-muted border-border-strong"
                          : "text-text-muted border-border-strong";
                    return (
                      <tr
                        key={i}
                        className="hover:bg-surface-2 transition cursor-pointer"
                        onClick={() => (window.location.href = item.__link)}
                      >
                        <td className="px-5 py-2.5 text-text-faint whitespace-nowrap">
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
                          className="px-5 py-2.5 font-bold text-text truncate max-w-[200px]"
                          title={item.__name}
                        >
                          {item.__name}
                        </td>
                        <td className="px-5 py-2.5 text-text-muted whitespace-nowrap">
                          {item.__type === "Anime" ? (
                            <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
                              {item.airing_type || "-"}
                            </span>
                          ) : (
                            <span className="text-text-faint">-</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-text-faint whitespace-nowrap text-xs">
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

