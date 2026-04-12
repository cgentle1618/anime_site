/**
 * static/js/anime.js
 * Handles fetching, rendering, and interactive updates for the single Anime Details page.
 */

// Setup Constants (IS_ADMIN_DETAILS is securely injected via Jinja2 in the HTML)
const IS_ADMIN_DETAILS = window.IS_ADMIN_DETAILS || false;
const ANIME_ID = window.location.pathname.split("/").pop();

// Data State
const state = {
  anime: null,
  franchise: null,
  series: null,
  allAnimeList: [],
};

// DOM Cache
const pageDOM = {};

document.addEventListener("DOMContentLoaded", () => {
  // Cache Elements
  pageDOM.loading = document.getElementById("loading");
  pageDOM.content = document.getElementById("details-content");
  pageDOM.breadcrumbTitle = document.getElementById("breadcrumb-title");

  // Header Data
  pageDOM.titleMain = document.getElementById("title-main");
  pageDOM.titleSub = document.getElementById("title-sub");
  pageDOM.headerBadges = document.getElementById("header-badges");
  pageDOM.franchiseLink = document.getElementById("franchise-link-container");
  pageDOM.seriesLink = document.getElementById("series-link-container");
  pageDOM.scoreMal = document.getElementById("score-mal");
  pageDOM.rankMal = document.getElementById("rank-mal");
  pageDOM.scoreAnilist = document.getElementById("score-anilist");
  pageDOM.dateUpdated = document.getElementById("date-updated");

  // Blocks
  pageDOM.posterContainer = document.getElementById("poster-container");
  pageDOM.ratingBadgeContainer = document.getElementById(
    "rating-badge-container",
  );
  pageDOM.progressText = document.getElementById("overlay-progress-text");
  pageDOM.progressBar = document.getElementById("overlay-progress-bar");
  pageDOM.streamingLinks = document.getElementById("streaming-links-container");

  pageDOM.namingGrid = document.getElementById("naming-grid");
  pageDOM.infoGrid = document.getElementById("info-grid");
  pageDOM.productionGrid = document.getElementById("production-grid");

  pageDOM.relatedContainer = document.getElementById(
    "related-entries-container",
  );
  pageDOM.relatedGrid = document.getElementById("related-entries-grid");
  pageDOM.displaySystemId = document.getElementById("display-system-id");

  // Inputs
  pageDOM.epFin = document.getElementById("input-ep-fin");
  pageDOM.epTotal = document.getElementById("display-ep-total");
  pageDOM.epCumBadge = document.getElementById("cumulative-badge");
  pageDOM.epCumText = document.getElementById("display-ep-cum");

  pageDOM.selWatching = document.getElementById("select-watching-status");
  pageDOM.selRating = document.getElementById("select-my-rating");
  pageDOM.txtRemark = document.getElementById("input-remark");

  // Music Selects
  pageDOM.selOp = document.getElementById("select-op");
  pageDOM.selEd = document.getElementById("select-ed");
  pageDOM.selInsertOst = document.getElementById("select-insert-ost");

  setupEventDelegation();
  loadDetails();
});

async function loadDetails() {
  try {
    // Parallel fetch the core data
    const [animeRes, franchiseRes, seriesRes, allAnimeRes] = await Promise.all([
      fetch(`/api/anime/${ANIME_ID}`),
      fetch(`/api/franchise/`),
      fetch(`/api/series/`),
      fetch(`/api/anime/`),
    ]);

    if (!animeRes.ok) throw new Error("Anime details not found");

    state.anime = await animeRes.json();
    const allFranchises = await franchiseRes.json();
    const allSeries = await seriesRes.json();
    state.allAnimeList = await allAnimeRes.json();

    // Resolve relational entities
    if (state.anime.franchise_id) {
      state.franchise = allFranchises.find(
        (f) => f.system_id === state.anime.franchise_id,
      );
    }
    if (state.anime.series_id) {
      state.series = allSeries.find(
        (s) => s.system_id === state.anime.series_id,
      );
    }

    renderUI();

    pageDOM.loading.classList.add("hidden");
    pageDOM.content.classList.remove("hidden");
  } catch (error) {
    pageDOM.loading.innerHTML = `
        <div class="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
            <i class="fas fa-exclamation-triangle mb-2 text-2xl"></i>
            <p class="font-bold">Error Loading Data</p>
            <p class="text-sm mt-1">${error.message}</p>
        </div>`;
  }
}

