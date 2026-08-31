// Frontend: page component file for Index.
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
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
import { Eyebrow } from "../../components/ui/primitives";

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
  { id: "announcements", label: "Announcements", level: 1 },
  { id: "schedule", label: "Schedule", level: 1 },
  { id: "schedule-watch", label: "My Watch", level: 2 },
  { id: "schedule-broadcast", label: "Broadcast", level: 2 },
  { id: "watching", label: "Watching", level: 1 },
  { id: "watching-active", label: "Active", level: 2 },
  { id: "watching-passive", label: "Passive", level: 2 },
  { id: "watching-paused", label: "Paused", level: 2 },
  { id: "reading", label: "Reading", level: 1 },
  { id: "reading-active", label: "Active", level: 2 },
  { id: "reading-passive", label: "Passive", level: 2 },
  { id: "reading-paused", label: "Paused", level: 2 },
];

function DashboardTOC({ activeId }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Division links: land just below nav. Subsection links: land below division sticky header.
    const navH = document.querySelector("nav")?.offsetHeight ?? 56;
    const divH =
      document.querySelector("[data-division-header]")?.offsetHeight ?? 58;
    const offset = navH + (id.includes("-") ? divH + 24 : 8);
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <nav className="sticky top-[calc(var(--nav-h)+1rem)] space-y-0.5">
      <Eyebrow className="px-2 mb-3">Contents</Eyebrow>
      {TOC_ITEMS.map(({ id, label, level }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            className={`w-full text-left flex items-center gap-2 border-l-2 transition-colors py-1 ${
              level === 2
                ? "pl-5 pr-2 font-mono text-[11px] uppercase tracking-[0.12em]"
                : "pl-3 pr-2 font-display text-sm"
            } ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-text-faint hover:text-text"
            }`}
          >
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
  count,
  items,
  franchiseData,
  isAdmin,
  onEpChange,
  headerTop,
}) {
  const typeGroups = { Anime: [], "TV Show": [], Cartoon: [] };
  items.forEach((item) => {
    const type = item._ui_type || "Anime";
    if (typeGroups[type]) typeGroups[type].push(item);
    else typeGroups[type] = [item];
  });

  return (
    <div id={id}>
      {/* Sticky section header — stacks below the sticky division header */}
      <div
        style={{ top: headerTop }}
        className="sticky z-20 bg-canvas flex items-baseline justify-between pb-2 mb-2 border-b border-border-strong"
      >
        <h2 className="font-display text-2xl font-semibold text-text leading-none">
          {title}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          {count} entries
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-2 py-8 px-4 border border-dashed border-border-strong text-center">
          <p className="text-sm text-text-faint">Nothing filed here right now.</p>
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
                <div className="flex items-center gap-3">
                  <Eyebrow as="h3">
                    {type} · {sorted.length}
                  </Eyebrow>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
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
  count,
  items,
  franchiseData,
  isAdmin,
  onChChange,
  onNovelProgressChange,
  onComicProgressChange,
  headerTop,
}) {
  return (
    <div id={id}>
      {/* Sticky section header — stacks below the sticky division header */}
      <div
        style={{ top: headerTop }}
        className="sticky z-20 bg-canvas flex items-baseline justify-between pb-2 mb-2 border-b border-border-strong"
      >
        <h2 className="font-display text-2xl font-semibold text-text leading-none">
          {title}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          {count} entries
        </span>
      </div>
      {items.length === 0 ? (
        <div className="mt-2 py-8 px-4 border border-dashed border-border-strong text-center">
          <p className="text-sm text-text-faint">Nothing filed here right now.</p>
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
                <div className="flex items-center gap-3">
                  <Eyebrow as="h3">
                    {type} · {sorted.length}
                  </Eyebrow>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
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

  // Subsection headers pin below a division header. Its height depends on
  // fonts, so measure it instead of guessing; all four division headers share
  // the same structure, so observing the first is enough.
  const [divisionBarHeight, setDivisionBarHeight] = useState(58);
  useEffect(() => {
    if (loading) return;
    const el = document.querySelector("[data-division-header]");
    if (!el) return;
    const ro = new ResizeObserver(() => setDivisionBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);
  const subHeaderTop = `calc(var(--nav-h) + ${divisionBarHeight}px)`;

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
      const navH = document.querySelector("nav")?.offsetHeight ?? 56;
      const divH =
        document.querySelector("[data-division-header]")?.offsetHeight ?? 58;
      const threshold = window.scrollY + navH + divH + 24;
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
            <div
              data-division-header
              className="sticky top-[var(--nav-h)] z-30 bg-canvas flex items-end justify-between gap-3 pb-2 border-b border-border-strong"
            >
              <div>
                <Eyebrow className="mb-1">Pinned to the top of the dashboard</Eyebrow>
                <h2 className="font-display text-3xl font-semibold text-text leading-none">
                  Announcements &amp; notes
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {announcements.length} posted
              </span>
            </div>
            <AnnouncementBoard announcements={announcements} />
          </div>

          {/* Schedule Division */}
          <div id="schedule">
            <div
              data-division-header
              className="sticky top-[var(--nav-h)] z-30 bg-canvas flex items-end justify-between gap-3 pb-2 border-b border-border-strong"
            >
              <div>
                <Eyebrow className="mb-1">Sunday · Saturday</Eyebrow>
                <h2 className="font-display text-3xl font-semibold text-text leading-none">
                  Weekly schedule
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {broadcastSchedule.length + watchSchedule.length} scheduled
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <WeeklySchedule
                id="schedule-watch"
                title="My watch schedule"
                icon="fa-user-clock"
                subtitle="Airing · by my watch day"
                dayField="my_watch_day"
                items={watchSchedule}
                emptyText="No airing entries have a watch day set."
              />
              <WeeklySchedule
                id="schedule-broadcast"
                title="Broadcast schedule"
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
            <div
              data-division-header
              className="sticky top-[var(--nav-h)] z-30 bg-canvas flex items-end justify-between gap-3 pb-2 border-b border-border-strong"
            >
              <div>
                <Eyebrow className="mb-1">Anime · TV Show · Cartoon</Eyebrow>
                <h2 className="font-display text-3xl font-semibold text-text leading-none">
                  Watching
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {active.length + passive.length + paused.length} in progress
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <Section
                id="watching-active"
                title="Active watching"
                count={active.length}
                items={active}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
              <Section
                id="watching-passive"
                title="Passive watching"
                count={passive.length}
                items={passive}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
              <Section
                id="watching-paused"
                title="Paused"
                count={paused.length}
                items={paused}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
                isAdmin={isAdmin}
                onEpChange={handleEpChange}
              />
            </div>
          </div>

          {/* Reading Division */}
          <div id="reading">
            <div
              data-division-header
              className="sticky top-[var(--nav-h)] z-30 bg-canvas flex items-end justify-between gap-3 pb-2 border-b border-border-strong"
            >
              <div>
                <Eyebrow className="mb-1">Manga · Novel · Comic</Eyebrow>
                <h2 className="font-display text-3xl font-semibold text-text leading-none">
                  Reading
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {activeReading.length +
  passiveReading.length +
  pausedReading.length}{" "}
in progress
              </span>
            </div>
            <div className="pt-8 space-y-12">
              <ReadingSection
                id="reading-active"
                title="Active reading"
                count={activeReading.length}
                items={activeReading}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
                isAdmin={isAdmin}
                onChChange={handleChChange}
                onNovelProgressChange={handleNovelProgressChange}
                onComicProgressChange={handleComicProgressChange}
              />
              <ReadingSection
                id="reading-passive"
                title="Passive reading"
                count={passiveReading.length}
                items={passiveReading}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
                isAdmin={isAdmin}
                onChChange={handleChChange}
                onNovelProgressChange={handleNovelProgressChange}
                onComicProgressChange={handleComicProgressChange}
              />
              <ReadingSection
                id="reading-paused"
                title="Paused"
                count={pausedReading.length}
                items={pausedReading}
                franchiseData={franchiseData}
                headerTop={subHeaderTop}
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

