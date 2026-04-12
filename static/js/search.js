/**
 * static/js/search.js
 * Handles data fetching, relationship grouping, and rendering for the Global Search feature.
 */

// Setup Constants (IS_ADMIN_SEARCH is securely injected via Jinja2 in the HTML)
const IS_ADMIN_SEARCH = window.IS_ADMIN_SEARCH || false;

// State Management
const state = {
  searchQuery: "",
  allFranchises: [],
  allAnime: [],
  matchedFranchises: [],
  matchedAnime: [],
  selectedFranchiseFilter: "all",
};

// DOM Cache
const pageDOM = {};

document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM
  pageDOM.loading = document.getElementById("loading");
  pageDOM.loadingText = document.getElementById("loading-text");
  pageDOM.content = document.getElementById("main-content");

  pageDOM.displayQuery = document.getElementById("display-query");
  pageDOM.countFranchise = document.getElementById("count-franchise");
  pageDOM.countAnime = document.getElementById("count-anime");

  pageDOM.pillsContainer = document.getElementById("franchise-pills-container");
  pageDOM.franchiseGrid = document.getElementById("franchise-grid");

  pageDOM.groupTv = document.getElementById("anime-group-tv");
  pageDOM.gridTv = document.getElementById("anime-grid-tv");
  pageDOM.countTv = document.getElementById("count-tv");

  pageDOM.groupMovie = document.getElementById("anime-group-movie");
  pageDOM.gridMovie = document.getElementById("anime-grid-movie");
  pageDOM.countMovie = document.getElementById("count-movie");

  pageDOM.groupOther = document.getElementById("anime-group-other");
  pageDOM.gridOther = document.getElementById("anime-grid-other");
  pageDOM.countOther = document.getElementById("count-other");

  pageDOM.animeEmptyState = document.getElementById("anime-empty-state");

  // Extract Query
  const urlParams = new URLSearchParams(window.location.search);
  state.searchQuery = urlParams.get("q") || "";
  pageDOM.displayQuery.innerText = state.searchQuery;

  if (!state.searchQuery.trim()) {
    pageDOM.loading.innerHTML = `
            <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 font-bold">No Search Query</p>
            <p class="text-sm text-gray-400 mt-1">Please enter a term in the top search bar.</p>
        `;
    return;
  }

  setupEventDelegation();
  performSearch();
});

// Strict String Cleaner: strips capitalization, punctuation, spaces
function cleanString(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}

async function performSearch() {
  try {
    const [franchiseRes, animeRes] = await Promise.all([
      fetch("/api/franchise/"),
      fetch("/api/anime/"),
    ]);

    if (!franchiseRes.ok || !animeRes.ok)
      throw new Error("Failed to fetch database");

    state.allFranchises = await franchiseRes.json();
    state.allAnime = await animeRes.json();

    const queryClean = cleanString(state.searchQuery);

    // 1. Find directly matched Franchises
    const directMatchedFranchises = state.allFranchises.filter((f) => {
      const names = [
        f.franchise_name_cn,
        f.franchise_name_en,
        f.franchise_name_romanji,
        f.franchise_name_jp,
        f.franchise_name_alt,
      ];
      return names.some((n) => cleanString(n).includes(queryClean));
    });

    // 2. Find directly matched Anime
    const directMatchedAnime = state.allAnime.filter((a) => {
      const names = [
        a.anime_name_cn,
        a.anime_name_en,
        a.anime_name_romanji,
        a.anime_name_jp,
        a.anime_name_alt,
      ];
      return names.some((n) => cleanString(n).includes(queryClean));
    });

    // 3. Resolve Relational Expansion
    // Franchises that should be shown (direct matches + parents of matched anime)
    const franchiseIdSet = new Set(
      directMatchedFranchises.map((f) => f.system_id),
    );
    directMatchedAnime.forEach((a) => {
      if (a.franchise_id) franchiseIdSet.add(a.franchise_id);
    });
    state.matchedFranchises = state.allFranchises.filter((f) =>
      franchiseIdSet.has(f.system_id),
    );

    // Anime that should be shown (direct matches + children of directly matched franchises)
    const directFranchiseIdSet = new Set(
      directMatchedFranchises.map((f) => f.system_id),
    );
    const animeIdSet = new Set(directMatchedAnime.map((a) => a.system_id));

    state.allAnime.forEach((a) => {
      if (a.franchise_id && directFranchiseIdSet.has(a.franchise_id)) {
        animeIdSet.add(a.system_id);
      }
    });
    state.matchedAnime = state.allAnime.filter((a) =>
      animeIdSet.has(a.system_id),
    );

    // Sort alphabetically by default Title CN
    state.matchedFranchises.sort((a, b) =>
      (a.franchise_name_cn || "").localeCompare(b.franchise_name_cn || ""),
    );
    state.matchedAnime.sort((a, b) =>
      (a.anime_name_cn || "").localeCompare(b.anime_name_cn || ""),
    );

    pageDOM.loading.classList.add("hidden");
    pageDOM.content.classList.remove("hidden");

    renderUI();
  } catch (error) {
    pageDOM.loading.innerHTML = `
            <div class="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
                <i class="fas fa-exclamation-triangle mb-2 text-2xl"></i>
                <p class="font-bold">Search Error</p>
                <p class="text-sm mt-1">${error.message}</p>
            </div>`;
  }
}