function renderUI() {
  const a = state.anime;

  // 1. Strict Titles
  const titleCN =
    a.anime_name_cn ||
    a.anime_name_en ||
    a.anime_name_romanji ||
    "Unknown Title";
  const titleEN =
    a.anime_name_en && a.anime_name_en !== titleCN
      ? a.anime_name_en
      : a.anime_name_romanji;

  pageDOM.titleMain.innerText = titleCN;
  pageDOM.titleSub.innerText = titleEN || "No Alternate Title";
  pageDOM.breadcrumbTitle.innerText = titleCN;

  // 2. Hierarchy Links
  if (state.franchise) {
    const fName =
      state.franchise.franchise_name_cn ||
      state.franchise.franchise_name_en ||
      state.franchise.franchise_name_romanji;
    pageDOM.franchiseLink.innerHTML = `<i class="fas fa-sitemap text-brand/50 mr-1.5"></i>From Franchise: <a href="/franchise/${state.franchise.system_id}" class="text-brand hover:underline font-bold">${fName}</a>`;
  } else {
    pageDOM.franchiseLink.innerHTML = `<i class="fas fa-unlink text-gray-400 mr-1.5"></i>Independent Entry`;
  }

  if (state.series) {
    const sName =
      state.series.series_name_cn ||
      state.series.series_name_en ||
      state.series.series_name_alt ||
      "Unknown Series";
    // Clickable button that triggers the modal
    pageDOM.seriesLink.innerHTML = `<i class="fas fa-layer-group text-purple-400/50 mr-1.5"></i>From Series: <button onclick="openSeriesModal()" class="font-bold text-purple-600 hover:text-purple-800 hover:underline transition bg-transparent border-none cursor-pointer focus:outline-none p-0">${sName}</button>`;
  } else {
    pageDOM.seriesLink.innerHTML = `<i class="fas fa-minus text-gray-300 mr-1.5"></i>No Series Hub`;
  }

  // 3. Badges
  let statusColor = "bg-gray-100 text-gray-600 border-gray-200";
  if (a.airing_status === "Airing")
    statusColor = "bg-green-100 text-green-700 border-green-200";
  else if (a.airing_status === "Finished Airing")
    statusColor = "bg-blue-100 text-blue-700 border-blue-200";
  else if (a.airing_status === "Not Yet Aired")
    statusColor = "bg-orange-100 text-orange-700 border-orange-200";

  pageDOM.headerBadges.innerHTML = `
      <span class="${statusColor} px-2.5 py-1 rounded-md text-[11px] font-bold border shadow-sm uppercase tracking-wider">${a.airing_status || "Status Unknown"}</span>
      <span class="bg-brand/10 text-brand px-2.5 py-1 rounded-md text-[11px] font-black tracking-widest uppercase border border-brand/20"><i class="fas fa-tv mr-1.5"></i>${a.airing_type || "TV"}</span>
    `;

  if (a.my_rating) {
    pageDOM.ratingBadgeContainer.innerHTML = `<div class="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-1 rounded z-10 flex items-center shadow-md"><i class="fas fa-star text-[10px] mr-1"></i>${a.my_rating}</div>`;
  } else {
    pageDOM.ratingBadgeContainer.innerHTML = "";
  }

  // 4. Scores & Updates
  pageDOM.scoreMal.innerText = a.mal_rating || "-";
  pageDOM.rankMal.innerText = a.mal_rank ? `#${a.mal_rank}` : "-";
  pageDOM.scoreAnilist.innerText = a.anilist_rating || "-";
  pageDOM.dateUpdated.innerText = new Date(a.updated_at).toLocaleString();

  // 5. Image & Progress
  const fallbackSvg = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2214%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  let imageUrl = fallbackSvg;
  if (a.cover_image_file && a.cover_image_file !== "N/A") {
    imageUrl = isLocalhost
      ? `/static/covers/${a.cover_image_file}`
      : `https://storage.googleapis.com/cg1618-anime-covers/${a.cover_image_file}`;
  }
  pageDOM.posterContainer.innerHTML = `<img src="${imageUrl}" alt="Cover" class="w-full h-full object-cover transition duration-700 group-hover:scale-105" onerror="this.src='${fallbackSvg}'">`;

  const pLocalFin = a.ep_fin || 0;
  const pTotal =
    a.ep_total !== null && a.ep_total !== undefined ? a.ep_total : "?";

  let progressPercent = 0;
  if (pTotal !== "?") {
    progressPercent = Math.round((pLocalFin / pTotal) * 100);
    pageDOM.progressText.innerText = `${progressPercent}%`;
    pageDOM.progressBar.style.width = `${progressPercent}%`;
  } else if (pLocalFin > 0) {
    pageDOM.progressText.innerText = `Ongoing`;
    pageDOM.progressBar.style.width = `100%`;
  }

  // --- V2 CLEAN BACKEND MATH (Pydantic Computed Fields) ---
  const hasCumulative = a.ep_previous && a.ep_previous > 0;

  if (hasCumulative) {
    pageDOM.epCumText.innerText = `${a.cum_ep_fin || 0} / ${a.cum_ep_total || "?"}`;
    pageDOM.epCumBadge.classList.remove("hidden");
  } else {
    pageDOM.epCumBadge.classList.add("hidden");
  }

  // 6. Stacked Streaming Links
  let linksHtml = "";
  if (a.source_baha && String(a.source_baha).toLowerCase() === "true") {
    linksHtml += a.baha_link
      ? `<a href="${a.baha_link}" target="_blank" class="block w-full bg-blue-50 hover:bg-[#00B4D8] text-blue-800 hover:text-white px-3 py-2 rounded border border-blue-100 transition text-sm font-bold flex justify-between items-center"><span class="flex items-center"><img src="https://i2.bahamut.com.tw/anime/logo.svg" class="h-4 mr-2 opacity-80" alt="Baha"> Bahamut</span> <i class="fas fa-external-link-alt text-[10px]"></i></a>`
      : `<div class="block w-full bg-gray-50 text-gray-500 px-3 py-2 rounded border border-gray-200 text-sm font-bold flex items-center"><img src="https://i2.bahamut.com.tw/anime/logo.svg" class="h-4 mr-2 grayscale opacity-50" alt="Baha"> Bahamut (No Link)</div>`;
  }
  if (a.source_netflix && String(a.source_netflix).toLowerCase() === "true") {
    linksHtml += `<div class="block w-full bg-red-50 text-red-800 px-3 py-2 rounded border border-red-100 text-sm font-bold flex items-center"><span class="text-[#E50914] font-black mr-2 leading-none">N</span> Netflix</div>`;
  }
  if (a.source_other) {
    linksHtml += a.source_other_link
      ? `<a href="${a.source_other_link}" target="_blank" class="block w-full bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white px-3 py-2 rounded border border-purple-100 transition text-sm font-bold flex justify-between items-center"><span><i class="fas fa-play-circle mr-2"></i> ${a.source_other}</span> <i class="fas fa-external-link-alt text-[10px]"></i></a>`
      : `<div class="block w-full bg-gray-50 text-gray-500 px-3 py-2 rounded border border-gray-200 text-sm font-bold flex items-center"><i class="fas fa-play-circle mr-2 opacity-50"></i> ${a.source_other}</div>`;
  }
  if (a.mal_link) {
    linksHtml += `<a href="${a.mal_link}" target="_blank" class="block w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold flex justify-between items-center border-b border-gray-50"><span class="flex items-center"><span class="bg-[#2E51A2] text-white text-[9px] px-1 py-0.5 rounded mr-2 leading-none">MAL</span> MyAnimeList</span> <i class="fas fa-external-link-alt text-[10px]"></i></a>`;
  }
  if (a.official_link) {
    linksHtml += `<a href="${a.official_link}" target="_blank" class="block w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold flex justify-between items-center"><span class="flex items-center"><i class="fas fa-globe mr-2"></i> Official Site</span> <i class="fas fa-external-link-alt text-[10px]"></i></a>`;
  }
  pageDOM.streamingLinks.innerHTML =
    linksHtml ||
    '<div class="text-sm text-gray-400 italic">No official sources recorded.</div>';

  // 7. Naming Grid
  const namingData = [
    { label: "Anime Alt Name", val: a.anime_name_alt },
    { label: "Anime Entry Name JP", val: a.anime_name_jp },
    { label: "Anime Entry Name Romanji", val: a.anime_name_romanji },
  ];

  pageDOM.namingGrid.innerHTML = namingData
    .map(
      (d) => `
        <div class="flex flex-col border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${d.label}</span>
            <span class="text-sm font-medium text-gray-900">${d.val !== null && d.val !== undefined && d.val !== "" ? d.val : "-"}</span>
        </div>
    `,
    )
    .join("");

  // 8. Info Grid
  const formatSeasonalYear =
    a.release_season && a.release_year
      ? `${a.release_season} ${a.release_year}`
      : a.release_season || a.release_year;
  const formatMonthYear =
    a.release_month && a.release_year
      ? `${a.release_month} ${a.release_year}`
      : a.release_month || a.release_year;

  const infoData = [
    { label: "Season Part", val: a.season_part },
    { label: "Airing Type", val: a.airing_type },
    { label: "Airing Status", val: a.airing_status },
    { label: "Release Season", val: formatSeasonalYear },
    { label: "Release Date", val: formatMonthYear },
    { label: "Total Ep", val: a.ep_total },
    { label: "Genre Main", val: a.genre_main },
    { label: "Genre Sub", val: a.genre_sub },
  ];

  pageDOM.infoGrid.innerHTML = infoData
    .map(
      (d) => `
        <div class="flex flex-col border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${d.label}</span>
            <span class="text-sm font-medium text-gray-900">${d.val !== null && d.val !== undefined && d.val !== "" ? d.val : "-"}</span>
        </div>
    `,
    )
    .join("");

  // 9. Production Grid
  const prodData = [
    { label: "台灣代理", val: a.distributor_tw },
    { label: "Studio", val: a.studio },
    { label: "Director", val: a.director },
    { label: "Producer", val: a.producer },
    { label: "Music Composer", val: a.music },
  ];
  pageDOM.productionGrid.innerHTML = prodData
    .map(
      (d) => `
        <div class="flex flex-col border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${d.label}</span>
            <span class="text-sm font-medium text-gray-900">${d.val !== null && d.val !== undefined && d.val !== "" ? d.val : "-"}</span>
        </div>
    `,
    )
    .join("");

  // 10. Related Entries Block logic
  const relatedCards = [];
  const createMiniCard = (relId, relTypeTag, tagColor) => {
    const relAnime = state.allAnimeList.find((r) => r.system_id === relId);
    if (!relAnime) return "";
    const name =
      relAnime.anime_name_cn ||
      relAnime.anime_name_en ||
      relAnime.anime_name_romanji;
    const rImg =
      relAnime.cover_image_file && relAnime.cover_image_file !== "N/A"
        ? isLocalhost
          ? `/static/covers/${relAnime.cover_image_file}`
          : `https://storage.googleapis.com/cg1618-anime-covers/${relAnime.cover_image_file}`
        : fallbackSvg;

    return `
          <div class="bg-gray-50 rounded-lg border border-gray-200 p-2 flex items-center gap-3 cursor-pointer hover:bg-brand/5 hover:border-brand/30 transition card-hover" onclick="window.location.href='/anime/${relAnime.system_id}'">
              <img src="${rImg}" class="w-10 h-14 object-cover rounded shadow-sm shrink-0" onerror="this.src='${fallbackSvg}'">
              <div class="min-w-0 flex-1">
                  <div class="text-[9px] font-bold uppercase tracking-wider ${tagColor} mb-0.5">${relTypeTag}</div>
                  <div class="text-sm font-bold text-gray-900 truncate" title="${name}">${name}</div>
                  <div class="text-[11px] text-gray-500">${relAnime.airing_type || "TV"} • ${relAnime.release_year || "TBA"}</div>
              </div>
          </div>
        `;
  };

  if (a.prequel_id)
    relatedCards.push(
      createMiniCard(a.prequel_id, "Prequel", "text-orange-500"),
    );
  if (a.sequel_id)
    relatedCards.push(createMiniCard(a.sequel_id, "Sequel", "text-green-500"));

  if (a.alternative) {
    const altIds = String(a.alternative)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    altIds.forEach((altId) => {
      relatedCards.push(createMiniCard(altId, "Alternative", "text-blue-500"));
    });
  }

  if (relatedCards.length > 0) {
    pageDOM.relatedGrid.innerHTML = relatedCards.join("");
    pageDOM.relatedContainer.classList.remove("hidden");
  }

  // 11. Forms / Inputs Binding
  pageDOM.epFin.value = a.ep_fin || 0;
  pageDOM.epTotal.innerText = a.ep_total || "?";

  pageDOM.selWatching.value = a.watching_status || "";
  pageDOM.selRating.value = a.my_rating || "";

  pageDOM.txtRemark.value = a.remark || "";

  pageDOM.selOp.value = a.op || "";
  pageDOM.selEd.value = a.ed || "";
  pageDOM.selInsertOst.value = a.insert_ost || "";

  // 12. System Info
  if (pageDOM.displaySystemId)
    pageDOM.displaySystemId.innerText = a.system_id || "-";
}

