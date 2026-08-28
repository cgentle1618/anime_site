// Frontend: page component file for ReviewQueue.
import { useState, useCallback } from "react";
import { Link } from "react-router-dom";

function RemarksSection({ results, loading, onRefresh }) {
  const [tab, setTab] = useState("anime");

  const tabs = results
    ? [
        { key: "anime", label: "Anime", entries: results.anime },
        {
          key: "anime_movie",
          label: "Anime Movie",
          entries: results.anime_movie,
        },
        { key: "movie", label: "Movie", entries: results.movie },
        { key: "tv_show", label: "TV Show", entries: results.tv_show },
        { key: "cartoon", label: "Cartoon", entries: results.cartoon },
        { key: "manga", label: "Manga", entries: results.manga },
        { key: "novel", label: "Novel", entries: results.novel },
        // `|| []` on this one alone: comic joined the remarks payload after
        // the others, so a response from a backend that predates it would
        // otherwise crash the reduce below on an undefined.
        { key: "comic", label: "Comic", entries: results.comic || [] },
      ]
    : [];

  const totalEntries = tabs.reduce((s, t) => s + t.entries.length, 0);
  const activeTab = tabs.find((t) => t.key === tab);

  const colClass = "px-5 py-3 whitespace-nowrap";
  const cellClass = "px-5 py-3 whitespace-nowrap text-xs text-gray-500";

  function renderTable() {
    if (!activeTab || activeTab.entries.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          <i className="fas fa-check-circle text-2xl text-emerald-400 block mb-2"></i>
          <p className="font-bold text-sm">No remarks in this category</p>
        </div>
      );
    }

    const entries = activeTab.entries;

    if (tab === "anime") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Type</th>
              <th className={colClass}>Watching</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() => (window.location.href = `/anime/${e.system_id}`)}
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.anime_name_cn}
                >
                  {e.anime_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.anime_name_en}
                >
                  {e.anime_name_en || "—"}
                </td>
                <td className={cellClass}>
                  <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                    {e.airing_type || "—"}
                  </span>
                </td>
                <td className={cellClass}>{e.watching_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "anime_movie") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Watching</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() =>
                  (window.location.href = `/anime-movie/${e.system_id}`)
                }
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.anime_movie_name_cn}
                >
                  {e.anime_movie_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.anime_movie_name_en}
                >
                  {e.anime_movie_name_en || "—"}
                </td>
                <td className={cellClass}>{e.watching_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "movie") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Release Date</th>
              <th className={colClass}>Watching</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() => (window.location.href = `/movie/${e.system_id}`)}
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.movie_name_cn}
                >
                  {e.movie_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.movie_name_en}
                >
                  {e.movie_name_en || "—"}
                </td>
                <td className={cellClass}>{e.release_date_usa || "—"}</td>
                <td className={cellClass}>{e.watching_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "tv_show") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Season</th>
              <th className={colClass}>Watching</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() => (window.location.href = `/tv/${e.system_id}`)}
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.tv_name_cn}
                >
                  {e.tv_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.tv_name_en}
                >
                  {e.tv_name_en || "—"}
                </td>
                <td className={cellClass}>{e.season_part || "—"}</td>
                <td className={cellClass}>{e.watching_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "cartoon") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Type</th>
              <th className={colClass}>Watching</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() =>
                  (window.location.href = `/cartoon/${e.system_id}`)
                }
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.cartoon_name_cn}
                >
                  {e.cartoon_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.cartoon_name_en}
                >
                  {e.cartoon_name_en || "—"}
                </td>
                <td className={cellClass}>
                  <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                    {e.airing_type || "—"}
                  </span>
                </td>
                <td className={cellClass}>{e.watching_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "manga") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Is Main</th>
              <th className={colClass}>Reading</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() => (window.location.href = `/manga/${e.system_id}`)}
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.manga_name_cn}
                >
                  {e.manga_name_cn || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.manga_name_en}
                >
                  {e.manga_name_en || "—"}
                </td>
                <td className={cellClass}>{e.is_main || "—"}</td>
                <td className={cellClass}>{e.reading_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === "comic") {
      return (
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
            <tr>
              {/* EN leads: comic's display name falls back EN -> CN -> Alt,
                  the reverse of every other tab here. */}
              <th className={colClass}>Name (EN)</th>
              <th className={colClass}>Name (CN)</th>
              <th className={colClass}>Volume</th>
              <th className={colClass}>Reading</th>
              <th className="px-5 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e, i) => (
              <tr
                key={i}
                className="hover:bg-amber-50/40 transition cursor-pointer"
                onClick={() => (window.location.href = `/comic/${e.system_id}`)}
              >
                <td
                  className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                  title={e.comic_name_en}
                >
                  {e.comic_name_en || "—"}
                </td>
                <td
                  className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                  title={e.comic_name_cn}
                >
                  {e.comic_name_cn || "—"}
                </td>
                <td className={cellClass}>{e.volume_label || "—"}</td>
                <td className={cellClass}>{e.reading_status || "—"}</td>
                <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                  {e.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // novel
    return (
      <table className="w-full text-sm text-left">
        <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
          <tr>
            <th className={colClass}>Name (CN)</th>
            <th className={colClass}>Name (EN)</th>
            <th className={colClass}>Is Main</th>
            <th className={colClass}>Reading</th>
            <th className="px-5 py-3">Remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {entries.map((e, i) => (
            <tr
              key={i}
              className="hover:bg-amber-50/40 transition cursor-pointer"
              onClick={() => (window.location.href = `/novel/${e.system_id}`)}
            >
              <td
                className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                title={e.novel_name_cn}
              >
                {e.novel_name_cn || "—"}
              </td>
              <td
                className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                title={e.novel_name_en}
              >
                {e.novel_name_en || "—"}
              </td>
              <td className={cellClass}>{e.is_main || "—"}</td>
              <td className={cellClass}>{e.reading_status || "—"}</td>
              <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                {e.remark}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Entries With Remarks
          </h2>
          {results !== null && (
            <p className="text-xs text-gray-500 mt-0.5">
              {totalEntries === 0
                ? "No entries have a remark."
                : `${totalEntries} entr${totalEntries !== 1 ? "ies" : "y"} with a remark.`}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm"
        >
          {loading ? (
            <i className="fas fa-circle-notch fa-spin"></i>
          ) : (
            <i className="fas fa-comment-alt"></i>
          )}
          {loading ? "Loading…" : results === null ? "Find Remarks" : "Refresh"}
        </button>
      </div>

      {results === null ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center py-16 text-gray-400">
          <div className="text-center">
            <i className="fas fa-comment-alt text-3xl block mb-3 text-amber-300"></i>
            <p className="font-bold">Click "Find Remarks" to load</p>
          </div>
        </div>
      ) : totalEntries === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center py-16 text-gray-400">
          <div className="text-center">
            <i className="fas fa-check-circle text-3xl block mb-3 text-emerald-400"></i>
            <p className="font-bold">No remarks found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-3 gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-black rounded-t-lg transition border-b-2 -mb-px ${
                  tab === t.key
                    ? "border-amber-500 text-amber-700 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {t.label}
                {t.entries.length > 0 && (
                  <span className="ml-1.5 bg-amber-100 text-amber-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {t.entries.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            {renderTable()}
          </div>
        </div>
      )}
    </div>
  );
}

function DuplicatesSection({ results, loading, onRefresh }) {
  const [tab, setTab] = useState("franchise");

  const tabs = results
    ? [
        { key: "franchise", label: "Franchise", groups: results.franchise },
        { key: "series", label: "Series", groups: results.series },
        { key: "anime", label: "Anime", groups: results.anime },
        {
          key: "anime_movie",
          label: "Anime Movie",
          groups: results.anime_movie,
        },
        { key: "movie", label: "Movie", groups: results.movie },
        { key: "tv_show", label: "TV Show", groups: results.tv_show },
        { key: "cartoon", label: "Cartoon", groups: results.cartoon },
        { key: "manga", label: "Manga", groups: results.manga },
        { key: "novel", label: "Novel", groups: results.novel },
        {
          key: "system_options",
          label: "Sys. Options",
          groups: results.system_options,
        },
      ]
    : [];

  const totalGroups = tabs.reduce((s, t) => s + t.groups.length, 0);
  const activeTab = tabs.find((t) => t.key === tab);

  function renderGroup(group, idx) {
    if (tab === "franchise") {
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded uppercase">
              {group[0].franchise_type || "—"}
            </span>
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1">EN Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((f, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {f.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {f.franchise_name_cn || "—"}
                  </td>
                  <td className="py-1">{f.franchise_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "series") {
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {group[0].franchise_id?.slice(0, 8)}…
            </span>
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1 pr-3">EN Name</th>
                <th className="text-left pb-1">Alt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((s, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {s.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {s.series_name_cn || "—"}
                  </td>
                  <td className="py-1 pr-3">{s.series_name_en || "—"}</td>
                  <td className="py-1 text-gray-400">
                    {s.series_name_alt || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "anime") {
      const a0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
              {a0.airing_type || "—"}
            </span>
            {a0.season_part && (
              <span className="text-[10px] text-gray-600">
                {a0.season_part}
              </span>
            )}
            {a0.ep_special != null && (
              <span className="text-[10px] text-gray-500">
                Ep.Special: {a0.ep_special}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1">EN Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((a, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {a.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {a.anime_name_cn || "—"}
                  </td>
                  <td className="py-1">{a.anime_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "anime_movie") {
      const a0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {a0.franchise_id?.slice(0, 8)}…
            </span>
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1">EN Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((m, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {m.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {m.anime_movie_name_cn || "—"}
                  </td>
                  <td className="py-1">{m.anime_movie_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "movie") {
      const m0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {m0.franchise_id?.slice(0, 8)}…
            </span>
            {m0.series_id && (
              <span className="text-[10px] font-mono text-gray-400">
                Series: {m0.series_id.slice(0, 8)}…
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1 pr-3">EN Name</th>
                <th className="text-left pb-1">Alt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((m, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {m.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {m.movie_name_cn || "—"}
                  </td>
                  <td className="py-1 pr-3">{m.movie_name_en || "—"}</td>
                  <td className="py-1 text-gray-400">
                    {m.movie_name_alt || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "tv_show") {
      const t0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {t0.franchise_id?.slice(0, 8)}…
            </span>
            {t0.series_id && (
              <span className="text-[10px] font-mono text-gray-400">
                Series: {t0.series_id.slice(0, 8)}…
              </span>
            )}
            {t0.season_part && (
              <span className="text-[10px] text-gray-600">
                {t0.season_part}
              </span>
            )}
            {t0.is_main != null && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
                {t0.is_main ? "Main" : "Side"}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1 pr-3">EN Name</th>
                <th className="text-left pb-1">Alt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((t, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {t.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">{t.tv_name_cn || "—"}</td>
                  <td className="py-1 pr-3">{t.tv_name_en || "—"}</td>
                  <td className="py-1 text-gray-400">{t.tv_name_alt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "cartoon") {
      const c0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {c0.franchise_id?.slice(0, 8)}…
            </span>
            {c0.series_id && (
              <span className="text-[10px] font-mono text-gray-400">
                Series: {c0.series_id.slice(0, 8)}…
              </span>
            )}
            {c0.season_part && (
              <span className="text-[10px] text-gray-600">
                {c0.season_part}
              </span>
            )}
            {c0.is_main != null && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
                {c0.is_main ? "Main" : "Side"}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1 pr-3">EN Name</th>
                <th className="text-left pb-1">Alt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((c, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {c.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {c.cartoon_name_cn || "—"}
                  </td>
                  <td className="py-1 pr-3">{c.cartoon_name_en || "—"}</td>
                  <td className="py-1 text-gray-400">
                    {c.cartoon_name_alt || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "manga") {
      const mg0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {mg0.franchise_id?.slice(0, 8)}…
            </span>
            {mg0.series_id && (
              <span className="text-[10px] font-mono text-gray-400">
                Series: {mg0.series_id.slice(0, 8)}…
              </span>
            )}
            {mg0.is_main != null && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
                {mg0.is_main ? "Main" : "Side"}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1">EN Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((mg, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {mg.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {mg.manga_name_cn || "—"}
                  </td>
                  <td className="py-1">{mg.manga_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "novel") {
      const nv0 = group[0];
      return (
        <div
          key={idx}
          className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {nv0.franchise_id?.slice(0, 8)}…
            </span>
            {nv0.series_id && (
              <span className="text-[10px] font-mono text-gray-400">
                Series: {nv0.series_id.slice(0, 8)}…
              </span>
            )}
            {nv0.is_main != null && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
                {nv0.is_main ? "Main" : "Side"}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {group.length} entries
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left pb-1 pr-3">ID</th>
                <th className="text-left pb-1 pr-3">CN Name</th>
                <th className="text-left pb-1">EN Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {group.map((nv, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">
                    {nv.system_id.slice(0, 8)}…
                  </td>
                  <td className="py-1 pr-3 font-bold">
                    {nv.novel_name_cn || "—"}
                  </td>
                  <td className="py-1">{nv.novel_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div
        key={idx}
        className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {group[0].category}
          </span>
          <span className="text-xs text-gray-500">{group.length} entries</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.map((opt, i) => (
            <span
              key={i}
              className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded font-mono"
            >
              [{opt.id}] {opt.option_value}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Potential Duplicates
          </h2>
          {results !== null && (
            <p className="text-xs text-gray-500 mt-0.5">
              {totalGroups === 0
                ? "No duplicates found across all categories."
                : `${totalGroups} duplicate group${totalGroups !== 1 ? "s" : ""} detected.`}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm"
        >
          {loading ? (
            <i className="fas fa-circle-notch fa-spin"></i>
          ) : (
            <i className="fas fa-clone"></i>
          )}
          {loading
            ? "Loading…"
            : results === null
              ? "Find Duplicates"
              : "Refresh"}
        </button>
      </div>

      {results === null ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center py-16 text-gray-400">
          <div className="text-center">
            <i className="fas fa-clone text-3xl block mb-3 text-orange-300"></i>
            <p className="font-bold">Click "Find Duplicates" to load</p>
          </div>
        </div>
      ) : totalGroups === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center py-16 text-gray-400">
          <div className="text-center">
            <i className="fas fa-check-circle text-3xl block mb-3 text-emerald-400"></i>
            <p className="font-bold">No duplicates found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-3 gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-black rounded-t-lg transition border-b-2 -mb-px ${
                  tab === t.key
                    ? "border-orange-500 text-orange-700 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {t.label}
                {t.groups.length > 0 && (
                  <span className="ml-1.5 bg-orange-100 text-orange-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {t.groups.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-5 overflow-y-auto max-h-[600px]">
            {activeTab && activeTab.groups.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <i className="fas fa-check-circle text-2xl text-emerald-400 block mb-2"></i>
                <p className="font-bold text-sm">
                  No duplicates in this category
                </p>
              </div>
            ) : (
              activeTab &&
              activeTab.groups.map((group, idx) => renderGroup(group, idx))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQueue() {
  const [remarksResults, setRemarksResults] = useState(null);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [duplicatesResults, setDuplicatesResults] = useState(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  const loadRemarks = useCallback(async () => {
    setRemarksLoading(true);
    try {
      const res = await fetch("/api/data-control/check/remarks", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch remarks.");
      setRemarksResults(data);
    } catch {
      /* ignore */
    } finally {
      setRemarksLoading(false);
    }
  }, []);

  const loadDuplicates = useCallback(async () => {
    setDuplicatesLoading(true);
    try {
      const res = await fetch("/api/data-control/check/duplicates", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Failed to check duplicates.");
      setDuplicatesResults(data);
    } catch {
      /* ignore */
    } finally {
      setDuplicatesLoading(false);
    }
  }, []);

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Review Queue
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Anime entries with remarks and potential duplicates that may need
            attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/system"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition shadow-sm flex items-center"
          >
            <i className="fas fa-cog mr-2 text-gray-500"></i> Control Center
          </Link>
        </div>
      </div>

      {/* Section 1: Remarks */}
      <RemarksSection
        results={remarksResults}
        loading={remarksLoading}
        onRefresh={loadRemarks}
      />

      {/* Section 2: Duplicates */}
      <DuplicatesSection
        results={duplicatesResults}
        loading={duplicatesLoading}
        onRefresh={loadDuplicates}
      />
    </div>
  );
}

