// Frontend: page component file for Index.
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getRatingWeight } from "../../utils/media";
import { getSortName } from "../../lib/naming";
import DashboardCard from "../../components/tracker/DashboardCard";
import NovelDashboardCard from "../../components/tracker/NovelDashboardCard";
import ComicDashboardCard from "../../components/tracker/ComicDashboardCard";
import WeeklySchedule from "../../components/tracker/WeeklySchedule";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import AnnouncementBoard from "../../components/info/AnnouncementBoard";
import { useMediaList } from "../../hooks/useMediaList";
import { useApiQuery } from "../../hooks/useApiQuery";
import { endpoints } from "../../api/endpoints";

const RATING_WEIGHT = {
  S: 0,
  "A+": 1,
  A: 2,
  B: 3,
  C: 4,
  D: 5,
  E: 6,
  F: 7,
  Unrated: 8,
};

// The Reading section mixes three media types, each keeping its title under a
// different prefix. Kept here rather than delegated to getSortName because
// manga's fallback order puts jp ahead of cn, which getSortName reverses.
function readingSortName(item) {
  if (item._ui_type === "Novel")
    return item.novel_name_en || item.novel_name_roman || item.novel_name_cn || "";
  if (item._ui_type === "Comic")
    return item.comic_name_en || item.comic_name_cn || item.comic_name_alt || "";
  return (
    item.manga_name_en ||
    item.manga_name_roman ||
    item.manga_name_jp ||
    item.manga_name_cn ||
    item.manga_name_alt ||
    ""
  );
}

const TOC_ITEMS = [
  { id: "announcements", label: "Announcements", icon: "fa-bullhorn", level: 1 },
  { id: "schedule", label: "Schedule", icon: "fa-calendar-week", level: 1 },
  { id: "schedule-watch", label: "My Watch", icon: "fa-user-clock", level: 2 },
  {
    id: "schedule-broadcast",
    label: "Broadcast",
    icon: "fa-satellite-dish",
    level: 2,
  },
  { id: "watching", label: "Watching", icon: "fa-eye", level: 1 },
  { id: "watching-active", label: "Active", icon: "fa-play-circle", level: 2 },
  { id: "watching-passive", label: "Passive", icon: "fa-headphones", level: 2 },
  { id: "watching-paused", label: "Paused", icon: "fa-pause-circle", level: 2 },
  { id: "reading", label: "Reading", icon: "fa-book-open", level: 1 },
  { id: "reading-active", label: "Active", icon: "fa-book-reader", level: 2 },
  { id: "reading-passive", label: "Passive", icon: "fa-glasses", level: 2 },
  { id: "reading-paused", label: "Paused", icon: "fa-pause-circle", level: 2 },
];

