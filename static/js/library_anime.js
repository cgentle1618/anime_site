/**
 * static/js/library_anime.js
 * Handles data fetching, advanced filtering, multi-field searching, sorting, and view toggling.
 */

// Setup Constants (IS_ADMIN_LIBRARY_ANIME is securely injected via Jinja2 in the HTML)
const IS_ADMIN_LIBRARY_ANIME = window.IS_ADMIN_LIBRARY_ANIME || false;

// State Management
const state = {
  allAnime: [],
  filteredAnime: [],
  franchiseDict: {},
  seriesDict: {},

  searchQuery: "",
  currentSort: "title",
  currentView: "grid", // 'grid' or 'table'

  filters: {
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  },
};

// DOM Cache
const pageDOM = {};

// Title Helper for Display (Fallback: CN -> EN -> Alt -> Romanji -> JP)
function getDisplayName(item, type) {
  if (!item) return "";
  if (type === "series") {
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown Series"
    );
  }
  return (
    item[`${type}_name_cn`] ||
    item[`${type}_name_en`] ||
    item[`${type}_name_alt`] ||
    item[`${type}_name_romanji`] ||
    item[`${type}_name_jp`] ||
    "Unknown Title"
  );
}

// Title Helper for Sorting (Fallback: EN -> Romanji -> CN -> Alt -> JP)
function getSortName(item, type) {
  if (!item) return "";
  if (type === "series") {
    return (
      item.series_name_en || item.series_name_cn || item.series_name_alt || ""
    );
  }
  return (
    item[`${type}_name_en`] ||
    item[`${type}_name_romanji`] ||
    item[`${type}_name_cn`] ||
    item[`${type}_name_alt`] ||
    item[`${type}_name_jp`] ||
    ""
  );
}

document.addEventListener("DOMContentLoaded", () => {
  // General
  pageDOM.loading = document.getElementById("loading");
  pageDOM.content = document.getElementById("main-content");
  pageDOM.countResults = document.getElementById("count-results");
  pageDOM.emptyState = document.getElementById("empty-state");

  // Top Bar Controls
  pageDOM.inputSearch = document.getElementById("input-search");
  pageDOM.btnClearSearch = document.getElementById("btn-clear-search");
  pageDOM.sortDropdown = document.getElementById("sort-dropdown");

  pageDOM.btnToggleFilters = document.getElementById("btn-toggle-filters");
  pageDOM.advancedFilters = document.getElementById("advanced-filters");
  pageDOM.badgeFilterCount = document.getElementById("badge-filter-count");
  pageDOM.btnClearFilters = document.getElementById("btn-clear-filters");

  pageDOM.btnViewGrid = document.getElementById("btn-view-grid");
  pageDOM.btnViewTable = document.getElementById("btn-view-table");

  // Containers
  pageDOM.viewGrid = document.getElementById("view-container-grid");
  pageDOM.viewTable = document.getElementById("view-container-table");
  pageDOM.tableBody = document.getElementById("table-body");

  // Individual Filter Elements
  pageDOM.filterBaha = document.getElementById("filter-baha");

  setupEventListeners();
  fetchDatabase();
});

async function fetchDatabase() {
  try {
    const [animeRes, franchiseRes, seriesRes] = await Promise.all([
      fetch("/api/anime/"),
      fetch("/api/franchise/"),
      fetch("/api/series/"),
    ]);

    if (!animeRes.ok || !franchiseRes.ok || !seriesRes.ok)
      throw new Error("Failed to fetch database records");

    state.allAnime = await animeRes.json();
    const rawFranchises = await franchiseRes.json();
    const rawSeries = await seriesRes.json();

    // Build Dictionary lookups for fast search resolution & table rendering
    rawFranchises.forEach((f) => (state.franchiseDict[f.system_id] = f));
    rawSeries.forEach((s) => (state.seriesDict[s.system_id] = s));

    pageDOM.loading.classList.add("hidden");
    pageDOM.content.classList.remove("hidden");

    processFiltersAndSort();
  } catch (error) {
    pageDOM.loading.innerHTML = `
            <div class="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
                <i class="fas fa-exclamation-triangle mb-2 text-2xl"></i>
                <p class="font-bold">Database Error</p>
                <p class="text-sm mt-1">${error.message}</p>
            </div>`;
  }
}

