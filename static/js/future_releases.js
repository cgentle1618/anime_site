/**
 * static/js/future_releases.js
 * Fetches anime/franchise/current-season data, filters to "Not Yet Aired" entries
 * from the current season onward, groups by season, sorts within groups, and
 * renders Anime Entry Card Third Type.
 */

const IS_ADMIN = window.IS_ADMIN_FUTURE_RELEASES || false;

// ─── Season constants ─────────────────────────────────────────────────────
const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 };
const SEASON_LABEL = {
  WIN: "Winter",
  SPR: "Spring",
  SUM: "Summer",
  FAL: "Fall",
};

// ─── Watching status sort priority (lower = first) ────────────────────────
const WATCHING_PRIORITY = {
  "Watch When Airs": 0,
  "Plan to Watch": 1,
  "Might Watch": 2,
};

// ─── Franchise expectation sort priority ─────────────────────────────────
const EXPECTATION_PRIORITY = { High: 0, Medium: 1, Low: 2 };

// ─── State ────────────────────────────────────────────────────────────────
const state = {
  allAnime: [], // filtered anime (Not Yet Aired, from current season onward)
  franchiseDict: {}, // { franchise_id: franchise }
  currentSeasonKey: null, // e.g. "S_2026_2" — floor for season filtering
  activeTypeFilter: "all",
};

const pageDOM = {};

// ─── Name helper (CN → EN → Alt → Romanji → JP) ──────────────────────────
function getAnimeName(anime) {
  return (
    anime.anime_name_cn ||
    anime.anime_name_en ||
    anime.anime_name_alt ||
    anime.anime_name_romanji ||
    anime.anime_name_jp ||
    "Unknown Title"
  );
}

// ─── Group key for sorting ────────────────────────────────────────────────
// Season groups: "S_{YYYY}_{0-3}"  →  sort chronologically
// Year-only groups: "Y_{YYYY}"      →  after all season groups
// TBD: "Z_TBD"                      →  always last
function getGroupKey(anime) {
  const year = anime.release_year;
  const season = anime.release_season;
  if (year && season && SEASON_ORDER[season] !== undefined) {
    return `S_${year}_${SEASON_ORDER[season]}`;
  }
  if (year) {
    return `Y_${year}`;
  }
  return "Z_TBD";
}

// ─── Human-readable group label ───────────────────────────────────────────
function getGroupLabel(key) {
  if (key === "Z_TBD") return "TBD";
  if (key.startsWith("Y_")) return key.slice(2); // just the year
  // Season key: "S_2026_2" → ["S", "2026", "2"]
  const parts = key.split("_");
  const year = parts[1];
  const seasonIdx = Number(parts[2]);
  const seasonCode = Object.keys(SEASON_ORDER).find(
    (k) => SEASON_ORDER[k] === seasonIdx,
  );
  return `${SEASON_LABEL[seasonCode] || "?"} ${year}`;
}

// ─── Airing type filter matching ─────────────────────────────────────────
const SPECIFIC_TYPES = ["TV", "ONA", "Movie"];
function matchesTypeFilter(anime) {
  const t = anime.airing_type || "";
  if (state.activeTypeFilter === "all") return true;
  if (state.activeTypeFilter === "other") return !SPECIFIC_TYPES.includes(t);
  return t === state.activeTypeFilter;
}

// ─── Next season key from current ────────────────────────────────────────
function getNextSeasonKey(currentKey) {
  if (!currentKey || !currentKey.startsWith("S_")) return null;
  const parts = currentKey.split("_");
  const year = Number(parts[1]);
  const idx = Number(parts[2]);
  return idx < 3 ? `S_${year}_${idx + 1}` : `S_${year + 1}_0`;
}

