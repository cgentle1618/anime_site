// Frontend: page component file for SeriesPage.
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
  getRatingWeight,
  COMPLETED_STATUSES,
} from "../../utils/media";
import { getSeriesCover } from "../../lib/covers";
import TierBadge from "../../components/layout/TierBadge";
import SectionHeader from "../../components/hub/SectionHeader";
import HubTabBar from "../../components/hub/HubTabBar";
import {
  HubLoading,
  HubError,
  FilterEmpty,
} from "../../components/hub/HubStates";
import {
  HubShell,
  HubBreadcrumb,
  HubCard,
  HubHeroRow,
  HubCover,
  GRID_CLS,
} from "../../components/hub/HubChrome";
import MediaCard from "../../components/cards/MediaCard";
import RemarkModal from "../../components/modals/RemarkModal";
import WatchOrderSection from "../../components/tracker/WatchOrderSection";
import SeriesNotes from "./SeriesNotes";
import RelationGraph from "../../components/relations/RelationGraph";
import PlanKindToggles, { kindLabel } from "../../components/plan/PlanKindToggles";

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

// TW first, matching the stored release priority for movies.
function movieDateScore(m) {
  return releaseScore(m.release_date_tw || m.release_date_usa);
}

function tvDateScore(t) {
  return releaseScore(t.release_date);
}

