// Frontend: page component file for FranchisePage.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { releaseScore, releaseYear } from "../../lib/releaseDate";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  getSortName,
  isBaha,
  FALLBACK_SVG,
  getRatingWeight,
  parseTypes,
  COMPLETED_STATUSES,
} from "../../utils/media";
import { getFranchiseCover } from "../../lib/covers";
import {
  HubLoading,
  HubError,
  FilterEmpty,
} from "../../components/hub/HubStates";
import {
  HubShell,
  GRID_CLS,
  SELECT_CLS,
  pillCls,
  Crumbs,
  AdminStrip,
  HeroCover,
  Field,
  HubTabs,
  Section,
} from "../../components/hub/HubChrome";
import {
  Eyebrow,
  Slip,
  RatingStamp,
  Chip,
  ProgressRule,
  Button,
} from "../../components/ui/primitives";
import MediaCard from "../../components/cards/MediaCard";
import RemarkModal from "../../components/modals/RemarkModal";
import WatchOrderSection from "../../components/tracker/WatchOrderSection";
import FranchiseNotes from "./FranchiseNotes";
import RelationGraph from "../../components/relations/RelationGraph";
import SizeGroupControls from "../../components/plan/SizeGroupControls";
import PlanKindToggles, {
  kindLabel,
  applicableTypes,
} from "../../components/plan/PlanKindToggles";
import { SIZE_GROUPS, scopesFor } from "../../config/planNextGroups";
import { effectiveBucket } from "../../utils/planNext";

function GroupRail({ label, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <Eyebrow as="h3" className="shrink-0">
        {label}
      </Eyebrow>
      <span className="font-mono text-[10px] text-text-faint">{count}</span>
      <span className="flex-1 border-t border-dotted border-border-strong/60" />
    </div>
  );
}

const WATCHING_STATUS_GROUPS = {
  Planned: ["Plan to Watch", "Watch When Airs"],
  Watching: ["Active Watching", "Passive Watching", "Paused"],
  Completed: COMPLETED_STATUSES,
  Dropped: ["Temp Dropped", "Dropped", "Won't Watch"],
  "Might Watch": ["Might Watch"],
};

function getWatchingGroup(status) {
  for (const [group, statuses] of Object.entries(WATCHING_STATUS_GROUPS)) {
    if (statuses.includes(status)) return group;
  }
  return "Might Watch";
}

function animeDateScore(a) {
  return releaseScore(a.release_date);
}

function animeMovieDateScore(m) {
  return releaseScore(m.release_date_jp || m.release_date_tw);
}

// TW first, matching the stored release priority for movies.
function movieDateScore(m) {
  return releaseScore(m.release_date_tw || m.release_date_usa);
}

function tvDateScore(t) {
  return releaseScore(t.release_date);
}