// ─── Build single card (Third Type) ──────────────────────────────────────
function buildCard(anime) {
  const title = getAnimeName(anime);
  const detailUrl = `/anime/${anime.system_id}`;

  // Cover image: localhost → /static/covers/, production → GCS bucket (matches second type)
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

  // Franchise expectation badge — dark overlay, top-left of poster
  const franchise   = state.franchiseDict[anime.franchise_id];
  const expectation = franchise?.franchise_expectation;
  const expectationColor = { High: "bg-amber-500/80", Medium: "bg-sky-500/80", Low: "bg-gray-500/70" };
  const expectationBadge = expectation
    ? `<div class="absolute top-1 left-1 ${expectationColor[expectation] || "bg-gray-500/70"} text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">${expectation}</div>`
    : "";

  // Airing type badge — dark overlay, top-right of poster (same as second type)
  const airingBadge = `<div class="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20"><i class="fas fa-tv mr-1 text-brand"></i>${anime.airing_type || "?"}</div>`;

  // Bahamut badge — white overlay, bottom-left of poster
  // Greyed out when source_baha=true but no baha_link; colored when baha_link present
  const isBaha =
    anime.source_baha === true ||
    String(anime.source_baha).toLowerCase() === "true";
  const hasBahaLink = isBaha && anime.baha_link && anime.baha_link !== "N/A";
  let bahaBadge = "";
  if (isBaha) {
    const imgClass = hasBahaLink ? "h-3 opacity-90" : "h-3 opacity-30 grayscale";
    const inner = `<img src="https://i2.bahamut.com.tw/anime/logo.svg" class="${imgClass}" alt="Baha">`;
    bahaBadge = hasBahaLink
      ? `<a href="${anime.baha_link}" target="_blank" onclick="event.stopPropagation()" class="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center" title="Watch on Bahamut">${inner}</a>`
      : `<div class="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center" title="Available on Bahamut (no link)">${inner}</div>`;
  }

  // Admin controls: watching status dropdown + mark-as-airing button
  let adminHtml = "";
  if (IS_ADMIN) {
    const WATCHING_OPTIONS = [
      "Might Watch",
      "Plan to Watch",
      "Watch When Airs",
    ];
    const currentStatus = anime.watching_status || "Might Watch";
    const needsExtraOption = !WATCHING_OPTIONS.includes(currentStatus);

    const extraOption = needsExtraOption
      ? `<option value="${currentStatus}" disabled selected>${currentStatus}</option>`
      : "";
    const standardOptions = WATCHING_OPTIONS.map(
      (s) =>
        `<option value="${s}"${!needsExtraOption && s === currentStatus ? " selected" : ""}>${s}</option>`,
    ).join("");

    adminHtml = `
      <select
        data-action="set-watching-status"
        data-id="${anime.system_id}"
        class="text-[10px] font-bold rounded border border-gray-200 px-1 py-0.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-brand w-full"
        onclick="event.stopPropagation()"
        title="Watching status">
        ${extraOption}${standardOptions}
      </select>
      <button
        data-action="set-airing-status"
        data-id="${anime.system_id}"
        class="w-6 h-6 flex items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-[10px] shrink-0"
        title="Mark as Airing">
        <i class="fas fa-bolt"></i>
      </button>`;
  }

  return `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden card-hover shadow-sm flex flex-col h-full cursor-pointer relative group" onclick="window.location.href='${detailUrl}'">
      <div class="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        ${expectationBadge}${airingBadge}${bahaBadge}
        <img src="${imageUrl}" alt="${title}" loading="lazy"
             class="w-full h-full object-cover transition duration-500 group-hover:scale-110"
             onerror="this.src='${fallbackSvg}'" />
      </div>
      <div class="p-3 flex flex-col flex-1 bg-white">
        <h3 class="font-bold text-gray-900 text-xs line-clamp-2 leading-tight" title="${title}">${title}</h3>
        ${anime.studio ? `<p class="text-[10px] text-gray-400 truncate mt-0.5">${anime.studio}</p>` : ""}
        <div class="mt-auto flex items-center gap-1 border-t border-gray-100 pt-2.5">
          ${adminHtml}
        </div>
      </div>
    </div>
  `;
}

