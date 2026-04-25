import { useState, useCallback } from "react";
import { Link } from "react-router-dom";

function RemarksSection({ results, loading, onRefresh }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Anime With Remarks
          </h2>
          {results !== null && (
            <p className="text-xs text-gray-500 mt-0.5">
              {results.length === 0
                ? "No anime entries have a remark."
                : `${results.length} entr${results.length !== 1 ? "ies" : "y"} with a remark.`}
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
      ) : results.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center py-16 text-gray-400">
          <div className="text-center">
            <i className="fas fa-check-circle text-3xl block mb-3 text-emerald-400"></i>
            <p className="font-bold">No remarks found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-white">
                <tr>
                  <th className="px-5 py-3 whitespace-nowrap">Name (CN)</th>
                  <th className="px-5 py-3 whitespace-nowrap">Name (EN)</th>
                  <th className="px-5 py-3 whitespace-nowrap">Type</th>
                  <th className="px-5 py-3 whitespace-nowrap">Watching</th>
                  <th className="px-5 py-3">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((a, i) => (
                  <tr
                    key={i}
                    className="hover:bg-amber-50/40 transition cursor-pointer"
                    onClick={() =>
                      (window.location.href = `/anime/${a.system_id}`)
                    }
                  >
                    <td
                      className="px-5 py-3 font-bold text-gray-800 max-w-[180px] truncate whitespace-nowrap"
                      title={a.anime_name_cn}
                    >
                      {a.anime_name_cn || "—"}
                    </td>
                    <td
                      className="px-5 py-3 text-gray-600 max-w-[180px] truncate whitespace-nowrap text-xs"
                      title={a.anime_name_en}
                    >
                      {a.anime_name_en || "—"}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                        {a.airing_type || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-500">
                      {a.watching_status || "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-700 text-xs max-w-[400px]">
                      {a.remark}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
