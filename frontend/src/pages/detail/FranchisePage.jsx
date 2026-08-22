// Frontend: page component file for FranchisePage.
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  getSortName,
  isBaha,
  getRatingWeight,
  parseTypes,
} from "../../utils/media";
import MediaCard from "../../components/cards/MediaCard";
import SeriesModal from "../../components/modals/SeriesModal";

const WATCHING_STATUS_GROUPS = {
  Planned: ["Plan to Watch", "Watch When Airs"],
  Watching: ["Active Watching", "Passive Watching", "Paused"],
  Completed: ["Completed"],
  Dropped: ["Temp Dropped", "Dropped", "Won't Watch"],
  "Might Watch": ["Might Watch"],
};

function getWatchingGroup(status) {
  for (const [group, statuses] of Object.entries(WATCHING_STATUS_GROUPS)) {
    if (statuses.includes(status)) return group;
  }
  return "Might Watch";
}

const MONTH_MAP = {
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

function animeDateScore(a) {
  return (
    (parseInt(a.release_year) || 0) * 100 +
    (MONTH_MAP[(a.release_month || "").toUpperCase()] || 0)
  );
}

function animeMovieDateScore(m) {
  const raw = m.release_date_jp || m.release_date_tw || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return (
    (parseInt(parts[0]) || 0) * 10000 +
    (parseInt(parts[1]) || 0) * 100 +
    (parseInt(parts[2]) || 0)
  );
}

function movieDateScore(m) {
  const raw = m.release_date_usa || m.release_date_tw || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return (
    (parseInt(parts[0]) || 0) * 10000 +
    (parseInt(parts[1]) || 0) * 100 +
    (parseInt(parts[2]) || 0)
  );
}

function tvDateScore(t) {
  const raw = t.release_date || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return (
    (parseInt(parts[0]) || 0) * 10000 +
    (parseInt(parts[1]) || 0) * 100 +
    (parseInt(parts[2]) || 0)
  );
}

const GRID_CLS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

function SectionHeader({ icon, title, subtitle, count }) {
  return (
    <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
      <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
        <i className={`fas ${icon} text-brand`}></i>
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-gray-400 font-medium mt-0.5">{subtitle}</p>
        )}
      </div>
      <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
        {count} entries
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-400">
      <i className="fas fa-ghost text-3xl mb-3"></i>
      <p className="font-medium">No entries match the current filters.</p>
    </div>
  );
}

