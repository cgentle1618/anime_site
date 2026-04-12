/**
 * static/js/delete.js
 * Handles search filtering, dynamic warning modals, and cascading deletions
 * for the Database Deletion interface.
 */

// --- Display Title Fallback Helpers (V2 Standard) ---
const getDisplayTitleA = (a) =>
  a.anime_name_cn ||
  a.anime_name_en ||
  a.anime_name_alt ||
  a.anime_name_romanji ||
  a.anime_name_jp ||
  "Unknown Anime";

const getDisplayTitleF = (f) =>
  f.franchise_name_cn ||
  f.franchise_name_en ||
  f.franchise_name_alt ||
  f.franchise_name_romanji ||
  f.franchise_name_jp ||
  "Unknown Franchise";

const getDisplayTitleS = (s) =>
  s.series_name_cn || s.series_name_en || s.series_name_alt || "Unknown Series";

const getClean = (str) =>
  (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

const state = {
  db: { anime: [], franchise: [], series: [], options: [] },
  dict: { franchise: {}, series: {} },
  target: null, // Holds info about item to delete
  debounce: null,
};

const pageDOM = {
  loading: document.getElementById("workspace-loading"),

  animeInput: document.getElementById("anime-search-input"),
  animeResults: document.getElementById("anime-search-results"),
  animeContainer: document.getElementById("anime-delete-container"),

  franchiseInput: document.getElementById("franchise-search-input"),
  franchiseResults: document.getElementById("franchise-search-results"),
  franchiseContainer: document.getElementById("franchise-delete-container"),

  seriesInput: document.getElementById("series-search-input"),
  seriesResults: document.getElementById("series-search-results"),
  seriesContainer: document.getElementById("series-delete-container"),

  optCategory: document.getElementById("delete-option-category"),
  optLoading: document.getElementById("options-loading"),
  optContainer: document.getElementById("options-list-container"),

  modal: document.getElementById("delete-modal"),
  modalBox: document.getElementById("delete-modal-box"),
  modalWarnings: document.getElementById("dynamic-delete-warnings"),
  btnExecute: document.getElementById("execute-delete-btn"),
};

document.addEventListener("DOMContentLoaded", () => {
  fetchDatabase();

  // Search Listeners with Debounce
  pageDOM.animeInput.addEventListener("input", () => {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => filterSearch("anime"), 250);
  });
  pageDOM.animeInput.addEventListener("focus", () => filterSearch("anime"));

  pageDOM.franchiseInput.addEventListener("input", () => {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => filterSearch("franchise"), 250);
  });
  pageDOM.franchiseInput.addEventListener("focus", () =>
    filterSearch("franchise"),
  );

  pageDOM.seriesInput.addEventListener("input", () => {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => filterSearch("series"), 250);
  });
  pageDOM.seriesInput.addEventListener("focus", () => filterSearch("series"));

  pageDOM.optCategory.addEventListener("change", loadCategoryOptions);
  pageDOM.btnExecute.addEventListener("click", executeDelete);

  // Global Event Delegation
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container-anime"))
      pageDOM.animeResults.classList.add("hidden");
    if (!e.target.closest(".search-container-franchise"))
      pageDOM.franchiseResults.classList.add("hidden");
    if (!e.target.closest(".search-container-series"))
      pageDOM.seriesResults.classList.add("hidden");

    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "switch-tab") switchTab(actionEl.dataset.tab);
    else if (action === "select-item")
      selectItem(actionEl.dataset.type, actionEl.dataset.id);
    else if (action === "close-card") closeCard(actionEl.dataset.target);
    else if (action === "init-delete") initDelete(actionEl.dataset.type);
    else if (action === "close-modal") closeDeleteModal();
    else if (action === "delete-option")
      initOptionDelete(
        actionEl.dataset.id,
        actionEl.dataset.name,
        actionEl.dataset.category,
      );
  });
});

async function fetchDatabase() {
  pageDOM.loading.classList.remove("hidden");
  try {
    const [aRes, fRes, sRes, oRes] = await Promise.all([
      fetch("/api/anime/"),
      fetch("/api/franchise/"),
      fetch("/api/series/"),
      fetch("/api/options/"),
    ]);
    if (!aRes.ok || !fRes.ok || !sRes.ok || !oRes.ok)
      throw new Error("Failed to load schema data");

    state.db.anime = await aRes.json();
    state.db.franchise = await fRes.json();
    state.db.series = await sRes.json();
    state.db.options = await oRes.json();

    state.dict.franchise = {};
    state.db.franchise.forEach((f) => (state.dict.franchise[f.system_id] = f));
    state.dict.series = {};
    state.db.series.forEach((s) => (state.dict.series[s.system_id] = s));

    // Populate Option Categories
    const categories = [
      ...new Set(state.db.options.map((o) => o.category)),
    ].sort();
    pageDOM.optCategory.innerHTML =
      `<option value="" disabled selected>-- Choose a category to manage --</option>` +
      categories.map((c) => `<option value="${c}">${c}</option>`).join("");
  } catch (e) {
    console.error(e);
    if (typeof showNotification === "function")
      showNotification("error", "Database load failed.");
  } finally {
    pageDOM.loading.classList.add("hidden");
  }
}

