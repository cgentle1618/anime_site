/**
 * static/js/admin.js
 * Handles data control pipelines (SSE streaming, sync operations),
 * system configurations (Season settings), and renders audit logs/history tables.
 */

// Global variable to hold the AbortController for streaming pipelines
let currentAbortController = null;
let currentStatusElementId = null;

document.addEventListener("DOMContentLoaded", () => {
  loadAdminData();

  // Bind Standard Sync Data Control Actions (Pull/Push)
  document.querySelectorAll('[data-action="sync"]').forEach((btn) => {
    btn.addEventListener("click", (e) =>
      executeSync(e.target, e.target.dataset.url),
    );
  });

  // Bind Streaming Data Control Actions (Fill/Replace)
  document.querySelectorAll('[data-action="stream"]').forEach((btn) => {
    btn.addEventListener("click", (e) =>
      executeStream(e.target, e.target.dataset.url, e.target.dataset.statusId),
    );
  });

  // Specific Pull Bind
  const btnPullSpecific = document.getElementById("btn-pull-specific");
  if (btnPullSpecific) {
    btnPullSpecific.addEventListener("click", (e) => {
      const tabName = document.getElementById("pull-tab-select").value;
      // Traverse up to find the button element to pass visual state
      const targetBtn =
        e.target.tagName === "I" ? e.target.parentElement : e.target;
      executeSync(targetBtn, `/api/data-control/pull/${tabName}`);
    });
  }

  // Bind Season Config
  const btnSetSeason = document.getElementById("btn-set-season");
  if (btnSetSeason) {
    btnSetSeason.addEventListener("click", setCurrentSeason);
  }

  // Bind Manual Refreshes
  document.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    if (actionEl.dataset.action === "refresh-logs") loadLogsTable();
    if (actionEl.dataset.action === "refresh-history") {
      loadHistoryTables();
      loadDeletedTable();
    }
  });
});

// --- System Config Logic ---
async function setCurrentSeason() {
  const season = document.getElementById("season-select").value;
  const year = document.getElementById("year-input").value.trim();
  const btn = document.getElementById("btn-set-season");

  if (!season || !year) {
    if (typeof showNotification === "function")
      showNotification("warning", "Please select a season and type a year.");
    return;
  }

  btn.disabled = true;
  btn.innerText = "Processing...";

  try {
    const val = `${season} ${year}`;
    const res = await fetch("/api/system/config/current_season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_season: val }),
    });

    if (!res.ok) throw new Error("Failed to update season");
    if (typeof showNotification === "function")
      showNotification("success", "Current Season successfully updated!");

    document.getElementById("display-current-season").innerText = val;
  } catch (error) {
    if (typeof showNotification === "function")
      showNotification("error", error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Confirm Set";
  }
}

// --- Master Sync Execution Logic (Standard) ---
async function executeSync(buttonElement, endpointUrl) {
  const originalText = buttonElement.innerHTML;
  buttonElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  buttonElement.disabled = true;
  buttonElement.classList.add("opacity-70");

  try {
    const res = await fetch(endpointUrl, { method: "POST" });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Action failed.");

    if (typeof showNotification === "function")
      showNotification("success", "Pipeline execution successful.");

    // Refresh tables to show new log and updated entries
    loadLogsTable();
    loadHistoryTables();
  } catch (error) {
    if (typeof showNotification === "function")
      showNotification("error", `Pipeline Error: ${error.message}`);
  } finally {
    buttonElement.innerHTML = originalText;
    buttonElement.disabled = false;
    buttonElement.classList.remove("opacity-70");
  }
}

// --- Streaming Execution Logic (SSE) ---

// Needs to be globally available for the inline onclick handlers in HTML
window.abortCurrentPipeline = function () {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    if (currentStatusElementId) {
      const el = document.getElementById(currentStatusElementId);
      if (el) {
        el.innerText = "Pipeline aborted by user.";
        el.classList.add("text-red-600");

        const containerPrefix = currentStatusElementId.split("-")[0];
        document
          .getElementById(`${currentStatusElementId}-stop`)
          .classList.add("hidden");
        document
          .querySelectorAll(`#${containerPrefix}-buttons-container .stream-btn`)
          .forEach((b) => b.classList.remove("hidden"));
      }
    }
  }
};

