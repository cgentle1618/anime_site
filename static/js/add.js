/**
 * static/js/add.js
 * Handles tab routing, autocomplete dropdowns, multi-select components,
 * duplication checks, and form appending to the backend.
 */

const state = {
  activeTab: "anime",
  db: { anime: [], series: [], franchise: [], options: [] },
  dict: { franchise: {}, series: {} },
  multiSelects: {},
  comboboxes: {},
};

const pageDOM = {
  loading: document.getElementById("workspace-loading"),
  btnAppend: document.getElementById("btn-append"),
  lastAddedCard: document.getElementById("last-added-card"),
  lastAddedTitle: document.getElementById("last-added-title"),
  btnAddOptionRow: document.getElementById("btn-add-option-row"),
  optionsValuesContainer: document.getElementById("options-values-container"),
  forms: {
    anime: document.getElementById("form-anime"),
    series: document.getElementById("form-series"),
    franchise: document.getElementById("form-franchise"),
    options: document.getElementById("form-options"),
  },
};

const getClean = (str) =>
  (str || "")
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  fetchDatabase();
  pageDOM.btnAppend.addEventListener("click", handleAppendFlow);

  // Multiple Options Logic
  if (pageDOM.btnAddOptionRow) {
    pageDOM.btnAddOptionRow.addEventListener("click", () => {
      const rowCount =
        pageDOM.optionsValuesContainer.querySelectorAll(".option-value-row")
          .length + 1;
      const newRow = document.createElement("div");
      newRow.className = "flex items-center gap-2 option-value-row";
      newRow.innerHTML = `
                  <input type="text" required class="option-value-input w-full border-brand/50 rounded-md shadow-sm text-sm focus:ring-brand font-bold bg-indigo-50/30" placeholder="Value ${rowCount}">
                  <button type="button" class="btn-remove-option text-gray-400 hover:text-red-500 transition px-2 hidden" title="Remove"><i class="fas fa-times"></i></button>
              `;
      pageDOM.optionsValuesContainer.appendChild(newRow);
      updateOptionRemoveButtons();
    });
  }

  if (pageDOM.optionsValuesContainer) {
    pageDOM.optionsValuesContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove-option");
      if (btn) {
        btn.closest(".option-value-row").remove();
        updateOptionRemoveButtons();
      }
    });
  }
});

function updateOptionRemoveButtons() {
  const rows =
    pageDOM.optionsValuesContainer.querySelectorAll(".option-value-row");
  rows.forEach((row, index) => {
    const btn = row.querySelector(".btn-remove-option");
    if (rows.length === 1) {
      btn.classList.add("hidden");
    } else {
      btn.classList.remove("hidden");
    }
    row.querySelector(".option-value-input").placeholder = `Value ${index + 1}`;
  });
}

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

    state.db.anime = await aRes.json();
    state.db.series = await sRes.json();
    state.db.franchise = await fRes.json();
    state.db.options = await oRes.json();

    state.dict.franchise = {};
    state.db.franchise.forEach((f) => (state.dict.franchise[f.system_id] = f));
    state.dict.series = {};
    state.db.series.forEach((s) => (state.dict.series[s.system_id] = s));

    initCustomInputs();
    initAnimeNameAutocomplete();
    populateOptionsDatalist();
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

  // Form Title Changes
  const titles = {
    anime: "Create New Anime Entry",
    franchise: "Create New Franchise Hub",
    series: "Create New Series Hub",
    options: "Add System Option",
  };
  document.getElementById("editor-main-title").innerText = titles[tabName];

  Object.values(pageDOM.forms).forEach((f) => f.classList.add("hidden"));
  pageDOM.forms[tabName].classList.remove("hidden");
};