function switchTab(tabName) {
  ["anime", "franchise", "series", "options"].forEach((t) => {
    const btn = document.getElementById(`tab-${t}`);
    const sec = document.getElementById(`section-${t}`);
    if (t === tabName) {
      btn.className =
        "px-6 py-3 font-bold text-sm tracking-wide transition-colors duration-200 tab-active whitespace-nowrap";
      sec.classList.remove("hidden");
    } else {
      btn.className =
        "px-6 py-3 font-bold text-sm tracking-wide transition-colors duration-200 tab-inactive whitespace-nowrap";
      sec.classList.add("hidden");
    }
  });
}

// --- Search Engines ---
function filterSearch(type) {
  const input = pageDOM[`${type}Input`];
  const results = pageDOM[`${type}Results`];
  const query = getClean(input.value);

  if (!query) {
    results.classList.add("hidden");
    return;
  }

  let filtered = [];
  if (type === "anime") {
    filtered = state.db.anime
      .filter((a) => {
        const searchStr = [
          a.anime_name_cn,
          a.anime_name_en,
          a.anime_name_romanji,
          a.anime_name_jp,
          a.anime_name_alt,
        ]
          .filter(Boolean)
          .join("");
        return getClean(searchStr).includes(query);
      })
      .slice(0, 10);

    results.innerHTML = filtered.length
      ? filtered
          .map((a) => {
            const fTitle = a.franchise_id
              ? getDisplayTitleF(state.dict.franchise[a.franchise_id] || {})
              : "No Franchise";
            return `
                        <div data-action="select-item" data-type="anime" data-id="${a.system_id}" class="p-3 px-4 hover:bg-red-50 cursor-pointer transition flex justify-between items-center group">
                            <div class="min-w-0 flex-1 pr-2">
                                <div class="font-bold text-gray-800 text-sm truncate">${getDisplayTitleA(a)}</div>
                                <div class="text-[11px] text-gray-500 truncate mt-0.5">Hub: ${fTitle}</div>
                            </div>
                            <i class="fas fa-chevron-right text-gray-300 group-hover:text-red-500 transition shrink-0 ml-2"></i>
                        </div>`;
          })
          .join("")
      : `<div class="p-4 text-center text-sm text-gray-500">No matches found.</div>`;
  } else if (type === "franchise") {
    filtered = state.db.franchise
      .filter((f) => {
        const searchStr = [
          f.franchise_name_cn,
          f.franchise_name_en,
          f.franchise_name_romanji,
          f.franchise_name_jp,
          f.franchise_name_alt,
        ]
          .filter(Boolean)
          .join("");
        return getClean(searchStr).includes(query);
      })
      .slice(0, 10);

    results.innerHTML = filtered.length
      ? filtered
          .map(
            (f) => `
                    <div data-action="select-item" data-type="franchise" data-id="${f.system_id}" class="p-3 px-4 hover:bg-red-50 cursor-pointer transition flex justify-between items-center group">
                        <div class="min-w-0 flex-1 pr-2">
                            <div class="font-bold text-gray-800 text-sm truncate">${getDisplayTitleF(f)}</div>
                            <div class="text-[11px] text-gray-500 truncate mt-0.5">ID: ${f.system_id}</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-300 group-hover:text-red-500 transition shrink-0 ml-2"></i>
                    </div>`,
          )
          .join("")
      : `<div class="p-4 text-center text-sm text-gray-500">No matches found.</div>`;
  } else if (type === "series") {
    filtered = state.db.series
      .filter((s) => {
        const searchStr = [
          s.series_name_cn,
          s.series_name_en,
          s.series_name_alt,
        ]
          .filter(Boolean)
          .join("");
        return getClean(searchStr).includes(query);
      })
      .slice(0, 10);

    results.innerHTML = filtered.length
      ? filtered
          .map((s) => {
            const fTitle = s.franchise_id
              ? getDisplayTitleF(state.dict.franchise[s.franchise_id] || {})
              : "Unknown";
            return `
                    <div data-action="select-item" data-type="series" data-id="${s.system_id}" class="p-3 px-4 hover:bg-red-50 cursor-pointer transition flex justify-between items-center group">
                        <div class="min-w-0 flex-1 pr-2">
                            <div class="font-bold text-gray-800 text-sm truncate">${getDisplayTitleS(s)}</div>
                            <div class="text-[11px] text-gray-500 truncate mt-0.5">Franchise: ${fTitle}</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-300 group-hover:text-red-500 transition shrink-0 ml-2"></i>
                    </div>`;
          })
          .join("")
      : `<div class="p-4 text-center text-sm text-gray-500">No matches found.</div>`;
  }

  results.classList.remove("hidden");
}