async function executeStream(buttonElement, endpointUrl, statusElementId) {
  if (currentAbortController) {
    if (typeof showNotification === "function")
      showNotification(
        "warning",
        "A pipeline is already running. Please stop it first.",
      );
    return;
  }

  currentStatusElementId = statusElementId;
  currentAbortController = new AbortController();

  const containerPrefix = statusElementId.split("-")[0];
  const stopBtn = document.getElementById(`${statusElementId}-stop`);
  const streamBtns = document.querySelectorAll(
    `#${containerPrefix}-buttons-container .stream-btn`,
  );
  const statusEl = document.getElementById(statusElementId);

  // Hide regular stream buttons, show stop button, prepare status text
  streamBtns.forEach((b) => b.classList.add("hidden"));
  stopBtn.classList.remove("hidden");
  statusEl.classList.remove("hidden", "text-red-600", "text-emerald-600");
  statusEl.innerText = "Initiating connection...";

  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      signal: currentAbortController.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to start stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        if (part.startsWith("data: ")) {
          const jsonStr = part.substring(6);
          try {
            const data = JSON.parse(jsonStr);

            if (data.status === "processing") {
              statusEl.innerText = `[${data.processed}/${data.total}] Processing: ${data.current_entry}`;
            } else if (data.status === "success") {
              statusEl.classList.add("text-emerald-600");
              statusEl.innerText = `${data.message} (${data.processed}/${data.total})`;
              if (typeof showNotification === "function")
                showNotification("success", "Pipeline streaming completed.");
              loadLogsTable();
              loadHistoryTables();
            } else if (data.status === "error") {
              statusEl.classList.add("text-red-600");
              statusEl.innerText = `Error: ${data.message}`;
            }
          } catch (e) {
            console.error("Error parsing stream JSON:", e, jsonStr);
          }
        }
      }
    }
  } catch (error) {
    statusEl.classList.add("text-red-600");
    if (error.name === "AbortError") {
      statusEl.innerText = "Pipeline stopped forcefully.";
    } else {
      statusEl.innerText = `Stream Error: ${error.message}`;
      if (typeof showNotification === "function")
        showNotification("error", `Stream Error: ${error.message}`);
    }
  } finally {
    currentAbortController = null;
    currentStatusElementId = null;
    stopBtn.classList.add("hidden");
    streamBtns.forEach((b) => b.classList.remove("hidden"));
  }
}

// --- Data Fetching & Table Rendering ---

// Strict CN Fallback Logic as requested
function getTitleCNFallback(item, type) {
  if (type === "anime") {
    return (
      item.anime_name_cn ||
      item.anime_name_en ||
      item.anime_name_romanji ||
      item.anime_name_jp ||
      item.anime_name_alt ||
      "Unknown"
    );
  } else if (type === "franchise") {
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_romanji ||
      item.franchise_name_jp ||
      item.franchise_name_alt ||
      "Unknown"
    );
  } else if (type === "series") {
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown"
    );
  }
  return "Unknown";
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadAdminData() {
  try {
    const seasonRes = await fetch("/api/system/config/current_season");
    const seasonData = await seasonRes.json();
    document.getElementById("display-current-season").innerText =
      seasonData.current_season || "Not Set";
  } catch (e) {
    console.error("Failed to load season", e);
  }

  loadLogsTable();
  loadHistoryTables();
  loadDeletedTable();
}