function populateOptionsDatalist() {
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

  const datalist = document.getElementById("options-categories");
  if (datalist)
    datalist.innerHTML = allCategories
      .map((c) => `<option value="${c}">`)
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

// --- ANIME NAME AUTOCOMPLETE AUTO-FILL ---
function initAnimeNameAutocomplete() {
  const inputs = document.querySelectorAll(".anime-name-input");
  inputs.forEach((input) => {
    const dropdown = input.nextElementSibling;
    const fieldName = input.getAttribute("data-field"); // Gets the specific language field (e.g., anime_name_en)
    const wrapper = input.parentElement;

    const showDropdown = (filterText) => {
      const cleanFilter = getClean(filterText);
      if (!cleanFilter) {
        dropdown.classList.remove("open");
        return;
      }

      // Sliced to 50 to guarantee scrolling
      const matches = state.db.anime
        .filter((a) => {
          const nameToMatch = a[fieldName];
          return nameToMatch && getClean(nameToMatch).includes(cleanFilter);
        })
        .slice(0, 50);

      if (matches.length === 0) {
        dropdown.classList.remove("open");
        return;
      }

      // Richer UI with Franchise Context
      dropdown.innerHTML = matches
        .map((a) => {
          const title = a[fieldName];
          const fTitle =
            a.franchise_id && state.dict.franchise[a.franchise_id]
              ? state.dict.franchise[a.franchise_id].franchise_name_cn ||
                state.dict.franchise[a.franchise_id].franchise_name_en ||
                "Franchise"
              : "Standalone";

          return `
            <div class="combo-option group" data-id="${a.system_id}">
                <div class="font-bold text-gray-800 text-sm truncate mb-0.5">${title}</div>
                <div class="text-[10px] text-gray-500 truncate flex items-center justify-between">
                    <span><i class="fas fa-sitemap mr-1 opacity-50"></i>${fTitle}</span>
                    <span class="text-brand opacity-0 group-hover:opacity-100 transition-opacity font-bold">Auto-fill <i class="fas fa-magic ml-0.5"></i></span>
                </div>
            </div>`;
        })
        .join("");

      dropdown.querySelectorAll(".combo-option").forEach((opt) => {
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault();
          fillAnimeDataFromSuggestion(opt.dataset.id);
          dropdown.classList.remove("open");
        });
      });

      dropdown.classList.add("open");
    };

    input.addEventListener("focus", () => showDropdown(input.value));
    input.addEventListener("input", () => showDropdown(input.value));

    // SAFE CLICK-OUTSIDE (Replaces Blur)
    document.addEventListener("mousedown", (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove("open");
      }
    });
  });
}

function fillAnimeDataFromSuggestion(systemId) {
  const anime = state.db.anime.find((a) => a.system_id === systemId);
  if (!anime) return;

  // Fill Comboboxes
  if (state.comboboxes["combo-anime-franchise"]) {
    state.comboboxes["combo-anime-franchise"].setValue(anime.franchise_id);
  }
  if (state.comboboxes["combo-anime-series"]) {
    state.comboboxes["combo-anime-series"].setValue(anime.series_id);
  }

  // Fill Text Inputs
  const form = pageDOM.forms.anime;
  form.querySelector('[data-field="anime_name_en"]').value =
    anime.anime_name_en || "";
  form.querySelector('[data-field="anime_name_cn"]').value =
    anime.anime_name_cn || "";
  form.querySelector('[data-field="anime_name_romanji"]').value =
    anime.anime_name_romanji || "";
  form.querySelector('[data-field="anime_name_jp"]').value =
    anime.anime_name_jp || "";
  form.querySelector('[data-field="anime_name_alt"]').value =
    anime.anime_name_alt || "";

  // Fill MultiSelects
  if (state.multiSelects["ms-genre_main"])
    state.multiSelects["ms-genre_main"].setValue(anime.genre_main);
  if (state.multiSelects["ms-genre_sub"])
    state.multiSelects["ms-genre_sub"].setValue(anime.genre_sub);
  if (state.multiSelects["ms-studio"])
    state.multiSelects["ms-studio"].setValue(anime.studio);

  if (typeof showNotification === "function")
    showNotification("success", "Auto-filled fields from existing entry.");
}

function resetForms() {
  Object.values(pageDOM.forms).forEach((f) => f.reset());
  Object.values(state.comboboxes).forEach((c) => c.clear());
  Object.values(state.multiSelects).forEach((m) => m.clear());

  if (pageDOM.optionsValuesContainer) {
    pageDOM.optionsValuesContainer.innerHTML = `
              <div class="flex items-center gap-2 option-value-row">
                  <input type="text" required class="option-value-input w-full border-brand/50 rounded-md shadow-sm text-sm focus:ring-brand font-bold bg-indigo-50/30" placeholder="Value 1">
                  <button type="button" class="btn-remove-option text-gray-400 hover:text-red-500 transition px-2 hidden" title="Remove"><i class="fas fa-times"></i></button>
              </div>
          `;
  }
}

function displayLastAdded(title) {
  pageDOM.lastAddedTitle.innerText = title;
  pageDOM.lastAddedCard.classList.remove("hidden");

  pageDOM.lastAddedCard.classList.add("scale-105");
  setTimeout(() => pageDOM.lastAddedCard.classList.remove("scale-105"), 200);
}