export default function FranchisePage() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── admin editable ─────────────────────────────────────────────────────────
  const [rating, setRating] = useState("");
  const [expectation, setExpectation] = useState("");
  const [watchNextGroup, setWatchNextGroup] = useState("");
  const [toRewatch, setToRewatch] = useState(false);
  const [remark, setRemark] = useState("");

  // ── tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(null);

  // ── series modal ──────────────────────────────────────────────────────────
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);

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
    async function load() {
      try {
        const [fRes, sRes, aRes, amRes, mRes, tvRes, cRes, mgRes, nvRes] =
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
          ]);
        if (!fRes.ok) throw new Error("Franchise not found");
        const [f, s, a, am, m, tv, c, mg, nv] = await Promise.all([
          fRes.json(),
          sRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
        ]);
        setFranchise(f);
        setSeriesList(s);
        setAnimeList(a);
        setAnimeMovieList(am);
        setMovieList(m);
        setTvShowList(tv);
        setCartoonList(c);
        setMangaList(mg);
        setNovelList(nv);
        setRating(f.my_rating || "");
        setExpectation(f.franchise_expectation || "");
        setWatchNextGroup(f.watch_next_group || "");
        setToRewatch(f.to_rewatch || false);
        setRemark(f.remark || "");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
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

  const tabs = useMemo(() => {
    if (!franchise) return [];
    return [
      hasACG && animeList.length && "Anime",
      (hasACG || hasAnimeMovie) && animeMovieList.length && "Anime Movies",
      hasACGFull && mangaList.length && "Manga",
      hasNovel && novelList.length && "Novel",
      hasMovie && movieList.length && "Movies",
      hasTV && tvShowList.length && "TV Shows",
      hasCartoon && cartoonList.length && "Cartoons",
    ].filter(Boolean);
  }, [
    franchise,
    hasACG,
    hasACGFull,
    hasNovel,
    hasAnimeMovie,
    hasMovie,
    hasTV,
    hasCartoon,
    animeList,
    animeMovieList,
    mangaList,
    novelList,
    movieList,
    tvShowList,
    cartoonList,
  ]);

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
        else if (ws === "Completed") group = "Completed";
        else if (["Temp Dropped", "Dropped", "Won't Watch"].includes(ws))
          group = "Dropped";
        if (!animeFilters.watchingStatus.has(group)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      if (animeSort === "watch_order")
        return (a.watch_order ?? 999999) - (b.watch_order ?? 999999);
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
        else if (rs === "Completed") group = "Completed";
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
      if (mangaSort === "release_year")
        return (
          (parseInt(a.release_year) || 0) - (parseInt(b.release_year) || 0)
        );
      if (mangaSort === "end_year")
        return (parseInt(a.end_year) || 0) - (parseInt(b.end_year) || 0);
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
        else if (rs === "Completed") group = "Completed";
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
      if (novelSort === "release_year")
        return (
          (parseInt(a.release_year) || 0) - (parseInt(b.release_year) || 0)
        );
      if (novelSort === "end_year")
        return (parseInt(a.end_year) || 0) - (parseInt(b.end_year) || 0);
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
  const totalEntries = allWatchable.length + mangaList.length;
  const completedCount =
    allWatchable.filter((e) => e.watching_status === "Completed").length +
    mangaList.filter((m) => m.reading_status === "Completed").length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  function getTabCount(tab) {
    const map = {
      Anime: animeList.length,
      "Anime Movies": animeMovieList.length,
      Manga: mangaList.length,
      Novel: novelList.length,
      Movies: movieList.length,
      "TV Shows": tvShowList.length,
      Cartoons: cartoonList.length,
    };
    return map[tab] ?? 0;
  }

  // ── loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading Franchise Hub...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Franchise</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
        <Link to="/library/franchise" className="hover:text-brand font-medium">
          <i className="fas fa-sitemap mr-1"></i>Franchise Library
        </Link>
        <span>/</span>
        {parentCollection && (
          <>
            <Link
              to={`/collection/${parentCollection.system_id}`}
              className="hover:text-brand font-medium"
            >
              <i className="fas fa-boxes-stacked mr-1"></i>
              {getDisplayName(parentCollection, "collection")}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="font-bold text-gray-800 truncate">{mainTitle}</span>
      </nav>

      {/* Admin toolbar */}
      {isAdmin && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
          <span className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <i className="fas fa-shield-alt"></i> Admin Tools
          </span>
          <button
            onClick={() => navigate(`/modify?id=${system_id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-50 transition shadow-sm"
          >
            <i className="fas fa-pencil-alt"></i> Quick Edit
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          {/* Left: title + info */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-2">
              <i className="fas fa-sitemap mr-1"></i>
              {franchise.franchise_type || "Franchise"}
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
              {franchise.my_rating && (
                <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-star mr-1"></i>
                  {franchise.my_rating}
                </span>
              )}
              {franchise.franchise_expectation && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  {franchise.franchise_expectation} Expectation
                </span>
              )}
              {hasACG && franchise.watch_next_group && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-list-ol mr-1"></i>
                  Watch Next:{" "}
                  {
                    { "12ep": "12 EP", "24ep": "24 EP", "30ep_plus": "30+ EP" }[
                      franchise.watch_next_group
                    ]
                  }
                </span>
              )}
              {hasACG && franchise.to_rewatch && (
                <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-redo mr-1"></i>To Rewatch
                </span>
              )}
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
                      saveField("franchise_expectation", e.target.value);
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
                {hasACG && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                        Watch Next Group
                      </label>
                      <select
                        value={watchNextGroup}
                        onChange={(e) => {
                          setWatchNextGroup(e.target.value);
                          saveField("watch_next_group", e.target.value);
                        }}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                      >
                        <option value="">— Not in Watch List —</option>
                        <option value="12ep">12 EP</option>
                        <option value="24ep">24 EP</option>
                        <option value="30ep_plus">30+ EP</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                        To Rewatch
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toRewatch}
                          onChange={(e) => {
                            setToRewatch(e.target.checked);
                            saveField("to_rewatch", e.target.checked);
                          }}
                          className="w-4 h-4 rounded accent-brand"
                        />
                        <span className="text-xs font-medium text-gray-700">
                          Mark for rewatch
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Series list */}
      {seriesList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <i className="fas fa-layer-group text-brand/60"></i> Series
          </div>
          <div className="flex flex-wrap gap-2">
            {seriesList.map((s) => {
              const name =
                s.series_name_cn ||
                s.series_name_en ||
                s.series_name_alt ||
                "Unknown Series";
              return (
                <button
                  key={s.system_id}
                  onClick={() => {
                    setSelectedSeries(s);
                    setShowSeriesModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-sm font-bold transition cursor-pointer"
                >
                  <i className="fas fa-layer-group text-purple-400 text-xs"></i>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <i className="fas fa-sticky-note text-brand/60"></i> Notes & Overview
        </div>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => saveField("remark", remark)}
          disabled={!isAdmin}
          rows={3}
          placeholder="Add private overview notes, watch order guides, or specific remarks for the entire franchise..."
          className={`w-full border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 text-gray-500 cursor-default"}`}
        />
      </div>

      {/* Tab bar (only when multiple tabs) */}
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              <span className="ml-1.5 text-xs font-bold bg-gray-100 px-1.5 py-0.5 rounded-full">
                {getTabCount(tab)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Anime tab content ─────────────────────────────────────────────── */}
      {(activeTab === "Anime" || (tabs.length === 1 && tabs[0] === "Anime")) &&
        animeList.length > 0 && (
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
                <option value="watch_order">Sort: Watch Order</option>
                <option value="title">Sort: Title</option>
                <option value="release_date">Sort: Release Date</option>
                <option value="my_rating">Sort: My Rating</option>
                <option value="mal_rating">Sort: MAL Rating</option>
              </select>

              <div className="w-px h-5 bg-gray-200"></div>

              {["TV", "Movie", "ONA", "OVA", "Special"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    toggleSetFilter(setAnimeFilters, "airingType", v)
                  }
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
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${animeFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}

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

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setAnimeGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${animeGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedAnime.length === 0 ? (
              <EmptyState />
            ) : animeGroupBySeries ? (
              <div className="space-y-10">
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
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                          <i
                            className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-film"} text-brand/70`}
                          ></i>
                          {label}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.anime.length}
                        </span>
                        <div className="flex-1 border-t border-gray-100"></div>
                      </div>
                      <div className={GRID_CLS}>
                        {group.anime.map((a) => (
                          <div
                            key={a.system_id}
                            className="flex flex-col gap-1"
                          >
                            {animeSort === "watch_order" &&
                              a.watch_order != null && (
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-[10px] font-black text-brand/70 uppercase tracking-widest">
                                    #{a.watch_order}
                                  </span>
                                  {a.is_main_entry && (
                                    <span className="text-[9px] font-bold bg-brand/10 text-brand border border-brand/30 rounded px-1 leading-tight uppercase tracking-wide">
                                      main
                                    </span>
                                  )}
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
                    {animeSort === "watch_order" && a.watch_order != null && (
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[10px] font-black text-brand/70 uppercase tracking-widest">
                          #{a.watch_order}
                        </span>
                        {a.is_main_entry && (
                          <span className="text-[9px] font-bold bg-brand/10 text-brand border border-brand/30 rounded px-1 leading-tight uppercase tracking-wide">
                            main
                          </span>
                        )}
                      </div>
                    )}
                    <MediaCard type="anime" data={a} onUpdated={handleAnimeUpdated} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* ── Anime Movies tab content ──────────────────────────────────────── */}
      {(activeTab === "Anime Movies" ||
        (tabs.length === 1 && tabs[0] === "Anime Movies")) &&
        animeMovieList.length > 0 && (
          <div>
            <SectionHeader
              icon="fa-film"
              title="Anime Movies"
              subtitle="Standalone theatrical films"
              count={sortedAnimeMovies.length}
            />

            <div className="flex flex-wrap gap-2 mb-6 items-center">
              <select
                value={animeMovieSort}
                onChange={(e) => setAnimeMovieSort(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
              >
                <option value="release_date">Sort: Release Date</option>
                <option value="title">Sort: Title</option>
                <option value="my_rating">Sort: My Rating</option>
                <option value="mal_rating">Sort: MAL Rating</option>
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
          </div>
        )}

      {/* ── Manga tab content ─────────────────────────────────────────────── */}
      {(activeTab === "Manga" || (tabs.length === 1 && tabs[0] === "Manga")) &&
        mangaList.length > 0 && (
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
                <option value="release_year">Sort: Release Year</option>
                <option value="end_year">Sort: End Year</option>
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

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setMangaGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${mangaGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedManga.length === 0 ? (
              <EmptyState />
            ) : mangaGroupBySeries ? (
              <div className="space-y-10">
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
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                          <i
                            className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-book"} text-brand/70`}
                          ></i>
                          {label}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.manga.length}
                        </span>
                        <div className="flex-1 border-t border-gray-100"></div>
                      </div>
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
          </div>
        )}

      {/* ── Novel tab content ────────────────────────────────────────────── */}
      {(activeTab === "Novel" || (tabs.length === 1 && tabs[0] === "Novel")) &&
        novelList.length > 0 && (
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
                <option value="release_year">Sort: Release Year</option>
                <option value="end_year">Sort: End Year</option>
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

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setNovelGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${novelGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedNovel.length === 0 ? (
              <EmptyState />
            ) : novelGroupBySeries ? (
              <div className="space-y-10">
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
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                          <i
                            className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-book-open"} text-brand/70`}
                          ></i>
                          {label}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.novels.length}
                        </span>
                        <div className="flex-1 border-t border-gray-100"></div>
                      </div>
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
          </div>
        )}

      {/* ── Movies tab content ────────────────────────────────────────────── */}
      {(activeTab === "Movies" ||
        (tabs.length === 1 && tabs[0] === "Movies")) &&
        movieList.length > 0 && (
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
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${movFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setMovGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${movGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedMovies.length === 0 ? (
              <EmptyState />
            ) : movGroupBySeries ? (
              <div className="space-y-10">
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
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                          <i
                            className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-film"} text-brand/70`}
                          ></i>
                          {label}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.movies.length}
                        </span>
                        <div className="flex-1 border-t border-gray-100"></div>
                      </div>
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
          </div>
        )}

      {/* ── TV Shows tab content ──────────────────────────────────────────── */}
      {(activeTab === "TV Shows" ||
        (tabs.length === 1 && tabs[0] === "TV Shows")) &&
        tvShowList.length > 0 && (
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
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${tvFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setTvGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${tvGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedTvShows.length === 0 ? (
              <EmptyState />
            ) : tvGroupBySeries ? (
              <div className="space-y-10">
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
                        <div className="flex items-center gap-3 mb-4">
                          <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                            <i
                              className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-video"} text-brand/70`}
                            ></i>
                            {label}
                          </h3>
                          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {group.shows.length}
                          </span>
                          <div className="flex-1 border-t border-gray-100"></div>
                        </div>
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
          </div>
        )}

      {/* ── Cartoons tab content ──────────────────────────────────────────── */}
      {(activeTab === "Cartoons" ||
        (tabs.length === 1 && tabs[0] === "Cartoons")) &&
        cartoonList.length > 0 && (
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
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${cartoonFilters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}

              <div className="w-px h-5 bg-gray-200"></div>

              <button
                onClick={() => setCartoonGroupBySeries((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${cartoonGroupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                <i className="fas fa-layer-group mr-1"></i>Group by Series
              </button>
            </div>

            {filteredAndSortedCartoons.length === 0 ? (
              <EmptyState />
            ) : cartoonGroupBySeries ? (
              <div className="space-y-10">
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
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                          <i
                            className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-tv"} text-brand/70`}
                          ></i>
                          {label}
                        </h3>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.cartoons.length}
                        </span>
                        <div className="flex-1 border-t border-gray-100"></div>
                      </div>
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
          </div>
        )}

      {/* No content at all */}
      {tabs.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <i className="fas fa-box-open text-3xl mb-3"></i>
          <p className="font-medium">No entries found for this franchise.</p>
        </div>
      )}

      {/* Series Modal */}
      {showSeriesModal && selectedSeries && (
        <SeriesModal
          series={selectedSeries}
          isAdmin={isAdmin}
          onClose={() => {
            setShowSeriesModal(false);
            setSelectedSeries(null);
          }}
        />
      )}
    </div>
  );
}