function selectItem(type, id) {
  pageDOM[`${type}Results`].classList.add("hidden");

  if (type === "anime") {
    const a = state.db.anime.find((x) => x.system_id === id);
    pageDOM.animeInput.value = getDisplayTitleA(a);

    // Image Resolver
    const bucket = "cg1618-anime-covers";
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    let imgUrl = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2210%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

    if (a.cover_image_file && a.cover_image_file !== "N/A") {
      imgUrl = isLocal
        ? `/static/covers/${a.cover_image_file}`
        : `https://storage.googleapis.com/${bucket}/${a.cover_image_file}`;
    } else if (a.cover_image_url) {
      imgUrl = a.cover_image_url;
    }

    document.getElementById("del-anime-img").src = imgUrl;
    document.getElementById("del-anime-title").innerText = getDisplayTitleA(a);
    document.getElementById("del-anime-subtitle").innerText =
      a.anime_name_en || a.anime_name_romanji || "-";
    document.getElementById("del-anime-type").innerText =
      a.airing_type || "Type Unset";
    document.getElementById("del-anime-status").innerText =
      a.watching_status || "Status Unset";

    const fTitle = a.franchise_id
      ? getDisplayTitleF(state.dict.franchise[a.franchise_id] || {})
      : "Standalone";
    const sTitle = a.series_id
      ? getDisplayTitleS(state.dict.series[a.series_id] || {})
      : "No Series";
    document.getElementById("del-anime-parents").innerText =
      `${fTitle} / ${sTitle}`;
    document.getElementById("del-anime-id").innerText = a.system_id;

    state.target = {
      type: "anime",
      id: a.system_id,
      name: getDisplayTitleA(a),
      fId: a.franchise_id,
      sId: a.series_id,
    };
  } else if (type === "franchise") {
    const f = state.db.franchise.find((x) => x.system_id === id);
    pageDOM.franchiseInput.value = getDisplayTitleF(f);

    document.getElementById("del-franchise-title").innerText =
      getDisplayTitleF(f);
    document.getElementById("del-franchise-alt").innerText =
      [f.franchise_name_en, f.franchise_name_alt].filter(Boolean).join(" • ") ||
      "No alt names";
    document.getElementById("del-franchise-id").innerText = f.system_id;

    const cS = state.db.series.filter(
      (s) => s.franchise_id === f.system_id,
    ).length;
    const cA = state.db.anime.filter(
      (a) => a.franchise_id === f.system_id,
    ).length;
    document.getElementById("del-franchise-count").innerText =
      `${cS} Series, ${cA} Anime`;

    state.target = {
      type: "franchise",
      id: f.system_id,
      name: getDisplayTitleF(f),
      sCount: cS,
      aCount: cA,
    };
  } else if (type === "series") {
    const s = state.db.series.find((x) => x.system_id === id);
    pageDOM.seriesInput.value = getDisplayTitleS(s);

    document.getElementById("del-series-title").innerText = getDisplayTitleS(s);
    document.getElementById("del-series-alt").innerText =
      [s.series_name_en, s.series_name_alt].filter(Boolean).join(" • ") ||
      "No alt names";
    document.getElementById("del-series-id").innerText = s.system_id;

    const cA = state.db.anime.filter((a) => a.series_id === s.system_id).length;
    document.getElementById("del-series-count").innerText = `${cA} Anime`;

    state.target = {
      type: "series",
      id: s.system_id,
      name: getDisplayTitleS(s),
      fId: s.franchise_id,
      aCount: cA,
    };
  }

  pageDOM[`${type}Container`].classList.remove("hidden");
}

function closeCard(type) {
  pageDOM[`${type}Container`].classList.add("hidden");
  pageDOM[`${type}Input`].value = "";
  state.target = null;
}

