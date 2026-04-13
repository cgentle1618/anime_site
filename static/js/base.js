// ==========================================
// 1. Mobile Menu Toggle
// ==========================================
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileMenu = document.getElementById("mobile-menu");
if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("hidden");
  });
}

// ==========================================
// 2. Toast Notification Function
// ==========================================
function showNotification(type = "success", message = "Operation successful!") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `flex items-center p-4 rounded-lg shadow-lg text-sm font-medium text-white transform transition-all duration-300 translate-y-4 opacity-0 ${type === "success" ? "bg-emerald-500" : type === "warning" ? "bg-amber-500" : "bg-red-500"}`;
  toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : type === "warning" ? "fa-exclamation-triangle" : "fa-exclamation-circle"} mr-2"></i> ${message}`;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
  });

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// 3. Backup System Logic
// ==========================================
const DOM = {
  syncBtn: document.getElementById("backup-btn"),
  syncIcon: document.getElementById("backup-icon"),
};

if (DOM.syncBtn && DOM.syncIcon) {
  DOM.syncBtn.addEventListener("click", async () => {
    try {
      DOM.syncIcon.classList.remove("fa-sync-alt");
      DOM.syncIcon.classList.add("fa-spinner", "fa-spin");
      DOM.syncBtn.classList.add("opacity-75", "pointer-events-none");
      DOM.syncBtn.innerText = " Backing up...";
      DOM.syncBtn.prepend(DOM.syncIcon);

      const response = await fetch("/api/data-control/backup", {
        method: "POST",
      });
      if (response.ok) {
        DOM.syncIcon.classList.remove("fa-spinner", "fa-spin");
        DOM.syncIcon.classList.add("fa-check");
        DOM.syncBtn.classList.remove(
          "bg-brand",
          "hover:bg-brand-hover",
          "opacity-75",
          "pointer-events-none",
        );
        DOM.syncBtn.classList.add("bg-emerald-500", "hover:bg-emerald-600");
        DOM.syncBtn.innerText = " Backed up!";
        DOM.syncBtn.prepend(DOM.syncIcon);

        showNotification("success", "Backup completed successfully.");

        if (typeof loadDashboard === "function") await loadDashboard();
        await loadUniversalSearchData();

        setTimeout(() => {
          DOM.syncIcon.classList.remove("fa-check");
          DOM.syncIcon.classList.add("fa-sync-alt");
          DOM.syncBtn.classList.remove(
            "bg-emerald-500",
            "hover:bg-emerald-600",
          );
          DOM.syncBtn.classList.add("bg-brand", "hover:bg-brand-hover");
          DOM.syncBtn.innerText = " Backup";
          DOM.syncBtn.prepend(DOM.syncIcon);
        }, 2000);
      } else {
        throw new Error(
          (await response.json()).detail || "Unknown error occurred.",
        );
      }
    } catch (error) {
      DOM.syncIcon.classList.remove("fa-spin");
      DOM.syncBtn.classList.remove("opacity-75", "pointer-events-none");
      DOM.syncBtn.innerText = " Backup";
      DOM.syncBtn.prepend(DOM.syncIcon);
      showNotification("error", error.message);
    }
  });
}

// ==========================================
// 4. Universal Search Logic
// ==========================================
const usInput = document.getElementById("universal-search-input");
const usResults = document.getElementById("universal-search-results");
const usContainer = document.getElementById("universal-search-container");
let searchDataCache = null;

async function loadUniversalSearchData() {
  try {
    const [franchiseRes, animeRes] = await Promise.all([
      fetch("/api/franchise/"),
      fetch("/api/anime/"),
    ]);
    if (!franchiseRes.ok || !animeRes.ok) return;
    searchDataCache = {
      franchises: await franchiseRes.json(),
      anime: await animeRes.json(),
    };
  } catch (e) {
    console.error("Universal Search init failed", e);
  }
}

if (usContainer) {
  usContainer.addEventListener(
    "mouseenter",
    () => {
      if (!searchDataCache) loadUniversalSearchData();
    },
    { once: true },
  );
  usInput.addEventListener("focus", () => {
    if (!searchDataCache) loadUniversalSearchData();
  });
}

