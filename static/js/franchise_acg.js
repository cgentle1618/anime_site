/**
 * static/js/franchise_acg.js
 * Handles data fetching, UI rendering, grouping, filtering, and admin patching for ACG Franchise Hubs.
 */

// Setup Constants (IS_ADMIN_FRANCHISE is securely injected via Jinja2 in the HTML)
const IS_ADMIN_FRANCHISE = window.IS_ADMIN_FRANCHISE || false;
const FRANCHISE_ID = window.location.pathname.split("/").pop();

// Data State
const state = {
  franchise: null,
  seriesList: [],
  animeList: [],
  currentSort: "title",
  filters: {
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  },
};

// DOM Cache
const pageDOM = {};

document.addEventListener("DOMContentLoaded", () => {
  // Cache Elements
  pageDOM.loading = document.getElementById("loading");
  pageDOM.content = document.getElementById("franchise-content");
  pageDOM.breadcrumbTitle = document.getElementById("breadcrumb-title");

  // Header Data
  pageDOM.titleMain = document.getElementById("title-main");
  pageDOM.titleSub = document.getElementById("title-sub");
  pageDOM.titleAlt = document.getElementById("title-alt");
  pageDOM.heroBadges = document.getElementById("hero-badges");

  // Inputs (Safely fetch them, as they might not exist if Guest)
  pageDOM.selRating = document.getElementById("select-franchise-rating");
  pageDOM.selExpectation = document.getElementById(
    "select-franchise-expectation",
  );
  pageDOM.txtRemark = document.getElementById("input-remark");

  // Sort & Filter UI
  pageDOM.sortDropdown = document.getElementById("sort-dropdown");
  pageDOM.filterBaha = document.getElementById("filter-baha");

  // Completion Tracking UI
  pageDOM.txtCompletion = document.getElementById("text-completion");
  pageDOM.barCompletion = document.getElementById("bar-completion");
  pageDOM.txtCompletionCount = document.getElementById("text-completion-count");

  // Containers
  pageDOM.animeGroupsContainer = document.getElementById(
    "anime-groups-container",
  );
  pageDOM.countAnime = document.getElementById("count-anime");

  setupEventDelegation();
  loadFranchiseHub();
});

async function loadFranchiseHub() {
  try {
    // Parallel fetch the core data for this specific franchise
    const [franchiseRes, seriesRes, animeRes] = await Promise.all([
      fetch(`/api/franchise/${FRANCHISE_ID}`),
      fetch(`/api/series/?franchise_id=${FRANCHISE_ID}`),
      fetch(`/api/anime/?franchise_id=${FRANCHISE_ID}`),
    ]);

    if (!franchiseRes.ok) throw new Error("Franchise details not found");

    state.franchise = await franchiseRes.json();
    state.seriesList = await seriesRes.json();
    state.animeList = await animeRes.json();

    renderUI();

    pageDOM.loading.classList.add("hidden");
    pageDOM.content.classList.remove("hidden");
  } catch (error) {
    pageDOM.loading.innerHTML = `
        <div class="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
            <i class="fas fa-exclamation-triangle mb-2 text-2xl"></i>
            <p class="font-bold">Error Loading Franchise Data</p>
            <p class="text-sm mt-1">${error.message}</p>
        </div>`;
  }
}