// --- Options Loader ---
function loadCategoryOptions() {
  const cat = pageDOM.optCategory.value;
  if (!cat) return;
  const opts = state.db.options.filter((o) => o.category === cat);

  pageDOM.optContainer.innerHTML = opts.length
    ? opts
        .map(
          (opt) => `
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center group hover:bg-red-50 hover:border-red-200 transition shadow-sm">
                    <span class="font-bold text-gray-700 text-sm truncate pr-2 group-hover:text-red-900">${opt.option_value}</span>
                    <button data-action="delete-option" data-id="${opt.id}" data-name="${opt.option_value}" data-category="${cat}" class="text-gray-400 hover:text-red-600 transition shrink-0 bg-white shadow-sm border border-gray-200 w-8 h-8 rounded-md flex items-center justify-center">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `,
        )
        .join("")
    : `<div class="col-span-full text-center text-sm text-gray-500 italic py-8 border border-dashed border-gray-300 rounded-xl">No options in this category.</div>`;

  pageDOM.optContainer.classList.remove("hidden");
}

// --- Master Deletion Flow ---
function initOptionDelete(id, name, cat) {
  state.target = { type: "options", id: id, name: name, category: cat };
  showDeleteModal();
}

function initDelete(type) {
  // state.target is already set by selectItem
  showDeleteModal();
}

function showDeleteModal() {
  const t = state.target;
  document.getElementById("modal-target-type").innerText =
    t.type.toUpperCase() + (t.category ? ` (${t.category})` : "");
  document.getElementById("modal-target-name").innerText = t.name;
  document.getElementById("modal-target-id").innerText = `ID: ${t.id}`;

  // Build Smart Warnings & Cascade Options
  let html = "";
  if (t.type === "franchise") {
    if (t.sCount > 0 || t.aCount > 0) {
      html = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <label class="flex items-start space-x-3 cursor-pointer">
                        <input type="checkbox" id="cb-cascade" class="mt-0.5 rounded border-red-400 text-red-600 focus:ring-red-600 w-4 h-4">
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-bold text-red-800"><i class="fas fa-trash-restore mr-1"></i> Cascade Deletion</div>
                            <div class="text-xs text-red-700 mt-1 leading-snug">There are <strong>${t.sCount} Series</strong> and <strong>${t.aCount} Anime</strong> connected to this hub. Check this box to securely delete ALL of them.</div>
                        </div>
                    </label>
                </div>`;
    }
  } else if (t.type === "series") {
    if (t.aCount > 0) {
      html = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <label class="flex items-start space-x-3 cursor-pointer">
                        <input type="checkbox" id="cb-cascade" class="mt-0.5 rounded border-red-400 text-red-600 focus:ring-red-600 w-4 h-4">
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-bold text-red-800"><i class="fas fa-trash-restore mr-1"></i> Cascade Deletion</div>
                            <div class="text-xs text-red-700 mt-1 leading-snug">There are <strong>${t.aCount} Anime</strong> connected to this series. Check this box to delete them as well.</div>
                        </div>
                    </label>
                </div>`;
    }

    // Check if Series is the ONLY one in the Franchise, and the Franchise has no standalone anime
    if (t.fId) {
      const sSibs = state.db.series.filter(
        (s) => s.franchise_id === t.fId,
      ).length;
      const aSibs = state.db.anime.filter(
        (a) => a.franchise_id === t.fId && a.series_id !== t.id,
      ).length;
      if (sSibs === 1 && aSibs === 0) {
        html += `
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-3">
                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input type="checkbox" id="cb-orphan-franchise" class="mt-0.5 rounded border-orange-300 text-orange-500 focus:ring-orange-500 w-4 h-4">
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-orange-800"><i class="fas fa-link mr-1"></i> Last Series in Franchise</div>
                                <div class="text-xs text-orange-700 mt-1 leading-snug">Deleting this will leave its parent Franchise empty. Check to delete the Franchise Hub too.</div>
                            </div>
                        </label>
                    </div>`;
      }
    }
  } else if (t.type === "anime") {
    // Check if Anime is the ONLY one in the Series
    if (t.sId) {
      const aSibs = state.db.anime.filter((a) => a.series_id === t.sId).length;
      if (aSibs === 1) {
        html += `
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input type="checkbox" id="cb-orphan-series" class="mt-0.5 rounded border-orange-300 text-orange-500 focus:ring-orange-500 w-4 h-4">
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-orange-800"><i class="fas fa-link mr-1"></i> Last Anime in Series</div>
                                <div class="text-xs text-orange-700 mt-1 leading-snug">This is the only entry in its Series Hub. Check to delete the Series Hub too.</div>
                            </div>
                        </label>
                    </div>`;
      }
    } else if (t.fId) {
      // If it has no series, but has a franchise, check if it's the last anime AND no series exist
      const aSibs = state.db.anime.filter(
        (a) => a.franchise_id === t.fId,
      ).length;
      const fSeries = state.db.series.filter(
        (s) => s.franchise_id === t.fId,
      ).length;
      if (aSibs === 1 && fSeries === 0) {
        html += `
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input type="checkbox" id="cb-orphan-franchise" class="mt-0.5 rounded border-orange-300 text-orange-500 focus:ring-orange-500 w-4 h-4">
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-orange-800"><i class="fas fa-link mr-1"></i> Last Anime in Franchise</div>
                                <div class="text-xs text-orange-700 mt-1 leading-snug">This is the only entry in its Franchise Hub. Check to delete the Franchise Hub too.</div>
                            </div>
                        </label>
                    </div>`;
      }
    }
  }

  pageDOM.modalWarnings.innerHTML = html;
  pageDOM.modal.classList.remove("hidden");
  setTimeout(() => pageDOM.modalBox.classList.remove("scale-95"), 10);
}