// ─── Sort entries within a group ──────────────────────────────────────────
function sortGroup(entries) {
  return entries.slice().sort((a, b) => {
    // 1. watching_status priority
    const wa = WATCHING_PRIORITY[a.watching_status] ?? 9;
    const wb = WATCHING_PRIORITY[b.watching_status] ?? 9;
    if (wa !== wb) return wa - wb;

    // 2. franchise_expectation priority
    const fa = state.franchiseDict[a.franchise_id];
    const fb = state.franchiseDict[b.franchise_id];
    const ea = EXPECTATION_PRIORITY[fa?.franchise_expectation] ?? 9;
    const eb = EXPECTATION_PRIORITY[fb?.franchise_expectation] ?? 9;
    return ea - eb;
  });
}

// ─── Render all season groups ─────────────────────────────────────────────
function render() {
  const filtered = state.allAnime.filter(matchesTypeFilter);

  const groups = {};
  for (const anime of filtered) {
    const key = getGroupKey(anime);
    if (!groups[key]) groups[key] = [];
    groups[key].push(anime);
  }

  const sortedKeys = Object.keys(groups).sort();

  if (sortedKeys.length === 0) {
    pageDOM.emptyState.classList.remove("hidden");
    pageDOM.container.innerHTML = "";
    return;
  }
  pageDOM.emptyState.classList.add("hidden");

  const nextSeasonKey = getNextSeasonKey(state.currentSeasonKey);

  pageDOM.container.innerHTML = sortedKeys
    .map((key) => {
      const label = getGroupLabel(key);
      const sorted = sortGroup(groups[key]);
      const cards = sorted.map(buildCard).join("");
      const count = sorted.length;

      let seasonBadge = "";
      if (key === state.currentSeasonKey) {
        seasonBadge = `<span class="text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">Current</span>`;
      } else if (key === nextSeasonKey) {
        seasonBadge = `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Next</span>`;
      }

      return `
      <section>
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-base font-black text-gray-800">${label}</h2>
          ${seasonBadge}
          <span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">${count}</span>
          <div class="flex-1 border-t border-gray-100"></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          ${cards}
        </div>
      </section>
    `;
    })
    .join("");
}

// ─── Tab switching ────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll(".tab-btn").forEach((b) => {
        const active = b.dataset.tab === tab;
        b.classList.toggle("border-brand", active);
        b.classList.toggle("text-brand", active);
        b.classList.toggle("border-transparent", !active);
        b.classList.toggle("text-gray-400", !active);
      });

      const isAnime = tab === "anime";
      pageDOM.panelAnime.classList.toggle("hidden", !isAnime);
      pageDOM.panelUnderDev.classList.toggle("hidden", isAnime);
    });
  });
}

// ─── Airing type filter chips ─────────────────────────────────────────────
function setupTypeChips() {
  document.querySelectorAll(".type-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTypeFilter = btn.dataset.typeFilter;

      document.querySelectorAll(".type-chip").forEach((b) => {
        const active = b.dataset.typeFilter === state.activeTypeFilter;
        b.classList.toggle("bg-brand", active);
        b.classList.toggle("text-white", active);
        b.classList.toggle("border-brand", active);
        b.classList.toggle("bg-white", !active);
        b.classList.toggle("text-gray-600", !active);
        b.classList.toggle("border-gray-200", !active);
      });

      render();
    });
  });
}

// ─── Convert "SUM 2026" → group key "S_2026_2" ───────────────────────────
function seasonRawToKey(raw) {
  if (!raw || raw === "Not Set") return null;
  const parts = raw.trim().split(" ");
  if (parts.length !== 2) return null;
  const [code, year] = parts;
  const idx = SEASON_ORDER[code];
  if (idx === undefined) return null;
  return `S_${year}_${idx}`;
}