function renderUI() {
  const f = state.franchise;

  // 1. Strict Titles Fallback Logic
  const rawTitles = [
    f.franchise_name_cn,
    f.franchise_name_en,
    f.franchise_name_alt,
    f.franchise_name_romanji,
    f.franchise_name_jp,
  ];
  const validTitles = rawTitles.filter((t) => t && t.trim() !== "");
  const uniqueTitles = [...new Set(validTitles)]; // Remove exact duplicates

  const titleMain = uniqueTitles[0] || "Unknown Franchise";
  const titleSub = uniqueTitles[1] || "";
  const titleAlt = uniqueTitles[2] || "";

  pageDOM.titleMain.innerText = titleMain;
  pageDOM.titleMain.title = titleMain;

  if (titleSub) {
    pageDOM.titleSub.innerText = titleSub;
    pageDOM.titleSub.title = titleSub;
    pageDOM.titleSub.classList.remove("hidden");
  } else {
    pageDOM.titleSub.classList.add("hidden");
  }

  if (titleAlt) {
    pageDOM.titleAlt.innerText = titleAlt;
    pageDOM.titleAlt.title = titleAlt;
    pageDOM.titleAlt.classList.remove("hidden");
  } else {
    pageDOM.titleAlt.classList.add("hidden");
  }

  pageDOM.breadcrumbTitle.innerText = titleMain;

  // 2. Badges (Rating, Expectation, 3x3) - Visible to everyone
  let badgesHtml = "";

  if (f.my_rating) {
    badgesHtml += `<span class="bg-yellow-100 text-yellow-800 border-yellow-300 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider shadow-sm"><i class="fas fa-star text-[9px] mr-1"></i>${f.my_rating}</span>`;
  }

  if (f.franchise_expectation) {
    let expColor = "bg-gray-100 text-gray-700 border-gray-200";
    if (f.franchise_expectation === "High")
      expColor = "bg-purple-100 text-purple-700 border-purple-200";
    else if (f.franchise_expectation === "Medium")
      expColor = "bg-blue-100 text-blue-700 border-blue-200";

    badgesHtml += `<span class="${expColor} px-2.5 py-1 rounded-md text-[11px] font-bold border shadow-sm uppercase tracking-wider"><i class="fas fa-fire mr-1.5 opacity-70"></i>${f.franchise_expectation}</span>`;
  }

  if (f.favorite_3x3_slot) {
    badgesHtml += `<span class="bg-orange-100 text-orange-800 border-orange-300 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider shadow-sm"><i class="fas fa-th mr-1.5"></i>3x3 Slot: ${f.favorite_3x3_slot}</span>`;
  }
  pageDOM.heroBadges.innerHTML = badgesHtml;

  // 3. Form Binding
  if (pageDOM.selRating) pageDOM.selRating.value = f.my_rating || "";
  if (pageDOM.selExpectation)
    pageDOM.selExpectation.value = f.franchise_expectation || "Low";
  if (pageDOM.txtRemark) pageDOM.txtRemark.value = f.remark || "";

  // 4. Update Completion Stats FIRST so we don't accidentally nest elements
  updateCompletionPercentage();

  // 5. Render Anime Section
  renderAnimeSection();
}

function updateCompletionPercentage() {
  const totalEntries = state.animeList.length;
  const completedEntries = state.animeList.filter(
    (a) => a.watching_status === "Completed",
  ).length;

  let completionPercent = 0;
  if (totalEntries > 0) {
    completionPercent = Math.round((completedEntries / totalEntries) * 100);
  }

  pageDOM.txtCompletion.innerText = `${completionPercent}%`;
  pageDOM.barCompletion.style.width = `${completionPercent}%`;
  pageDOM.txtCompletionCount.innerText = `${completedEntries} / ${totalEntries} Total Entries`;
}