export default function FranchisePage() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  // ── data ──────────────────────────────────────────────────────────────────
  const [franchise, setFranchise] = useState(null);
  const [parentCollection, setParentCollection] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [animeList, setAnimeList] = useState([]);
  const [animeMovieList, setAnimeMovieList] = useState([]);
  const [movieList, setMovieList] = useState([]);
  const [tvShowList, setTvShowList] = useState([]);
  const [cartoonList, setCartoonList] = useState([]);
  const [mangaList, setMangaList] = useState([]);
  const [novelList, setNovelList] = useState([]);
  const [comicList, setComicList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── admin editable ─────────────────────────────────────────────────────────
  const [rating, setRating] = useState("");
  const [expectation, setExpectation] = useState("");
  const [plannedTypes, setPlannedTypes] = useState(new Set());
  const [rewatchMarked, setRewatchMarked] = useState(new Set());
  const [remark, setRemark] = useState("");
  const [showRemark, setShowRemark] = useState(false);
  const [remarkClipped, setRemarkClipped] = useState(false);
  const remarkRef = useRef(null);

  // ── tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(null);

  // ── Anime tab state ───────────────────────────────────────────────────────
  const [animeSort, setAnimeSort] = useState("release_date");
  const [animeGroupBySeries, setAnimeGroupBySeries] = useState(true);
  const [animeFilters, setAnimeFilters] = useState({
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  });

  // ── Anime Movie tab state ─────────────────────────────────────────────────
  const [animeMovieSort, setAnimeMovieSort] = useState("release_date");

  // ── Manga tab state ───────────────────────────────────────────────────────
  const [mangaSort, setMangaSort] = useState("title");
  const [mangaGroupBySeries, setMangaGroupBySeries] = useState(false);
  const [mangaFilters, setMangaFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
    region: new Set(),
  });

  // ── Novel tab state ───────────────────────────────────────────────────────
  const [novelSort, setNovelSort] = useState("title");
  const [novelGroupBySeries, setNovelGroupBySeries] = useState(false);
  const [novelFilters, setNovelFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
    region: new Set(),
  });

  // ── Comic tab state ───────────────────────────────────────────────────────
  // Grouping defaults on: a comic franchise is a shelf of many short runs, so
  // the series rail is what makes the tab readable.
  const [comicSort, setComicSort] = useState("release_date");
  const [comicGroupBySeries, setComicGroupBySeries] = useState(true);
  const [comicFilters, setComicFilters] = useState({
    comicType: new Set(),
    readingStatus: new Set(),
    era: new Set(),
  });

  // ── Movies tab state ──────────────────────────────────────────────────────
  const [movSort, setMovSort] = useState("release_date");
  const [movGroupBySeries, setMovGroupBySeries] = useState(true);
  const [movFilters, setMovFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
  });

  // ── TV Shows tab state ────────────────────────────────────────────────────
  const [tvSort, setTvSort] = useState("release_date");
  const [tvGroupBySeries, setTvGroupBySeries] = useState(true);
  const [tvFilters, setTvFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
  });

  // ── Cartoons tab state ────────────────────────────────────────────────────
  const [cartoonSort, setCartoonSort] = useState("release_date");
  const [cartoonGroupBySeries, setCartoonGroupBySeries] = useState(true);
  const [cartoonFilters, setCartoonFilters] = useState({
    airingStatus: new Set(),
    airingType: new Set(),
    watchingStatus: new Set(),
  });

  // ── fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Navigating hub -> hub reuses this component: reset the view and drop
    // any response that lands after the id has already changed.
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveTab(null);
    async function load() {
      try {
        const [fRes, sRes, aRes, amRes, mRes, tvRes, cRes, mgRes, nvRes, cmRes, pnRes] =
          await Promise.all([
            fetch(endpoints.resource("franchise").detail(system_id), { credentials: "include" }),
            fetch(buildUrl(endpoints.resource("series").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("anime").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("anime-movie").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("movie").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("tv-show").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("cartoon").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("manga").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("novel").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("comic").list(), { franchise_id: system_id }), {
              credentials: "include",
            }),
            fetch("/api/plan-next/?scope=franchise", { credentials: "include" }),
          ]);
        if (!fRes.ok) throw new Error("Franchise not found");
        const [f, s, a, am, m, tv, c, mg, nv, cm, pn] = await Promise.all([
          fRes.json(),
          sRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
          cmRes.json(),
          pnRes.ok ? pnRes.json() : [],
        ]);
        if (cancelled) return;
        setFranchise(f);
        setSeriesList(s);
        setAnimeList(a);
        setAnimeMovieList(am);
        setMovieList(m);
        setTvShowList(tv);
        setCartoonList(c);
        setMangaList(mg);
        setNovelList(nv);
        setComicList(cm);
        setPlannedTypes(
          new Set(
            pn
              .filter(
                (row) =>
                  row.target_id === f.system_id &&
                  (row.kind ?? "next") === "next",
              )
              .map((row) => row.media_type),
          ),
        );
        setRewatchMarked(
          new Set(
            pn
              .filter(
                (row) =>
                  row.target_id === f.system_id && row.kind === "rewatch",
              )
              .map((row) => row.media_type),
          ),
        );
        setRating(f.my_rating || "");
        setExpectation(f.franchise_expectation || "");
        setRemark(f.remark || "");
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [system_id]);

  // ── type flags ────────────────────────────────────────────────────────────
  const types = useMemo(
    () => parseTypes(franchise?.franchise_type),
    [franchise],
  );
  const hasACG = useMemo(
    () => types.includes("ACG") || types.includes("Anime"),
    [types],
  );
  const hasACGFull = useMemo(() => types.includes("ACG"), [types]);
  const hasNovel = useMemo(
    () => types.includes("Novel") || types.includes("ACG"),
    [types],
  );
  const hasAnimeMovie = useMemo(() => types.includes("Anime Movie"), [types]);
  const hasMovie = useMemo(() => types.includes("Movie"), [types]);
  const hasTV = useMemo(() => types.includes("TV"), [types]);
  const hasCartoon = useMemo(() => types.includes("Cartoon"), [types]);
  const hasComic = useMemo(() => types.includes("Comic"), [types]);

  // Media types this franchise carries a size bucket for, restricted to
  // franchise-eligible scopes (comic/anime-movie/manga/novel can never be
  // planned at franchise level - see scopesFor / ALLOWED_SCOPES["next"]).
  const sizeGroupMediaTypes = useMemo(() => {
    const keys = new Set([
      ...Object.keys(franchise?.size_group_derived || {}),
      ...Object.keys(franchise?.size_group_manual || {}),
    ]);
    const filtered = Array.from(keys).filter((mt) =>
      scopesFor("next", mt).includes("franchise"),
    );
    return filtered.length > 0 ? filtered : ["anime"];
  }, [franchise]);

  // Media types this franchise actually holds entries for, driven by the
  // per-type entry lists rather than franchise_type (which is multi-valued,
  // bundles types together, and carries a legacy "Anime" value).
  const franchiseMediaTypes = useMemo(() => {
    const list = [];
    if (animeList.length) list.push("anime");
    if (animeMovieList.length) list.push("anime-movie");
    if (movieList.length) list.push("movie");
    if (tvShowList.length) list.push("tv-show");
    if (cartoonList.length) list.push("cartoon");
    if (mangaList.length) list.push("manga");
    if (novelList.length) list.push("novel");
    if (comicList.length) list.push("comic");
    return list;
  }, [
    animeList,
    animeMovieList,
    movieList,
    tvShowList,
    cartoonList,
    mangaList,
    novelList,
    comicList,
  ]);

  const franchiseApplicableRewatchTypes = useMemo(
    () => applicableTypes("rewatch", "franchise", franchiseMediaTypes),
    [franchiseMediaTypes],
  );

  // Only this group filters which media entries are listed. It is shown under
  // its own label, apart from the extras below, because mixing the two in one
  // row made "Memes" read as just another entry type.
  const mediaTabs = useMemo(() => {
    if (!franchise) return [];
    return [
      hasACG && animeList.length && "Anime",
      (hasACG || hasAnimeMovie) && animeMovieList.length && "Anime Movies",
      hasACGFull && mangaList.length && "Manga",
      hasNovel && novelList.length && "Novel",
      hasComic && comicList.length && "Comic",
      hasMovie && movieList.length && "Movies",
      hasTV && tvShowList.length && "TV Shows",
      hasCartoon && cartoonList.length && "Cartoons",
    ].filter(Boolean);
  }, [
    franchise,
    hasACG,
    hasACGFull,
    hasNovel,
    hasComic,
    hasAnimeMovie,
    hasMovie,
    hasTV,
    hasCartoon,
    animeList,
    animeMovieList,
    mangaList,
    novelList,
    comicList,
    movieList,
    tvShowList,
    cartoonList,
  ]);

  // Always offered, and never dependent on the entry lists: each section
  // reports whether it holds anything, and an admin needs the entry point
  // precisely when it is still empty.
  const extraTabs = useMemo(
    () => (franchise ? ["Watch Order", "Relations", "Notes"] : []),
    [franchise],
  );

  const tabs = useMemo(
    () => [...mediaTabs, ...extraTabs],
    [mediaTabs, extraTabs],
  );

  useEffect(() => {
    if (tabs.length > 0 && activeTab === null) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // ── callbacks ─────────────────────────────────────────────────────────────
  const handleAnimeUpdated = useCallback(
    (u) =>
      setAnimeList((p) => p.map((a) => (a.system_id === u.system_id ? u : a))),
    [],
  );
  const handleAnimeMovieUpdated = useCallback(
    (u) =>
      setAnimeMovieList((p) =>
        p.map((m) => (m.system_id === u.system_id ? u : m)),
      ),
    [],
  );
  const handleMovieUpdated = useCallback(
    (u) =>
      setMovieList((p) => p.map((m) => (m.system_id === u.system_id ? u : m))),
    [],
  );
  const handleTvShowUpdated = useCallback(
    (u) =>
      setTvShowList((p) => p.map((t) => (t.system_id === u.system_id ? u : t))),
    [],
  );
  const handleCartoonUpdated = useCallback(
    (u) =>
      setCartoonList((p) =>
        p.map((c) => (c.system_id === u.system_id ? u : c)),
      ),
    [],
  );
  const handleMangaUpdated = useCallback(
    (u) =>
      setMangaList((p) => p.map((m) => (m.system_id === u.system_id ? u : m))),
    [],
  );
  const handleNovelUpdated = useCallback(
    (u) =>
      setNovelList((p) => p.map((n) => (n.system_id === u.system_id ? u : n))),
    [],
  );
  const handleComicUpdated = useCallback(
    (u) =>
      setComicList((p) => p.map((c) => (c.system_id === u.system_id ? u : c))),
    [],
  );

  // Optional parent tier: resolve the collection name for the breadcrumb.
  useEffect(() => {
    const cid = franchise?.collection_id;
    if (!cid) {
      setParentCollection(null);
      return;
    }
    let cancelled = false;
    fetch(endpoints.resource("collection").detail(cid), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled) setParentCollection(c);
      })
      .catch(() => {
        if (!cancelled) setParentCollection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [franchise?.collection_id]);

  // The inline box stays a fixed three rows; "Show all" is only worth offering
  // when the text actually runs past it.
  useEffect(() => {
    const el = remarkRef.current;
    if (!el) {
      setRemarkClipped(false);
      return;
    }
    setRemarkClipped(el.scrollHeight > el.clientHeight + 1);
  }, [remark, loading]);

  async function saveField(field, value) {
    try {
      const res = await fetch(endpoints.resource("franchise").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
        credentials: "include",
      });
      if (res.ok) {
        setFranchise(await res.json());
        showToast("success", "Franchise updated successfully");
      } else {
        showToast("error", "Save failed");
      }
    } catch {
      showToast("error", "Network error. Reverting.");
    }
  }

  // Shared by both plan kinds at franchise scope: only the kind, the target
  // state Set, and the resulting toast differ.
  async function handleTogglePlanKind(kind, mediaType, next) {
    if (!franchise) return;
    try {
      if (next) {
        const res = await fetch("/api/plan-next/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            media_type: mediaType,
            scope: "franchise",
            kind,
            target_id: franchise.system_id,
          }),
        });
        if (!res.ok && res.status !== 409) return;
      } else {
        const params = new URLSearchParams({
          scope: "franchise",
          media_type: mediaType,
          kind,
          target_id: franchise.system_id,
        });
        const res = await fetch(`/api/plan-next/target?${params}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) return;
      }
      const setter = kind === "rewatch" ? setRewatchMarked : setPlannedTypes;
      setter((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(mediaType);
        else nextSet.delete(mediaType);
        return nextSet;
      });
    } catch {
      showToast("error", "Network error.");
    }
  }

  const handleTogglePlan = (mediaType, next) =>
    handleTogglePlanKind("next", mediaType, next);
  const handleRewatchToggle = (mediaType, next) =>
    handleTogglePlanKind("rewatch", mediaType, next);

  function handleOverride(mediaType, key) {
    const nextManual = { ...(franchise?.size_group_manual || {}) };
    if (key) nextManual[mediaType] = key;
    else delete nextManual[mediaType];
    saveField(
      "size_group_manual",
      Object.keys(nextManual).length > 0 ? nextManual : null,
    );
  }

  // Shared by the inline box and the full-view modal, which edit one draft.
  function saveRemark() {
    if (isAdmin && remark !== (franchise?.remark || ""))
      saveField("remark", remark);
  }

  function toggleSetFilter(setFn, group, value) {
    setFn((prev) => {
      const next = { ...prev, [group]: new Set(prev[group]) };
      if (next[group].has(value)) next[group].delete(value);
      else next[group].add(value);
      return next;
    });
  }

  // ── Anime memos ───────────────────────────────────────────────────────────
  const filteredAndSortedAnime = useMemo(() => {
    let result = animeList.filter((a) => {
      if (
        animeFilters.airingType.size > 0 &&
        !animeFilters.airingType.has(a.airing_type)
      )
        return false;
      if (
        animeFilters.airingStatus.size > 0 &&
        !animeFilters.airingStatus.has(a.airing_status)
      )
        return false;
      if (animeFilters.bahaOnly && !isBaha(a)) return false;
      if (animeFilters.watchingStatus.size > 0) {
        const ws = a.watching_status || "Might Watch";
        let group = "Might Watch";
        if (["Plan to Watch", "Watch When Airs"].includes(ws))
          group = "Planned";
        else if (["Active Watching", "Passive Watching", "Paused"].includes(ws))
          group = "Watching";
        else if (COMPLETED_STATUSES.includes(ws))
          group = "Completed";
        else if (["Temp Dropped", "Dropped", "Won't Watch"].includes(ws))
          group = "Dropped";
        if (!animeFilters.watchingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (animeSort === "release_date") {
        const diff = animeDateScore(a) - animeDateScore(b);
        if (diff !== 0) return diff;
      }
      if (animeSort === "my_rating")
        return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
      if (animeSort === "mal_rating") {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
        if (wA !== wB) return wB - wA;
      }
      return getSortName(a, "anime").localeCompare(getSortName(b, "anime"));
    });
    return result;
  }, [animeList, animeFilters, animeSort]);

  const animeSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedAnime.forEach((a) => {
      if (a.series_id && sm[a.series_id]) {
        (grouped[a.series_id] = grouped[a.series_id] || []).push(a);
      } else standalone.push(a);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({ type: "series", series: s, anime: grouped[s.system_id] });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", anime: standalone });
    return result;
  }, [filteredAndSortedAnime, seriesList]);

  // ── Anime Movie memos ─────────────────────────────────────────────────────
  const sortedAnimeMovies = useMemo(() => {
    return [...animeMovieList].sort((a, b) => {
      if (animeMovieSort === "release_date") {
        const diff = animeMovieDateScore(a) - animeMovieDateScore(b);
        if (diff !== 0) return diff;
      }
      if (animeMovieSort === "my_rating")
        return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
      if (animeMovieSort === "mal_rating") {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
        if (wA !== wB) return wB - wA;
      }
      const t = (m) =>
        m.anime_movie_name_en ||
        m.anime_movie_name_roman ||
        m.anime_movie_name_cn ||
        "";
      return t(a).localeCompare(t(b));
    });
  }, [animeMovieList, animeMovieSort]);

  // ── Manga memos ───────────────────────────────────────────────────────────
  const filteredAndSortedManga = useMemo(() => {
    let result = mangaList.filter((m) => {
      if (
        mangaFilters.serializationStatus.size > 0 &&
        !mangaFilters.serializationStatus.has(m.serialization_status || "")
      )
        return false;
      if (
        mangaFilters.region.size > 0 &&
        !mangaFilters.region.has(m.region || "")
      )
        return false;
      if (mangaFilters.readingStatus.size > 0) {
        const rs = m.reading_status || "Might Read";
        let group = "Might Read";
        if (rs === "Plan to Read") group = "Planned";
        else if (["Active Reading", "Passive Reading", "Paused"].includes(rs))
          group = "Reading";
        else if (COMPLETED_STATUSES.includes(rs))
          group = "Completed";
        else if (["Temp Dropped", "Dropped", "Won't Read"].includes(rs))
          group = "Dropped";
        if (!mangaFilters.readingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (mangaSort === "my_rating")
        return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
      if (mangaSort === "mal_rating") {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
        if (wA !== wB) return wB - wA;
      }
      if (mangaSort === "release_date")
        return (
          releaseScore(a.release_date) - releaseScore(b.release_date)
        );
      if (mangaSort === "end_date")
        return releaseScore(a.end_date) - releaseScore(b.end_date);
      return (a.manga_name_cn || a.manga_name_en || "").localeCompare(
        b.manga_name_cn || b.manga_name_en || "",
      );
    });
    return result;
  }, [mangaList, mangaFilters, mangaSort]);

  const mangaSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedManga.forEach((m) => {
      if (m.series_id && sm[m.series_id]) {
        (grouped[m.series_id] = grouped[m.series_id] || []).push(m);
      } else standalone.push(m);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({ type: "series", series: s, manga: grouped[s.system_id] });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", manga: standalone });
    return result;
  }, [filteredAndSortedManga, seriesList]);

  // ── Novel memos ───────────────────────────────────────────────────────────
  const filteredAndSortedNovel = useMemo(() => {
    let result = novelList.filter((n) => {
      if (
        novelFilters.serializationStatus.size > 0 &&
        !novelFilters.serializationStatus.has(n.serialization_status || "")
      )
        return false;
      if (
        novelFilters.region.size > 0 &&
        !novelFilters.region.has(n.region || "")
      )
        return false;
      if (novelFilters.readingStatus.size > 0) {
        const rs = n.reading_status || "Might Read";
        let group = "Might Read";
        if (rs === "Plan to Read") group = "Planned";
        else if (["Active Reading", "Passive Reading", "Paused"].includes(rs))
          group = "Reading";
        else if (COMPLETED_STATUSES.includes(rs))
          group = "Completed";
        else if (["Temp Dropped", "Dropped", "Won't Read"].includes(rs))
          group = "Dropped";
        if (!novelFilters.readingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (novelSort === "my_rating")
        return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
      if (novelSort === "mal_rating") {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
        if (wA !== wB) return wB - wA;
      }
      if (novelSort === "release_date")
        return (
          releaseScore(a.release_date) - releaseScore(b.release_date)
        );
      if (novelSort === "end_date")
        return releaseScore(a.end_date) - releaseScore(b.end_date);
      return (a.novel_name_cn || a.novel_name_en || "").localeCompare(
        b.novel_name_cn || b.novel_name_en || "",
      );
    });
    return result;
  }, [novelList, novelFilters, novelSort]);

  const novelSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedNovel.forEach((n) => {
      if (n.series_id && sm[n.series_id]) {
        (grouped[n.series_id] = grouped[n.series_id] || []).push(n);
      } else standalone.push(n);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({ type: "series", series: s, novels: grouped[s.system_id] });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", novels: standalone });
    return result;
  }, [filteredAndSortedNovel, seriesList]);

  // ── Comic memos ───────────────────────────────────────────────────────────
  // Era is user-defined in system_options, so the filter row is built from
  // what the franchise actually holds rather than a hardcoded list.
  const comicEras = useMemo(
    () =>
      [...new Set(comicList.map((c) => c.era).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [comicList],
  );

  const filteredAndSortedComic = useMemo(() => {
    let result = comicList.filter((c) => {
      if (
        comicFilters.comicType.size > 0 &&
        !comicFilters.comicType.has(c.comic_type || "")
      )
        return false;
      if (comicFilters.era.size > 0 && !comicFilters.era.has(c.era || ""))
        return false;
      if (comicFilters.readingStatus.size > 0) {
        const rs = c.reading_status || "Might Read";
        let group = "Might Read";
        if (rs === "Plan to Read") group = "Planned";
        else if (["Active Reading", "Passive Reading", "Paused"].includes(rs))
          group = "Reading";
        else if (COMPLETED_STATUSES.includes(rs))
          group = "Completed";
        else if (["Temp Dropped", "Dropped", "Won't Read"].includes(rs))
          group = "Dropped";
        if (!comicFilters.readingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (comicSort === "my_rating")
        return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
      if (comicSort === "release_date") {
        const diff =
          releaseScore(a.release_date) - releaseScore(b.release_date);
        if (diff !== 0) return diff;
      }
      return (a.comic_name_en || a.comic_name_cn || "").localeCompare(
        b.comic_name_en || b.comic_name_cn || "",
      );
    });
    return result;
  }, [comicList, comicFilters, comicSort]);

  const comicSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedComic.forEach((c) => {
      if (c.series_id && sm[c.series_id]) {
        (grouped[c.series_id] = grouped[c.series_id] || []).push(c);
      } else standalone.push(c);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({ type: "series", series: s, comics: grouped[s.system_id] });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", comics: standalone });
    return result;
  }, [filteredAndSortedComic, seriesList]);

  // ── Movies memos ──────────────────────────────────────────────────────────
  const filteredAndSortedMovies = useMemo(() => {
    let result = movieList.filter((m) => {
      if (
        movFilters.airingStatus.size > 0 &&
        !movFilters.airingStatus.has(m.airing_status)
      )
        return false;
      if (movFilters.watchingStatus.size > 0) {
        const group = getWatchingGroup(m.watching_status || "Might Watch");
        if (!movFilters.watchingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (movSort === "release_date") {
        const diff = movieDateScore(a) - movieDateScore(b);
        if (diff !== 0) return diff;
      }
      if (movSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      if (movSort === "imdb_rating") {
        const wA =
          a.imdb_rating && a.imdb_rating !== "N/A"
            ? parseFloat(a.imdb_rating)
            : -1;
        const wB =
          b.imdb_rating && b.imdb_rating !== "N/A"
            ? parseFloat(b.imdb_rating)
            : -1;
        if (wA !== wB) return wB - wA;
      }
      return (a.movie_name_en || a.movie_name_cn || "").localeCompare(
        b.movie_name_en || b.movie_name_cn || "",
      );
    });
    return result;
  }, [movieList, movFilters, movSort]);

  const movieSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedMovies.forEach((m) => {
      if (m.series_id && sm[m.series_id]) {
        (grouped[m.series_id] = grouped[m.series_id] || []).push(m);
      } else standalone.push(m);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({
          type: "series",
          series: s,
          movies: grouped[s.system_id],
        });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", movies: standalone });
    return result;
  }, [filteredAndSortedMovies, seriesList]);

  // ── TV Shows memos ────────────────────────────────────────────────────────
  const filteredAndSortedTvShows = useMemo(() => {
    let result = tvShowList.filter((t) => {
      if (
        tvFilters.airingStatus.size > 0 &&
        !tvFilters.airingStatus.has(t.airing_status)
      )
        return false;
      if (tvFilters.watchingStatus.size > 0) {
        const group = getWatchingGroup(t.watching_status || "Might Watch");
        if (!tvFilters.watchingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (tvSort === "release_date") {
        const diff = tvDateScore(a) - tvDateScore(b);
        if (diff !== 0) return diff;
      }
      if (tvSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      if (tvSort === "imdb_rating") {
        const wA =
          a.imdb_rating && a.imdb_rating !== "N/A"
            ? parseFloat(a.imdb_rating)
            : -1;
        const wB =
          b.imdb_rating && b.imdb_rating !== "N/A"
            ? parseFloat(b.imdb_rating)
            : -1;
        if (wA !== wB) return wB - wA;
      }
      return (a.tv_name_en || a.tv_name_cn || "").localeCompare(
        b.tv_name_en || b.tv_name_cn || "",
      );
    });
    return result;
  }, [tvShowList, tvFilters, tvSort]);

  const tvShowSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedTvShows.forEach((t) => {
      if (t.series_id && sm[t.series_id]) {
        (grouped[t.series_id] = grouped[t.series_id] || []).push(t);
      } else standalone.push(t);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({ type: "series", series: s, shows: grouped[s.system_id] });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", shows: standalone });
    return result;
  }, [filteredAndSortedTvShows, seriesList]);

  // ── Cartoons memos ────────────────────────────────────────────────────────
  const cartoonAiringTypeOptions = useMemo(
    () =>
      [
        ...new Set(cartoonList.map((c) => c.airing_type).filter(Boolean)),
      ].sort(),
    [cartoonList],
  );

  const filteredAndSortedCartoons = useMemo(() => {
    let result = cartoonList.filter((c) => {
      if (
        cartoonFilters.airingStatus.size > 0 &&
        !cartoonFilters.airingStatus.has(c.airing_status)
      )
        return false;
      if (
        cartoonFilters.airingType.size > 0 &&
        !cartoonFilters.airingType.has(c.airing_type)
      )
        return false;
      if (cartoonFilters.watchingStatus.size > 0) {
        const group = getWatchingGroup(c.watching_status || "Might Watch");
        if (!cartoonFilters.watchingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (cartoonSort === "release_date") {
        const dA = a.release_date ? new Date(a.release_date).getTime() : 0;
        const dB = b.release_date ? new Date(b.release_date).getTime() : 0;
        if (dA !== dB) return dA - dB;
      }
      if (cartoonSort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      if (cartoonSort === "imdb_rating") {
        const wA =
          a.imdb_rating && a.imdb_rating !== "N/A"
            ? parseFloat(a.imdb_rating)
            : -1;
        const wB =
          b.imdb_rating && b.imdb_rating !== "N/A"
            ? parseFloat(b.imdb_rating)
            : -1;
        if (wA !== wB) return wB - wA;
      }
      return (
        a.cartoon_name_en ||
        a.cartoon_name_alt ||
        a.cartoon_name_cn ||
        ""
      ).localeCompare(
        b.cartoon_name_en || b.cartoon_name_alt || b.cartoon_name_cn || "",
        undefined,
        { numeric: true },
      );
    });
    return result;
  }, [cartoonList, cartoonFilters, cartoonSort]);

  const cartoonSeriesGroups = useMemo(() => {
    const sm = Object.fromEntries(seriesList.map((s) => [s.system_id, s]));
    const grouped = {};
    const standalone = [];
    filteredAndSortedCartoons.forEach((c) => {
      if (c.series_id && sm[c.series_id]) {
        (grouped[c.series_id] = grouped[c.series_id] || []).push(c);
      } else standalone.push(c);
    });
    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0)
        result.push({
          type: "series",
          series: s,
          cartoons: grouped[s.system_id],
        });
    });
    if (standalone.length > 0)
      result.push({ type: "standalone", cartoons: standalone });
    return result;
  }, [filteredAndSortedCartoons, seriesList]);

  // ── Completion ────────────────────────────────────────────────────────────
  const allWatchable = useMemo(
    () => [
      ...animeList,
      ...animeMovieList,
      ...movieList,
      ...tvShowList,
      ...cartoonList,
    ],
    [animeList, animeMovieList, movieList, tvShowList, cartoonList],
  );
  const totalEntries =
    allWatchable.length + mangaList.length + comicList.length;
  const completedCount =
    allWatchable.filter((e) =>
      COMPLETED_STATUSES.includes(e.watching_status),
    ).length +
    mangaList.filter((m) =>
      COMPLETED_STATUSES.includes(m.reading_status),
    ).length +
    comicList.filter((c) =>
      COMPLETED_STATUSES.includes(c.reading_status),
    ).length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  function getTabCount(tab) {
    const map = {
      Anime: animeList.length,
      "Anime Movies": animeMovieList.length,
      Manga: mangaList.length,
      Novel: novelList.length,
      Comic: comicList.length,
      Movies: movieList.length,
      "TV Shows": tvShowList.length,
      Cartoons: cartoonList.length,
    };
    return map[tab] ?? 0;
  }

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading) return <HubLoading label="Loading Franchise Hub..." />;

  if (error)
    return (
      <HubError
        title="Error Loading Franchise"
        message={error}
        backTo="/library/franchise"
        backLabel="Franchise Library"
      />
    );

  // Combined flat entry list, used only for hero cover resolution. Every entry
  // loaded here already belongs to this franchise, so the by-franchise map the
  // shared helper expects is a single bucket.
  const allEntries = [
    ...animeList,
    ...animeMovieList,
    ...movieList,
    ...tvShowList,
    ...cartoonList,
    ...mangaList,
    ...novelList,
  ];
  const coverUrl = getFranchiseCover(
    franchise,
    Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
    { [franchise.system_id]: allEntries },
  );

  const mainTitle =
    franchise.franchise_name_cn ||
    franchise.franchise_name_en ||
    franchise.franchise_name_alt ||
    franchise.franchise_name_roman ||
    franchise.franchise_name_jp ||
    "Unknown Franchise";

  const subTitles = [
    { label: "EN", value: franchise.franchise_name_en },
    { label: "JP", value: franchise.franchise_name_jp },
    { label: "Romaji", value: franchise.franchise_name_roman },
    { label: "Alt", value: franchise.franchise_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);

  // A franchise sits under its collection when it has one.
  const trail = [
    { to: "/library/franchise", label: "Franchise" },
    ...(parentCollection
      ? [
          {
            to: `/collection/${parentCollection.system_id}`,
            label: getDisplayName(parentCollection, "collection"),
          },
        ]
      : []),
  ];

  const eyebrow = [
    "Franchise",
    ...types,
    `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
    `${completionPct}% completed`,
  ].join("  ·  ");

  return (
    <HubShell>
      <Crumbs trail={trail} current={mainTitle} />

      {isAdmin && <AdminStrip editId={system_id} />}

      {/* Hero: cover with spine strip, then the identity block */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <HeroCover
            src={coverUrl}
            spine={`Franchise · ${franchise.franchise_type || "—"}`}
            id={franchise.system_id}
            rating={franchise.my_rating}
            done={completedCount}
            total={totalEntries}
            pct={completionPct}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {mainTitle}
            </h1>
            {subTitles.length > 0 && (
              <div className="space-y-0.5 mb-4">
                {subTitles.map(({ label, value }) => (
                  <p
                    key={label}
                    className="text-lg text-text-muted truncate flex items-baseline gap-2"
                  >
                    <Eyebrow className="shrink-0">{label}</Eyebrow>
                    {value}
                  </p>
                ))}
              </div>
            )}

            {/* Lineage: the collection above, the series within */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Collection</Eyebrow>
                {parentCollection ? (
                  <Link
                    to={`/collection/${parentCollection.system_id}`}
                    className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
                  >
                    {getDisplayName(parentCollection, "collection")}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <Eyebrow>Series</Eyebrow>
                <span className="text-text">{seriesList.length}</span>
              </div>
            </div>

            {(franchise.franchise_expectation ||
              plannedTypes.size > 0 ||
              rewatchMarked.size > 0) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {franchise.franchise_expectation && (
                  <Chip>Expectation · {franchise.franchise_expectation}</Chip>
                )}
                {Array.from(plannedTypes).map((mediaType) => {
                  const bucket = effectiveBucket(
                    franchise.size_group_derived,
                    franchise.size_group_manual,
                    mediaType,
                  );
                  const label = (SIZE_GROUPS[mediaType] || []).find(
                    (g) => g.key === bucket,
                  )?.label;
                  return (
                    <Chip key={mediaType}>
                      Plan next · {mediaType.replace("-", " ")}
                      {label ? ` (${label})` : ""}
                    </Chip>
                  );
                })}
                {Array.from(rewatchMarked).map((mediaType) => (
                  <Chip key={`rewatch-${mediaType}`}>
                    {kindLabel("rewatch", [mediaType])} ·{" "}
                    {mediaType.replace("-", " ")}
                  </Chip>
                ))}
              </div>
            )}
          </header>

          {isAdmin && (
            <Slip title="Curation">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Overall rating">
                  <select
                    value={rating}
                    onChange={(e) => {
                      setRating(e.target.value);
                      saveField("my_rating", e.target.value);
                    }}
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">Not rated</option>
                    {["S", "A+", "A", "B", "C", "D", "E", "F"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Expectation">
                  <select
                    value={expectation}
                    onChange={(e) => {
                      setExpectation(e.target.value);
                      saveField("franchise_expectation", e.target.value);
                    }}
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">None</option>
                    {["Highest", "High", "Medium", "Low"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Plan next" className="sm:col-span-2">
                  <SizeGroupControls
                    mediaTypes={sizeGroupMediaTypes}
                    planned={plannedTypes}
                    derived={franchise.size_group_derived}
                    manual={franchise.size_group_manual}
                    onTogglePlan={handleTogglePlan}
                    onOverride={handleOverride}
                  />
                </Field>
                {franchiseApplicableRewatchTypes.length > 0 && (
                  <Field
                    label={kindLabel("rewatch", franchiseApplicableRewatchTypes)}
                    className="sm:col-span-2"
                  >
                    <PlanKindToggles
                      kind="rewatch"
                      scope="franchise"
                      mediaTypes={franchiseMediaTypes}
                      marked={rewatchMarked}
                      onToggle={handleRewatchToggle}
                    />
                  </Field>
                )}
              </div>
            </Slip>
          )}

          {(isAdmin || franchise.remark) && (
            <Slip
              title="Remark"
              actions={
                remarkClipped && (
                  <Button
                    kind="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setShowRemark(true)}
                  >
                    Show all
                  </Button>
                )
              }
            >
              <textarea
                ref={remarkRef}
                value={remark}
                disabled={!isAdmin}
                onChange={(e) => setRemark(e.target.value)}
                onBlur={() => saveRemark()}
                rows={3}
                placeholder="Private overview notes, watch order guides or remarks for the whole franchise"
                className={`w-full border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-border bg-surface text-text" : "border-border bg-surface-2 text-text-muted cursor-default"}`}
              />
            </Slip>
          )}
        </div>
      </div>

      {/* Series list */}
      {seriesList.length > 0 && (
        <Slip
          title="Series"
          actions={
            <span className="font-mono text-[11px] text-text-faint">
              {seriesList.length}
            </span>
          }
        >
          <div className="flex flex-wrap gap-2">
            {seriesList.map((s) => {
              const name =
                s.series_name_cn ||
                s.series_name_en ||
                s.series_name_alt ||
                "Unknown Series";
              return (
                <Link
                  key={s.system_id}
                  to={`/series/${s.system_id}`}
                  className="border border-border-strong px-2.5 py-1 text-sm text-text hover:border-brand hover:text-brand transition"
                >
                  {name}
                </Link>
              );
            })}
          </div>
        </Slip>
      )}

      {/*
        Tab bar, in two labelled groups: "Media" picks which entries the list
        below shows, "Extras" opens material that belongs to the franchise as a
        whole. The Media group disappears for a franchise with no entries yet.
      */}
      <HubTabs
        groups={[
          { label: "Media", tabs: mediaTabs, counted: true },
          { label: "Extras", tabs: extraTabs },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={getTabCount}
      />

      {/* ── Anime tab content ─────────────────────────────────────────────── */}
      {activeTab === "Anime" &&
        animeList.length > 0 && (
          <Section
            title="Anime"
            subtitle="TV · ONA · Movie · OVA · Special"
            count={filteredAndSortedAnime.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={animeSort}
                onChange={(e) => setAnimeSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="title">Sort: title</option>
                <option value="release_date">Sort: release date</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="mal_rating">Sort: MAL rating</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["TV", "Movie", "ONA", "OVA", "Special"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setAnimeFilters, "airingType", v)
                  }
                  className={pillCls(animeFilters.airingType.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                ["Airing", "Airing"],
                ["Finished", "Finished Airing"],
                ["Not Aired", "Not Yet Aired"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() =>
                    toggleSetFilter(setAnimeFilters, "airingStatus", val)
                  }
                  className={pillCls(animeFilters.airingStatus.has(val))}
                >
                  {label}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                "Planned",
                "Watching",
                "Completed",
                "Dropped",
                "Might Watch",
              ].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setAnimeFilters, "watchingStatus", v)
                  }
                  className={pillCls(animeFilters.watchingStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={animeFilters.bahaOnly}
                  onChange={(e) =>
                    setAnimeFilters((p) => ({
                      ...p,
                      bahaOnly: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Baha only
              </label>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setAnimeGroupBySeries((v) => !v)}
                className={pillCls(animeGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedAnime.length === 0 ? (
              <FilterEmpty />
            ) : animeGroupBySeries ? (
              <div className="space-y-8">
                {animeSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? getDisplayName(group.series, "series") ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      <GroupRail label={label} count={group.anime.length} />
                      <div className={GRID_CLS}>
                        {group.anime.map((a) => (
                          <div
                            key={a.system_id}
                            className="flex flex-col gap-1"
                          >
                            {a.is_main_entry && (
                              <div className="flex justify-center">
                                <Chip>Main</Chip>
                              </div>
                            )}
                            <MediaCard
                              type="anime"
                              data={a}
                              onUpdated={handleAnimeUpdated}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedAnime.map((a) => (
                  <div key={a.system_id} className="flex flex-col gap-1">
                    {a.is_main_entry && (
                      <div className="flex justify-center">
                        <Chip>Main</Chip>
                      </div>
                    )}
                    <MediaCard type="anime" data={a} onUpdated={handleAnimeUpdated} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── Anime Movies tab content ──────────────────────────────────────── */}
      {activeTab === "Anime Movies" &&
        animeMovieList.length > 0 && (
          <Section
            title="Anime Movies"
            subtitle="Standalone theatrical films"
            count={sortedAnimeMovies.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={animeMovieSort}
                onChange={(e) => setAnimeMovieSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="release_date">Sort: release date</option>
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="mal_rating">Sort: MAL rating</option>
              </select>
            </div>

            <div className={GRID_CLS}>
              {sortedAnimeMovies.map((m) => (
                <MediaCard
                  key={m.system_id}
                  type="anime-movie"
                  data={m}
                  onUpdated={handleAnimeMovieUpdated}
                />
              ))}
            </div>
          </Section>
        )}

      {/* ── Manga tab content ─────────────────────────────────────────────── */}
      {activeTab === "Manga" &&
        mangaList.length > 0 && (
          <Section
            title="Manga"
            subtitle="Manga · Manhwa · Manhua"
            count={filteredAndSortedManga.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={mangaSort}
                onChange={(e) => setMangaSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="mal_rating">Sort: MAL rating</option>
                <option value="release_date">Sort: release date</option>
                <option value="end_date">Sort: end date</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["連載中", "完結", "腰斬", "停更"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setMangaFilters, "serializationStatus", v)
                  }
                  className={pillCls(mangaFilters.serializationStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
                (v) => (
                  <button
                    key={v}
                    onClick={() =>
                      toggleSetFilter(setMangaFilters, "readingStatus", v)
                    }
                    className={pillCls(mangaFilters.readingStatus.has(v))}
                  >
                    {v}
                  </button>
                ),
              )}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
                <button
                  key={v}
                  onClick={() => toggleSetFilter(setMangaFilters, "region", v)}
                  className={pillCls(mangaFilters.region.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setMangaGroupBySeries((v) => !v)}
                className={pillCls(mangaGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedManga.length === 0 ? (
              <FilterEmpty />
            ) : mangaGroupBySeries ? (
              <div className="space-y-8">
                {mangaSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? getDisplayName(group.series, "series") ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      <GroupRail label={label} count={group.manga.length} />
                      <div className={GRID_CLS}>
                        {group.manga.map((m) => (
                          <MediaCard
                            key={m.system_id}
                            type="manga"
                            data={m}
                            isAdmin={isAdmin}
                            onUpdated={handleMangaUpdated}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedManga.map((m) => (
                  <MediaCard
                    key={m.system_id}
                    type="manga"
                    data={m}
                    isAdmin={isAdmin}
                    onUpdated={handleMangaUpdated}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── Novel tab content ────────────────────────────────────────────── */}
      {activeTab === "Novel" &&
        novelList.length > 0 && (
          <Section
            title="Novel"
            subtitle="Light Novel · Web Novel · Novel"
            count={filteredAndSortedNovel.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={novelSort}
                onChange={(e) => setNovelSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="mal_rating">Sort: MAL rating</option>
                <option value="release_date">Sort: release date</option>
                <option value="end_date">Sort: end date</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["連載中", "完結", "腰斬", "停更"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setNovelFilters, "serializationStatus", v)
                  }
                  className={pillCls(novelFilters.serializationStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
                (v) => (
                  <button
                    key={v}
                    onClick={() =>
                      toggleSetFilter(setNovelFilters, "readingStatus", v)
                    }
                    className={pillCls(novelFilters.readingStatus.has(v))}
                  >
                    {v}
                  </button>
                ),
              )}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {["JP", "CN", "TW", "KR", "Western"].map((v) => (
                <button
                  key={v}
                  onClick={() => toggleSetFilter(setNovelFilters, "region", v)}
                  className={pillCls(novelFilters.region.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setNovelGroupBySeries((v) => !v)}
                className={pillCls(novelGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedNovel.length === 0 ? (
              <FilterEmpty />
            ) : novelGroupBySeries ? (
              <div className="space-y-8">
                {novelSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? getDisplayName(group.series, "series") ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      <GroupRail label={label} count={group.novels.length} />
                      <div className={GRID_CLS}>
                        {group.novels.map((n) => (
                          <MediaCard
                            key={n.system_id}
                            type="novel"
                            data={n}
                            onUpdated={handleNovelUpdated}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedNovel.map((n) => (
                  <MediaCard
                    key={n.system_id}
                    type="novel"
                    data={n}
                    onUpdated={handleNovelUpdated}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── Comic tab content ─────────────────────────────────────────────── */}
      {activeTab === "Comic" && comicList.length > 0 && (
        <Section
          title="Comic"
          subtitle="Runs, limited series &amp; one-shots"
          count={filteredAndSortedComic.length}
        >

          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <select
              value={comicSort}
              onChange={(e) => setComicSort(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="release_date">Sort: release date</option>
              <option value="title">Sort: title</option>
              <option value="my_rating">Sort: my rating</option>
            </select>

            <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

            {["Ongoing", "Limited", "One-Shot", "Annual"].map((v) => (
              <button
                key={v}
                onClick={() =>
                  toggleSetFilter(setComicFilters, "comicType", v)
                }
                className={pillCls(comicFilters.comicType.has(v))}
              >
                {v}
              </button>
            ))}

            <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

            {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setComicFilters, "readingStatus", v)
                  }
                  className={pillCls(comicFilters.readingStatus.has(v))}
                >
                  {v}
                </button>
              ),
            )}

            {comicEras.length > 0 && (
              <>
                <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>
                {comicEras.map((v) => (
                  <button
                    key={v}
                    onClick={() => toggleSetFilter(setComicFilters, "era", v)}
                    className={pillCls(comicFilters.era.has(v))}
                  >
                    {v}
                  </button>
                ))}
              </>
            )}

            <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

            <button
              onClick={() => setComicGroupBySeries((v) => !v)}
              className={pillCls(comicGroupBySeries)}
            >
              Group by series
            </button>
          </div>

          {filteredAndSortedComic.length === 0 ? (
            <FilterEmpty />
          ) : comicGroupBySeries ? (
            <div className="space-y-8">
              {comicSeriesGroups.map((group) => {
                const label =
                  group.type === "series"
                    ? getDisplayName(group.series, "series") || "Unknown Series"
                    : "Standalone";
                return (
                  <section
                    key={
                      group.type === "series"
                        ? group.series.system_id
                        : "standalone"
                    }
                  >
                    <GroupRail label={label} count={group.comics.length} />
                    <div className={GRID_CLS}>
                      {group.comics.map((c) => (
                        <MediaCard
                          key={c.system_id}
                          type="comic"
                          data={c}
                          onUpdated={handleComicUpdated}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className={GRID_CLS}>
              {filteredAndSortedComic.map((c) => (
                <MediaCard
                  key={c.system_id}
                  type="comic"
                  data={c}
                  onUpdated={handleComicUpdated}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Movies tab content ────────────────────────────────────────────── */}
      {activeTab === "Movies" &&
        movieList.length > 0 && (
          <Section
            title="Movies"
            subtitle="Live-action &amp; animated films"
            count={filteredAndSortedMovies.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={movSort}
                onChange={(e) => setMovSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="release_date">Sort: release date</option>
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="imdb_rating">Sort: IMDb rating</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                ["Finished", "Finished Airing"],
                ["Not Aired", "Not Yet Aired"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() =>
                    toggleSetFilter(setMovFilters, "airingStatus", val)
                  }
                  className={pillCls(movFilters.airingStatus.has(val))}
                >
                  {label}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                "Planned",
                "Watching",
                "Completed",
                "Dropped",
                "Might Watch",
              ].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setMovFilters, "watchingStatus", v)
                  }
                  className={pillCls(movFilters.watchingStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setMovGroupBySeries((v) => !v)}
                className={pillCls(movGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedMovies.length === 0 ? (
              <FilterEmpty />
            ) : movGroupBySeries ? (
              <div className="space-y-8">
                {movieSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? group.series.series_name_cn ||
                        group.series.series_name_en ||
                        group.series.series_name_alt ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      <GroupRail label={label} count={group.movies.length} />
                      <div className={GRID_CLS}>
                        {group.movies.map((m) => (
                          <MediaCard
                            key={m.system_id}
                            type="movie"
                            data={m}
                            onUpdated={handleMovieUpdated}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedMovies.map((m) => (
                  <MediaCard
                    key={m.system_id}
                    type="movie"
                    data={m}
                    onUpdated={handleMovieUpdated}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── TV Shows tab content ──────────────────────────────────────────── */}
      {activeTab === "TV Shows" &&
        tvShowList.length > 0 && (
          <Section
            title="TV Shows"
            subtitle="Live-action series"
            count={filteredAndSortedTvShows.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={tvSort}
                onChange={(e) => setTvSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="release_date">Sort: release date</option>
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="imdb_rating">Sort: IMDb rating</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                ["Airing", "Airing"],
                ["Finished", "Finished Airing"],
                ["Not Aired", "Not Yet Aired"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() =>
                    toggleSetFilter(setTvFilters, "airingStatus", val)
                  }
                  className={pillCls(tvFilters.airingStatus.has(val))}
                >
                  {label}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                "Planned",
                "Watching",
                "Completed",
                "Dropped",
                "Might Watch",
              ].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setTvFilters, "watchingStatus", v)
                  }
                  className={pillCls(tvFilters.watchingStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setTvGroupBySeries((v) => !v)}
                className={pillCls(tvGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedTvShows.length === 0 ? (
              <FilterEmpty />
            ) : tvGroupBySeries ? (
              <div className="space-y-8">
                {tvShowSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? group.series.series_name_cn ||
                        group.series.series_name_en ||
                        group.series.series_name_alt ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      {tvShowSeriesGroups.length > 1 && (
                        <GroupRail label={label} count={group.shows.length} />
                      )}
                      <div className={GRID_CLS}>
                        {group.shows.map((t) => (
                          <MediaCard
                            key={t.system_id}
                            type="tv-show"
                            data={t}
                            onUpdated={handleTvShowUpdated}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedTvShows.map((t) => (
                  <MediaCard
                    key={t.system_id}
                    type="tv-show"
                    data={t}
                    onUpdated={handleTvShowUpdated}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── Cartoons tab content ──────────────────────────────────────────── */}
      {activeTab === "Cartoons" &&
        cartoonList.length > 0 && (
          <Section
            title="Cartoons"
            subtitle="Cartoon entries"
            count={filteredAndSortedCartoons.length}
          >

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={cartoonSort}
                onChange={(e) => setCartoonSort(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="release_date">Sort: release date</option>
                <option value="title">Sort: title</option>
                <option value="my_rating">Sort: my rating</option>
                <option value="imdb_rating">Sort: IMDb rating</option>
              </select>

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {cartoonAiringTypeOptions.length > 0 && (
                <>
                  {cartoonAiringTypeOptions.map((v) => (
                    <button
                      key={v}
                      onClick={() =>
                        toggleSetFilter(setCartoonFilters, "airingType", v)
                      }
                      className={pillCls(cartoonFilters.airingType.has(v))}
                    >
                      {v}
                    </button>
                  ))}
                  <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>
                </>
              )}

              {[
                ["Finished", "Finished Airing"],
                ["Airing", "Airing"],
                ["Not Aired", "Not Yet Aired"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() =>
                    toggleSetFilter(setCartoonFilters, "airingStatus", val)
                  }
                  className={pillCls(cartoonFilters.airingStatus.has(val))}
                >
                  {label}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              {[
                "Planned",
                "Watching",
                "Completed",
                "Dropped",
                "Might Watch",
              ].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setCartoonFilters, "watchingStatus", v)
                  }
                  className={pillCls(cartoonFilters.watchingStatus.has(v))}
                >
                  {v}
                </button>
              ))}

              <span className="w-px h-4 bg-border-strong" aria-hidden="true"></span>

              <button
                onClick={() => setCartoonGroupBySeries((v) => !v)}
                className={pillCls(cartoonGroupBySeries)}
              >
                Group by series
              </button>
            </div>

            {filteredAndSortedCartoons.length === 0 ? (
              <FilterEmpty />
            ) : cartoonGroupBySeries ? (
              <div className="space-y-8">
                {cartoonSeriesGroups.map((group) => {
                  const label =
                    group.type === "series"
                      ? group.series.series_name_cn ||
                        group.series.series_name_en ||
                        group.series.series_name_alt ||
                        "Unknown Series"
                      : "Standalone";
                  return (
                    <section
                      key={
                        group.type === "series"
                          ? group.series.system_id
                          : "standalone"
                      }
                    >
                      <GroupRail label={label} count={group.cartoons.length} />
                      <div className={GRID_CLS}>
                        {group.cartoons.map((c) => (
                          <MediaCard
                            key={c.system_id}
                            type="cartoon"
                            data={c}
                            onUpdated={handleCartoonUpdated}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={GRID_CLS}>
                {filteredAndSortedCartoons.map((c) => (
                  <MediaCard
                    key={c.system_id}
                    type="cartoon"
                    data={c}
                    onUpdated={handleCartoonUpdated}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      {/* ── Watch Order tab content ──────────────────────────────────────── */}
      {activeTab === "Watch Order" && (
        <Section
          title="Watch Order"
          subtitle="Ordered viewing guide across every media type"
        >
          <WatchOrderSection franchiseId={system_id} />
        </Section>
      )}

      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <Section
          title="Relations"
          subtitle="How this franchise's entries connect - prequels, alternatives, side stories and adaptations"
        >
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. */}
          <RelationGraph readOnly scopeType="franchise" scopeId={system_id} />
        </Section>
      )}

      {/* ── Notes tab content ─────────────────────────────────────────────── */}
      {activeTab === "Notes" && (
        <Section
          title="Notes"
          subtitle="Structured notes belonging to the whole franchise"
        >
          {/* The hero remark editor above edits the same singleton note row, so
              hide the duplicate `remark` section wherever that editor renders. */}
          <FranchiseNotes
            franchise={franchise}
            isAdmin={isAdmin}
            hideSections={isAdmin || franchise.remark ? ["remark"] : []}
          />
        </Section>
      )}

      {/* No content at all */}
      {tabs.length === 0 && !loading && (
        <section className="border border-dashed border-border-strong px-4 py-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
            No entries
          </div>
          <p className="text-sm text-text-faint">
            Nothing is filed under this franchise yet. Assign entries to it from the Modify page.
          </p>
        </section>
      )}

      {showRemark && (
        <RemarkModal
          value={remark}
          isAdmin={isAdmin}
          onChange={setRemark}
          onClose={() => {
            saveRemark();
            setShowRemark(false);
          }}
        />
      )}
    </HubShell>
  );
}

