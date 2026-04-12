/**
 * static/js/modify.js
 * Handles data fetching, global searching, inline editing, and updating entries.
 */

const state = {
  activeTab: "anime",
  db: { anime: [], series: [], franchise: [], options: [] },
  dict: { franchise: {}, series: {} },
  currentEdit: { id: null },
  multiSelects: {},
  comboboxes: {},
};

const pageDOM = {
  loading: document.getElementById("workspace-loading"),
  discoveryView: document.getElementById("discovery-view"),
  editorView: document.getElementById("editor-view"),

  discoveryIcon: document.getElementById("discovery-icon"),
  discoveryTitle: document.getElementById("discovery-title"),
  discoverySubtitle: document.getElementById("discovery-subtitle"),

  stdSearchContainer: document.getElementById("standard-search-container"),
  optSearchContainer: document.getElementById("options-search-container"),
  searchInput: document.getElementById("global-search-input"),
  searchDropdown: document.getElementById("global-search-dropdown"),
  optCategoryFilter: document.getElementById("options-category-filter"),

  recentHeader: document.getElementById("recent-header"),
  discoveryGrid: document.getElementById("discovery-grid"),

  btnUpdate: document.getElementById("btn-update"),
  animeRibbon: document.getElementById("anime-ribbon"),
  animeRibbonLinks: document.getElementById("anime-ribbon-links"),

  forms: {
    anime: document.getElementById("form-anime"),
    series: document.getElementById("form-series"),
    franchise: document.getElementById("form-franchise"),
    options: document.getElementById("form-options"),
  },
};

// --- UTILS ---
const getClean = (str) =>
  (str || "")
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");

// Sort Fallback Logic
const getSortTitleF = (f) =>
  f.franchise_name_en ||
  f.franchise_name_romanji ||
  f.franchise_name_cn ||
  f.franchise_name_jp ||
  f.franchise_name_alt ||
  "Unknown";
const getSortTitleS = (s) =>
  s.series_name_en ||
  s.series_name_romanji ||
  s.series_name_cn ||
  s.series_name_jp ||
  s.series_name_alt ||
  "Unknown";
const getSortTitleA = (a) =>
  a.anime_name_en ||
  a.anime_name_romanji ||
  a.anime_name_cn ||
  a.anime_name_jp ||
  a.anime_name_alt ||
  "Unknown";

// Display Fallback Logic
const getDisplayTitleF = (f) =>
  f.franchise_name_cn ||
  f.franchise_name_en ||
  f.franchise_name_alt ||
  f.franchise_name_romanji ||
  f.franchise_name_jp ||
  "Unknown";
const getDisplayTitleS = (s) =>
  s.series_name_cn ||
  s.series_name_en ||
  s.series_name_alt ||
  s.series_name_romanji ||
  s.series_name_jp ||
  "Unknown";
const getDisplayTitleA = (a) =>
  a.anime_name_cn ||
  a.anime_name_en ||
  a.anime_name_alt ||
  a.anime_name_romanji ||
  a.anime_name_jp ||
  "Unknown";

// Get All Names for Search Matching
const getAllNames = (item, type) => {
  if (!item || !type) return "";
  const names = [
    item[`${type}_name_en`],
    item[`${type}_name_cn`],
    item[`${type}_name_alt`],
  ];
  if (type !== "series") {
    names.push(item[`${type}_name_romanji`], item[`${type}_name_jp`]);
  }
  return names.filter(Boolean).join(" ");
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  fetchDatabase();

  pageDOM.searchInput.addEventListener("input", handleGlobalSearch);
  pageDOM.searchInput.addEventListener("focus", handleGlobalSearch);

  // Mousedown used to avoid blur-closing issues
  document.addEventListener("mousedown", (e) => {
    if (!pageDOM.stdSearchContainer.contains(e.target))
      pageDOM.searchDropdown.classList.remove("open");
  });

  pageDOM.optCategoryFilter.addEventListener("change", renderDiscoveryGrid);
  pageDOM.btnUpdate.addEventListener("click", handleUpdateFlow);
});