function renderAnimeSection() {
  // 1. Apply Filtering Engine
  const filteredAnime = state.animeList.filter((a) => {
    // Airing Type
    if (
      state.filters.airingType.size > 0 &&
      !state.filters.airingType.has(a.airing_type)
    )
      return false;

    // Airing Status
    if (
      state.filters.airingStatus.size > 0 &&
      !state.filters.airingStatus.has(a.airing_status)
    )
      return false;

    // Baha Source
    if (state.filters.bahaOnly) {
      const isBaha =
        a.source_baha === true ||
        String(a.source_baha).toLowerCase() === "true";
      if (!isBaha) return false;
    }

    // Watching Status (Custom Groupings)
    if (state.filters.watchingStatus.size > 0) {
      const s = a.watching_status || "Might Watch";
      let group = "Might Watch";

      if (["Plan to Watch", "Watch When Airs"].includes(s)) group = "Planned";
      else if (["Active Watching", "Passive Watching", "Paused"].includes(s))
        group = "Watching";
      else if (s === "Completed") group = "Completed";
      else if (["Temp Dropped", "Dropped", "Won't Watch"].includes(s))
        group = "Dropped";

      if (!state.filters.watchingStatus.has(group)) return false;
    }

    return true;
  });

  pageDOM.countAnime.innerText = `${filteredAnime.length} Entries`;

  if (filteredAnime.length === 0) {
    pageDOM.animeGroupsContainer.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 px-4 bg-white/50 rounded-xl border border-gray-200 border-dashed">
              <i class="fas fa-ghost text-4xl text-gray-300 mb-3"></i>
              <p class="text-gray-500 font-bold">No Anime Entries Found</p>
              <p class="text-sm text-gray-400 mt-1">Try adjusting your filters or search criteria.</p>
          </div>
        `;
    return;
  }

  // 2. Grouping Engine (using filtered data)
  const groupedData = {};
  state.seriesList.forEach((s) => {
    groupedData[s.system_id] = { series: s, items: [] };
  });
  groupedData["independent"] = { series: null, items: [] };

  filteredAnime.forEach((a) => {
    if (a.series_id && groupedData[a.series_id])
      groupedData[a.series_id].items.push(a);
    else groupedData["independent"].items.push(a);
  });

  let html = "";

  // Prioritize populated series, Independent goes last
  const groupKeys = Object.keys(groupedData).filter(
    (k) => k !== "independent" && groupedData[k].items.length > 0,
  );

  groupKeys.forEach((key) => {
    html += buildSeriesGroupHTML(groupedData[key], false, "anime");
  });

  if (groupedData["independent"].items.length > 0) {
    html += buildSeriesGroupHTML(groupedData["independent"], true, "anime");
  }

  pageDOM.animeGroupsContainer.innerHTML = html;
}

function buildSeriesGroupHTML(
  groupObj,
  isIndependent = false,
  entryType = "anime",
) {
  // Dynamic Sorting Engine
  groupObj.items.sort((a, b) => {
    const sortBy = state.currentSort || "title";

    if (sortBy === "watch_order" && entryType === "anime") {
      const wA =
        a.watch_order !== null &&
        a.watch_order !== undefined &&
        a.watch_order !== ""
          ? parseFloat(a.watch_order)
          : 999999;
      const wB =
        b.watch_order !== null &&
        b.watch_order !== undefined &&
        b.watch_order !== ""
          ? parseFloat(b.watch_order)
          : 999999;
      if (wA !== wB) return wA - wB;
    } else if (sortBy === "release_date") {
      const getScore = (item) => {
        const y = item.release_year ? parseInt(item.release_year, 10) : 9999;
        const mMap = {
          JAN: 1,
          FEB: 2,
          MAR: 3,
          APR: 4,
          MAY: 5,
          JUN: 6,
          JUL: 7,
          AUG: 8,
          SEP: 9,
          OCT: 10,
          NOV: 11,
          DEC: 12,
        };
        const mStr = item.release_month ? item.release_month.toUpperCase() : "";
        const m = mMap[mStr] || 12;
        return y * 100 + m;
      };
      const scoreA = getScore(a);
      const scoreB = getScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB; // chronological ASC
    } else if (sortBy === "my_rating") {
      const rMap = { S: 0, "A+": 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };
      const wA = rMap[a.my_rating] !== undefined ? rMap[a.my_rating] : 99;
      const wB = rMap[b.my_rating] !== undefined ? rMap[b.my_rating] : 99;
      if (wA !== wB) return wA - wB; // highest tier first
    } else if (sortBy === "mal_rating") {
      const wA =
        a.mal_rating !== null && a.mal_rating !== undefined
          ? parseFloat(a.mal_rating)
          : -1;
      const wB =
        b.mal_rating !== null && b.mal_rating !== undefined
          ? parseFloat(b.mal_rating)
          : -1;
      if (wA !== wB) return wB - wA; // DESC, highest score first
    }

    // Default / Fallback: Title Sort
    const titleA =
      a.anime_name_en ||
      a.anime_name_romanji ||
      a.anime_name_cn ||
      a.anime_name_jp ||
      a.anime_name_alt ||
      "";
    const titleB =
      b.anime_name_en ||
      b.anime_name_romanji ||
      b.anime_name_cn ||
      b.anime_name_jp ||
      b.anime_name_alt ||
      "";
    return titleA.localeCompare(titleB);
  });

  let seriesTitle = "Independent Entries / Standalone";
  let seriesLinkHtml = "";

  if (!isIndependent && groupObj.series) {
    const s = groupObj.series;
    const titles = [
      s.series_name_cn,
      s.series_name_en,
      s.series_name_alt,
    ].filter((t) => t && t.trim() !== "");
    seriesTitle = [...new Set(titles)][0] || "Unnamed Series";
    seriesLinkHtml = `<a href="/series/${s.system_id}" class="text-xs text-brand hover:underline font-bold ml-4"><i class="fas fa-external-link-alt mr-1"></i>View Hub</a>`;
  }

  const cardsHtml = groupObj.items.map((a) => createAnimeEntryCard(a)).join("");

  return `
      <section class="space-y-6 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div class="border-b-2 border-gray-100 pb-3 flex items-center justify-between">
              <div class="flex items-center">
                  <h3 class="text-lg font-black text-gray-800 flex items-center">
                      <i class="fas ${isIndependent ? "fa-unlink text-gray-400" : "fa-layer-group text-purple-500"} mr-2.5"></i> ${seriesTitle}
                  </h3>
                  ${seriesLinkHtml}
              </div>
              <span class="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-gray-200 shadow-inner">${groupObj.items.length} Entries</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              ${cardsHtml}
          </div>
      </section>
    `;
}

function createAnimeEntryCard(anime) {
  // 1. Strict Title Fallback (CN -> EN -> Alt -> Romanji -> JP)
  const title =
    anime.anime_name_cn ||
    anime.anime_name_en ||
    anime.anime_name_alt ||
    anime.anime_name_romanji ||
    anime.anime_name_jp ||
    "Unknown Title";

  // 2. Poster Image setup
  const fallbackSvg = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  let imageUrl = fallbackSvg;
  if (anime.cover_image_file && anime.cover_image_file !== "N/A") {
    imageUrl = isLocalhost
      ? `/static/covers/${anime.cover_image_file}`
      : `https://storage.googleapis.com/cg1618-anime-covers/${anime.cover_image_file}`;
  }

  // 3. Badges & Icons
  const myRatingBadge = anime.my_rating
    ? `<div class="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm"><i class="fas fa-star text-[8px] mr-1"></i>${anime.my_rating}</div>`
    : "";

  const malRatingText = anime.mal_rating
    ? `<i class="fas fa-star text-blue-500 mr-0.5"></i>${anime.mal_rating}`
    : `<i class="fas fa-star text-gray-300 mr-0.5"></i>-`;

  const isBaha =
    anime.source_baha === true ||
    String(anime.source_baha).toLowerCase() === "true";
  const bahaBadge = isBaha
    ? `<div class="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center" title="Available on Bahamut"><img src="https://i2.bahamut.com.tw/anime/logo.svg" class="h-3 opacity-90" alt="Baha"></div>`
    : "";

  const airingTypeBadge = `<div class="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20"><i class="fas fa-tv mr-1 text-brand"></i>${anime.airing_type || "TV"}</div>`;

  // 4. Release Season Fallback (Season Year -> Month Year -> Year)
  let releaseFallback = "TBA";
  if (anime.release_season && anime.release_year) {
    releaseFallback = `${anime.release_season} ${anime.release_year}`;
  } else if (anime.release_month && anime.release_year) {
    releaseFallback = `${anime.release_month} ${anime.release_year}`;
  } else if (anime.release_year) {
    releaseFallback = anime.release_year;
  }

  // 5. --- CLEAN BACKEND MATH (Pydantic Computed Fields) ---
  const localFin = anime.ep_fin || 0;
  const localTotal =
    anime.ep_total !== null &&
    anime.ep_total !== undefined &&
    anime.ep_total !== ""
      ? parseInt(anime.ep_total, 10)
      : "?";

  const cumFin = anime.cum_ep_fin ?? localFin;
  const cumTotal = anime.cum_ep_total ?? localTotal;

  // 6. Action Button (Admin + toggle) OR Text (Guest)
  let statusHtml = "";
  if (IS_ADMIN_FRANCHISE && window.getGlobalStatusToggleData) {
    // Leverages the global toggle function we extracted to base.js
    const toggleData = window.getGlobalStatusToggleData(anime.watching_status);
    statusHtml = `
            <button data-action="toggle-status" data-id="${anime.system_id}" data-next-status="${toggleData.nextStatus}" class="w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors ${toggleData.cls}" title="${anime.watching_status || "Might Watch"} \u2192 ${toggleData.nextStatus}">
                ${toggleData.html}
            </button>
        `;
  } else if (anime.watching_status) {
    statusHtml = `
            <div class="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate" title="${anime.watching_status}">
                ${anime.watching_status}
            </div>
        `;
  }

  // Watch order visibility toggle based on sorting criteria
  const showWatchOrder =
    state.currentSort === "watch_order" &&
    anime.watch_order !== null &&
    anime.watch_order !== undefined
      ? `<div class="absolute bottom-1 right-1 bg-brand/90 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-md z-10 border border-white/30" title="Watch Order #${anime.watch_order}">${anime.watch_order}</div>`
      : "";

  return `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden card-hover shadow-sm flex flex-col h-full cursor-pointer relative group" data-action="view-details" data-id="${anime.system_id}">
          <div class="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
              ${myRatingBadge}
              ${airingTypeBadge}
              ${bahaBadge}
              ${showWatchOrder}

              <img src="${imageUrl}" alt="Cover" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" onerror="this.src='${fallbackSvg}'">
          </div>

          <div class="p-3 flex flex-col flex-1 relative z-20 bg-white">
              <h3 class="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5" title="${title}">${title}</h3>

              <div class="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between">
                  <span class="truncate pr-1">${releaseFallback}</span>
                  <span class="shrink-0 flex items-center">${malRatingText}</span>
              </div>

              <div class="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
                  <div class="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
                      ${cumFin} <span class="text-gray-400">/</span> ${cumTotal}
                  </div>
                  ${statusHtml}
              </div>
          </div>
      </div>
    `;
}

