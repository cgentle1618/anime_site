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

// Streaming box (Fill or Replace)
// specificOptions: [{ label, url }] — renders a select+play row below the "All" button
function StreamBox({
  color,
  borderColor,
  titleColor,
  statusColor,
  title,
  icon,
  allLabel,
  allUrl,
  specificOptions,
  streamRunning,
  onStart,
  onStop,
  status,
}) {
  const [specificSelected, setSpecificSelected] = useState(
    specificOptions?.[0]?.url ?? "",
  );

  const selectCls = `w-full bg-white border rounded-lg text-[10px] font-bold px-1 py-2 focus:outline-none ${borderColor.replace("border ", "border-")} ${titleColor}`;

  return (
    <div className={`${color} ${borderColor} rounded-xl p-4 flex flex-col`}>
      <h3 className={`text-sm font-bold ${titleColor} mb-3 flex items-center`}>
        <i className={`fas ${icon} mr-2 ${statusColor}`}></i> {title}
      </h3>
      <div className="space-y-2 mt-auto">
        {!streamRunning && (
          <>
            <button
              onClick={() => onStart(allUrl)}
              className={`w-full bg-white hover:opacity-80 border py-2 rounded-lg text-xs font-bold shadow-sm transition ${borderColor.replace("border ", "border-")} ${titleColor}`}
            >
              {allLabel}
            </button>
            {specificOptions && specificOptions.length > 0 && (
              <div className="flex gap-2">
                <select
                  value={specificSelected}
                  onChange={(e) => setSpecificSelected(e.target.value)}
                  className={selectCls}
                >
                  {specificOptions.map((opt) => (
                    <option key={opt.url} value={opt.url}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onStart(specificSelected)}
                  disabled={!specificSelected}
                  className={`bg-white hover:opacity-80 border px-2.5 rounded-lg text-[10px] font-bold disabled:opacity-40 ${borderColor.replace("border ", "border-")} ${titleColor}`}
                >
                  <i className="fas fa-play"></i>
                </button>
              </div>
            )}
          </>
        )}
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

  async function handleDeleteLog(logId) {
    await fetch(`/api/system/logs/${logId}`, {
      method: "DELETE",
      credentials: "include",
    });
    onRefresh();
  }

  async function handleClearAll() {
    if (!confirm("Delete old logs? The 10 most recent entries will be kept."))
      return;
    await fetch("/api/system/logs", {
      method: "DELETE",
      credentials: "include",
    });
    onRefresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest flex items-center">
          <i className="fas fa-terminal text-brand mr-2"></i> Data Control Log
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearAll}
            className="text-xs font-bold text-red-400 hover:text-red-600 transition"
            title="Delete old logs, keep 10 most recent"
          >
            <i className="fas fa-trash mr-1"></i>Clear Old
          </button>
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-brand transition"
          >
            <i className="fas fa-redo"></i>
          </button>
        </div>
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
              <th className="px-3 py-3"></th>
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
                  className="hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors group"
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
                  <td className="px-3 py-3">
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"
                      title="Delete this log entry"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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

const JIKAN_TYPES = ["TV", "ONA", "OVA", "Movie", "Special"];

function CoverImageModal({
  result,
  onDownload,
  onSetFields,
  onDeleteOrphaned,
  onClose,
  downloading,
  setting,
  deleting,
}) {
  const [selected, setSelected] = useState(new Set());
  const allIds = result.missing.map((m) => m.system_id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-900">
            Cover Image Check
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-lg"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          {result.should_use_count > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-amber-800 mb-2">
                {result.should_use_count} image
                {result.should_use_count !== 1 ? "s" : ""} in storage not linked
                to any entry
              </p>
              <div className="max-h-32 overflow-y-auto space-y-0.5 mb-3">
                {result.should_use.map((m, i) => (
                  <div key={i} className="text-xs text-amber-700 truncate">
                    {m.name}
                  </div>
                ))}
              </div>
              <button
                onClick={onSetFields}
                disabled={setting}
                className="w-full px-3 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {setting && <i className="fas fa-circle-notch fa-spin"></i>}
                {setting ? "Setting..." : "Set All Cover Image Fields"}
              </button>
            </div>
          )}

          {result.orphaned_count > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-bold text-gray-600 mb-2">
                {result.orphaned_count} orphaned file
                {result.orphaned_count !== 1 ? "s" : ""} in storage
              </p>
              <div className="max-h-28 overflow-y-auto space-y-0.5 mb-3">
                {result.orphaned.map((filename, i) => (
                  <div
                    key={i}
                    className="text-xs text-gray-500 font-mono truncate"
                  >
                    {filename}
                  </div>
                ))}
              </div>
              <button
                onClick={onDeleteOrphaned}
                disabled={deleting}
                className="w-full px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting && <i className="fas fa-circle-notch fa-spin"></i>}
                {deleting ? "Deleting..." : "Delete All Orphaned Files"}
              </button>
            </div>
          )}

          <p className="text-sm text-gray-500">
            Checked{" "}
            <span className="font-bold text-gray-800">
              {result.total_checked}
            </span>{" "}
            entries with a cover image record.
          </p>

          {result.missing_count === 0 ? (
            <div className="text-center py-6">
              <i className="fas fa-check-circle text-4xl text-emerald-400 block mb-3"></i>
              <p className="font-bold text-gray-700">
                All cover images are present.
              </p>
            </div>
          ) : (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-orange-800">
                  {result.missing_count} missing cover image
                  {result.missing_count !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs text-orange-600 hover:underline"
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {result.missing.map((m) => (
                  <label
                    key={m.system_id}
                    className="flex items-center gap-2 text-xs text-orange-700 cursor-pointer truncate"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(m.system_id)}
                      onChange={() => toggleOne(m.system_id)}
                      className="accent-orange-500 shrink-0"
                    />
                    <span className="font-mono bg-orange-100 px-1 rounded shrink-0">
                      {m.airing_type || "?"}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Close
          </button>
          {result.missing_count > 0 && (
            <>
              <button
                onClick={() => onDownload([...selected])}
                disabled={downloading || selected.size === 0}
                className="px-4 py-2 text-sm font-bold text-brand border border-brand hover:bg-brand/5 rounded-lg transition disabled:opacity-40"
              >
                Download Selected ({selected.size})
              </button>
              <button
                onClick={() => onDownload(null)}
                disabled={downloading}
                className="px-4 py-2 text-sm font-bold text-white bg-brand hover:opacity-90 rounded-lg transition disabled:opacity-60 flex items-center gap-2"
              >
                {downloading && <i className="fas fa-circle-notch fa-spin"></i>}
                {downloading ? "Downloading..." : "Download All"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RemarksModal({ results, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              Anime With Remarks
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {results.length === 0
                ? "No anime entries have a remark."
                : `${results.length} entr${results.length !== 1 ? "ies" : "y"} with a remark.`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-lg"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-check-circle text-3xl text-emerald-400 block mb-3"></i>
              <p className="font-bold">No remarks found</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0 bg-white">
                <tr>
                  <th className="pb-2 pr-4 whitespace-nowrap">Name (CN)</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Name (EN)</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Type</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Watching</th>
                  <th className="pb-2">Remark</th>
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
                      className="py-2.5 pr-4 font-bold text-gray-800 max-w-[160px] truncate whitespace-nowrap"
                      title={a.anime_name_cn}
                    >
                      {a.anime_name_cn || "—"}
                    </td>
                    <td
                      className="py-2.5 pr-4 text-gray-600 max-w-[160px] truncate whitespace-nowrap text-xs"
                      title={a.anime_name_en}
                    >
                      {a.anime_name_en || "—"}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">
                        {a.airing_type || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-gray-500">
                      {a.watching_status || "—"}
                    </td>
                    <td className="py-2.5 text-gray-700 text-xs max-w-[300px]">
                      {a.remark}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    {
      key: "system_options",
      label: "Sys. Options",
      groups: results.system_options,
    },
  ];

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

    // system_options
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              Duplicate Check Results
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalGroups === 0
                ? "No duplicates found across all categories."
                : `${totalGroups} duplicate group${totalGroups !== 1 ? "s" : ""} detected.`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-lg"
          >
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
  const [remarksResults, setRemarksResults] = useState(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [coverCheckResult, setCoverCheckResult] = useState(null);
  const [coverCheckOpen, setCoverCheckOpen] = useState(false);
  const [coverDownloading, setCoverDownloading] = useState(false);
  const [coverSetting, setCoverSetting] = useState(false);
  const [coverDeleting, setCoverDeleting] = useState(false);

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

  useEffect(() => {
    loadSeason();
    loadLogs();
  }, [loadSeason, loadLogs]);

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

  async function handleDownloadMissingCovers(systemIds) {
    setCoverDownloading(true);
    try {
      const res = await fetch(
        "/api/data-control/calculate/download-missing-covers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ system_ids: systemIds }),
        },
      );
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

  async function handleDeleteOrphanedCovers() {
    setCoverDeleting(true);
    try {
      const res = await fetch(
        "/api/data-control/calculate/delete-orphaned-covers",
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed.");
      showToast(
        "success",
        `Deleted ${data.deleted_count} orphaned image${data.deleted_count !== 1 ? "s" : ""}.`,
      );
      setCoverCheckOpen(false);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCoverDeleting(false);
    }
  }

  async function handleSetCoverImageFields() {
    setCoverSetting(true);
    try {
      const res = await fetch(
        "/api/data-control/calculate/set-cover-image-fields",
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Set failed.");
      showToast(
        "success",
        `Set ${data.updated_count} cover image field${data.updated_count !== 1 ? "s" : ""}.`,
      );
      setCoverCheckOpen(false);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCoverSetting(false);
    }
  }

  async function runFindDuplicates() {
    setCalcLoading((prev) => ({ ...prev, duplicates: true }));
    try {
      const res = await fetch("/api/data-control/check/duplicates", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Failed to check duplicates.");
      setDuplicateResults(data);
      setDuplicateOpen(true);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCalcLoading((prev) => ({ ...prev, duplicates: false }));
    }
  }

  async function runFindRemarks() {
    setCalcLoading((prev) => ({ ...prev, remarks: true }));
    try {
      const res = await fetch("/api/data-control/check/remarks", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch remarks.");
      setRemarksResults(data);
      setRemarksOpen(true);
    } catch (e) {
      showToast("error", `Error: ${e.message}`);
    } finally {
      setCalcLoading((prev) => ({ ...prev, remarks: false }));
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

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {coverCheckOpen && coverCheckResult && (
        <CoverImageModal
          result={coverCheckResult}
          onDownload={handleDownloadMissingCovers}
          onSetFields={handleSetCoverImageFields}
          onDeleteOrphaned={handleDeleteOrphanedCovers}
          onClose={() => setCoverCheckOpen(false)}
          downloading={coverDownloading}
          setting={coverSetting}
          deleting={coverDeleting}
        />
      )}
      {duplicateOpen && duplicateResults && (
        <DuplicatesModal
          results={duplicateResults}
          onClose={() => setDuplicateOpen(false)}
        />
      )}
      {remarksOpen && remarksResults && (
        <RemarksModal
          results={remarksResults}
          onClose={() => setRemarksOpen(false)}
        />
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
            to="/data-history"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-history mr-2 text-violet-500"></i> Data History
          </Link>
          <Link
            to="/review-queue"
            className="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition shadow-sm flex items-center"
          >
            <i className="fas fa-tasks mr-2 text-rose-500"></i> Review Queue
          </Link>
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
              allLabel="Fill All"
              allUrl="/api/data-control/fill/all"
              specificOptions={[
                { label: "Anime", url: "/api/data-control/fill/anime" },
                {
                  label: "Anime Movie",
                  url: "/api/data-control/fill/anime-movie",
                },
                { label: "Movie", url: "/api/data-control/fill/movie" },
              ]}
              streamRunning={streamRunning === "fill"}
              onStart={(url) => startStream(url, "fill")}
              onStop={stopStream}
              status={fillStatus}
            />

            {/* Replace */}
            <StreamBox
              color="bg-amber-50/50"
              borderColor="border border-amber-100"
              titleColor="text-amber-800"
              statusColor="text-amber-800"
              title="Replace"
              icon="fa-bolt"
              allLabel="Replace All"
              allUrl="/api/data-control/replace/all"
              specificOptions={[
                { label: "Anime", url: "/api/data-control/replace/anime" },
                {
                  label: "Anime Movie",
                  url: "/api/data-control/replace/anime-movie",
                },
                { label: "Movie", url: "/api/data-control/replace/movie" },
              ]}
              streamRunning={streamRunning === "replace"}
              onStart={(url) => startStream(url, "replace")}
              onStop={stopStream}
              status={replaceStatus}
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
                  <option value="Anime Movies">Anime Movies</option>
                  <option value="Movies">Movies</option>
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
            onClick={() =>
              runCalc("calculateall", "/api/data-control/calculate/all")
            }
            disabled={!!calcLoading.calculateall}
            className="flex flex-col items-center gap-2 p-3 bg-brand/5 hover:bg-brand/10 border border-brand/30 hover:border-brand/50 rounded-xl text-xs font-bold text-brand transition disabled:opacity-60"
          >
            <i className="fas fa-calculator text-lg"></i>
            {calcLoading.calculateall ? (
              <i className="fas fa-circle-notch fa-spin"></i>
            ) : (
              "Calculate All"
            )}
          </button>
          <button
            onClick={runFindDuplicates}
            disabled={!!calcLoading.duplicates}
            className="flex flex-col items-center gap-2 p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-xl text-xs font-bold text-orange-700 transition disabled:opacity-60"
          >
            <i className="fas fa-clone text-lg"></i>
            {calcLoading.duplicates ? (
              <i className="fas fa-circle-notch fa-spin"></i>
            ) : (
              "Find Duplicates"
            )}
          </button>
          <button
            onClick={runFindRemarks}
            disabled={!!calcLoading.remarks}
            className="flex flex-col items-center gap-2 p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 rounded-xl text-xs font-bold text-amber-700 transition disabled:opacity-60"
          >
            <i className="fas fa-comment-alt text-lg"></i>
            {calcLoading.remarks ? (
              <i className="fas fa-circle-notch fa-spin"></i>
            ) : (
              "With Remarks"
            )}
          </button>
          <button
            onClick={runCheckCoverImage}
            disabled={!!calcLoading.checkcoverimage}
            className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-brand/5 border border-gray-200 hover:border-brand/30 rounded-xl text-xs font-bold text-gray-700 hover:text-brand transition disabled:opacity-60"
          >
            <i className="fas fa-image text-lg"></i>
            {calcLoading.checkcoverimage ? (
              <i className="fas fa-circle-notch fa-spin"></i>
            ) : (
              "Check & Download Covers"
            )}
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
    </div>
  );
}