async function fetchDatabase() {
  pageDOM.loading.classList.remove("hidden");
  try {
    const [aRes, sRes, fRes, oRes] = await Promise.all([
      fetch("/api/anime/"),
      fetch("/api/series/"),
      fetch("/api/franchise/"),
      fetch("/api/options/"),
    ]);

    if (!aRes.ok || !sRes.ok || !fRes.ok || !oRes.ok)
      throw new Error("Failed to load schema data");

    const sortRecent = (a, b) => {
      if (a.updated_at && b.updated_at)
        return new Date(b.updated_at) - new Date(a.updated_at);
      return (b.system_id || "").localeCompare(a.system_id || "");
    };

    state.db.anime = (await aRes.json()).sort(sortRecent);
    state.db.series = (await sRes.json()).sort(sortRecent);
    state.db.franchise = (await fRes.json()).sort(sortRecent);
    state.db.options = await oRes.json();

    state.dict.franchise = {};
    state.db.franchise.forEach((f) => (state.dict.franchise[f.system_id] = f));
    state.dict.series = {};
    state.db.series.forEach((s) => (state.dict.series[s.system_id] = s));

    initStandardDropdowns();
    initCustomInputs();
    renderDiscoveryGrid();

    // --- URL Routing Logic for "Quick Edit" ---
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get("id");

    if (targetId) {
      let targetTab = null;
      if (state.db.anime.some((a) => a.system_id === targetId))
        targetTab = "anime";
      else if (state.db.franchise.some((f) => f.system_id === targetId))
        targetTab = "franchise";
      else if (state.db.series.some((s) => s.system_id === targetId))
        targetTab = "series";
      else if (state.db.options.some((o) => String(o.id) === targetId))
        targetTab = "options";

      if (targetTab) {
        switchTab(targetTab);
        openEditor(targetId);
        const url = new URL(window.location);
        url.searchParams.delete("id");
        window.history.replaceState({}, document.title, url.toString());
      }
    }
  } catch (e) {
    console.error(e);
    if (typeof showNotification === "function")
      showNotification("error", "Database load failed.");
  } finally {
    pageDOM.loading.classList.add("hidden");
  }
}

window.switchTab = function (tabName) {
  if (state.activeTab === tabName) return;
  ["anime", "franchise", "series", "options"].forEach((t) => {
    document
      .getElementById(`tab-${t}`)
      .classList.replace(
        t === tabName ? "tab-inactive" : "tab-active",
        t === tabName ? "tab-active" : "tab-inactive",
      );
  });

  state.activeTab = tabName;
  pageDOM.searchInput.value = "";
  pageDOM.searchDropdown.classList.remove("open");

  if (tabName === "anime") {
    pageDOM.discoveryIcon.className = "fas fa-tv text-2xl";
    pageDOM.discoveryTitle.innerText = "Modify Anime Entry";
    pageDOM.stdSearchContainer.classList.remove("hidden");
    pageDOM.optSearchContainer.classList.add("hidden");
    pageDOM.recentHeader.classList.remove("hidden");
  } else if (tabName === "franchise") {
    pageDOM.discoveryIcon.className = "fas fa-sitemap text-2xl";
    pageDOM.discoveryTitle.innerText = "Modify Franchise";
    pageDOM.stdSearchContainer.classList.remove("hidden");
    pageDOM.optSearchContainer.classList.add("hidden");
    pageDOM.recentHeader.classList.remove("hidden");
  } else if (tabName === "series") {
    pageDOM.discoveryIcon.className = "fas fa-layer-group text-2xl";
    pageDOM.discoveryTitle.innerText = "Modify Series";
    pageDOM.stdSearchContainer.classList.remove("hidden");
    pageDOM.optSearchContainer.classList.add("hidden");
    pageDOM.recentHeader.classList.add("hidden");
  } else if (tabName === "options") {
    pageDOM.discoveryIcon.className = "fas fa-sliders-h text-2xl";
    pageDOM.discoveryTitle.innerText = "Modify System Option";
    pageDOM.stdSearchContainer.classList.add("hidden");
    pageDOM.optSearchContainer.classList.remove("hidden");
    pageDOM.recentHeader.classList.add("hidden");
    if (pageDOM.optCategoryFilter.options.length > 0)
      pageDOM.optCategoryFilter.selectedIndex = 0;
  }

  closeEditor();
  renderDiscoveryGrid();
};