// Strict String Cleaner
function cleanString(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}

function processFiltersAndSort() {
  const queryClean = cleanString(state.searchQuery);

  // 1. Filter Logic
  state.filteredAnime = state.allAnime.filter((a) => {
    // --- Multi-Field Search Match ---
    if (queryClean) {
      const f = state.franchiseDict[a.franchise_id];
      const s = state.seriesDict[a.series_id];

      const seasonMap = {
        WIN: "Winter",
        SPR: "Spring",
        SUM: "Summer",
        FAL: "Fall",
      };
      const fullSeason = a.release_season
        ? seasonMap[a.release_season.toUpperCase()]
        : "";
      const compSeasonShort =
        a.release_season && a.release_year
          ? `${a.release_season}${a.release_year}`
          : "";
      const compSeasonFull =
        fullSeason && a.release_year ? `${fullSeason}${a.release_year}` : "";

      const searchFields = [
        a.anime_name_cn,
        a.anime_name_en,
        a.anime_name_romanji,
        a.anime_name_jp,
        a.anime_name_alt,
        f?.franchise_name_cn,
        f?.franchise_name_en,
        f?.franchise_name_romanji,
        f?.franchise_name_jp,
        f?.franchise_name_alt,
        s?.series_name_cn,
        s?.series_name_en,
        s?.series_name_romanji,
        s?.series_name_jp,
        s?.series_name_alt,
        a.release_season,
        fullSeason,
        compSeasonShort,
        compSeasonFull,
        a.release_date,
        a.release_year,
        a.genre_main,
        a.genre_sub,
      ];
      const isMatch = searchFields.some(
        (field) => field && cleanString(String(field)).includes(queryClean),
      );
      if (!isMatch) return false;
    }

    // --- Interactive Filters ---
    if (
      state.filters.airingType.size > 0 &&
      !state.filters.airingType.has(a.airing_type)
    )
      return false;
    if (
      state.filters.airingStatus.size > 0 &&
      !state.filters.airingStatus.has(a.airing_status)
    )
      return false;

    if (state.filters.bahaOnly) {
      const isBaha =
        a.source_baha === true ||
        String(a.source_baha).toLowerCase() === "true";
      if (!isBaha) return false;
    }

    if (state.filters.watchingStatus.size > 0) {
      const ws = a.watching_status || "Might Watch";
      let group = "Might Watch";
      if (["Plan to Watch", "Watch When Airs"].includes(ws)) group = "Planned";
      else if (["Active Watching", "Passive Watching", "Paused"].includes(ws))
        group = "Watching";
      else if (ws === "Completed") group = "Completed";
      else if (["Temp Dropped", "Dropped", "Won't Watch"].includes(ws))
        group = "Dropped";

      if (!state.filters.watchingStatus.has(group)) return false;
    }

    return true;
  });

  // 2. Sorting Logic
  state.filteredAnime.sort((a, b) => {
    const sortBy = state.currentSort;

    if (sortBy === "release_date") {
      // New to Old (DESC)
      const getScore = (item) => {
        const y = item.release_year ? parseInt(item.release_year, 10) : 0;
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
        const m = mMap[mStr] || 0;
        return y * 100 + m;
      };
      const scoreA = getScore(a);
      const scoreB = getScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
    } else if (sortBy === "my_rating") {
      const rMap = { S: 0, "A+": 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };
      const wA = rMap[a.my_rating] !== undefined ? rMap[a.my_rating] : 99;
      const wB = rMap[b.my_rating] !== undefined ? rMap[b.my_rating] : 99;
      if (wA !== wB) return wA - wB;
    } else if (sortBy === "mal_rating") {
      // DESC
      const wA =
        a.mal_rating !== null && a.mal_rating !== undefined
          ? parseFloat(a.mal_rating)
          : -1;
      const wB =
        b.mal_rating !== null && b.mal_rating !== undefined
          ? parseFloat(b.mal_rating)
          : -1;
      if (wA !== wB) return wB - wA;
    }

    // Default / Fallback: Title Sort (Hierarchical: Franchise -> Series -> Anime)
    const animeNameA = getSortName(a, "anime");
    const animeNameB = getSortName(b, "anime");

    const fA = state.franchiseDict[a.franchise_id];
    const fB = state.franchiseDict[b.franchise_id];
    const sA = state.seriesDict[a.series_id];
    const sB = state.seriesDict[b.series_id];

    // 1. Franchise Level Comparison
    const franchiseNameA = fA ? getSortName(fA, "franchise") : animeNameA;
    const franchiseNameB = fB ? getSortName(fB, "franchise") : animeNameB;

    const compFranchise = franchiseNameA.localeCompare(franchiseNameB);
    if (compFranchise !== 0) return compFranchise;

    // 2. Series Level Comparison (Empty string if independent so it comes before series)
    const seriesNameA = sA ? getSortName(sA, "series") : "";
    const seriesNameB = sB ? getSortName(sB, "series") : "";

    const compSeries = seriesNameA.localeCompare(seriesNameB);
    if (compSeries !== 0) return compSeries;

    // 3. Anime Level Comparison
    return animeNameA.localeCompare(animeNameB);
  });

  renderUI();
}