// --- SAVE LOGIC & INTERCEPTORS ---
async function handleAppendFlow() {
  const type = state.activeTab;
  const form = pageDOM.forms[type];

  const resetBtn = () => {
    pageDOM.btnAppend.innerHTML =
      '<i class="fas fa-plus-circle mr-2"></i> Append Entry';
    pageDOM.btnAppend.classList.remove("opacity-75", "pointer-events-none");
  };

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (type === "anime") {
    // Check Franchise Name requirement (either ID or Text)
    const fText = state.comboboxes["combo-anime-franchise"]
      ? state.comboboxes["combo-anime-franchise"].input.value.trim()
      : "";
    const fId = state.comboboxes["combo-anime-franchise"]
      ? state.comboboxes["combo-anime-franchise"].selectedId
      : null;
    if (!fText && !fId) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "A Franchise Name (selected or typed) must be provided.",
        );
      alert("A Franchise Name (selected or typed) must be provided.");
      return;
    }

    // Check Anime Name requirement (at least one)
    const en = form.querySelector('[data-field="anime_name_en"]').value.trim();
    const cn = form.querySelector('[data-field="anime_name_cn"]').value.trim();
    const rom = form
      .querySelector('[data-field="anime_name_romanji"]')
      .value.trim();
    const jp = form.querySelector('[data-field="anime_name_jp"]').value.trim();
    const alt = form
      .querySelector('[data-field="anime_name_alt"]')
      .value.trim();

    if (!en && !cn && !rom && !jp && !alt) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "At least one Anime Name must be provided.",
        );
      alert("At least one Anime Name must be provided.");
      return;
    }
  } else if (type === "franchise") {
    const en = form
      .querySelector('[data-field="franchise_name_en"]')
      .value.trim();
    const cn = form
      .querySelector('[data-field="franchise_name_cn"]')
      .value.trim();
    const rom = form
      .querySelector('[data-field="franchise_name_romanji"]')
      .value.trim();
    const jp = form
      .querySelector('[data-field="franchise_name_jp"]')
      .value.trim();
    const alt = form
      .querySelector('[data-field="franchise_name_alt"]')
      .value.trim();

    if (!en && !cn && !rom && !jp && !alt) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "At least one Franchise Name must be provided.",
        );
      alert("At least one Franchise Name must be provided.");
      return;
    }
  } else if (type === "series") {
    const en = form.querySelector('[data-field="series_name_en"]').value.trim();
    const cn = form.querySelector('[data-field="series_name_cn"]').value.trim();
    const alt = form
      .querySelector('[data-field="series_name_alt"]')
      .value.trim();

    if (!en && !cn && !alt) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "At least one Series Name must be provided.",
        );
      alert("At least one Series Name must be provided.");
      return;
    }
  }

  pageDOM.btnAppend.innerHTML =
    '<i class="fas fa-spinner fa-spin mr-2"></i> Appending...';
  pageDOM.btnAppend.classList.add("opacity-75", "pointer-events-none");

  // ==========================================
  // MULTI-APPEND LOGIC FOR SYSTEM OPTIONS
  // ==========================================
  if (type === "options") {
    const category = document.getElementById("opt-category").value.trim();
    const valueInputs = Array.from(form.querySelectorAll(".option-value-input"))
      .map((i) => i.value.trim())
      .filter(Boolean);

    if (!category || valueInputs.length === 0) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "Category and at least one value are required.",
        );
      resetBtn();
      return;
    }

    try {
      const promises = valueInputs.map((val) =>
        fetch(`/api/options/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: category, option_value: val }),
        }),
      );

      const responses = await Promise.all(promises);
      const errors = [];
      let successCount = 0;

      for (let i = 0; i < responses.length; i++) {
        if (!responses[i].ok) {
          const errData = await responses[i].json();
          errors.push(`'${valueInputs[i]}': ${errData.detail || "Failed"}`);
        } else {
          successCount++;
        }
      }

      if (errors.length > 0) {
        if (successCount > 0) {
          if (typeof showNotification === "function")
            showNotification(
              "warning",
              `Added ${successCount} entries, but some failed: ${errors.join(" | ")}`,
            );
        } else {
          throw new Error(errors.join(" | "));
        }
      } else {
        if (typeof showNotification === "function")
          showNotification(
            "success",
            `Successfully appended ${successCount} option(s).`,
          );
      }

      if (successCount > 0) {
        displayLastAdded(`${category}: ${valueInputs.join(", ")}`);
        resetForms();
        fetchDatabase();
      }
    } catch (e) {
      console.error(e);
      if (typeof showNotification === "function")
        showNotification("error", e.message);
      alert(`Error appending options: ${e.message}`);
    } finally {
      resetBtn();
    }
    return;
  }

  // ==========================================
  // SINGLE-APPEND LOGIC FOR ANIME/FRANCHISE/SERIES
  // ==========================================
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
      else payload[key] = null;
    } else if (el.classList.contains("number-select") || el.type === "number") {
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

    // --- STRICT EPISODE VALIDATION ---
    const epTotal = payload.ep_total !== null ? Number(payload.ep_total) : null;
    const epFin = payload.ep_fin !== null ? Number(payload.ep_fin) : 0;

    if ((epTotal !== null && epTotal < 0) || epFin < 0) {
      if (typeof showNotification === "function")
        showNotification("warning", "Episode counts cannot be less than zero.");
      alert("Validation Error: Episode counts cannot be less than zero.");
      resetBtn();
      return;
    }

    if (epTotal !== null && epFin > epTotal) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "Episode Finished cannot exceed Total Episodes.",
        );
      alert("Validation Error: Episode Finished cannot exceed Total Episodes.");
      resetBtn();
      return;
    }
  }

  if (type === "series") {
    if (!payload.franchise_id) {
      if (typeof showNotification === "function")
        showNotification(
          "warning",
          "You must select a valid, existing Franchise.",
        );
      resetBtn();
      return;
    }
  }

  try {
    // 1. Create on the Fly
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
          throw new Error(
            "Cannot auto-create series without a valid franchise_id.",
          );
        const newSId = await triggerCreateModal("Series", sText, payload);
        if (!newSId) throw new Error("Canceled");
        payload.series_id = newSId;
      }
    }

    Object.keys(payload).forEach((k) => {
      if (k.startsWith("_")) delete payload[k];
    });

    // 2. Duplicate Check
    const isDuplicate = checkDuplicate(type, payload);
    if (isDuplicate) {
      const proceed = await triggerDuplicateModal(type, payload);
      if (!proceed) throw new Error("Canceled");
    }

    // 3. Execute Append
    const res = await fetch(`/api/${type}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorMessage = `Server Error (${res.status})`;
      try {
        const errData = await res.json();
        errorMessage = errData.detail || JSON.stringify(errData);
      } catch (e) {
        errorMessage = await res.text();
      }
      throw new Error(errorMessage);
    }

    const data = await res.json();

    // 4. Cleanup & Feedback
    if (typeof showNotification === "function")
      showNotification("success", "Entry appended successfully.");

    let addedTitle = "";
    if (type === "anime")
      addedTitle =
        payload.anime_name_en ||
        payload.anime_name_cn ||
        payload.anime_name_romanji ||
        payload.anime_name_jp ||
        payload.anime_name_alt;
    else if (type === "franchise")
      addedTitle =
        payload.franchise_name_en ||
        payload.franchise_name_cn ||
        payload.franchise_name_romanji ||
        payload.franchise_name_jp;
    else if (type === "series")
      addedTitle = payload.series_name_en || payload.series_name_cn;

    displayLastAdded(addedTitle);
    resetForms();
    fetchDatabase();
  } catch (e) {
    console.error(e);
    if (e.message !== "Canceled" && e.message !== "Validation Failed") {
      if (typeof showNotification === "function")
        showNotification("error", `Failed: ${e.message}`);
      alert(`Backend Validation Failed: \n\n${e.message}`);
    }
  } finally {
    resetBtn();
  }
}