// --- DISCOVERY VIEW (Search & Grid) ---

function renderDiscoveryGrid() {
  pageDOM.discoveryGrid.innerHTML = "";

  if (state.activeTab === "anime") {
    state.db.anime.slice(0, 12).forEach((a) => {
      const fTitle = state.dict.franchise[a.franchise_id]
        ? getDisplayTitleF(state.dict.franchise[a.franchise_id])
        : "No Franchise";
      pageDOM.discoveryGrid.insertAdjacentHTML(
        "beforeend",
        createGridCard(
          a.system_id,
          getDisplayTitleA(a),
          fTitle,
          a.airing_type || "TV",
        ),
      );
    });
  } else if (state.activeTab === "franchise") {
    state.db.franchise.slice(0, 12).forEach((f) => {
      pageDOM.discoveryGrid.insertAdjacentHTML(
        "beforeend",
        createGridCard(
          f.system_id,
          getDisplayTitleF(f),
          "Franchise Hub",
          f.franchise_type || "Mixed",
        ),
      );
    });
  } else if (state.activeTab === "options") {
    const cat = pageDOM.optCategoryFilter.value;
    state.db.options
      .filter((o) => o.category === cat)
      .forEach((o) => {
        pageDOM.discoveryGrid.insertAdjacentHTML(
          "beforeend",
          createGridCard(o.id, o.option_value, cat, `ID: ${o.id}`),
        );
      });
  }
}