// --- SERIES MODAL LOGIC ---
window.openSeriesModal = function () {
  if (!state.series) return;
  const s = state.series;

  let html = `
        <div class="grid grid-cols-1 gap-4">
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">English Name</div>
                <div class="text-sm font-bold text-gray-800">${s.series_name_en || "-"}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Chinese Name</div>
                <div class="text-sm font-bold text-gray-800">${s.series_name_cn || "-"}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Alternative Name</div>
                <div class="text-sm font-bold text-gray-800">${s.series_name_alt || "-"}</div>
            </div>
        </div>
    `;

  if (IS_ADMIN_DETAILS) {
    html += `
        <div class="pt-4 mt-4 border-t border-gray-100 flex justify-end">
            <a href="/modify?id=${s.system_id}" class="text-xs font-bold text-brand hover:underline flex items-center bg-brand/5 px-3 py-1.5 rounded transition"><i class="fas fa-edit mr-2"></i> Edit Series Data</a>
        </div>
        `;
  }

  document.getElementById("series-modal-content").innerHTML = html;
  document.getElementById("series-modal").classList.remove("hidden");
};

window.closeSeriesModal = function () {
  document.getElementById("series-modal").classList.add("hidden");
};

// --- INTERACTION LOGIC ---

function setupEventDelegation() {
  // Buttons inside Admin Toolbar
  const btnQuickEdit = document.getElementById("btn-quick-edit");
  const btnMarkCompleted = document.getElementById("btn-mark-completed");
  const btnAutofill = document.getElementById("btn-autofill");

  if (btnQuickEdit)
    btnQuickEdit.addEventListener(
      "click",
      () => (window.location.href = `/modify?id=${ANIME_ID}`),
    );

  if (btnMarkCompleted) {
    btnMarkCompleted.addEventListener("click", async () => {
      const targetEps = state.anime.ep_total
        ? parseInt(state.anime.ep_total, 10)
        : state.anime.ep_fin;
      const payload = {
        watching_status: "Completed",
        airing_status: "Finished Airing",
        ep_fin: targetEps,
      };
      await performUpdate(payload, "Marked as Completed!");
    });
  }

  if (btnAutofill) {
    btnAutofill.addEventListener("click", async () => {
      const btn = btnAutofill;
      const icon = btn.querySelector("i");
      icon.className = "fas fa-circle-notch fa-spin mr-2";
      btn.disabled = true;

      try {
        // Map to the new single entry data-control endpoint
        const response = await fetch(
          `/api/data-control/replace/anime/${ANIME_ID}`,
          {
            method: "POST",
          },
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail || data.message || "Autofill processing failed.",
          );
        }

        if (typeof showNotification === "function")
          showNotification(
            "success",
            data.message || "Jikan/MAL autofill completed.",
          );
        await loadDetails();
      } catch (error) {
        if (typeof showNotification === "function")
          showNotification("error", error.message);
      } finally {
        icon.className = "fas fa-magic mr-2";
        btn.disabled = false;
      }
    });
  }

  // Plus/Minus Buttons
  pageDOM.content.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    if (actionEl.dataset.action === "ep-minus") updateEps(-1);
    if (actionEl.dataset.action === "ep-plus") updateEps(1);
  });

  // Centralized DB Patcher
  const handleFieldChange = (e) => {
    const fieldEl = e.target.closest("[data-update-field]");
    if (fieldEl) {
      const payload = {};
      payload[fieldEl.dataset.updateField] = fieldEl.value;
      performUpdate(payload, "Field updated");
    }
  };

  pageDOM.content.addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT") handleFieldChange(e);
  });

  pageDOM.content.addEventListener("focusout", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.target.dataset.action === "ep-input") {
        handleDirectEpUpdate(e.target.value);
      } else {
        handleFieldChange(e);
      }
    }
  });

  pageDOM.content.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") e.target.blur();
  });
}