async function loadLogsTable() {
  try {
    const logsRes = await fetch("/api/system/logs");
    const logs = await logsRes.json();

    const logHTML = logs
      .slice(0, 15)
      .map((log) => {
        // Dynamically build the status HTML
        let statusHtml = "";
        if (log.status === "Success") {
          statusHtml =
            '<span class="text-emerald-500 font-bold"><i class="fas fa-check-circle mr-1"></i> Success</span>';
        } else if (log.status === "Aborted") {
          statusHtml =
            '<span class="text-amber-500 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> Aborted</span>';
        } else {
          // Render Failed with hover tooltip for the error message
          statusHtml = `<span class="text-red-500 font-bold cursor-help" title="${log.error_message || "Unknown error"}"><i class="fas fa-times-circle mr-1"></i> Failed</span>`;
        }

        // Conditional class for Auto vs Manual triggers
        const triggerClass =
          log.type === "Auto"
            ? "bg-purple-100 text-purple-700"
            : "bg-blue-100 text-blue-700";

        return `
            <tr class="hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors">
                <td class="px-6 py-3">
                    <div class="font-bold text-gray-800">${log.action_main || "Unknown"}</div>
                    <div class="text-[10px] text-gray-500">${log.action_specific || ""}</div>
                </td>
                <td class="px-6 py-3">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${triggerClass}">${log.type || "Manual"}</span>
                </td>
                <td class="px-6 py-3 text-gray-500 whitespace-nowrap">${formatDate(log.timestamp)}</td>
                <td class="px-6 py-3">${statusHtml}</td>
                <td class="px-6 py-3 font-mono text-xs whitespace-nowrap">
                    <span class="text-emerald-600">+${log.rows_added || 0}</span> / 
                    <span class="text-blue-600">~${log.rows_updated || 0}</span> / 
                    <span class="text-red-600">-${log.rows_deleted || 0}</span>
                </td>
            </tr>
        `;
      })
      .join("");

    document.getElementById("table-logs").innerHTML =
      logHTML ||
      '<tr><td colspan="5" class="text-center py-6 italic text-gray-400">No data control logs found</td></tr>';
  } catch (e) {
    console.error("Failed to load logs", e);
    document.getElementById("table-logs").innerHTML =
      '<tr><td colspan="5" class="text-center py-6 italic text-red-400">Failed to fetch log data.</td></tr>';
  }
}

function getDeletedDisplayData(d) {
  let name = "Unknown";
  let context = "-";

  if (d.type === "System Options") {
    name = d.anime_en || "Unknown Value";
    context = d.anime_cn || "Unknown Category";
  } else if (d.type === "Franchise") {
    name = d.franchise || "Unknown Franchise";
    context = "Top Level Hub";
  } else if (d.type === "Series") {
    name = d.series || "Unknown Series";
    context = d.franchise || "No Franchise";
  } else {
    name = d.anime_cn || d.anime_en || "Unknown Anime";
    context = d.series || d.franchise || "Independent";
  }

  return { name, context };
}

async function loadDeletedTable() {
  try {
    const res = await fetch("/api/system/deleted");
    if (!res.ok) throw new Error("Failed to fetch deleted records");
    const deleted = await res.json();

    document.getElementById("table-deleted").innerHTML =
      deleted
        .map((d) => {
          const { name, context } = getDeletedDisplayData(d);
          return `
            <tr class="hover:bg-red-50/30 transition">
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">${formatDate(d.timestamp)}</td>
                <td class="px-5 py-2.5"><span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-red-50 text-red-600 border-red-200">${d.type}</span></td>
                <td class="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]" title="${name}">${name}</td>
                <td class="px-5 py-2.5 text-gray-500 text-xs truncate max-w-[150px]" title="${context}">${context}</td>
            </tr>
            `;
        })
        .join("") ||
      `<tr><td colspan="4" class="text-center py-6 text-gray-400 italic">No recently deleted entries</td></tr>`;
  } catch (e) {
    console.error("Failed to load deleted records", e);
    document.getElementById("table-deleted").innerHTML =
      `<tr><td colspan="4" class="text-center py-6 text-gray-400 italic">Failed to load deleted records.</td></tr>`;
  }
}