function createGridCard(id, title, sub1, badge = "") {
  return `
      <div onclick="openEditor('${id}')" class="bg-white border border-gray-200 p-4 rounded-xl hover:border-brand hover:shadow-md cursor-pointer transition group flex flex-col h-full">
          <div class="flex justify-between items-start mb-2">
              <div class="text-xs font-bold text-gray-500 uppercase tracking-wider truncate mr-2">${sub1}</div>
              ${badge ? `<span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">${badge}</span>` : ""}
          </div>
          <div class="font-black text-gray-800 text-sm group-hover:text-brand line-clamp-2 leading-tight">${title}</div>
      </div>
  `;
}

function handleGlobalSearch(e) {
  const query = getClean(e.target.value);
  if (!query) {
    pageDOM.searchDropdown.classList.remove("open");
    return;
  }

  let html = "";
  if (state.activeTab === "anime") {
    const filtered = state.db.anime.filter((a) => {
      const f = state.dict.franchise[a.franchise_id] || null;
      const s = state.dict.series[a.series_id] || null;
      const fields = [
        getAllNames(a, "anime"),
        f ? getAllNames(f, "franchise") : "",
        s ? getAllNames(s, "series") : "",
      ].join(" ");
      return getClean(fields).includes(query);
    });

    const grouped = {};
    filtered.forEach((a) => {
      const fId = a.franchise_id || "unassigned";
      const sId = a.series_id || "unassigned";
      if (!grouped[fId]) grouped[fId] = {};
      if (!grouped[fId][sId]) grouped[fId][sId] = [];
      grouped[fId][sId].push(a);
    });

    Object.keys(grouped)
      .sort((a, b) =>
        getSortTitleF(state.dict.franchise[a] || {}).localeCompare(
          getSortTitleF(state.dict.franchise[b] || {}),
        ),
      )
      .forEach((fId) => {
        html += `<div class="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider px-4 py-1.5 sticky top-0">${getDisplayTitleF(state.dict.franchise[fId] || {})}</div>`;
        Object.keys(grouped[fId])
          .sort((a, b) =>
            getSortTitleS(state.dict.series[a] || {}).localeCompare(
              getSortTitleS(state.dict.series[b] || {}),
            ),
          )
          .forEach((sId) => {
            grouped[fId][sId]
              .sort((a, b) => getSortTitleA(a).localeCompare(getSortTitleA(b)))
              .forEach((a) => {
                html += `
                  <div onmousedown="openEditor('${a.system_id}')" class="px-4 py-2 hover:bg-brand/5 border-b border-gray-50 cursor-pointer transition flex items-center">
                      ${sId !== "unassigned" ? '<div class="w-4 h-4 border-l-2 border-b-2 border-brand/20 mr-2 -mt-2 rounded-bl"></div>' : ""}
                      <div class="text-sm font-bold text-gray-800 line-clamp-1">${getDisplayTitleA(a)}</div>
                      <div class="ml-auto text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded">${a.airing_type || "TV"}</div>
                  </div>`;
              });
          });
      });
  } else if (state.activeTab === "franchise") {
    state.db.franchise
      .filter((f) => getClean(getAllNames(f, "franchise")).includes(query))
      .sort((a, b) => getSortTitleF(a).localeCompare(getSortTitleF(b)))
      .forEach((f) => {
        html += `<div onmousedown="openEditor('${f.system_id}')" class="px-4 py-3 hover:bg-brand/5 border-b border-gray-50 cursor-pointer transition text-sm font-bold text-gray-800">${getDisplayTitleF(f)}</div>`;
      });
  } else if (state.activeTab === "series") {
    const filtered = state.db.series.filter((s) => {
      const f = state.dict.franchise[s.franchise_id] || null;
      const fields = [
        getAllNames(s, "series"),
        f ? getAllNames(f, "franchise") : "",
      ].join(" ");
      const matchingAnime = state.db.anime.some(
        (a) =>
          a.series_id === s.system_id &&
          getClean(getAllNames(a, "anime")).includes(query),
      );
      return matchingAnime || getClean(fields).includes(query);
    });

    const grouped = {};
    filtered.forEach((s) => {
      const fId = s.franchise_id || "unassigned";
      if (!grouped[fId]) grouped[fId] = [];
      grouped[fId].push(s);
    });

    Object.keys(grouped)
      .sort((a, b) =>
        getSortTitleF(state.dict.franchise[a] || {}).localeCompare(
          getSortTitleF(state.dict.franchise[b] || {}),
        ),
      )
      .forEach((fId) => {
        html += `<div class="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider px-4 py-1.5 sticky top-0">${getDisplayTitleF(state.dict.franchise[fId] || {})}</div>`;
        grouped[fId]
          .sort((a, b) => getSortTitleS(a).localeCompare(getSortTitleS(b)))
          .forEach((s) => {
            html += `
              <div onmousedown="openEditor('${s.system_id}')" class="px-4 py-2 hover:bg-brand/5 border-b border-gray-50 cursor-pointer transition flex items-center">
                  <div class="text-sm font-bold text-gray-800 line-clamp-1">${getDisplayTitleS(s)}</div>
                  <div class="ml-auto text-[10px] text-brand font-bold bg-brand/10 px-2 py-0.5 rounded">Series Hub</div>
              </div>`;
          });
      });
  }

  if (html === "")
    html =
      '<div class="p-4 text-sm text-gray-500 italic text-center">No matches found.</div>';
  pageDOM.searchDropdown.innerHTML = html;
  pageDOM.searchDropdown.classList.add("open");
}

// --- FORM POPULATION ---
function initStandardDropdowns() {
  const predefinedCategories = [
    "Studio",
    "Distributor TW",
    "Director",
    "Producer",
    "Music / Composer",
    "Manga Author",
    "Genre Main",
    "Genre Sub",
    "Official Source",
    "Movie Franchise",
  ];
  const dbCategories = state.db.options.map((o) => o.category);
  const allCategories = [
    ...new Set([...predefinedCategories, ...dbCategories]),
  ].sort();

  pageDOM.optCategoryFilter.innerHTML = allCategories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

function initCustomInputs() {
  document.querySelectorAll(".ms-wrapper").forEach((el) => {
    const cat = el.getAttribute("data-options");
    if (!state.multiSelects[el.id])
      state.multiSelects[el.id] = new MultiSelect(el.id, cat);
  });

  if (!state.comboboxes["combo-anime-franchise"]) {
    state.comboboxes["combo-anime-franchise"] = new Combobox(
      "combo-anime-franchise",
      "franchise",
      true,
    );
    state.comboboxes["combo-anime-series"] = new Combobox(
      "combo-anime-series",
      "series",
      true,
    );
    state.comboboxes["combo-series-franchise"] = new Combobox(
      "combo-series-franchise",
      "franchise",
      false,
    );
  } else {
    Object.values(state.comboboxes).forEach((c) => c.refreshData());
  }
}

// --- EDITOR LOGIC ---
function openEditor(id) {
  state.currentEdit.id = id;

  pageDOM.discoveryView.classList.add("hidden");
  pageDOM.editorView.classList.remove("hidden");
  const form = pageDOM.forms[state.activeTab];
  Object.values(pageDOM.forms).forEach((f) => f.classList.add("hidden"));
  form.classList.remove("hidden");
  pageDOM.searchDropdown.classList.remove("open");

  let record;
  if (state.activeTab === "options")
    record = state.db.options.find((r) => r.id === parseInt(id));
  else record = state.db[state.activeTab].find((r) => r.system_id === id);

  if (!record) return;

  // Header Mapping
  let title = "",
    subtitle = "";
  if (state.activeTab === "anime") {
    title = getDisplayTitleA(record);
    subtitle = state.dict.franchise[record.franchise_id]
      ? getDisplayTitleF(state.dict.franchise[record.franchise_id])
      : "Standalone";
    buildAnimeRibbon(record.franchise_id, id);
  } else if (state.activeTab === "franchise") {
    title = getDisplayTitleF(record);
    subtitle = "Franchise Hub";
    pageDOM.animeRibbon.classList.add("hidden");
  } else if (state.activeTab === "series") {
    title = getDisplayTitleS(record);
    subtitle = state.dict.franchise[record.franchise_id]
      ? getDisplayTitleF(state.dict.franchise[record.franchise_id])
      : "Unknown Franchise";
    pageDOM.animeRibbon.classList.add("hidden");
  }

  document.getElementById("editor-main-title").innerText = title;
  document.getElementById("editor-subtitle").innerText = subtitle;
  document.getElementById("editor-sys-id").innerText =
    state.activeTab === "options" ? record.id : record.system_id;

  // Populate Fields
  form.querySelectorAll("[data-field]").forEach((el) => {
    const key = el.getAttribute("data-field");
    const val = record[key];

    if (el.classList.contains("ms-wrapper")) {
      state.multiSelects[el.id].setValue(val);
    } else if (el.classList.contains("combo-wrapper")) {
      state.comboboxes[el.id].setValue(val);
    } else if (el.classList.contains("boolean-select")) {
      if (val === true || val === "true") el.value = "true";
      else if (val === false || val === "false") el.value = "false";
      else el.value = "";
    } else {
      el.value = val === null || val === undefined ? "" : val;
    }
  });

  if (state.activeTab === "anime") {
    const sp = record.season_part || "";
    const sMatch = sp.match(/Season\s\d+/i);
    const pMatch = sp.match(/Part\s\d+/i);
    const selSeason = document.getElementById("sel-season");
    const selPart = document.getElementById("sel-part");
    if (selSeason) selSeason.value = sMatch ? sMatch[0] : "";
    if (selPart) selPart.value = pMatch ? pMatch[0] : "";
  }

  document
    .getElementById("editor-view")
    .querySelector(".overflow-y-auto").scrollTop = 0;
}

window.openEditor = openEditor;

function closeEditor() {
  state.currentEdit.id = null;
  pageDOM.editorView.classList.add("hidden");
  pageDOM.discoveryView.classList.remove("hidden");
  renderDiscoveryGrid();
}

window.closeEditor = closeEditor;

function buildAnimeRibbon(franchiseId, currentAnimeId) {
  if (!franchiseId) {
    pageDOM.animeRibbon.classList.add("hidden");
    return;
  }

  const siblings = state.db.anime
    .filter((a) => a.franchise_id === franchiseId)
    .sort((a, b) => getSortTitleA(a).localeCompare(getSortTitleA(b)));
  if (siblings.length <= 1) {
    pageDOM.animeRibbon.classList.add("hidden");
    return;
  }

  let html = "";
  siblings.forEach((a) => {
    const isActive = a.system_id === currentAnimeId;
    html += `<button onclick="openEditor('${a.system_id}')" class="px-3 py-1.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition-colors ${isActive ? "bg-brand text-white border-brand" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}">${getDisplayTitleA(a)}</button>`;
  });

  pageDOM.animeRibbonLinks.innerHTML = html;
  pageDOM.animeRibbon.classList.remove("hidden");
  pageDOM.animeRibbon.classList.add("flex");
}

// --- SAVE LOGIC ---
async function handleUpdateFlow() {
  pageDOM.btnUpdate.innerHTML =
    '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
  pageDOM.btnUpdate.classList.add("opacity-75", "pointer-events-none");

  const type = state.activeTab;
  const id = state.currentEdit.id;
  const form = pageDOM.forms[type];
  let payload = {};

  form.querySelectorAll("[data-field]").forEach((el) => {
    const key = el.getAttribute("data-field");
    if (el.classList.contains("ms-wrapper")) {
      payload[key] = state.multiSelects[el.id].getValue();
    } else if (el.classList.contains("combo-wrapper")) {
      const combo = state.comboboxes[el.id];
      payload[key] = combo.selectedId;
      payload[`_${key}_text`] = combo.input.value.trim();
    } else if (el.classList.contains("boolean-select")) {
      if (el.value === "true") payload[key] = true;
      else if (el.value === "false") payload[key] = false;
      else {
        // --- FIX FOR SOURCE NETFLIX BUG ---
        payload[key] = key === "source_netflix" ? false : null;
      }
    } else if (el.type === "number") {
      payload[key] = el.value !== "" ? Number(el.value) : null;
    } else {
      payload[key] = el.value || null;
    }
  });

  if (type === "anime") {
    const selSeason = document.getElementById("sel-season");
    const selPart = document.getElementById("sel-part");
    if (selSeason && selPart) {
      payload.season_part =
        [selSeason.value, selPart.value].filter(Boolean).join(" ") || null;
    }
  }

  try {
    if (type === "anime") {
      const fText = payload["_franchise_id_text"];
      if (fText && !payload.franchise_id) {
        const newFId = await triggerCreateModal("Franchise", fText, payload);
        if (!newFId) throw new Error("Canceled");
        payload.franchise_id = newFId;
      }
      const sText = payload["_series_id_text"];
      if (sText && !payload.series_id) {
        if (!payload.franchise_id)
          throw new Error("Cannot create series without a franchise.");
        const newSId = await triggerCreateModal("Series", sText, payload);
        if (!newSId) throw new Error("Canceled");
        payload.series_id = newSId;
      }
    } else if (type === "series") {
      if (!payload.franchise_id) {
        if (typeof showNotification === "function")
          showNotification(
            "warning",
            "You must select a valid, existing Franchise.",
          );
        throw new Error("Validation Failed");
      }
    }

    Object.keys(payload).forEach((k) => {
      if (k.startsWith("_")) delete payload[k];
    });

    const res = await fetch(`/api/${type}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // --- HIGH RESOLUTION 422 ERROR REPORTER ---
    if (!res.ok) {
      let errorMessage = `Server Error (${res.status})`;
      try {
        const errData = await res.json();
        if (errData.detail) {
          errorMessage = Array.isArray(errData.detail)
            ? errData.detail
                .map((e) => `${e.loc.join(".")}: ${e.msg}`)
                .join("\n")
            : JSON.stringify(errData.detail);
        } else {
          errorMessage = JSON.stringify(errData);
        }
      } catch (e) {
        errorMessage = await res.text();
      }
      throw new Error(errorMessage);
    }

    if (typeof showNotification === "function")
      showNotification("success", "Update successful.");
    await fetchDatabase();
  } catch (e) {
    console.error(e);
    if (e.message !== "Canceled" && e.message !== "Validation Failed") {
      if (typeof showNotification === "function")
        showNotification("error", `Failed: \n${e.message}`);
      else alert(`Backend Validation Failed:\n\n${e.message}`);
    }
  } finally {
    pageDOM.btnUpdate.innerHTML =
      '<i class="fas fa-save mr-2"></i> Save Changes';
    pageDOM.btnUpdate.classList.remove("opacity-75", "pointer-events-none");
  }
}