function checkDuplicate(type, payload) {
  if (type === "anime") {
    return state.db.anime.some(
      (a) =>
        (a.anime_name_en &&
          payload.anime_name_en &&
          a.anime_name_en.toLowerCase() ===
            payload.anime_name_en.toLowerCase()) ||
        (a.anime_name_cn &&
          payload.anime_name_cn &&
          a.anime_name_cn.toLowerCase() ===
            payload.anime_name_cn.toLowerCase()),
    );
  } else if (type === "franchise") {
    return state.db.franchise.some(
      (f) =>
        (f.franchise_name_en &&
          payload.franchise_name_en &&
          f.franchise_name_en.toLowerCase() ===
            payload.franchise_name_en.toLowerCase()) ||
        (f.franchise_name_cn &&
          payload.franchise_name_cn &&
          f.franchise_name_cn.toLowerCase() ===
            payload.franchise_name_cn.toLowerCase()),
    );
  } else if (type === "series") {
    return state.db.series.some(
      (s) =>
        s.franchise_id === payload.franchise_id &&
        ((s.series_name_en &&
          payload.series_name_en &&
          s.series_name_en.toLowerCase() ===
            payload.series_name_en.toLowerCase()) ||
          (s.series_name_cn &&
            payload.series_name_cn &&
            s.series_name_cn.toLowerCase() ===
              payload.series_name_cn.toLowerCase())),
    );
  }
  return false;
}