// Gets the exact display title array for Franchises based on hierarchy
function getFranchiseTitles(f) {
  const rawTitles = [
    f.franchise_name_cn,
    f.franchise_name_en,
    f.franchise_name_alt,
    f.franchise_name_romanji,
    f.franchise_name_jp,
  ];
  const validTitles = rawTitles.filter((t) => t && t.trim() !== "");
  const uniqueTitles = [...new Set(validTitles)];
  return {
    main: uniqueTitles[0] || "Unknown Franchise",
    sub: uniqueTitles[1] || "", // This naturally handles "Franchise Name EN (hidden if CN used EN as fallback)"
  };
}

function renderUI() {
  // Top counts
  pageDOM.countFranchise.innerText = state.matchedFranchises.length;
  pageDOM.countAnime.innerText = state.matchedAnime.length;

  // 1. Render Franchise Pills
  let pillsHtml = `
        <button class="pill-filter shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${state.selectedFranchiseFilter === "all" ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}" data-id="all">
            All Results
        </button>
    `;
  state.matchedFranchises.forEach((f) => {
    const titles = getFranchiseTitles(f);
    const isSelected = state.selectedFranchiseFilter === f.system_id;
    pillsHtml += `
            <button class="pill-filter shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${isSelected ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}" data-id="${f.system_id}" title="${titles.main}">
                ${titles.main}
            </button>
        `;
  });
  pageDOM.pillsContainer.innerHTML = pillsHtml;

  // Filter Data based on Pill
  const displayFranchises =
    state.selectedFranchiseFilter === "all"
      ? state.matchedFranchises
      : state.matchedFranchises.filter(
          (f) => f.system_id === state.selectedFranchiseFilter,
        );

  const displayAnime =
    state.selectedFranchiseFilter === "all"
      ? state.matchedAnime
      : state.matchedAnime.filter(
          (a) => a.franchise_id === state.selectedFranchiseFilter,
        );

  // 2. Render Franchise Hub Section
  if (displayFranchises.length > 0) {
    pageDOM.franchiseGrid.innerHTML = displayFranchises
      .map((f) => {
        const t = getFranchiseTitles(f);
        const typeLabel = f.franchise_type || "ACG Franchise";
        return `
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm card-hover cursor-pointer flex flex-col justify-between" onclick="window.location.href='/franchise/${f.system_id}'">
                    <div>
                        <div class="text-[9px] font-bold text-brand uppercase tracking-widest mb-1.5"><i class="fas fa-sitemap mr-1"></i> ${typeLabel}</div>
                        <h3 class="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2" title="${t.main}">${t.main}</h3>
                        ${t.sub ? `<h4 class="text-xs font-medium text-gray-500 truncate" title="${t.sub}">${t.sub}</h4>` : ""}
                    </div>
                    <div class="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-400">
                        <span>View Hub</span>
                        <i class="fas fa-arrow-right"></i>
                    </div>
                </div>
            `;
      })
      .join("");
  } else {
    pageDOM.franchiseGrid.innerHTML = `<div class="col-span-full text-sm text-gray-400 italic">No franchises match current filter.</div>`;
  }

  // 3. Render Anime Section (Grouped strictly by Airing Type)
  if (displayAnime.length === 0) {
    pageDOM.groupTv.classList.add("hidden");
    pageDOM.groupMovie.classList.add("hidden");
    pageDOM.groupOther.classList.add("hidden");
    pageDOM.animeEmptyState.classList.remove("hidden");
    return;
  }

  pageDOM.animeEmptyState.classList.add("hidden");

  const tvOna = displayAnime.filter(
    (a) => a.airing_type === "TV" || a.airing_type === "ONA",
  );
  const movies = displayAnime.filter((a) => a.airing_type === "Movie");
  const others = displayAnime.filter(
    (a) =>
      a.airing_type !== "TV" &&
      a.airing_type !== "ONA" &&
      a.airing_type !== "Movie",
  );

  const renderGroup = (arr, groupEl, gridEl, countEl) => {
    if (arr.length > 0) {
      groupEl.classList.remove("hidden");
      countEl.innerText = arr.length;
      gridEl.innerHTML = arr.map((a) => createAnimeEntryCard(a)).join("");
    } else {
      groupEl.classList.add("hidden");
      gridEl.innerHTML = "";
    }
  };

  renderGroup(tvOna, pageDOM.groupTv, pageDOM.gridTv, pageDOM.countTv);
  renderGroup(
    movies,
    pageDOM.groupMovie,
    pageDOM.gridMovie,
    pageDOM.countMovie,
  );
  renderGroup(
    others,
    pageDOM.groupOther,
    pageDOM.gridOther,
    pageDOM.countOther,
  );
}