function triggerCreateModal(type, textName, animePayload) {
  return new Promise((resolve) => {
    const modal = document.getElementById("create-modal");
    const textEl = document.getElementById("create-modal-text");
    const btnConfirm = document.getElementById("btn-confirm-create");

    textEl.innerHTML = `<strong>"${textName}"</strong> was not found in the database.<br><br>Do you want to create a new <strong>${type} Hub</strong> using this Anime's EN/CN/JP names, and then link them?`;
    modal.classList.remove("hidden");

    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onConfirm = async () => {
      btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        let endpoint = `/api/${type.toLowerCase()}/`;
        let body = {};
        if (type === "Franchise") {
          body = {
            franchise_name_en: animePayload.anime_name_en || textName,
            franchise_name_cn: animePayload.anime_name_cn,
            franchise_name_jp: animePayload.anime_name_jp,
            franchise_name_romanji: animePayload.anime_name_romanji,
            franchise_name_alt: animePayload.anime_name_alt,
          };
        } else {
          body = {
            franchise_id: animePayload.franchise_id,
            series_name_en: animePayload.anime_name_en || textName,
            series_name_cn: animePayload.anime_name_cn,
            series_name_alt: animePayload.anime_name_alt,
          };
        }
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        cleanup();
        resolve(data.system_id);
      } catch (e) {
        if (typeof showNotification === "function")
          showNotification("error", `Failed to create ${type}`);
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      modal.classList.add("hidden");
      btnConfirm.innerHTML = "Create & Proceed";
      btnConfirm.removeEventListener("click", onConfirm);
      modal.querySelector("button").removeEventListener("click", onCancel);
    };

    btnConfirm.addEventListener("click", onConfirm);
    modal.querySelector("button").addEventListener("click", onCancel);
  });
}