// --- INTERACTION LOGIC ---

function setupEventDelegation() {
  const btnQuickEdit = document.getElementById("btn-quick-edit");
  if (btnQuickEdit) {
    btnQuickEdit.addEventListener("click", () => {
      window.location.href = `/modify?id=${FRANCHISE_ID}`;
    });
  }

  const handleFieldChange = (e) => {
    const fieldEl = e.target.closest("[data-update-field]");
    if (fieldEl) {
      const payload = {};
      let val = fieldEl.value;
      if (val === "") val = null;
      payload[fieldEl.dataset.updateField] = val;
      performFranchiseUpdate(payload, "Franchise updated successfully");
    }
  };

  pageDOM.content.addEventListener("change", (e) => {
    if (
      e.target.tagName === "SELECT" &&
      e.target.hasAttribute("data-update-field")
    ) {
      handleFieldChange(e);
    }
  });

  pageDOM.content.addEventListener("focusout", (e) => {
    if (e.target.id === "input-remark") handleFieldChange(e);
  });

  // Filtering & Sorting Listeners
  if (pageDOM.sortDropdown) {
    pageDOM.sortDropdown.addEventListener("change", (e) => {
      state.currentSort = e.target.value;
      renderAnimeSection();
    });
  }

  if (pageDOM.filterBaha) {
    pageDOM.filterBaha.addEventListener("change", (e) => {
      state.filters.bahaOnly = e.target.checked;
      renderAnimeSection();
    });
  }

  // Card Actions and Filter Tags
  pageDOM.content.addEventListener("click", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "OPTION") return;

    // Multi-Select Filter Tag Toggling
    const filterTag = e.target.closest(".filter-tag");
    if (filterTag) {
      e.stopPropagation();
      const group = filterTag.dataset.filterGroup;
      const val = filterTag.dataset.filterValue;

      if (state.filters[group].has(val)) {
        // Deselect
        state.filters[group].delete(val);
        filterTag.classList.remove("bg-brand", "text-white", "border-brand");
        filterTag.classList.add(
          "bg-gray-50",
          "text-gray-500",
          "border-gray-200",
        );
      } else {
        // Select
        state.filters[group].add(val);
        filterTag.classList.remove(
          "bg-gray-50",
          "text-gray-500",
          "border-gray-200",
        );
        filterTag.classList.add("bg-brand", "text-white", "border-brand");
      }

      renderAnimeSection();
      return;
    }

    // The global status toggle is handled in base.js now. We just need to listen for the event!
    // Navigation is still handled here.
    const cardEl = e.target.closest('[data-action="view-details"]');
    if (cardEl && !e.target.closest('[data-action="toggle-status"]')) {
      window.location.href = `/anime/${cardEl.dataset.id}`;
    }
  });

  // Listen for the custom event dispatched by base.js when a status is toggled
  document.addEventListener("animeStatusUpdated", (e) => {
    const { animeId, updatedAnime } = e.detail;
    if (updatedAnime) {
      const idx = state.animeList.findIndex((a) => a.system_id === animeId);
      if (idx !== -1) {
        state.animeList[idx] = updatedAnime;
        renderAnimeSection();
        updateCompletionPercentage();
      }
    }
  });
}

// API Callers
async function performFranchiseUpdate(payload, successMessage) {
  if (!IS_ADMIN_FRANCHISE) return;
  Object.assign(state.franchise, payload);

  try {
    const res = await fetch(`/api/franchise/${FRANCHISE_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Sync failed");
    if (typeof showNotification === "function")
      showNotification("success", successMessage);
  } catch (e) {
    console.error(e);
    if (typeof showNotification === "function")
      showNotification("error", "Network error. Reverting.");
    loadFranchiseHub();
  }
}