// ─── Data fetch ───────────────────────────────────────────────────────────
async function fetchData() {
  try {
    const [animeRes, franchiseRes, seasonRes] = await Promise.all([
      fetch("/api/anime/"),
      fetch("/api/franchise/"),
      fetch("/api/system/config/current_season"),
    ]);

    if (!animeRes.ok || !franchiseRes.ok) throw new Error("API error");

    const [animeData, franchiseData, seasonData] = await Promise.all([
      animeRes.json(),
      franchiseRes.json(),
      seasonRes.ok ? seasonRes.json() : Promise.resolve({}),
    ]);

    state.franchiseDict = Object.fromEntries(
      franchiseData.map((f) => [f.system_id, f]),
    );
    state.currentSeasonKey = seasonRawToKey(seasonData.current_season || "");

    // Only "Not Yet Aired" entries; exclude seasons before the current season floor.
    state.allAnime = animeData.filter((a) => {
      if (a.airing_status !== "Not Yet Aired") return false;
      if (state.currentSeasonKey) {
        const key = getGroupKey(a);
        // Exclude past season keys; year-only and TBD always pass through.
        if (key.startsWith("S_") && key < state.currentSeasonKey) return false;
      }
      return true;
    });

    render();

    pageDOM.loading.classList.add("hidden");
    pageDOM.animeContent.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    pageDOM.loading.innerHTML = `
      <div class="text-center">
        <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
        <p class="text-gray-500 font-medium">Failed to load releases.</p>
        <button onclick="location.reload()"
          class="mt-4 text-sm text-brand hover:underline font-bold">Retry</button>
      </div>
    `;
  }
}

// ─── Watching status dropdown ─────────────────────────────────────────────
document.addEventListener("change", async (e) => {
  const sel = e.target.closest('[data-action="set-watching-status"]');
  if (!sel) return;
  const animeId = sel.dataset.id;
  const newStatus = sel.value;
  const res = await fetch(`/api/anime/${animeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watching_status: newStatus }),
  });
  if (res.ok) {
    const updatedAnime = await res.json();
    document.dispatchEvent(
      new CustomEvent("animeStatusUpdated", {
        detail: { animeId, newStatus, updatedAnime },
      }),
    );
  }
});

// ─── Mark as Airing button (capture phase — fires before card onclick) ───
document.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="set-airing-status"]');
  if (!btn) return;
  e.stopPropagation(); // prevent card navigation
  const animeId = btn.dataset.id;
  const res = await fetch(`/api/anime/${animeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ airing_status: "Airing" }),
  });
  if (res.ok) {
    const updatedAnime = await res.json();
    document.dispatchEvent(
      new CustomEvent("animeStatusUpdated", {
        detail: { animeId, updatedAnime },
      }),
    );
  }
}, true);

// ─── Re-render when any status update fires ──────────────────────────────
document.addEventListener("animeStatusUpdated", (e) => {
  const { animeId, updatedAnime } = e.detail;
  if (!updatedAnime) return;
  const idx = state.allAnime.findIndex((a) => a.system_id === animeId);
  if (idx < 0) return;
  // If it's now Airing, remove it from the list (page only shows Not Yet Aired)
  if (updatedAnime.airing_status === "Airing") {
    state.allAnime.splice(idx, 1);
  } else {
    state.allAnime[idx] = updatedAnime;
  }
  render();
});

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  pageDOM.loading = document.getElementById("loading");
  pageDOM.animeContent = document.getElementById("anime-content");
  pageDOM.emptyState = document.getElementById("empty-state");
  pageDOM.container = document.getElementById("releases-container");
  pageDOM.panelAnime = document.getElementById("panel-anime");
  pageDOM.panelUnderDev = document.getElementById("panel-under-dev");

  setupTabs();
  setupTypeChips();
  fetchData();
});