// --- RENDERERS ---
function renderUI() {
  pageDOM.countResults.innerText = state.filteredAnime.length;

  if (state.filteredAnime.length === 0) {
    pageDOM.viewGrid.classList.add("hidden");
    pageDOM.viewTable.classList.add("hidden");
    pageDOM.emptyState.classList.remove("hidden");
    return;
  }

  pageDOM.emptyState.classList.add("hidden");

  if (state.currentView === "grid") {
    pageDOM.viewTable.classList.add("hidden");
    pageDOM.viewGrid.classList.remove("hidden");
    pageDOM.viewGrid.innerHTML = state.filteredAnime
      .map((a) => createAnimeEntryCard(a))
      .join("");
  } else {
    pageDOM.viewGrid.classList.add("hidden");
    pageDOM.viewTable.classList.remove("hidden");
    pageDOM.tableBody.innerHTML = state.filteredAnime
      .map((a) => createAnimeTableRow(a))
      .join("");
  }
}

function createAnimeEntryCard(anime) {
  const title = getDisplayName(anime, "anime") || "Unknown Title";
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

  let releaseFallback = "TBA";
  if (anime.release_season && anime.release_year)
    releaseFallback = `${anime.release_season} ${anime.release_year}`;
  else if (anime.release_month && anime.release_year)
    releaseFallback = `${anime.release_month} ${anime.release_year}`;
  else if (anime.release_year) releaseFallback = anime.release_year;

  // --- CLEAN BACKEND MATH (Pydantic Computed Fields) ---
  const localFin = anime.ep_fin || 0;
  const localTotal =
    anime.ep_total !== null &&
    anime.ep_total !== undefined &&
    anime.ep_total !== ""
      ? parseInt(anime.ep_total, 10)
      : "?";

  const cumFin = anime.cum_ep_fin ?? localFin;
  const cumTotal = anime.cum_ep_total ?? localTotal;

  // Global Status Toggler
  let statusHtml = "";
  if (IS_ADMIN_LIBRARY_ANIME && window.getGlobalStatusToggleData) {
    const toggleData = window.getGlobalStatusToggleData(anime.watching_status);
    statusHtml = `<button data-action="toggle-status" data-id="${anime.system_id}" data-next-status="${toggleData.nextStatus}" class="w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors ${toggleData.cls}" title="${anime.watching_status || "Might Watch"} \u2192 ${toggleData.nextStatus}">${toggleData.html}</button>`;
  } else if (anime.watching_status) {
    statusHtml = `<div class="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate" title="${anime.watching_status}">${anime.watching_status}</div>`;
  }

  return `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden card-hover shadow-sm flex flex-col h-full cursor-pointer relative group" data-action="view-details" data-id="${anime.system_id}">
          <div class="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
              ${myRatingBadge}${airingTypeBadge}${bahaBadge}
              <img src="${imageUrl}" alt="Cover" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" onerror="this.src='${fallbackSvg}'">
          </div>
          <div class="p-3 flex flex-col flex-1 relative z-20 bg-white">
              <h3 class="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5" title="${title}">${title}</h3>
              <div class="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between">
                  <span class="truncate pr-1">${releaseFallback}</span>
                  <span class="shrink-0 flex items-center">${malRatingText}</span>
              </div>
              <div class="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
                  <div class="font-mono text-[11px] font-bold text-gray-700 tracking-tight">${cumFin} <span class="text-gray-400">/</span> ${cumTotal} <span class="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">EP</span></div>
                  ${statusHtml}
              </div>
          </div>
      </div>
    `;
}