async function loadHistoryTables() {
  try {
    const [animeRes, franchiseRes, seriesRes] = await Promise.all([
      fetch("/api/anime/"),
      fetch("/api/franchise/"),
      fetch("/api/series/"),
    ]);

    const anime = await animeRes.json();
    const franchises = await franchiseRes.json();
    const series = await seriesRes.json();

    // 1. Modified Franchise
    const modF = [...franchises]
      .filter((f) => f.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 15);
    document.getElementById("table-mod-franchise").innerHTML =
      modF
        .map(
          (f) => `
            <tr class="hover:bg-purple-50/30 transition cursor-pointer" onclick="window.location.href='/franchise/${f.system_id}'">
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">${formatDate(f.updated_at)}</td>
                <td class="px-5 py-2.5 text-gray-600 whitespace-nowrap"><span class="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">${f.franchise_type || "-"}</span></td>
                <td class="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[250px]" title="${getTitleCNFallback(f, "franchise")}">${getTitleCNFallback(f, "franchise")}</td>
            </tr>
        `,
        )
        .join("") ||
      `<tr><td colspan="3" class="text-center py-6 text-gray-400 italic">No modified franchises</td></tr>`;

    // 2. Recently Added Franchise
    const addF = [...franchises]
      .filter((f) => f.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 15);
    document.getElementById("table-add-franchise").innerHTML =
      addF
        .map(
          (f) => `
            <tr class="hover:bg-emerald-50/30 transition cursor-pointer" onclick="window.location.href='/franchise/${f.system_id}'">
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">${formatDate(f.created_at)}</td>
                <td class="px-5 py-2.5 text-gray-600 whitespace-nowrap"><span class="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">${f.franchise_type || "-"}</span></td>
                <td class="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[250px]" title="${getTitleCNFallback(f, "franchise")}">${getTitleCNFallback(f, "franchise")}</td>
            </tr>
        `,
        )
        .join("") ||
      `<tr><td colspan="3" class="text-center py-6 text-gray-400 italic">No recently added franchises</td></tr>`;

    // 3. Modified Anime
    const modA = [...anime]
      .filter((a) => a.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 15);
    document.getElementById("table-mod-anime").innerHTML =
      modA
        .map((a) => {
          let statusColor = "text-gray-500 bg-gray-100";
          if (a.airing_status === "Airing")
            statusColor = "text-green-700 bg-green-100";
          else if (a.airing_status === "Finished Airing")
            statusColor = "text-blue-700 bg-blue-100";
          else if (a.airing_status === "Not Yet Aired")
            statusColor = "text-orange-700 bg-orange-100";

          return `
            <tr class="hover:bg-blue-50/30 transition cursor-pointer" onclick="window.location.href='/anime/${a.system_id}'">
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">${formatDate(a.updated_at)}</td>
                <td class="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]" title="${getTitleCNFallback(a, "anime")}">${getTitleCNFallback(a, "anime")}</td>
                <td class="px-5 py-2.5 text-gray-600 whitespace-nowrap"><span class="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">${a.airing_type || "-"}</span></td>
                <td class="px-5 py-2.5 whitespace-nowrap"><span class="px-2 py-0.5 inline-flex text-[9px] leading-4 font-bold rounded-full ${statusColor}">${a.airing_status || "-"}</span></td>
                <td class="px-5 py-2.5 text-gray-600 whitespace-nowrap text-xs font-medium">${a.watching_status || "-"}</td>
            </tr>
        `;
        })
        .join("") ||
      `<tr><td colspan="5" class="text-center py-6 text-gray-400 italic">No modified anime</td></tr>`;

    // 4. Recently Added Entry (Anime + Series)
    const mixedEntries = [
      ...series.map((s) => ({
        ...s,
        __type: "Series",
        __name: getTitleCNFallback(s, "series"),
        __link: `/series/${s.system_id}`,
      })),
      ...anime.map((a) => ({
        ...a,
        __type: "Anime",
        __name: getTitleCNFallback(a, "anime"),
        __link: `/anime/${a.system_id}`,
      })),
    ];
    const addE = mixedEntries
      .filter((i) => i.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 15);

    document.getElementById("table-add-entry").innerHTML =
      addE
        .map((i) => {
          let badgeClass =
            i.__type === "Anime"
              ? "bg-blue-50 text-blue-600 border-blue-200"
              : "bg-indigo-50 text-indigo-600 border-indigo-200";
          let airingHtml =
            i.__type === "Anime"
              ? `<span class="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">${i.airing_type || "-"}</span>`
              : `<span class="text-gray-400">-</span>`;

          return `
            <tr class="hover:bg-indigo-50/30 transition cursor-pointer" onclick="window.location.href='${i.__link}'">
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap">${formatDate(i.created_at)}</td>
                <td class="px-5 py-2.5"><span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badgeClass}">${i.__type}</span></td>
                <td class="px-5 py-2.5 font-bold text-gray-800 truncate max-w-[200px]" title="${i.__name}">${i.__name}</td>
                <td class="px-5 py-2.5 text-gray-600 whitespace-nowrap">${airingHtml}</td>
                <td class="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs">${i.season_part || "-"}</td>
            </tr>
        `;
        })
        .join("") ||
      `<tr><td colspan="5" class="text-center py-6 text-gray-400 italic">No recently added entries</td></tr>`;
  } catch (error) {
    console.error("Failed to load history tables", error);
    if (typeof showNotification === "function")
      showNotification("error", "Failed to load history statistics.");
  }
}