function triggerDuplicateModal(type, payload) {
  return new Promise((resolve) => {
    const modal = document.getElementById("duplicate-modal");
    const textEl = document.getElementById("duplicate-modal-text");
    const btnConfirm = document.getElementById("btn-confirm-duplicate");

    let name =
      type === "anime"
        ? payload.anime_name_en || payload.anime_name_cn
        : type === "franchise"
          ? payload.franchise_name_en ||
            payload.franchise_name_cn ||
            payload.franchise_name_romanji ||
            payload.franchise_name_jp
          : payload.series_name_en || payload.series_name_cn;

    textEl.innerHTML = `An entry with the name <strong>"${name}"</strong> appears to already exist in the database.<br><br>Are you sure you want to proceed and create a duplicate?`;
    modal.classList.remove("hidden");

    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      modal.classList.add("hidden");
      btnConfirm.removeEventListener("click", onConfirm);
      modal.querySelector("button").removeEventListener("click", onCancel);
    };

    btnConfirm.addEventListener("click", onConfirm);
    modal.querySelector("button").addEventListener("click", onCancel);
  });
}

function triggerCreateModal(type, textName, animePayload) {
  return new Promise((resolve) => {
    const modal = document.getElementById("create-modal");
    const textEl = document.getElementById("create-modal-text");
    const btnConfirm = document.getElementById("btn-confirm-create");

    textEl.innerHTML = `<strong>"${textName}"</strong> was not found in the database.<br><br>Do you want to create a new <strong>${type} Hub</strong>?`;
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
            franchise_name_en: textName,
            franchise_name_cn: animePayload.anime_name_cn,
          };
        } else {
          body = {
            franchise_id: animePayload.franchise_id,
            series_name_en: textName,
            series_name_cn: animePayload.anime_name_cn,
          };
        }
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "API Error");
        }
        const data = await res.json();
        cleanup();
        resolve(data.system_id);
      } catch (e) {
        alert(`Failed to auto-create ${type}: ${e.message}`);
        if (typeof showNotification === "function")
          showNotification("error", `Failed to auto-create ${type}`);
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

// --- CUSTOM COMPONENTS ---

// Display Fallback Logic (CN -> EN -> Alt -> Romanji -> JP)
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

    // SAFE CLICK-OUTSIDE (Replaces Blur)
    document.addEventListener("mousedown", (e) => {
      if (!this.container.contains(e.target)) {
        this.dropdown.classList.remove("open");
      }
    });
  }

  showDropdown(filterText = "") {
    this.refreshData();
    const cleanFilter = getClean(filterText);
    const rawFilter = filterText.trim().toLowerCase();
    let perfectMatch = null;

    const matches = this.data.filter((item) => {
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
      if (names.some((n) => n && n.trim().toLowerCase() === rawFilter))
        perfectMatch = item;
      return names.some((n) => n && getClean(n).includes(cleanFilter));
    });

    if (perfectMatch && filterText.trim() !== "") {
      this.selectedId = perfectMatch.system_id;
    }

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
    if (!id) {
      this.input.value = "";
    } else {
      this.refreshData();
      const item = this.data.find((i) => i.system_id === id);
      if (item) {
        this.input.value =
          this.resourceType === "franchise"
            ? getDisplayTitleF(item)
            : getDisplayTitleS(item);
      }
    }
  }

  clear() {
    this.selectedId = null;
    this.input.value = "";
  }
}

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

    // SAFE CLICK-OUTSIDE (Replaces Blur)
    document.addEventListener("mousedown", (e) => {
      if (!this.container.contains(e.target)) {
        this.dropdown.classList.remove("open");
      }
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
      ) {
        this.removeOption(this.selected[this.selected.length - 1]);
      }
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
  clear() {
    this.selected = [];
    this.renderPills();
  }
}