if (usInput && usResults) {
  usInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const query = e.target.value.trim();
      if (query) {
        window.location.href = `/search?q=${encodeURIComponent(query)}`;
      }
    }
  });

  usInput.addEventListener("input", (e) => {
    if (!searchDataCache) return;

    const query = e.target.value
      .toLowerCase()
      .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
    if (query.length < 1) {
      usResults.classList.add("hidden");
      return;
    }

    let html = "";

    let fMatches = searchDataCache.franchises.filter((f) => {
      const names = [
        f.franchise_name_cn,
        f.franchise_name_en,
        f.franchise_name_romanji,
        f.franchise_name_jp,
        f.franchise_name_alt,
      ];
      return names.some(
        (n) =>
          n &&
          n
            .toLowerCase()
            .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "")
            .includes(query),
      );
    });

    fMatches.sort((a, b) => {
      const titleA =
        a.franchise_name_en ||
        a.franchise_name_romanji ||
        a.franchise_name_cn ||
        a.franchise_name_jp ||
        a.franchise_name_alt ||
        "";
      const titleB =
        b.franchise_name_en ||
        b.franchise_name_romanji ||
        b.franchise_name_cn ||
        b.franchise_name_jp ||
        b.franchise_name_alt ||
        "";
      return titleA.localeCompare(titleB);
    });

    fMatches = fMatches.slice(0, 5);

    if (fMatches.length > 0) {
      html += `<div class="px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0">Franchises</div>`;
      fMatches.forEach((f) => {
        const title =
          f.franchise_name_cn ||
          f.franchise_name_en ||
          f.franchise_name_alt ||
          f.franchise_name_romanji ||
          f.franchise_name_jp ||
          "Unknown";
        html += `
          <a href="/franchise/${f.system_id}" class="block px-4 py-2 hover:bg-brand/5 border-b border-gray-50 last:border-0 cursor-pointer transition">
              <div class="text-sm font-bold text-gray-800 truncate">${title}</div>
              <div class="text-[10px] text-brand font-medium">Franchise Hub</div>
          </a>`;
      });
    }

    let aMatches = searchDataCache.anime.filter((a) => {
      const names = [
        a.anime_name_cn,
        a.anime_name_en,
        a.anime_name_romanji,
        a.anime_name_jp,
        a.anime_name_alt,
      ];
      return names.some(
        (n) =>
          n &&
          n
            .toLowerCase()
            .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "")
            .includes(query),
      );
    });

    aMatches.sort((a, b) => {
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

    aMatches = aMatches.slice(0, 8);

    if (aMatches.length > 0) {
      html += `<div class="px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0">Anime Entries</div>`;
      aMatches.forEach((a) => {
        const title =
          a.anime_name_cn ||
          a.anime_name_en ||
          a.anime_name_alt ||
          a.anime_name_romanji ||
          a.anime_name_jp ||
          "Unknown";
        const type = a.airing_type || "TV";
        html += `
          <a href="/anime/${a.system_id}" class="block px-4 py-2 hover:bg-brand/5 border-b border-gray-50 last:border-0 cursor-pointer transition">
              <div class="text-sm font-bold text-gray-800 truncate">${title}</div>
              <div class="text-[10px] text-gray-500 font-medium">${type}</div>
          </a>`;
      });
    }

    if (html === "") {
      html = `<div class="px-4 py-3 text-sm text-gray-500 italic text-center">No results found for "${e.target.value}"</div>`;
    }

    html += `
      <a href="/search?q=${encodeURIComponent(e.target.value)}" class="block px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-center text-xs font-bold text-brand transition sticky bottom-0 border-t border-gray-200">
          View all search results <i class="fas fa-arrow-right ml-1"></i>
      </a>`;

    usResults.innerHTML = html;
    usResults.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!usContainer.contains(e.target)) usResults.classList.add("hidden");
  });
}

// ==========================================
// 5. Logout Logic
// ==========================================
async function logout() {
  try {
    let res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) console.error("Logout failed! Server said:", await res.text());
  } catch (e) {
    console.error("Network error during fetch:", e);
  }
  document.cookie =
    "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  window.location.href = "/login";
}

// ==========================================
// 6. Global Anime Status Toggle ("+" Button)
// ==========================================