function createAnimeTableRow(anime) {
  // Titles
  const mainTitle = getDisplayName(anime, "anime") || "Unknown Title";
  const subTitle =
    anime.anime_name_en ||
    anime.anime_name_romanji ||
    anime.anime_name_jp ||
    "";

  const f = state.franchiseDict[anime.franchise_id];
  const franchiseName = f
    ? getDisplayName(f, "franchise") || "Unknown Franchise"
    : `<span class="text-gray-300 italic">None</span>`;

  // Status Styling
  let airStatusColor = "text-gray-500 bg-gray-100";
  if (anime.airing_status === "Airing")
    airStatusColor = "text-green-700 bg-green-100";
  else if (anime.airing_status === "Finished Airing")
    airStatusColor = "text-blue-700 bg-blue-100";
  else if (anime.airing_status === "Not Yet Aired")
    airStatusColor = "text-orange-700 bg-orange-100";

  // --- CLEAN BACKEND MATH (Pydantic Computed Fields) ---
  const localFin = anime.ep_fin || 0;
  const localTotal =
    anime.ep_total !== null &&
    anime.ep_total !== undefined &&
    anime.ep_total !== ""
      ? parseInt(anime.ep_total, 10)
      : "?";

  const cumFin = anime.cum_ep_fin ?? localFin;
  const cumTotal = anime.cum_ep_total ?? localTotal;

  const myRatingBadge = anime.my_rating
    ? `<span class="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">${anime.my_rating}</span>`
    : "-";
  const malRatingText = anime.mal_rating
    ? `<span class="font-bold text-blue-600">${anime.mal_rating}</span>`
    : "-";

  // Baha Source Interactive Link Logic
  const isBaha =
    anime.source_baha === true ||
    String(anime.source_baha).toLowerCase() === "true";
  let bahaIcon = "-";
  if (isBaha) {
    if (anime.baha_link) {
      bahaIcon = `<a href="${anime.baha_link}" target="_blank" onclick="event.stopPropagation()" class="inline-block hover:scale-110 transition-transform" title="Watch on Bahamut"><img src="https://i2.bahamut.com.tw/anime/logo.svg" class="h-4 opacity-90" alt="Baha"></a>`;
    } else {
      bahaIcon = `<img src="https://i2.bahamut.com.tw/anime/logo.svg" class="h-4 inline-block opacity-50 grayscale" title="Bahamut (No Link)" alt="Baha">`;
    }
  }

  // Global Status Toggler
  let statusHtml = "";
  if (IS_ADMIN_LIBRARY_ANIME && window.getGlobalStatusToggleData) {
    const toggleData = window.getGlobalStatusToggleData(anime.watching_status);
    statusHtml = `<button data-action="toggle-status" data-id="${anime.system_id}" data-next-status="${toggleData.nextStatus}" class="w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${toggleData.cls} mx-auto" title="${anime.watching_status || "Might Watch"} \u2192 ${toggleData.nextStatus}">${toggleData.html}</button>`;
  } else if (anime.watching_status) {
    statusHtml = `<div class="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate" title="${anime.watching_status}">${anime.watching_status}</div>`;
  } else {
    statusHtml = "-";
  }

  const seasonPart = anime.season_part || "-";

  return `
        <tr class="hover:bg-indigo-50/50 transition-colors group cursor-pointer" data-action="view-details" data-id="${anime.system_id}">
            <td class="px-4 py-2 text-xs text-gray-600 font-medium truncate max-w-[12rem] border-r border-gray-100" title="${f ? getDisplayName(f, "franchise") : ""}">${franchiseName}</td>
            <td class="px-4 py-2 border-r border-gray-100">
                <div class="text-xs font-bold text-gray-900 leading-tight mb-0.5 line-clamp-1" title="${mainTitle}">${mainTitle}</div>
                ${subTitle && subTitle !== mainTitle ? `<div class="text-[9px] text-gray-400 line-clamp-1" title="${subTitle}">${subTitle}</div>` : ""}
            </td>
            <td class="px-4 py-2 text-xs text-center font-bold text-gray-600 border-r border-gray-100 hidden md:table-cell">${anime.airing_type || "-"}</td>
            <td class="px-4 py-2 text-xs text-center text-gray-500 border-r border-gray-100 hidden lg:table-cell">${seasonPart}</td>
            <td class="px-4 py-2 text-center border-r border-gray-100">
                <span class="px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${airStatusColor}">${anime.airing_status || "-"}</span>
            </td>
            <td class="px-4 py-2 text-xs text-center font-mono text-gray-700 font-medium border-r border-gray-100 hidden sm:table-cell">${cumFin} / ${cumTotal}</td>
            <td class="px-4 py-2 text-center border-r border-gray-100 hidden lg:table-cell">${myRatingBadge}</td>
            <td class="px-4 py-2 text-xs text-center border-r border-gray-100 hidden xl:table-cell">${malRatingText}</td>
            <td class="px-4 py-2 text-xs text-center text-gray-500 truncate max-w-[6rem] border-r border-gray-100 hidden xl:table-cell" title="${anime.studio || ""}">${anime.studio || "-"}</td>
            <td class="px-4 py-2 text-center border-r border-gray-100">${bahaIcon}</td>
            <td class="px-4 py-2 text-center" onclick="event.stopPropagation()">${statusHtml}</td>
        </tr>
    `;
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Search Box
  pageDOM.inputSearch.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    if (state.searchQuery.length > 0)
      pageDOM.btnClearSearch.classList.remove("hidden");
    else pageDOM.btnClearSearch.classList.add("hidden");
    processFiltersAndSort();
  });

  pageDOM.btnClearSearch.addEventListener("click", () => {
    pageDOM.inputSearch.value = "";
    state.searchQuery = "";
    pageDOM.btnClearSearch.classList.add("hidden");
    processFiltersAndSort();
  });

  // View Toggle
  pageDOM.btnViewGrid.addEventListener("click", () => {
    state.currentView = "grid";
    pageDOM.btnViewGrid.classList.replace("text-gray-400", "text-brand");
    pageDOM.btnViewGrid.classList.replace("hover:text-gray-600", "shadow");
    pageDOM.btnViewGrid.classList.add("bg-white", "active");

    pageDOM.btnViewTable.classList.replace("text-brand", "text-gray-400");
    pageDOM.btnViewTable.classList.remove("bg-white", "shadow", "active");
    pageDOM.btnViewTable.classList.add("hover:text-gray-600");
    renderUI();
  });

  pageDOM.btnViewTable.addEventListener("click", () => {
    state.currentView = "table";
    pageDOM.btnViewTable.classList.replace("text-gray-400", "text-brand");
    pageDOM.btnViewTable.classList.replace("hover:text-gray-600", "shadow");
    pageDOM.btnViewTable.classList.add("bg-white", "active");

    pageDOM.btnViewGrid.classList.replace("text-brand", "text-gray-400");
    pageDOM.btnViewGrid.classList.remove("bg-white", "shadow", "active");
    pageDOM.btnViewGrid.classList.add("hover:text-gray-600");
    renderUI();
  });

  // Filters Toggle Panel
  pageDOM.btnToggleFilters.addEventListener("click", () => {
    const isClosed =
      pageDOM.advancedFilters.classList.contains("filters-closed");
    if (isClosed) {
      pageDOM.advancedFilters.classList.replace(
        "filters-closed",
        "filters-open",
      );
      pageDOM.btnToggleFilters.classList.add("bg-gray-200", "border-gray-300");
    } else {
      pageDOM.advancedFilters.classList.replace(
        "filters-open",
        "filters-closed",
      );
      pageDOM.btnToggleFilters.classList.remove(
        "bg-gray-200",
        "border-gray-300",
      );
    }
  });

  // Sorting Change
  pageDOM.sortDropdown.addEventListener("change", (e) => {
    state.currentSort = e.target.value;
    processFiltersAndSort();
  });

  // Baha Source Filter
  pageDOM.filterBaha.addEventListener("change", (e) => {
    state.filters.bahaOnly = e.target.checked;
    updateFilterBadge();
    processFiltersAndSort();
  });

  // 1. EVENT DELEGATION FOR FILTERS PANEL
  pageDOM.advancedFilters.addEventListener("click", (e) => {
    const filterTag = e.target.closest(".filter-tag");
    if (filterTag) {
      e.stopPropagation();
      const group = filterTag.dataset.filterGroup;
      const val = filterTag.dataset.filterValue;

      if (state.filters[group].has(val)) {
        state.filters[group].delete(val);
        filterTag.classList.remove("bg-brand", "text-white", "border-brand");
        filterTag.classList.add("bg-white", "text-gray-500", "border-gray-200");
      } else {
        state.filters[group].add(val);
        filterTag.classList.remove(
          "bg-white",
          "text-gray-500",
          "border-gray-200",
        );
        filterTag.classList.add("bg-brand", "text-white", "border-brand");
      }

      updateFilterBadge();
      processFiltersAndSort();
    }
  });

  // 2. EVENT DELEGATION FOR MAIN CARDS/TABLE
  pageDOM.content.addEventListener("click", (e) => {
    // Navigation Click (Skip if they clicked the status toggle button, which base.js intercepts)
    const cardEl = e.target.closest('[data-action="view-details"]');
    if (cardEl && !e.target.closest('[data-action="toggle-status"]')) {
      window.location.href = `/anime/${cardEl.dataset.id}`;
    }
  });

  // 3. LISTEN FOR GLOBAL STATUS UPDATES (from base.js)
  document.addEventListener("animeStatusUpdated", (e) => {
    const { animeId, updatedAnime } = e.detail;
    if (updatedAnime) {
      const idx = state.allAnime.findIndex((a) => a.system_id === animeId);
      if (idx !== -1) {
        state.allAnime[idx] = updatedAnime;
        processFiltersAndSort(); // Re-trigger sort/render
      }
    }
  });

  // Clear Filters
  pageDOM.btnClearFilters.addEventListener("click", () => {
    state.filters.airingType.clear();
    state.filters.airingStatus.clear();
    state.filters.watchingStatus.clear();
    state.filters.bahaOnly = false;

    pageDOM.filterBaha.checked = false;

    document.querySelectorAll(".filter-tag").forEach((tag) => {
      tag.classList.remove("bg-brand", "text-white", "border-brand");
      tag.classList.add("bg-white", "text-gray-500", "border-gray-200");
    });

    updateFilterBadge();
    processFiltersAndSort();
  });
}

function updateFilterBadge() {
  let count =
    state.filters.airingType.size +
    state.filters.airingStatus.size +
    state.filters.watchingStatus.size;
  if (state.filters.bahaOnly) count += 1;

  if (count > 0) {
    pageDOM.badgeFilterCount.innerText = count;
    pageDOM.badgeFilterCount.classList.remove("hidden");
    pageDOM.btnClearFilters.classList.remove("hidden");
  } else {
    pageDOM.badgeFilterCount.classList.add("hidden");
    pageDOM.btnClearFilters.classList.add("hidden");
  }
}