// --- COMBOBOX UI COMPONENT ---
class Combobox {
  constructor(containerId, resourceType, allowCustom) {
    this.container = document.getElementById(containerId);
    this.resourceType = resourceType;
    this.allowCustom = allowCustom;
    this.selectedId = null;
    this.buildUI();
    this.attachEvents();
  }

  buildUI() {
    this.container.innerHTML = `
              <div class="relative">
                  <input type="text" class="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-brand px-3 py-2 pr-8" placeholder="${this.allowCustom ? "Select or type new..." : "Select existing..."}">
                  <i class="fas fa-chevron-down absolute right-3 top-3 text-gray-400 text-xs pointer-events-none"></i>
              </div>
              <div class="combo-dropdown"></div>
          `;
    this.input = this.container.querySelector("input");
    this.dropdown = this.container.querySelector(".combo-dropdown");
  }

  refreshData() {
    this.data = state.db[this.resourceType];
  }

  attachEvents() {
    this.input.addEventListener("focus", () =>
      this.showDropdown(this.input.value),
    );
    this.input.addEventListener("input", () => {
      this.selectedId = null;
      this.showDropdown(this.input.value);
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.container.contains(e.target))
        this.dropdown.classList.remove("open");
    });
  }

  showDropdown(filterText = "") {
    this.refreshData();
    const cleanFilter = getClean(filterText);
    let perfectMatch = null;

    const matches = this.data
      .filter((item) => {
        const names =
          this.resourceType === "franchise"
            ? [
                item.franchise_name_en,
                item.franchise_name_cn,
                item.franchise_name_romanji,
                item.franchise_name_jp,
                item.franchise_name_alt,
              ]
            : [item.series_name_en, item.series_name_cn, item.series_name_alt];
        if (
          names.some((n) => n && n.toLowerCase() === filterText.toLowerCase())
        )
          perfectMatch = item;
        return names.some((n) => n && getClean(n).includes(cleanFilter));
      })
      .slice(0, 50);

    if (perfectMatch && filterText.trim() !== "")
      this.selectedId = perfectMatch.system_id;

    if (matches.length === 0) {
      this.dropdown.innerHTML = `<div class="p-3 text-xs text-gray-500 italic">${this.allowCustom && filterText ? "Will create new record on save" : "No matches found"}</div>`;
    } else {
      this.dropdown.innerHTML = matches
        .map((item) => {
          const title =
            this.resourceType === "franchise"
              ? getDisplayTitleF(item)
              : getDisplayTitleS(item);
          return `<div class="combo-option" data-id="${item.system_id}" data-title="${title}">${title}</div>`;
        })
        .join("");

      this.dropdown.querySelectorAll(".combo-option").forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.selectedId = el.dataset.id;
          this.input.value = el.dataset.title;
          this.dropdown.classList.remove("open");
        });
      });
    }
    this.dropdown.classList.add("open");
  }

  setValue(id) {
    this.selectedId = id;
    if (!id) this.input.value = "";
    else {
      this.refreshData();
      const item = this.data.find((i) => i.system_id === id);
      if (item)
        this.input.value =
          this.resourceType === "franchise"
            ? getDisplayTitleF(item)
            : getDisplayTitleS(item);
    }
  }
}