// An entry list is only usable as an array. Anything else - an error body, an
// unexpected shape - collapses to empty so the page still renders.
async function asList(res) {
  if (!res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}


export default function SeriesPage() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  // ── data ──────────────────────────────────────────────────────────────────
  const [series, setSeries] = useState(null);
  const [parentFranchise, setParentFranchise] = useState(null);
  const [animeList, setAnimeList] = useState([]);
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
  const [rewatchMarked, setRewatchMarked] = useState(new Set());
  const [remark, setRemark] = useState("");
  const [showRemark, setShowRemark] = useState(false);
  const [remarkClipped, setRemarkClipped] = useState(false);
  const remarkRef = useRef(null);

  // ── tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(null);

  // ── Anime tab state ───────────────────────────────────────────────────────
  const [animeSort, setAnimeSort] = useState("release_date");
  const [animeFilters, setAnimeFilters] = useState({
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  });

  // ── Manga tab state ───────────────────────────────────────────────────────
  const [mangaSort, setMangaSort] = useState("title");
  const [mangaFilters, setMangaFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
    region: new Set(),
  });

  // ── Novel tab state ───────────────────────────────────────────────────────
  const [novelSort, setNovelSort] = useState("title");
  const [novelFilters, setNovelFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
    region: new Set(),
  });

  // ── Comic tab state ───────────────────────────────────────────────────────
  // No `region`: comic has no such column - every run is Western by definition.
  const [comicSort, setComicSort] = useState("title");
  const [comicFilters, setComicFilters] = useState({
    serializationStatus: new Set(),
    readingStatus: new Set(),
  });

  // ── Movies tab state ──────────────────────────────────────────────────────
  const [movSort, setMovSort] = useState("release_date");
  const [movFilters, setMovFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
  });

  // ── TV Shows tab state ────────────────────────────────────────────────────
  const [tvSort, setTvSort] = useState("release_date");
  const [tvFilters, setTvFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
  });

  // ── Cartoons tab state ────────────────────────────────────────────────────
  const [cartoonSort, setCartoonSort] = useState("release_date");
  const [cartoonFilters, setCartoonFilters] = useState({
    airingStatus: new Set(),
    airingType: new Set(),
    watchingStatus: new Set(),
  });

  // ── fetch ─────────────────────────────────────────────────────────────────
  // Seven entry lists, not eight: anime_movies has no series_id column, so an
  // anime movie can only ever be reached through its franchise.
  useEffect(() => {
    async function load() {
      try {
        const [sRes, aRes, mRes, tvRes, cRes, mgRes, nvRes, cmRes, pnRes] =
          await Promise.all([
          fetch(endpoints.resource("series").detail(system_id), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("anime").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("movie").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("tv-show").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("cartoon").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("manga").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("novel").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("comic").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch("/api/plan-next/?scope=series&kind=rewatch", {
            credentials: "include",
          }),
        ]);
        if (!sRes.ok) throw new Error("Series not found");
        // The series itself is load-bearing, so a missing one still throws to
        // the error card. A failing entry list is not: parsing FastAPI's error
        // body into a list state would hand the filter memos a non-array and
        // blank the whole page, so each list degrades to empty instead.
        const s = await sRes.json();
        const [a, m, tv, c, mg, nv, cm] = await Promise.all(
          [aRes, mRes, tvRes, cRes, mgRes, nvRes, cmRes].map(asList),
        );
        const pn = pnRes.ok ? await pnRes.json() : [];
        setSeries(s);
        setAnimeList(a);
        setMovieList(m);
        setTvShowList(tv);
        setCartoonList(c);
        setMangaList(mg);
        setNovelList(nv);
        setComicList(cm);
        setRewatchMarked(
          new Set(
            pn
              .filter((row) => row.target_id === s.system_id)
              .map((row) => row.media_type),
          ),
        );
        setRating(s.my_rating || "");
        setExpectation(s.series_expectation || "");
        setRemark(s.remark || "");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [system_id]);

  // Media types this series actually holds entries for. PlanKindToggles
  // further filters this down to what rewatch allows at series scope (movie,
  // tv-show, novel, comic - anime and cartoon rewatch at franchise scope only).
  const seriesMediaTypes = useMemo(() => {
    const list = [];
    if (animeList.length) list.push("anime");
    if (movieList.length) list.push("movie");
    if (tvShowList.length) list.push("tv-show");
    if (cartoonList.length) list.push("cartoon");
    if (mangaList.length) list.push("manga");
    if (novelList.length) list.push("novel");
    if (comicList.length) list.push("comic");
    return list;
  }, [
    animeList,
    movieList,
    tvShowList,
    cartoonList,
    mangaList,
    novelList,
    comicList,
  ]);

  // Only this group filters which media entries are listed. It is shown under
  // its own label, apart from the extras below. A series carries no type, so
  // a tab appears purely because its list holds something.
  const mediaTabs = useMemo(() => {
    if (!series) return [];
    return [
      animeList.length && "Anime",
      mangaList.length && "Manga",
      novelList.length && "Novel",
      comicList.length && "Comic",
      movieList.length && "Movies",
      tvShowList.length && "TV Shows",
      cartoonList.length && "Cartoons",
    ].filter(Boolean);
  }, [
    series,
    animeList,
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
    () => (series ? ["Watch Order", "Relations", "Notes"] : []),
    [series],
  );

  const tabs = useMemo(() => [...mediaTabs, ...extraTabs], [mediaTabs, extraTabs]);

  useEffect(() => {
    if (tabs.length > 0 && activeTab === null) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // ── callbacks ─────────────────────────────────────────────────────────────
  const handleAnimeUpdated = useCallback(
    (u) =>
      setAnimeList((p) => p.map((a) => (a.system_id === u.system_id ? u : a))),
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
      setCartoonList((p) => p.map((c) => (c.system_id === u.system_id ? u : c))),
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

  // Optional parent tier: resolve the franchise name for the breadcrumb.
  useEffect(() => {
    const fid = series?.franchise_id;
    if (!fid) {
      setParentFranchise(null);
      return;
    }
    let cancelled = false;
    fetch(endpoints.resource("franchise").detail(fid), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (!cancelled) setParentFranchise(f);
      })
      .catch(() => {
        if (!cancelled) setParentFranchise(null);
      });
    return () => {
      cancelled = true;
    };
  }, [series?.franchise_id]);

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

  async function handleRewatchToggle(mediaType, next) {
    if (!series) return;
    try {
      if (next) {
        const res = await fetch("/api/plan-next/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            media_type: mediaType,
            scope: "series",
            kind: "rewatch",
            target_id: series.system_id,
          }),
        });
        if (!res.ok && res.status !== 409) return;
      } else {
        const params = new URLSearchParams({
          scope: "series",
          media_type: mediaType,
          kind: "rewatch",
          target_id: series.system_id,
        });
        const res = await fetch(`/api/plan-next/target?${params}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) return;
      }
      setRewatchMarked((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(mediaType);
        else nextSet.delete(mediaType);
        return nextSet;
      });
    } catch {
      showToast("error", "Network error.");
    }
  }

  async function saveField(field, value) {
    try {
      const res = await fetch(endpoints.resource("series").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
        credentials: "include",
      });
      if (res.ok) {
        setSeries(await res.json());
        showToast("success", "Series updated successfully");
      } else {
        showToast("error", "Save failed");
      }
    } catch {
      showToast("error", "Network error. Reverting.");
    }
  }

  // Shared by the inline box and the full-view modal, which edit one draft.
  function saveRemark() {
    if (isAdmin && remark !== (series?.remark || ""))
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
        const group = getWatchingGroup(a.watching_status || "Might Watch");
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

  // ── Comic memos ───────────────────────────────────────────────────────────
  // Mirrors the manga memo minus the two things comic has no column for: no
  // region filter, and no MAL rating to sort on. The title sort leads with the
  // English name because comic's display name falls back EN -> CN -> Alt.
  const filteredAndSortedComic = useMemo(() => {
    let result = comicList.filter((c) => {
      if (
        comicFilters.serializationStatus.size > 0 &&
        !comicFilters.serializationStatus.has(c.serialization_status || "")
      )
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
      if (comicSort === "release_date")
        return (
          releaseScore(a.release_date) - releaseScore(b.release_date)
        );
      if (comicSort === "end_date")
        return releaseScore(a.end_date) - releaseScore(b.end_date);
      return (a.comic_name_en || a.comic_name_cn || "").localeCompare(
        b.comic_name_en || b.comic_name_cn || "",
      );
    });
    return result;
  }, [comicList, comicFilters, comicSort]);

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

  // ── Completion ────────────────────────────────────────────────────────────
  const allWatchable = useMemo(
    () => [...animeList, ...movieList, ...tvShowList, ...cartoonList],
    [animeList, movieList, tvShowList, cartoonList],
  );
  // Every tab the strip can show feeds these totals: the watchable types by
  // watching_status, and manga and novels alike by reading_status.
  const totalEntries =
    allWatchable.length + mangaList.length + novelList.length;
  const completedCount =
    allWatchable.filter((e) =>
      COMPLETED_STATUSES.includes(e.watching_status),
    ).length +
    mangaList.filter((m) =>
      COMPLETED_STATUSES.includes(m.reading_status),
    ).length +
    novelList.filter((n) =>
      COMPLETED_STATUSES.includes(n.reading_status),
    ).length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  function getTabCount(tab) {
    const map = {
      Anime: animeList.length,
      Manga: mangaList.length,
      Novel: novelList.length,
      Movies: movieList.length,
      "TV Shows": tvShowList.length,
      Cartoons: cartoonList.length,
    };
    return map[tab] ?? 0;
  }

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading) return <HubLoading label="Loading Series Hub..." />;

  if (error)
    return (
      <HubError
        title="Error Loading Series"
        message={error}
        backTo="/library/franchise"
        backLabel="Franchise Library"
      />
    );

  // Combined flat entry list, used only for hero cover resolution: search
  // every loaded tab's entries for cover_entry_id, then fall back to the
  // newest one with a cover image.
  const allEntries = [
    ...animeList,
    ...movieList,
    ...tvShowList,
    ...cartoonList,
    ...mangaList,
    ...novelList,
  ];
  const coverUrl = getSeriesCover(series, allEntries);

  const mainTitle =
    series.series_name_cn ||
    series.series_name_en ||
    series.series_name_alt ||
    series.series_name_roman ||
    series.series_name_jp ||
    "Unknown Series";

  const subTitles = [
    { label: "EN", value: series.series_name_en },
    { label: "JP", value: series.series_name_jp },
    { label: "Romaji", value: series.series_name_roman },
    { label: "Alt", value: series.series_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);

  // A series always hangs off a franchise, so the franchise library is the
  // root of the trail even when the parent has not loaded.
  const trail = [
    {
      to: "/library/franchise",
      icon: "fa-sitemap",
      label: "Franchise Library",
    },
    ...(parentFranchise
      ? [
          {
            to: `/franchise/${parentFranchise.system_id}`,
            icon: "fa-sitemap",
            label: getDisplayName(parentFranchise, "franchise"),
          },
        ]
      : []),
  ];

  return (
    <HubShell>
      <HubBreadcrumb
        trail={trail}
        current={mainTitle}
        editId={system_id}
        isAdmin={isAdmin}
      />

      {/* Hero */}
      <HubCard tier="series">
        <HubHeroRow>
          <HubCover src={coverUrl} />

          {/* Left: title + info */}
          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <TierBadge tier="series" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 leading-tight mb-1">
              {mainTitle}
            </h1>
            {subTitles.map(({ label, value }) => (
              <p
                key={label}
                className="text-sm text-gray-500 font-medium truncate flex items-center gap-1.5"
              >
                <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {label}
                </span>
                {value}
              </p>
            ))}

            <div className="flex flex-wrap gap-2 mt-4">
              {series.my_rating && (
                <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-star mr-1"></i>
                  {series.my_rating}
                </span>
              )}
              {series.series_expectation && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  {series.series_expectation} Expectation
                </span>
              )}
              {/*
                A link rather than a status pill: the franchise is somewhere to
                go, so it carries an indigo tone for navigation instead of a
                flat badge colour.
              */}
              {parentFranchise && (
                <Link
                  to={`/franchise/${parentFranchise.system_id}`}
                  className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full text-xs font-bold hover:bg-indigo-100 transition"
                >
                  <i className="fas fa-sitemap mr-1"></i>
                  {getDisplayName(parentFranchise, "franchise")}
                </Link>
              )}
              {Array.from(rewatchMarked).map((mediaType) => (
                <span
                  key={`rewatch-${mediaType}`}
                  className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold capitalize"
                >
                  <i className="fas fa-redo mr-1"></i>
                  {kindLabel("rewatch", [mediaType])}: {mediaType.replace("-", " ")}
                </span>
              ))}
              <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                {totalEntries} Total Entries
              </span>
            </div>
          </div>

          {/* Right: completion + admin controls */}
          <div className="lg:w-52 shrink-0 space-y-3">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                Completion
              </div>
              <div className="text-2xl font-black text-gray-900 mb-1">
                {completionPct}%
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                <div
                  className="bg-brand h-2 rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 font-medium">
                {completedCount} / {totalEntries} completed
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Overall Rating
                  </label>
                  <select
                    value={rating}
                    onChange={(e) => {
                      setRating(e.target.value);
                      saveField("my_rating", e.target.value);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— Not Rated —</option>
                    {["S", "A+", "A", "B", "C", "D", "E", "F"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Expectation
                  </label>
                  <select
                    value={expectation}
                    onChange={(e) => {
                      setExpectation(e.target.value);
                      saveField("series_expectation", e.target.value);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— None —</option>
                    {["Highest", "High", "Medium", "Low"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    {kindLabel("rewatch", seriesMediaTypes)}
                  </label>
                  <PlanKindToggles
                    kind="rewatch"
                    scope="series"
                    mediaTypes={seriesMediaTypes}
                    marked={rewatchMarked}
                    onToggle={handleRewatchToggle}
                  />
                </div>
              </div>
            )}
          </div>
        </HubHeroRow>

        {/* Remark */}
        {(isAdmin || series.remark) && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Remark
              </label>
              {remarkClipped && (
                <button
                  type="button"
                  onClick={() => setShowRemark(true)}
                  className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                >
                  <i className="fas fa-up-right-and-down-left-from-center text-[10px]"></i>
                  Show all
                </button>
              )}
            </div>
            <textarea
              ref={remarkRef}
              value={remark}
              disabled={!isAdmin}
              onChange={(e) => setRemark(e.target.value)}
              onBlur={() => saveRemark()}
              rows={3}
              placeholder="Add private overview notes, watch order guides, or specific remarks for the entire series..."
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 text-gray-500 cursor-default"}`}
            />
          </div>
        )}
      </HubCard>

      {/*
        Tab bar, in two labelled groups: "Media" picks which entries the list
        below shows, "Extras" opens material that belongs to the series as a
        whole. The Media group disappears for a series with no entries yet.
      */}
      <HubTabBar
        groups={[
          { label: "Media", tabs: mediaTabs, counted: true },
          { label: "Extras", tabs: extraTabs },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={getTabCount}
      />

      {/* ── Anime tab content ─────────────────────────────────────────────── */}
      {activeTab === "Anime" && animeList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-tv"
            title="Anime"
            subtitle="TV · ONA · Movie · OVA · Special"
            count={filteredAndSortedAnime.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={animeSort}
              onChange={(e) => setAnimeSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="title">Sort: Title</option>
              <option value="release_date">Sort: Release Date</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="mal_rating">Sort: MAL Rating</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {["TV", "Movie", "ONA", "OVA", "Special"].map((v) => (
              <button
                key={v}
                onClick={() => toggleSetFilter(setAnimeFilters, "airingType", v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${animeFilters.airingType.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

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
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${animeFilters.airingStatus.has(val) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Watching", "Completed", "Dropped", "Might Watch"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setAnimeFilters, "watchingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${animeFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}

            <div className="w-px h-5 bg-gray-200"></div>

            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
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
              Baha Only
            </label>
          </div>

          {filteredAndSortedAnime.length === 0 ? (
            <FilterEmpty />
          ) : (
            <div className={GRID_CLS}>
              {filteredAndSortedAnime.map((a) => (
                <div key={a.system_id} className="flex flex-col gap-1">
                  {a.is_main_entry && (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[9px] font-bold bg-brand/10 text-brand border border-brand/30 rounded px-1 leading-tight uppercase tracking-wide">
                        main
                      </span>
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
          )}
        </div>
      )}

      {/* ── Manga tab content ─────────────────────────────────────────────── */}
      {activeTab === "Manga" && mangaList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-book"
            title="Manga"
            subtitle="Manga · Manhwa · Manhua"
            count={filteredAndSortedManga.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={mangaSort}
              onChange={(e) => setMangaSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="mal_rating">Sort: MAL Rating</option>
              <option value="release_date">Sort: Release Date</option>
              <option value="end_date">Sort: End Date</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {["連載中", "完結", "腰斬", "停更"].map((v) => (
              <button
                key={v}
                onClick={() =>
                  toggleSetFilter(setMangaFilters, "serializationStatus", v)
                }
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${mangaFilters.serializationStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setMangaFilters, "readingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${mangaFilters.readingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}

            <div className="w-px h-5 bg-gray-200"></div>

            {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
              <button
                key={v}
                onClick={() => toggleSetFilter(setMangaFilters, "region", v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${mangaFilters.region.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {filteredAndSortedManga.length === 0 ? (
            <FilterEmpty />
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
        </div>
      )}

      {/* ── Novel tab content ────────────────────────────────────────────── */}
      {activeTab === "Novel" && novelList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-book-open"
            title="Novel"
            subtitle="Light Novel · Web Novel · Novel"
            count={filteredAndSortedNovel.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={novelSort}
              onChange={(e) => setNovelSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="mal_rating">Sort: MAL Rating</option>
              <option value="release_date">Sort: Release Date</option>
              <option value="end_date">Sort: End Date</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {["連載中", "完結", "腰斬", "停更"].map((v) => (
              <button
                key={v}
                onClick={() =>
                  toggleSetFilter(setNovelFilters, "serializationStatus", v)
                }
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${novelFilters.serializationStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setNovelFilters, "readingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${novelFilters.readingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}

            <div className="w-px h-5 bg-gray-200"></div>

            {["JP", "CN", "TW", "KR", "Western"].map((v) => (
              <button
                key={v}
                onClick={() => toggleSetFilter(setNovelFilters, "region", v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${novelFilters.region.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {filteredAndSortedNovel.length === 0 ? (
            <FilterEmpty />
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
        </div>
      )}

      {/* ── Comic tab content ─────────────────────────────────────────────── */}
      {activeTab === "Comic" && comicList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-book-bookmark"
            title="Comic"
            subtitle="Western comic runs"
            count={filteredAndSortedComic.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={comicSort}
              onChange={(e) => setComicSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="release_date">Sort: Release Date</option>
              <option value="end_date">Sort: End Date</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {["連載中", "完結", "腰斬", "停更"].map((v) => (
              <button
                key={v}
                onClick={() =>
                  toggleSetFilter(setComicFilters, "serializationStatus", v)
                }
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${comicFilters.serializationStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Reading", "Completed", "Dropped", "Might Read"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setComicFilters, "readingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${comicFilters.readingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}
          </div>

          {filteredAndSortedComic.length === 0 ? (
            <FilterEmpty />
          ) : (
            <div className={GRID_CLS}>
              {filteredAndSortedComic.map((c) => (
                <MediaCard
                  key={c.system_id}
                  type="comic"
                  data={c}
                  isAdmin={isAdmin}
                  onUpdated={handleComicUpdated}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Movies tab content ────────────────────────────────────────────── */}
      {activeTab === "Movies" && movieList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-film"
            title="Movies"
            subtitle="Live-action &amp; animated films"
            count={filteredAndSortedMovies.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={movSort}
              onChange={(e) => setMovSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="release_date">Sort: Release Date</option>
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="imdb_rating">Sort: IMDb Rating</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {[
              ["Finished", "Finished Airing"],
              ["Not Aired", "Not Yet Aired"],
            ].map(([label, val]) => (
              <button
                key={val}
                onClick={() =>
                  toggleSetFilter(setMovFilters, "airingStatus", val)
                }
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${movFilters.airingStatus.has(val) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Watching", "Completed", "Dropped", "Might Watch"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setMovFilters, "watchingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${movFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}
          </div>

          {filteredAndSortedMovies.length === 0 ? (
            <FilterEmpty />
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
        </div>
      )}

      {/* ── TV Shows tab content ──────────────────────────────────────────── */}
      {activeTab === "TV Shows" && tvShowList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-video"
            title="TV Shows"
            subtitle="Live-action series"
            count={filteredAndSortedTvShows.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={tvSort}
              onChange={(e) => setTvSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="release_date">Sort: Release Date</option>
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="imdb_rating">Sort: IMDb Rating</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

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
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${tvFilters.airingStatus.has(val) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Watching", "Completed", "Dropped", "Might Watch"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setTvFilters, "watchingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${tvFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}
          </div>

          {filteredAndSortedTvShows.length === 0 ? (
            <FilterEmpty />
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
        </div>
      )}

      {/* ── Cartoons tab content ──────────────────────────────────────────── */}
      {activeTab === "Cartoons" && cartoonList.length > 0 && (
        <div>
          <SectionHeader
            icon="fa-tv"
            title="Cartoons"
            subtitle="Cartoon entries"
            count={filteredAndSortedCartoons.length}
          />

          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <select
              value={cartoonSort}
              onChange={(e) => setCartoonSort(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              <option value="release_date">Sort: Release Date</option>
              <option value="title">Sort: Title</option>
              <option value="my_rating">Sort: My Rating</option>
              <option value="imdb_rating">Sort: IMDb Rating</option>
            </select>

            <div className="w-px h-5 bg-gray-200"></div>

            {cartoonAiringTypeOptions.length > 0 && (
              <>
                {cartoonAiringTypeOptions.map((v) => (
                  <button
                    key={v}
                    onClick={() =>
                      toggleSetFilter(setCartoonFilters, "airingType", v)
                    }
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${cartoonFilters.airingType.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                  >
                    {v}
                  </button>
                ))}
                <div className="w-px h-5 bg-gray-200"></div>
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
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${cartoonFilters.airingStatus.has(val) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200"></div>

            {["Planned", "Watching", "Completed", "Dropped", "Might Watch"].map(
              (v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setCartoonFilters, "watchingStatus", v)
                  }
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${cartoonFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ),
            )}
          </div>

          {filteredAndSortedCartoons.length === 0 ? (
            <FilterEmpty />
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
        </div>
      )}

      {/* ── Watch Order tab content ──────────────────────────────────────── */}
      {activeTab === "Watch Order" && (
        <div>
          <SectionHeader
            icon="fa-list-ol"
            title="Watch Order"
            subtitle="Ordered viewing guide across every media type"
          />
          <WatchOrderSection seriesId={system_id} />
        </div>
      )}

      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <div>
          <SectionHeader
            icon="fa-diagram-project"
            title="Relations"
            subtitle="How this series' entries connect - prequels, alternatives, side stories and adaptations"
          />
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. */}
          <RelationGraph readOnly scopeType="series" scopeId={system_id} />
        </div>
      )}

      {/* ── Notes tab content ─────────────────────────────────────────────── */}
      {activeTab === "Notes" && (
        <div>
          <SectionHeader
            icon="fa-sticky-note"
            title="Notes"
            subtitle="Structured notes belonging to the whole series"
          />
          {/* The hero remark editor above edits the same singleton note row, so
              hide the duplicate `remark` section wherever that editor renders. */}
          <SeriesNotes
            series={series}
            isAdmin={isAdmin}
            hideSections={isAdmin || series.remark ? ["remark"] : []}
          />
        </div>
      )}

      {/* No entries at all. Keyed off the media tabs, not every tab: Watch
          Order and Notes are always offered, so `tabs` is never empty. */}
      {mediaTabs.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <i className="fas fa-box-open text-3xl mb-3"></i>
          <p className="font-medium">No entries found for this series.</p>
        </div>
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