function DashboardTOC({ activeId }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Division links: land just below nav. Subsection links: land below division sticky header.
    const offset = id.includes("-") ? 140 : 72;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <nav className="sticky top-20 space-y-0.5">
      <p className="text-[10px] font-black text-text-faint uppercase tracking-widest px-2 mb-3">
        Contents
      </p>
      {TOC_ITEMS.map(({ id, label, icon, level }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            className={`w-full text-left flex items-center gap-2 rounded-lg text-sm transition-all py-1.5 ${
              level === 2 ? "pl-6 pr-2" : "px-2"
            } ${
              isActive
                ? "bg-brand/10 text-brand font-bold"
                : "text-text-faint hover:text-text hover:bg-surface-2 font-medium"
            }`}
          >
            <i
              className={`fas ${icon} text-xs w-3 ${
                isActive ? "text-brand" : "text-text-faint"
              }`}
            ></i>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Section({
  id,
  title,
  icon,
  count,
  items,
  franchiseData,
  isAdmin,
  onEpChange,
}) {
  const typeGroups = { Anime: [], "TV Show": [], Cartoon: [] };
  items.forEach((item) => {
    const type = item._ui_type || "Anime";
    if (typeGroups[type]) typeGroups[type].push(item);
    else typeGroups[type] = [item];
  });

  const typeIcons = {
    Anime: "fa-tv",
    "TV Show": "fa-video",
    Cartoon: "fa-laugh-squint",
  };

  return (
    <div id={id}>
      {/* Sticky section header — stacks below the sticky division header */}
      <div className="sticky top-[116px] z-20 bg-canvas flex items-center justify-between pb-3 mb-2 border-b-2 border-border">
        <h2 className="text-xl font-black text-text flex items-center gap-2">
          <i className={`fas ${icon} text-brand/70`}></i>
          {title}
        </h2>
        <span className="bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
          {count}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-surface/50 rounded-xl border border-border border-dashed">
          <p className="text-text-faint font-medium italic">
            <i className="fas fa-ghost mr-2"></i>Nothing in this category right
            now.
          </p>
        </div>
      ) : (
        <div className="pt-4 space-y-6">
          {["Anime", "TV Show", "Cartoon"].map((type) => {
            const typeItems = typeGroups[type];
            if (!typeItems?.length) return null;
            const sorted = [...typeItems].sort(
              (a, b) =>
                (RATING_WEIGHT[a.my_rating || "Unrated"] ?? 8) -
                (RATING_WEIGHT[b.my_rating || "Unrated"] ?? 8),
            );
            return (
              <div key={type} className="space-y-6">
                <div className="border-b-2 border-border pb-2 flex items-center justify-between">
                  <h3 className="text-lg font-black text-text uppercase tracking-widest flex items-center">
                    <i
                      className={`fas ${typeIcons[type]} text-brand/70 mr-2`}
                    ></i>
                    {type}
                  </h3>
                  <span className="bg-surface-2 text-text-muted px-2.5 py-0.5 rounded-full text-xs font-bold border border-border">
                    {sorted.length} Entries
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {sorted.map((anime) => (
                    <DashboardCard
                      key={anime.system_id}
                      anime={anime}
                      franchise={franchiseData.find(
                        (f) => f.system_id === anime.franchise_id,
                      )}
                      isAdmin={isAdmin}
                      onEpChange={onEpChange}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadingSection({
  id,
  title,
  icon,
  count,
  items,
  franchiseData,
  isAdmin,
  onChChange,
  onNovelProgressChange,
  onComicProgressChange,
}) {
  const typeIcons = { Manga: "fa-book", Novel: "fa-scroll", Comic: "fa-book-open" };

  return (
    <div id={id}>
      {/* Sticky section header — stacks below the sticky division header */}
      <div className="sticky top-[116px] z-20 bg-canvas flex items-center justify-between pb-3 mb-2 border-b-2 border-border">
        <h2 className="text-xl font-black text-text flex items-center gap-2">
          <i className={`fas ${icon} text-brand/70`}></i>
          {title}
        </h2>
        <span className="bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-surface/50 rounded-xl border border-border border-dashed">
          <p className="text-text-faint font-medium italic">
            <i className="fas fa-ghost mr-2"></i>Nothing in this category right
            now.
          </p>
        </div>
      ) : (
        <div className="pt-4 space-y-6">
          {["Manga", "Novel", "Comic"].map((type) => {
            const typeItems = items.filter((i) => i._ui_type === type);
            if (!typeItems.length) return null;
            const sorted = [...typeItems].sort((a, b) => {
              const ratingDiff =
                (RATING_WEIGHT[a.my_rating || "Unrated"] ?? 8) -
                (RATING_WEIGHT[b.my_rating || "Unrated"] ?? 8);
              if (ratingDiff !== 0) return ratingDiff;
              return readingSortName(a).localeCompare(readingSortName(b));
            });
            return (
              <div key={type} className="space-y-6">
                <div className="border-b-2 border-border pb-2 flex items-center justify-between">
                  <h3 className="text-lg font-black text-text uppercase tracking-widest flex items-center">
                    <i
                      className={`fas ${typeIcons[type]} text-brand/70 mr-2`}
                    ></i>
                    {type}
                  </h3>
                  <span className="bg-surface-2 text-text-muted px-2.5 py-0.5 rounded-full text-xs font-bold border border-border">
                    {sorted.length} Entries
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {sorted.map((item) =>
                    item._ui_type === "Comic" ? (
                      <ComicDashboardCard
                        key={item.system_id}
                        comic={item}
                        franchise={franchiseData.find(
                          (f) => f.system_id === item.franchise_id,
                        )}
                        isAdmin={isAdmin}
                        onProgressChange={onComicProgressChange}
                      />
                    ) : item._ui_type === "Novel" ? (
                      <NovelDashboardCard
                        key={item.system_id}
                        novel={item}
                        franchise={franchiseData.find(
                          (f) => f.system_id === item.franchise_id,
                        )}
                        isAdmin={isAdmin}
                        onProgressChange={onNovelProgressChange}
                      />
                    ) : (
                      <DashboardCard
                        key={item.system_id}
                        anime={item}
                        franchise={franchiseData.find(
                          (f) => f.system_id === item.franchise_id,
                        )}
                        isAdmin={isAdmin}
                        onEpChange={onChChange}
                      />
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Index() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);
  const comicQuery = useMediaList("comic", LIST_OPTIONS);
  // Announcements are intentionally kept out of the combined loading/error state
  // below — a failed board must never block the rest of the dashboard.
  const announcementQuery = useApiQuery(
    ["announcements"],
    endpoints.announcements.list(),
  );
  const announcements = announcementQuery.data || [];
  const animeData = animeQuery.data || [];
  const franchiseData = franchiseQuery.data || [];
  const tvData = tvQuery.data || [];
  const cartoonData = cartoonQuery.data || [];
  const mangaData = mangaQuery.data || [];
  const novelData = novelQuery.data || [];
  const comicData = comicQuery.data || [];
  const loading =
    animeQuery.isLoading ||
    franchiseQuery.isLoading ||
    tvQuery.isLoading ||
    cartoonQuery.isLoading ||
    mangaQuery.isLoading ||
    novelQuery.isLoading ||
    comicQuery.isLoading;
  const error =
    animeQuery.error?.message ||
    franchiseQuery.error?.message ||
    tvQuery.error?.message ||
    cartoonQuery.error?.message ||
    mangaQuery.error?.message ||
    novelQuery.error?.message ||
    comicQuery.error?.message ||
    null;
  const [activeSection, setActiveSection] = useState("announcements");

  function updateCachedList(type, updater) {
    queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
      Array.isArray(old) ? old.map(updater) : old,
    );
  }

  // Track which section is in view to highlight TOC
  useEffect(() => {
    if (loading) return;
    const ids = [
      "announcements",
      "schedule",
      "schedule-watch",
      "schedule-broadcast",
      "watching",
      "watching-active",
      "watching-passive",
      "watching-paused",
      "reading",
      "reading-active",
      "reading-passive",
      "reading-paused",
    ];

    function getActive() {
      // Use the same offset as the sticky headers so highlight matches what's visible
      const threshold = window.scrollY + 140;
      let active = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top + window.scrollY <= threshold) {
          active = id;
        }
      }
      setActiveSection(active);
    }

    window.addEventListener("scroll", getActive, { passive: true });
    getActive();
    return () => window.removeEventListener("scroll", getActive);
  }, [loading]);

  async function handleEpChange(sysId, newVal, prevVal, uiType) {
    if (uiType === "TV Show") {
      updateCachedList("tv-show", (t) =>
        t.system_id === sysId ? { ...t, ep_fin: newVal } : t,
      );
      try {
        const res = await fetch(`/api/tv-shows/${sysId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ep_fin: newVal }),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to sync");
        showToast("success", "Episodes updated!");
      } catch {
        updateCachedList("tv-show", (t) =>
          t.system_id === sysId ? { ...t, ep_fin: prevVal } : t,
        );
        showToast("error", "Network error. Progress reverted.");
      }
    } else if (uiType === "Cartoon") {
      updateCachedList("cartoon", (c) =>
        c.system_id === sysId ? { ...c, ep_fin: newVal } : c,
      );
      try {
        const res = await fetch(`/api/cartoon/${sysId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ep_fin: newVal }),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to sync");
        showToast("success", "Episodes updated!");
      } catch {
        updateCachedList("cartoon", (c) =>
          c.system_id === sysId ? { ...c, ep_fin: prevVal } : c,
        );
        showToast("error", "Network error. Progress reverted.");
      }
    } else {
      updateCachedList("anime", (a) =>
        a.system_id === sysId
          ? {
              ...a,
              ep_fin: newVal,
              cum_ep_fin: (a.ep_previous || 0) + newVal,
            }
          : a,
      );
      try {
        const res = await fetch(`/api/anime/${sysId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ep_fin: newVal }),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to sync");
        showToast("success", "Episodes updated!");
      } catch {
        updateCachedList("anime", (a) =>
          a.system_id === sysId
            ? {
                ...a,
                ep_fin: prevVal,
                cum_ep_fin: (a.ep_previous || 0) + prevVal,
              }
            : a,
        );
        showToast("error", "Network error. Progress reverted.");
      }
    }
  }

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading dashboard..." />;
  }

  if (error) {
    return (
      <MediaLoadingState
        error={error}
        errorTitle="Error loading dashboard data."
      />
    );
  }

  async function handleChChange(sysId, newVal, prevVal) {
    updateCachedList("manga", (m) =>
      m.system_id === sysId ? { ...m, ch_fin: newVal } : m,
    );
    try {
      const res = await fetch(`/api/manga/${sysId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ch_fin: newVal }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync");
      showToast("success", "Chapters updated!");
    } catch {
      updateCachedList("manga", (m) =>
        m.system_id === sysId ? { ...m, ch_fin: prevVal } : m,
      );
      showToast("error", "Network error. Progress reverted.");
    }
  }

  async function handleNovelProgressChange(
    sysId,
    fieldUpdates,
    prevFieldUpdates,
  ) {
    updateCachedList("novel", (n) =>
      n.system_id === sysId ? { ...n, ...fieldUpdates } : n,
    );
    try {
      const res = await fetch(`/api/novel/${sysId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fieldUpdates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync");
      showToast("success", "Progress updated!");
    } catch {
      updateCachedList("novel", (n) =>
        n.system_id === sysId ? { ...n, ...prevFieldUpdates } : n,
      );
      showToast("error", "Network error. Progress reverted.");
    }
  }

  async function handleComicProgressChange(
    sysId,
    fieldUpdates,
    prevFieldUpdates,
  ) {
    updateCachedList("comic", (c) =>
      c.system_id === sysId ? { ...c, ...fieldUpdates } : c,
    );
    try {
      const res = await fetch(`/api/comic/${sysId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fieldUpdates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync");
      showToast("success", "Progress updated!");
    } catch {
      updateCachedList("comic", (c) =>
        c.system_id === sysId ? { ...c, ...prevFieldUpdates } : c,
      );
      showToast("error", "Network error. Progress reverted.");
    }
  }

  const animeTagged = animeData.map((a) => ({ ...a, _ui_type: "Anime" }));
  const tvTagged = tvData.map((t) => ({ ...t, _ui_type: "TV Show" }));
  const cartoonTagged = cartoonData.map((c) => ({ ...c, _ui_type: "Cartoon" }));
  const mangaTagged = mangaData.map((m) => ({ ...m, _ui_type: "Manga" }));
  const novelTagged = novelData.map((n) => ({ ...n, _ui_type: "Novel" }));
  const comicTagged = comicData.map((c) => ({ ...c, _ui_type: "Comic" }));

  // Weekly schedule sources. `_media_type` is a MEDIA_CONFIG key, which the
  // schedule uses for display names and detail links. Append other media types
  // here once they carry broadcast/watch day fields.
  const scheduleSources = animeTagged.map((a) => ({
    ...a,
    _media_type: "anime",
  }));
  const broadcastSchedule = scheduleSources.filter(
    (item) => item.airing_status === "Airing" && item.broadcast_day,
  );
  const watchSchedule = scheduleSources.filter(
    (item) => item.airing_status === "Airing" && item.my_watch_day,
  );

  // _ui_type is a display label ("TV Show"); getSortName wants the slug.
  const sortSlug = (item) =>
    item._ui_type === "TV Show" ? "tv-show" : (item._ui_type || "").toLowerCase();

  const sorted = [...animeTagged, ...tvTagged, ...cartoonTagged].sort(
    (a, b) => {
      const fA = franchiseData.find((f) => f.system_id === a.franchise_id);
      const fB = franchiseData.find((f) => f.system_id === b.franchise_id);
      const tA = fA ? fA.franchise_name_cn || fA.franchise_name_en || "" : "";
      const tB = fB ? fB.franchise_name_cn || fB.franchise_name_en || "" : "";
      if (tA !== tB) return tA.localeCompare(tB);
      // Within one franchise the tie-break used to be the per-entry
      // watch_order column, which has been dropped. Name keeps the order
      // stable and predictable instead of leaving it to array position.
      // getSortName is needed rather than a plain field: this list mixes
      // three media types, and each keeps its title under its own prefix.
      return getSortName(a, sortSlug(a)).localeCompare(getSortName(b, sortSlug(b)));
    },
  );

  const active = sorted.filter((a) => a.watching_status === "Active Watching");
  const passive = sorted.filter(
    (a) => a.watching_status === "Passive Watching",
  );
  const paused = sorted.filter((a) => a.watching_status === "Paused");

  const readingSorted = [...mangaTagged, ...novelTagged, ...comicTagged].sort(
    (a, b) => {
      const ratingDiff =
        (RATING_WEIGHT[a.my_rating || "Unrated"] ?? 8) -
        (RATING_WEIGHT[b.my_rating || "Unrated"] ?? 8);
      if (ratingDiff !== 0) return ratingDiff;
      return readingSortName(a).localeCompare(readingSortName(b));
    },
  );
  const activeReading = readingSorted.filter(
    (m) => m.reading_status === "Active Reading",
  );
  const passiveReading = readingSorted.filter(
    (m) => m.reading_status === "Passive Reading",
  );
  const pausedReading = readingSorted.filter(
    (m) => m.reading_status === "Paused",
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* TOC Sidebar — visible on xl+ screens */}
        <aside className="hidden xl:block w-48 shrink-0">
          <DashboardTOC activeId={activeSection} />
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-16">
          {/* Announcement Division */}
          <div id="announcements">
            <div className="sticky top-16 z-30 bg-canvas flex items-center gap-3 pb-3 border-b-2 border-border">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-bullhorn text-brand text-lg"></i>
              </div>
              <div>
                <h1 className="text-2xl font-black text-text tracking-tight leading-none">
                  Announcement &amp; Notes
                </h1>
                <p className="text-xs text-text-faint font-medium mt-0.5">
                  Pinned to the top of the dashboard
                </p>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
                {announcements.length} Posted
              </span>
            </div>
            <AnnouncementBoard announcements={announcements} />
          </div>

          {/* Schedule Division */}
          <div id="schedule">
            <div className="sticky top-16 z-30 bg-canvas flex items-center gap-3 pb-3 border-b-2 border-border">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-calendar-week text-brand text-lg"></i>
              </div>
              <div>
                <h1 className="text-2xl font-black text-text tracking-tight leading-none">
                  Weekly Schedule
                </h1>
                <p className="text-xs text-text-faint font-medium mt-0.5">
                  Sunday · Saturday
                </p>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
                {broadcastSchedule.length + watchSchedule.length} Scheduled
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <WeeklySchedule
                id="schedule-watch"
                title="My Watch Schedule"
                icon="fa-user-clock"
                subtitle="Airing · by my watch day"
                dayField="my_watch_day"
                items={watchSchedule}
                emptyText="No airing entries have a watch day set."
              />
              <WeeklySchedule
                id="schedule-broadcast"
                title="Broadcast Schedule"
                icon="fa-satellite-dish"
                subtitle="Airing · by broadcast day"
                dayField="broadcast_day"
                timeField="broadcast_time"
                items={broadcastSchedule}
                emptyText="No airing entries have a broadcast day set."
                collapsible
                defaultCollapsed
              />
            </div>
          </div>

          {/* Watching Division */}
          <div id="watching">
            <div className="sticky top-16 z-30 bg-canvas flex items-center gap-3 pb-3 border-b-2 border-border">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-eye text-brand text-lg"></i>
              </div>
              <div>
                <h1 className="text-2xl font-black text-text tracking-tight leading-none">
                  Watching
                </h1>
                <p className="text-xs text-text-faint font-medium mt-0.5">
                  Anime · TV Show · Cartoon
                </p>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
                {active.length + passive.length + paused.length} Active
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <Section
                id="watching-active"
                title="Active Watching"
                icon="fa-play-circle"
                count={active.length}
                items={active}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
              <Section
                id="watching-passive"
                title="Passive Watching"
                icon="fa-headphones"
                count={passive.length}
                items={passive}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
              <Section
                id="watching-paused"
                title="Paused"
                icon="fa-pause-circle"
                count={paused.length}
                items={paused}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
            </div>
          </div>

          {/* Reading Division */}
          <div id="reading">
            <div className="sticky top-16 z-30 bg-canvas flex items-center gap-3 pb-3 border-b-2 border-border">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <i className="fas fa-book-open text-brand text-lg"></i>
              </div>
              <div>
                <h1 className="text-2xl font-black text-text tracking-tight leading-none">
                  Reading
                </h1>
                <p className="text-xs text-text-faint font-medium mt-0.5">
                  Manga · Novel · Comics
                </p>
              </div>
              <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
                {activeReading.length +
                  passiveReading.length +
                  pausedReading.length}{" "}
                Active
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <ReadingSection
                id="reading-active"
                title="Active Reading"
                icon="fa-book-reader"
                count={activeReading.length}
                items={activeReading}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onChChange={handleChChange}
                onNovelProgressChange={handleNovelProgressChange}
                onComicProgressChange={handleComicProgressChange}
              />
              <ReadingSection
                id="reading-passive"
                title="Passive Reading"
                icon="fa-glasses"
                count={passiveReading.length}
                items={passiveReading}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onChChange={handleChChange}
                onNovelProgressChange={handleNovelProgressChange}
                onComicProgressChange={handleComicProgressChange}
              />
              <ReadingSection
                id="reading-paused"
                title="Paused"
                icon="fa-pause-circle"
                count={pausedReading.length}
                items={pausedReading}
                franchiseData={franchiseData}
                isAdmin={isAdmin}
                onChChange={handleChChange}
                onNovelProgressChange={handleNovelProgressChange}
                onComicProgressChange={handleComicProgressChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

