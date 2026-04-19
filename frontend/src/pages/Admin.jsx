import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../hooks/useToast";

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
      item.anime_name_romanji ||
      item.anime_name_jp ||
      item.anime_name_alt ||
      "Unknown"
    );
  if (type === "franchise")
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_romanji ||
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

// Streaming box (Fill or Replace)
function StreamBox({
  color,
  borderColor,
  titleColor,
  statusColor,
  title,
  icon,
  buttons,
  streamRunning,
  onStart,
  onStop,
  status,
}) {
  return (
    <div className={`${color} ${borderColor} rounded-xl p-4 flex flex-col`}>
      <h3 className={`text-sm font-bold ${titleColor} mb-3 flex items-center`}>
        <i className={`fas ${icon} mr-2 ${statusColor}`}></i> {title}
      </h3>
      <div className="space-y-2 mt-auto">
        {!streamRunning &&
          buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={() => onStart(btn.url)}
              className={btn.cls}
            >
              {btn.label}
            </button>
          ))}
        {streamRunning && (
          <button
            onClick={onStop}
            className="w-full bg-red-600 text-white border border-red-700 py-2 rounded-lg text-xs font-bold transition"
          >
            Force Stop
          </button>
        )}
      </div>
      {status && (
        <div
          className={`mt-2 text-[10px] font-bold break-words ${
            status.startsWith("Error") ||
            status.startsWith("Pipeline stopped") ||
            status.startsWith("Stream Error")
              ? "text-red-600"
              : statusColor
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
}

// Simple sync box (Pull or Push)
function SyncBox({
  color,
  borderColor,
  titleColor,
  statusColor,
  title,
  icon,
  children,
}) {
  return (
    <div className={`${color} ${borderColor} rounded-xl p-4 flex flex-col`}>
      <h3 className={`text-sm font-bold ${titleColor} mb-3 flex items-center`}>
        <i className={`fas ${icon} mr-2 ${statusColor}`}></i> {title}
      </h3>
      <div className="space-y-2 mt-auto">{children}</div>
    </div>
  );
}

// Paginated log table
function LogsTable({ logs, onRefresh }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(logs.length / pageSize) || 1;
  const slice = logs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest flex items-center">
          <i className="fas fa-terminal text-brand mr-2"></i> Data Control Log
        </h2>
        <button
          onClick={onRefresh}
          className="text-gray-400 hover:text-brand transition"
        >
          <i className="fas fa-redo"></i>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider bg-white border-b border-gray-100">
            <tr>
              <th className="px-6 py-3">Action</th>
              <th className="px-6 py-3">Trigger</th>
              <th className="px-6 py-3">Time</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Metrics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {slice.map((log, i) => {
              let statusEl;
              if (log.status === "Success") {
                statusEl = (
                  <span className="text-emerald-500 font-bold">
                    <i className="fas fa-check-circle mr-1"></i>Success
                  </span>
                );
              } else if (log.status === "Aborted") {
                statusEl = (
                  <span className="text-amber-500 font-bold">
                    <i className="fas fa-exclamation-triangle mr-1"></i>Aborted
                  </span>
                );
              } else {
                statusEl = (
                  <span
                    className="text-red-500 font-bold"
                    title={log.error_message || "Unknown error"}
                  >
                    <i className="fas fa-times-circle mr-1"></i>Failed
                  </span>
                );
              }
              const triggerCls =
                log.type === "Auto"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700";
              return (
                <tr
                  key={i}
                  className="hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                >
                  <td className="px-6 py-3">
                    <div className="font-bold text-gray-800">
                      {log.action_main || "Unknown"}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {log.action_specific || ""}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${triggerCls}`}
                    >
                      {log.type || "Manual"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(log.timestamp)}
                  </td>
                  <td className="px-6 py-3">{statusEl}</td>
                  <td className="px-6 py-3 font-mono text-xs whitespace-nowrap">
                    <span className="text-emerald-600">
                      +{log.rows_added || 0}
                    </span>{" "}
                    /&nbsp;
                    <span className="text-blue-600">
                      ~{log.rows_updated || 0}
                    </span>{" "}
                    /&nbsp;
                    <span className="text-red-600">
                      -{log.rows_deleted || 0}
                    </span>
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-6 italic text-gray-400"
                >
                  No data control logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
        <div className="text-xs font-bold text-gray-500">
          Total Logs: <span className="text-gray-800">{logs.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 text-gray-400 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <div className="text-xs font-black text-gray-700 uppercase tracking-tighter">
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 text-gray-400 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

// Paginated deleted records table
function DeletedTable({ records }) {
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const totalPages = Math.ceil(records.length / pageSize) || 1;
  const slice = records.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="bg-red-50/50 border-b border-red-100 px-5 py-3 font-bold text-red-900">
        <i className="fas fa-trash-alt mr-2 text-red-500"></i> Recently Deleted
        Records
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider bg-white sticky top-0 border-b border-gray-100 shadow-sm z-10">
            <tr>
              <th className="px-5 py-2.5 whitespace-nowrap">Time</th>
              <th className="px-5 py-2.5">Type</th>
              <th className="px-5 py-2.5 w-1/2">Deleted Entry Name</th>
              <th className="px-5 py-2.5 w-1/2">Context</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {slice.map((d, i) => {
              const { name, context } = getDeletedDisplayData(d);
              return (
                <tr key={i} className="hover:bg-red-50/30 transition">
                  <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                    {formatDate(d.timestamp)}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-red-50 text-red-600 border-red-200">
                      {d.type}
                    </span>
                  </td>
                  <td
                    className="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]"
                    title={name}
                  >
                    {name}
                  </td>
                  <td
                    className="px-5 py-2.5 text-gray-500 text-xs truncate max-w-[150px]"
                    title={context}
                  >
                    {context}
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td
                  colSpan={4}
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

const JIKAN_TYPES = ["TV", "ONA", "OVA", "Movie", "Special"];

function CoverImageModal({ result, onDownload, onClose, downloading }) {
  const [downloadType, setDownloadType] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-900">Cover Image Check</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-lg">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Checked <span className="font-bold text-gray-800">{result.total_checked}</span> entries with a cover image record.
          </p>

          {result.missing_count === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-check-circle text-4xl text-emerald-400 block mb-3"></i>
              <p className="font-bold text-gray-700">All cover images are present.</p>
            </div>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-sm font-bold text-orange-800 mb-2">
                  {result.missing_count} missing cover image{result.missing_count !== 1 ? "s" : ""} detected
                </p>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {result.missing.map((m, i) => (
                    <div key={i} className="text-xs text-orange-700 truncate">
                      <span className="font-mono bg-orange-100 px-1 rounded mr-1">{m.airing_type || "?"}</span>
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Download for entry type
                </label>
                <select
                  value={downloadType}
                  onChange={(e) => setDownloadType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium px-3 py-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">All Jikan Types</option>
                  {JIKAN_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400">
                  Only Jikan-compatible types (TV, ONA, OVA, Movie, Special) can be downloaded. Others will be skipped.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            {result.missing_count === 0 ? "Close" : "Cancel"}
          </button>
          {result.missing_count > 0 && (
            <button
              onClick={() => onDownload(downloadType)}
              disabled={downloading}
              className="px-4 py-2 text-sm font-bold text-white bg-brand hover:opacity-90 rounded-lg transition disabled:opacity-60 flex items-center gap-2"
            >
              {downloading && <i className="fas fa-circle-notch fa-spin"></i>}
              {downloading ? "Downloading..." : "Download"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DuplicatesModal({ results, onClose }) {
  const [tab, setTab] = useState("franchise");

  const tabs = [
    { key: "franchise", label: "Franchise", groups: results.franchise },
    { key: "series", label: "Series", groups: results.series },
    { key: "anime", label: "Anime", groups: results.anime },
    { key: "system_options", label: "Sys. Options", groups: results.system_options },
  ];

  const totalGroups = tabs.reduce((s, t) => s + t.groups.length, 0);
  const activeTab = tabs.find((t) => t.key === tab);

  function renderGroup(group, idx) {
    if (tab === "franchise") {
      return (
        <div key={idx} className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded uppercase">
              {group[0].franchise_type || "—"}
            </span>
            <span className="text-xs text-gray-500">{group.length} entries</span>
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
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">{f.system_id.slice(0, 8)}…</td>
                  <td className="py-1 pr-3 font-bold">{f.franchise_name_cn || "—"}</td>
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
        <div key={idx} className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-gray-400">
              Franchise: {group[0].franchise_id?.slice(0, 8)}…
            </span>
            <span className="text-xs text-gray-500">{group.length} entries</span>
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
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">{s.system_id.slice(0, 8)}…</td>
                  <td className="py-1 pr-3 font-bold">{s.series_name_cn || "—"}</td>
                  <td className="py-1 pr-3">{s.series_name_en || "—"}</td>
                  <td className="py-1 text-gray-400">{s.series_name_alt || "—"}</td>
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
        <div key={idx} className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">
              {a0.airing_type || "—"}
            </span>
            {a0.season_part && <span className="text-[10px] text-gray-600">{a0.season_part}</span>}
            {a0.ep_special != null && (
              <span className="text-[10px] text-gray-500">Ep.Special: {a0.ep_special}</span>
            )}
            <span className="text-xs text-gray-500">{group.length} entries</span>
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
                  <td className="py-1 pr-3 font-mono text-[10px] text-gray-400">{a.system_id.slice(0, 8)}…</td>
                  <td className="py-1 pr-3 font-bold">{a.anime_name_cn || "—"}</td>
                  <td className="py-1">{a.anime_name_en || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // system_options
    return (
      <div key={idx} className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {group[0].category}
          </span>
          <span className="text-xs text-gray-500">{group.length} entries</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.map((opt, i) => (
            <span key={i} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded font-mono">
              [{opt.id}] {opt.option_value}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-black text-gray-900">Duplicate Check Results</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalGroups === 0
                ? "No duplicates found across all categories."
                : `${totalGroups} duplicate group${totalGroups !== 1 ? "s" : ""} detected.`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-lg">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex border-b border-gray-200 px-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition ${
                tab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {t.groups.length > 0 && (
                <span className="ml-1.5 bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full text-[10px]">
                  {t.groups.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {activeTab.groups.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-check-circle text-3xl text-emerald-400 block mb-3"></i>
              <p className="font-bold">No duplicates found</p>
            </div>
          ) : (
            activeTab.groups.map((group, idx) => renderGroup(group, idx))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { showToast } = useToast();

  // Season config
  const [currentSeason, setCurrentSeason] = useState("Loading...");
  const [seasonCode, setSeasonCode] = useState("WIN");
  const [seasonYear, setSeasonYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [settingSeason, setSettingSeason] = useState(false);

  // Data
  const [logs, setLogs] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [historyData, setHistoryData] = useState({
    anime: [],
    franchises: [],
    series: [],
  });

  // Streaming state (global: only one stream at a time)
  const abortRef = useRef(null);
  const [streamRunning, setStreamRunning] = useState(null); // 'fill' | 'replace' | null
  const [fillStatus, setFillStatus] = useState("");
  const [replaceStatus, setReplaceStatus] = useState("");

  // Pull state
  const [pullTab, setPullTab] = useState("Anime");
  const [pullLoading, setPullLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Calculate & Fix state
  const [calcLoading, setCalcLoading] = useState({});
  const [duplicateResults, setDuplicateResults] = useState(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [coverCheckResult, setCoverCheckResult] = useState(null);
  const [coverCheckOpen, setCoverCheckOpen] = useState(false);
  const [coverDownloading, setCoverDownloading] = useState(false);

  const loadSeason = useCallback(async () => {
    try {
      const res = await fetch("/api/system/config/current_season", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentSeason(data.current_season || "Not Set");
      }
    } catch {
      setCurrentSeason("Not Set");
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/system/logs", { credentials: "include" });
      if (res.ok) setLogs(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

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
    loadSeason();
    loadLogs();
    loadDeleted();
    loadHistory();
  }, [loadSeason, loadLogs, loadDeleted, loadHistory]);

  async function handleSetSeason() {
    if (!seasonCode || !seasonYear) {
      showToast("warning", "Please select a season and type a year.");
      return;
    }
    setSettingSeason(true);
    try {
      const val = `${seasonCode} ${seasonYear}`;
      const res = await fetch("/api/system/config/current_season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_season: val }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update season");
      setCurrentSeason(val);
      showToast("success", "Current Season successfully updated!");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setSettingSeason(false);
    }
  }

  async function startStream(url, box) {
    if (streamRunning) {
      showToast(
        "warning",
        "A pipeline is already running. Please stop it first.",
      );
      return;
    }
    setStreamRunning(box);
    const setStatus = box === "fill" ? setFillStatus : setReplaceStatus;
    setStatus("Initiating connection...");
    abortRef.current = new AbortController();

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: abortRef.current.signal,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start stream");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          if (part.startsWith("data: ")) {
            try {
              const data = JSON.parse(part.slice(6));
              if (data.status === "processing")
                setStatus(
                  `[${data.processed}/${data.total}] Processing: ${data.current_entry}`,
                );
              else if (data.status === "success") {
                setStatus(`${data.message} (${data.processed}/${data.total})`);
                showToast("success", "Pipeline streaming completed.");
                loadLogs();
                loadHistory();
              } else if (data.status === "error") {
                setStatus(`Error: ${data.message}`);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
    } catch (e) {
      const setStatus = box === "fill" ? setFillStatus : setReplaceStatus;
      if (e.name === "AbortError") setStatus("Pipeline stopped forcefully.");
      else {
        setStatus(`Stream Error: ${e.message}`);
        showToast("error", `Stream Error: ${e.message}`);
      }
    } finally {
      setStreamRunning(null);
      abortRef.current = null;
    }
  }

  function stopStream() {
    abortRef.current?.abort();
  }

  async function executeSync(url, setLoading) {
    setLoading(true);
    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed.");
      showToast("success", "Pipeline execution successful.");
      loadLogs();
      loadHistory();
    } catch (e) {
      showToast("error", `Pipeline Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runCheckCoverImage() {
    setCalcLoading((prev) => ({ ...prev, checkcoverimage: true }));
    try {
      const res = await fetch("/api/data-control/calculate/check-cover-image", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Check failed.");
      setCoverCheckResult(data);
      setCoverCheckOpen(true);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCalcLoading((prev) => ({ ...prev, checkcoverimage: false }));
    }
  }

  async function handleDownloadMissingCovers(entryType) {
    setCoverDownloading(true);
    try {
      const url = entryType
        ? `/api/data-control/calculate/download-missing-covers?entry_type=${encodeURIComponent(entryType)}`
        : "/api/data-control/calculate/download-missing-covers";
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Download failed.");
      showToast("success", data.message || "Download complete.");
      setCoverCheckOpen(false);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCoverDownloading(false);
    }
  }

  async function runFindDuplicates() {
    setCalcLoading((prev) => ({ ...prev, duplicates: true }));
    try {
      const res = await fetch("/api/data-control/check/duplicates", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to check duplicates.");
      setDuplicateResults(data);
      setDuplicateOpen(true);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCalcLoading((prev) => ({ ...prev, duplicates: false }));
    }
  }

  async function runCalc(key, url) {
    setCalcLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed.");
      showToast("success", data.message || "Calculation complete.");
      loadLogs();
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCalcLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Derived history data (sorted like admin.js)
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

  function airingBadgeCls(status) {
    if (status === "Airing") return "text-green-700 bg-green-100";
    if (status === "Finished Airing") return "text-blue-700 bg-blue-100";
    if (status === "Not Yet Aired") return "text-orange-700 bg-orange-100";
    return "text-gray-500 bg-gray-100";
  }

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {coverCheckOpen && coverCheckResult && (
        <CoverImageModal
          result={coverCheckResult}
          onDownload={handleDownloadMissingCovers}
          onClose={() => setCoverCheckOpen(false)}
          downloading={coverDownloading}
        />
      )}
      {duplicateOpen && duplicateResults && (
        <DuplicatesModal results={duplicateResults} onClose={() => setDuplicateOpen(false)} />
      )}
      {/* 1. Header & Entry Modification Nav */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
            System Administration
          </h1>
          <p className="text-gray-500 font-medium">
            Master control center for data actions, configurations, and history
            logs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/add"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-plus mr-2 text-emerald-500"></i> New Entry
          </Link>
          <Link
            to="/modify"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-edit mr-2 text-blue-500"></i> Edit Entry
          </Link>
          <Link
            to="/delete"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-trash-alt mr-2 text-red-500"></i> Delete Entry
          </Link>
        </div>
      </div>

      {/* 2. Top Grid: Season Config & Data Control */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Current Season Block */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest mb-4 flex items-center border-b border-gray-100 pb-2">
            <i className="fas fa-calendar-alt text-brand mr-2"></i> Current
            Season
          </h2>
          <div className="text-center mb-6">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Active Season Config
            </div>
            <div className="text-3xl font-black text-brand tracking-tight">
              {currentSeason}
            </div>
          </div>
          <div className="space-y-3 mt-auto">
            <select
              value={seasonCode}
              onChange={(e) => setSeasonCode(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold focus:ring-brand focus:border-brand py-2.5"
            >
              <option value="WIN">Winter (WIN)</option>
              <option value="SPR">Spring (SPR)</option>
              <option value="SUM">Summer (SUM)</option>
              <option value="FAL">Fall (FAL)</option>
            </select>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(e.target.value)}
              placeholder="YYYY (e.g. 2026)"
              className="w-full bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono focus:ring-brand focus:border-brand py-2.5 px-3"
            />
            <button
              onClick={handleSetSeason}
              disabled={settingSeason}
              className="w-full bg-gray-900 hover:bg-black text-white rounded-lg py-2.5 text-sm font-bold transition shadow-sm disabled:opacity-60"
            >
              {settingSeason ? "Processing..." : "Confirm Set"}
            </button>
          </div>
        </div>

        {/* Data Control Action Buttons */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 xl:col-span-2 flex flex-col">
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest mb-4 flex items-center border-b border-gray-100 pb-2">
            <i className="fas fa-database text-brand mr-2"></i> Data Control
            Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            {/* Fill */}
            <StreamBox
              color="bg-blue-50/50"
              borderColor="border border-blue-100"
              titleColor="text-blue-800"
              statusColor="text-blue-800"
              title="Fill"
              icon="fa-magic"
              streamRunning={streamRunning === "fill"}
              onStart={(url) => startStream(url, "fill")}
              onStop={stopStream}
              status={fillStatus}
              buttons={[
                {
                  label: "Fill All",
                  url: "/api/data-control/fill/all",
                  cls: "w-full bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 py-2 rounded-lg text-xs font-bold shadow-sm transition",
                },
                {
                  label: "Fill Anime",
                  url: "/api/data-control/fill/anime",
                  cls: "w-full bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 py-2 rounded-lg text-xs font-bold shadow-sm transition",
                },
              ]}
            />

            {/* Replace */}
            <StreamBox
              color="bg-amber-50/50"
              borderColor="border border-amber-100"
              titleColor="text-amber-800"
              statusColor="text-amber-800"
              title="Replace"
              icon="fa-bolt"
              streamRunning={streamRunning === "replace"}
              onStart={(url) => startStream(url, "replace")}
              onStop={stopStream}
              status={replaceStatus}
              buttons={[
                {
                  label: "Replace All",
                  url: "/api/data-control/replace/all",
                  cls: "w-full bg-white hover:bg-amber-50 border border-amber-200 text-amber-700 py-2 rounded-lg text-xs font-bold shadow-sm transition",
                },
                {
                  label: "Replace Anime",
                  url: "/api/data-control/replace/anime",
                  cls: "w-full bg-white hover:bg-amber-50 border border-amber-200 text-amber-700 py-2 rounded-lg text-xs font-bold shadow-sm transition",
                },
              ]}
            />

            {/* Pull */}
            <SyncBox
              color="bg-emerald-50/50"
              borderColor="border border-emerald-100"
              titleColor="text-emerald-800"
              statusColor="text-emerald-500"
              title="Pull"
              icon="fa-cloud-download-alt"
            >
              <button
                onClick={() =>
                  executeSync("/api/data-control/pull", setPullLoading)
                }
                disabled={pullLoading}
                className="w-full bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 py-2 rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-60"
              >
                {pullLoading ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  "Pull All"
                )}
              </button>
              <div className="flex gap-2">
                <select
                  value={pullTab}
                  onChange={(e) => setPullTab(e.target.value)}
                  className="w-full bg-white border border-emerald-200 text-emerald-800 rounded-lg text-[10px] font-bold px-1 py-2"
                >
                  <option value="Anime">Anime</option>
                  <option value="Franchise">Franchise</option>
                  <option value="Series">Series</option>
                  <option value="System Options">Options</option>
                </select>
                <button
                  onClick={() =>
                    executeSync(
                      `/api/data-control/pull/${pullTab}`,
                      setPullLoading,
                    )
                  }
                  disabled={pullLoading}
                  className="bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 rounded-lg text-[10px] font-bold disabled:opacity-60"
                >
                  <i className="fas fa-play"></i>
                </button>
              </div>
            </SyncBox>

            {/* Push */}
            <SyncBox
              color="bg-purple-50/50"
              borderColor="border border-purple-100"
              titleColor="text-purple-800"
              statusColor="text-purple-500"
              title="Push"
              icon="fa-cloud-upload-alt"
            >
              <button
                onClick={() =>
                  executeSync("/api/data-control/backup", setPushLoading)
                }
                disabled={pushLoading}
                className="w-full bg-white hover:bg-purple-50 border border-purple-200 text-purple-700 py-2 rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-60"
              >
                {pushLoading ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  "Push All Data"
                )}
              </button>
            </SyncBox>
          </div>
        </div>
      </div>

      {/* 3. Calculate & Fix */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest mb-4 flex items-center border-b border-gray-100 pb-2">
          <i className="fas fa-calculator text-brand mr-2"></i> Calculate &amp;
          Fix
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => runCalc("calculateall", "/api/data-control/calculate/all")}
            disabled={!!calcLoading.calculateall}
            className="flex flex-col items-center gap-2 p-3 bg-brand/5 hover:bg-brand/10 border border-brand/30 hover:border-brand/50 rounded-xl text-xs font-bold text-brand transition disabled:opacity-60"
          >
            <i className="fas fa-calculator text-lg"></i>
            {calcLoading.calculateall ? <i className="fas fa-circle-notch fa-spin"></i> : "Calculate All"}
          </button>
          <button
            onClick={runFindDuplicates}
            disabled={!!calcLoading.duplicates}
            className="flex flex-col items-center gap-2 p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-xl text-xs font-bold text-orange-700 transition disabled:opacity-60"
          >
            <i className="fas fa-clone text-lg"></i>
            {calcLoading.duplicates ? <i className="fas fa-circle-notch fa-spin"></i> : "Find Duplicates"}
          </button>
          <button
            onClick={runCheckCoverImage}
            disabled={!!calcLoading.checkcoverimage}
            className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-brand/5 border border-gray-200 hover:border-brand/30 rounded-xl text-xs font-bold text-gray-700 hover:text-brand transition disabled:opacity-60"
          >
            <i className="fas fa-image text-lg"></i>
            {calcLoading.checkcoverimage ? <i className="fas fa-circle-notch fa-spin"></i> : "Check & Download Covers"}
          </button>
        </div>
      </div>

      {/* 4. Data Control Log */}
      <LogsTable
        logs={logs}
        onRefresh={() => {
          loadLogs();
        }}
      />

      {/* 5. Database Record History */}
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
        <DeletedTable records={deleted} />
      </div>
    </div>
  );
}