// --- MULTISELECT UI COMPONENT ---
class MultiSelect {
  constructor(containerId, category) {
    this.container = document.getElementById(containerId);
    this.category = category;
    this.selected = [];
    this.buildUI();
    this.attachEvents();
  }

  buildUI() {
    this.container.innerHTML = `<div class="ms-pills" tabindex="0"><input type="text" class="ms-input" placeholder="Add..."><div class="ms-dropdown"></div></div>`;
    this.pillsContainer = this.container.querySelector(".ms-pills");
    this.input = this.container.querySelector(".ms-input");
    this.dropdown = this.container.querySelector(".ms-dropdown");
  }

  attachEvents() {
    this.input.addEventListener("focus", () => this.showDropdown());
    this.input.addEventListener("input", () =>
      this.showDropdown(this.input.value),
    );

    document.addEventListener("mousedown", (e) => {
      if (!this.container.contains(e.target))
        this.dropdown.classList.remove("open");
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = this.input.value.trim();
        if (val) this.addOption(val);
      } else if (
        e.key === "Backspace" &&
        this.input.value === "" &&
        this.selected.length > 0
      )
        this.removeOption(this.selected[this.selected.length - 1]);
    });
  }

  showDropdown(filter = "") {
    const allOpts = state.db.options
      .filter((o) => o.category === this.category)
      .map((o) => o.option_value);
    const available = allOpts.filter(
      (o) =>
        !this.selected.includes(o) &&
        o.toLowerCase().includes(filter.toLowerCase()),
    );
    if (available.length === 0)
      this.dropdown.innerHTML =
        '<div class="p-2 text-xs text-gray-400">No matches</div>';
    else {
      this.dropdown.innerHTML = available
        .map((o) => `<div class="ms-option" data-val="${o}">${o}</div>`)
        .join("");
      this.dropdown.querySelectorAll(".ms-option").forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.addOption(el.dataset.val);
        });
      });
    }
    this.dropdown.classList.add("open");
  }

  addOption(val) {
    if (!this.selected.includes(val)) {
      this.selected.push(val);
      this.renderPills();
    }
    this.input.value = "";
    this.input.focus();
    this.showDropdown();
  }

  removeOption(val) {
    this.selected = this.selected.filter((v) => v !== val);
    this.renderPills();
    this.input.focus();
  }

  renderPills() {
    this.pillsContainer.querySelectorAll(".ms-pill").forEach((e) => e.remove());
    this.selected.forEach((val) => {
      const p = document.createElement("div");
      p.className = "ms-pill";
      p.innerHTML = `<span>${val}</span><span class="ms-pill-remove"><i class="fas fa-times"></i></span>`;
      p.querySelector(".ms-pill-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeOption(val);
      });
      this.pillsContainer.insertBefore(p, this.input);
    });
  }

  setValue(valStr) {
    if (!valStr) {
      this.selected = [];
    } else if (Array.isArray(valStr)) {
      this.selected = [...valStr];
    } else if (typeof valStr === "string") {
      this.selected = valStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      this.selected = [String(valStr)];
    }
    this.renderPills();
  }

  getValue() {
    return this.selected.length > 0 ? this.selected.join(", ") : null;
  }
}