// Episode Math Logic
function handleDirectEpUpdate(val) {
  if (!IS_ADMIN_DETAILS) return;
  const typedLocal = parseInt(val, 10);
  if (isNaN(typedLocal) || typedLocal < 0) {
    renderUI();
    return;
  }
  setEpisodeProgress(typedLocal);
}

function updateEps(change) {
  if (!IS_ADMIN_DETAILS) return;
  const currentLocalEps = state.anime.ep_fin || 0;
  const totalLocalEps =
    state.anime.ep_total !== null && state.anime.ep_total !== "?"
      ? parseInt(state.anime.ep_total, 10)
      : null;

  let targetLocalEps = currentLocalEps + change;
  if (totalLocalEps !== null && targetLocalEps > totalLocalEps)
    targetLocalEps = totalLocalEps;
  if (targetLocalEps < 0) targetLocalEps = 0;

  if (targetLocalEps === currentLocalEps) return;
  setEpisodeProgress(targetLocalEps);
}

async function setEpisodeProgress(newLocalEps) {
  if (!IS_ADMIN_DETAILS) return;
  const totalLocalEps =
    state.anime.ep_total !== null && state.anime.ep_total !== "?"
      ? parseInt(state.anime.ep_total, 10)
      : null;
  let target = Math.max(0, newLocalEps);

  if (totalLocalEps !== null && target > totalLocalEps) {
    if (typeof showNotification === "function")
      showNotification("error", "Cannot exceed total episodes.");
    renderUI();
    return;
  }

  if (target === (state.anime.ep_fin || 0)) return;
  await performUpdate({ ep_fin: target }, "Episode progress saved.");
}

// Abstracted Fetch Patcher
async function performUpdate(payload, successMessage) {
  if (!IS_ADMIN_DETAILS) return;

  // Optimistic visual update
  Object.assign(state.anime, payload);
  renderUI();

  try {
    const res = await fetch(`/api/anime/${ANIME_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Sync failed");
    if (typeof showNotification === "function")
      showNotification("success", successMessage);

    // Re-fetch to guarantee absolute truth (especially if 'Mark Completed' modified dates/other fields)
    const newRes = await fetch(`/api/anime/${ANIME_ID}`);
    state.anime = await newRes.json();
    renderUI();
  } catch (e) {
    console.error(e);
    if (typeof showNotification === "function")
      showNotification("error", "Update failed.");
    // Revert on fail
    const revertRes = await fetch(`/api/anime/${ANIME_ID}`);
    state.anime = await revertRes.json();
    renderUI();
  }
}