function closeDeleteModal() {
  pageDOM.modalBox.classList.add("scale-95");
  setTimeout(() => {
    pageDOM.modal.classList.add("hidden");
    if (state.target && state.target.type === "options") state.target = null;
  }, 200);
}

async function executeDelete() {
  const t = state.target;
  if (!t) return;

  const btn = pageDOM.btnExecute;
  const originalText = btn.innerHTML;
  btn.disabled = true;

  try {
    if (t.type === "options") {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Deleting...';
      const res = await fetch(`/api/options/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete option");

      closeDeleteModal();
      if (typeof showNotification === "function")
        showNotification("success", "Option deleted.");
      await fetchDatabase();
      loadCategoryOptions(); // Refresh UI
      return;
    }

    // Path: Entity Deletions
    const cbCascade = document.getElementById("cb-cascade");
    const cbSeries = document.getElementById("cb-orphan-series");
    const cbFranchise = document.getElementById("cb-orphan-franchise");

    // 1. Cascades (Before deleting parents)
    if (t.type === "franchise" && cbCascade && cbCascade.checked) {
      const animes = state.db.anime.filter((a) => a.franchise_id === t.id);
      for (let i = 0; i < animes.length; i++) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Cascading Anime (${i + 1}/${animes.length})...`;
        await fetch(`/api/anime/${animes[i].system_id}`, {
          method: "DELETE",
        });
      }
      const series = state.db.series.filter((s) => s.franchise_id === t.id);
      for (let i = 0; i < series.length; i++) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Cascading Series (${i + 1}/${series.length})...`;
        await fetch(`/api/series/${series[i].system_id}`, {
          method: "DELETE",
        });
      }
    } else if (t.type === "series" && cbCascade && cbCascade.checked) {
      const animes = state.db.anime.filter((a) => a.series_id === t.id);
      for (let i = 0; i < animes.length; i++) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Cascading Anime (${i + 1}/${animes.length})...`;
        await fetch(`/api/anime/${animes[i].system_id}`, {
          method: "DELETE",
        });
      }
    }

    // 2. Primary Deletion
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-2"></i> Erasing Record...';
    const res = await fetch(`/api/${t.type}/${t.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete ${t.type}`);

    // 3. Orphans (After deleting child)
    if (t.type === "anime") {
      if (cbSeries && cbSeries.checked && t.sId) {
        btn.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i> Erasing Orphaned Series...';
        await fetch(`/api/series/${t.sId}`, { method: "DELETE" });
      }
      if (cbFranchise && cbFranchise.checked && t.fId) {
        btn.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i> Erasing Orphaned Franchise...';
        await fetch(`/api/franchise/${t.fId}`, { method: "DELETE" });
      }
    } else if (t.type === "series") {
      if (cbFranchise && cbFranchise.checked && t.fId) {
        btn.innerHTML =
          '<i class="fas fa-spinner fa-spin mr-2"></i> Erasing Orphaned Franchise...';
        await fetch(`/api/franchise/${t.fId}`, { method: "DELETE" });
      }
    }

    closeDeleteModal();
    closeCard(t.type);
    await fetchDatabase();
    if (typeof showNotification === "function")
      showNotification("success", "Deletion successful.");
  } catch (e) {
    console.error(e);
    if (typeof showNotification === "function")
      showNotification("error", `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}