function createAnimeEntryCard(anime) {
  // Strict Title Fallback (CN -> EN -> Alt -> Romanji -> JP)
  const title =
    anime.anime_name_cn ||
    anime.anime_name_en ||
    anime.anime_name_alt ||
    anime.anime_name_romanji ||
    anime.anime_name_jp ||
    "Unknown Title";

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

  // Release Season Fallback
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

  // Action Button leveraging the global function mapped in base.js
  let statusHtml = "";
  if (IS_ADMIN_SEARCH && window.getGlobalStatusToggleData) {
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

  return `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden card-hover shadow-sm flex flex-col h-full cursor-pointer relative group" data-action="view-details" data-id="${anime.system_id}">
          <div class="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
              ${myRatingBadge}
              ${airingTypeBadge}
              ${bahaBadge}
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
                      ${cumFin} <span class="text-gray-400">/</span> ${cumTotal} <span class="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">EP</span>
                  </div>
                  ${statusHtml}
              </div>
          </div>
      </div>
    `;
}

// --- EVENT DELEGATION ---
function setupEventDelegation() {
  pageDOM.content.addEventListener("click", (e) => {
    // Pill Filtering
    const pill = e.target.closest(".pill-filter");
    if (pill) {
      state.selectedFranchiseFilter = pill.dataset.id;
      renderUI();
      return;
    }

    // View Details Navigation (Skip if they clicked the status toggle button)
    const cardEl = e.target.closest('[data-action="view-details"]');
    if (cardEl && !e.target.closest('[data-action="toggle-status"]')) {
      window.location.href = `/anime/${cardEl.dataset.id}`;
    }
  });

  // Listen for the custom event dispatched globally by base.js
  document.addEventListener("animeStatusUpdated", (e) => {
    const { animeId, updatedAnime } = e.detail;
    if (updatedAnime) {
      // Update the master list
      const idxAll = state.allAnime.findIndex((a) => a.system_id === animeId);
      if (idxAll !== -1) state.allAnime[idxAll] = updatedAnime;

      // Update the specifically matched list
      const idxMatched = state.matchedAnime.findIndex(
        (a) => a.system_id === animeId,
      );
      if (idxMatched !== -1) state.matchedAnime[idxMatched] = updatedAnime;

      // Re-render UI to immediately reflect the newly updated card styling
      renderUI();
    }
  });
}