// Expose the visual data map globally so any page rendering a card can use it
window.getGlobalStatusToggleData = function (status) {
  const s = status || "Might Watch";
  if (s === "Might Watch")
    return {
      html: '<i class="fas fa-plus text-[10px]"></i>',
      nextStatus: "Plan to Watch",
      cls: "text-gray-500 bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600",
    };
  if (["Plan to Watch", "Watch When Airs"].includes(s))
    return {
      html: '<i class="fas fa-ellipsis-h text-[10px]"></i>',
      nextStatus: "Might Watch",
      cls: "text-blue-600 bg-blue-50 border-blue-200 hover:bg-gray-100 hover:border-gray-200 hover:text-gray-500",
    };
  if (["Active Watching", "Passive Watching", "Paused"].includes(s))
    return {
      html: '<span class="text-sm leading-none mt-[-2px] font-black">~</span>',
      nextStatus: "Might Watch",
      cls: "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-gray-100 hover:border-gray-200 hover:text-gray-500",
    };
  if (s === "Completed")
    return {
      html: '<i class="fas fa-check text-[10px]"></i>',
      nextStatus: "Might Watch",
      cls: "text-purple-600 bg-purple-50 border-purple-200 hover:bg-gray-100 hover:border-gray-200 hover:text-gray-500",
    };
  if (["Temp Dropped", "Dropped", "Won't Watch"].includes(s))
    return {
      html: '<i class="fas fa-times text-[10px]"></i>',
      nextStatus: "Might Watch",
      cls: "text-red-600 bg-red-50 border-red-200 hover:bg-gray-100 hover:border-gray-200 hover:text-gray-500",
    };
  return {
    html: '<i class="fas fa-plus text-[10px]"></i>',
    nextStatus: "Plan to Watch",
    cls: "text-gray-500 bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600",
  };
};

// Global Click Listener for any button with data-action="toggle-status"
document.addEventListener("click", async (e) => {
  const toggleBtn = e.target.closest('[data-action="toggle-status"]');
  if (!toggleBtn) return;

  e.preventDefault();
  e.stopPropagation();

  const animeId = toggleBtn.dataset.id;
  const nextStatus = toggleBtn.dataset.nextStatus;
  const originalHtml = toggleBtn.innerHTML;

  // Optimistic loading state
  toggleBtn.innerHTML =
    '<i class="fas fa-circle-notch fa-spin text-[10px]"></i>';
  toggleBtn.classList.add("opacity-50", "pointer-events-none");

  try {
    // 1. Send the PATCH request
    const res = await fetch(`/api/anime/${animeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watching_status: nextStatus }),
    });

    if (!res.ok) throw new Error("Status update failed");
    if (typeof showNotification === "function")
      showNotification("success", "Status updated to " + nextStatus);

    // 2. Fetch the fully updated entry to capture any backend cascade calculations
    const updatedRes = await fetch(`/api/anime/${animeId}`);
    let updatedAnime = null;
    if (updatedRes.ok) {
      updatedAnime = await updatedRes.json();
    }

    const finalStatus = updatedAnime
      ? updatedAnime.watching_status
      : nextStatus;
    const newToggleData = window.getGlobalStatusToggleData(finalStatus);

    // 3. Update the button visually
    toggleBtn.dataset.nextStatus = newToggleData.nextStatus;

    // Preserve mx-auto if it was used in a table layout
    const isMxAuto = toggleBtn.classList.contains("mx-auto");
    toggleBtn.className = `w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors ${newToggleData.cls}`;
    if (isMxAuto) toggleBtn.classList.add("mx-auto");

    toggleBtn.title = `${finalStatus} \u2192 ${newToggleData.nextStatus}`;
    toggleBtn.innerHTML = newToggleData.html;

    // 4. Dispatch a Custom Event. Pages like franchise_acg.html can listen for this to re-sort their lists!
    document.dispatchEvent(
      new CustomEvent("animeStatusUpdated", {
        detail: { animeId, newStatus: finalStatus, updatedAnime },
      }),
    );
  } catch (error) {
    console.error(error);
    if (typeof showNotification === "function")
      showNotification("error", "Failed to update status.");
    toggleBtn.innerHTML = originalHtml;
  } finally {
    toggleBtn.classList.remove("opacity-50", "pointer-events-none");
  }
});
