import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { cleanString } from "../utils/media";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "franchise", label: "Franchise" },
  { key: "series", label: "Series" },
  { key: "anime", label: "Anime" },
  { key: "anime-movie", label: "Anime Movie" },
  { key: "movie", label: "Movie" },
  { key: "tv-show", label: "TV Show" },
  { key: "cartoon", label: "Cartoon" },
  { key: "manga", label: "Manga" },
  { key: "novel", label: "Novel" },
  { key: "seasonal", label: "Seasonal" },
];

const TYPE_BADGE = {
  franchise: { label: "FRAN", cls: "bg-brand/10 text-brand" },
  series: { label: "SERIES", cls: "bg-purple-50 text-purple-600" },
  anime: { label: "ANIME", cls: "bg-gray-100 text-gray-500" },
  "anime-movie": { label: "A.MOVIE", cls: "bg-blue-50 text-blue-600" },
  movie: { label: "MOVIE", cls: "bg-amber-50 text-amber-600" },
  "tv-show": { label: "TV", cls: "bg-indigo-50 text-indigo-600" },
  cartoon: { label: "CARTOON", cls: "bg-orange-50 text-orange-600" },
  manga: { label: "MANGA", cls: "bg-rose-50 text-rose-600" },
  novel: { label: "NOVEL", cls: "bg-teal-50 text-teal-600" },
  seasonal: { label: "SEASON", cls: "bg-emerald-50 text-emerald-600" },
};

function DropdownMenu({ label, icon, items, labelClassName = "" }) {
  return (
    <div className="relative group py-2">
      <button
        className={`hover:bg-gray-50 hover:text-brand px-3 py-2 rounded-md text-sm font-bold transition flex items-center ${labelClassName || "text-gray-600"}`}
      >
        {icon && <i className={`${icon} mr-1.5`}></i>}
        {label}
        <i className="fas fa-chevron-down ml-1.5 text-[10px] text-gray-400 group-hover:text-brand transition-transform group-hover:rotate-180"></i>
      </button>
      <div className="absolute left-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden transform origin-top -translate-y-2 group-hover:translate-y-0 p-1.5 space-y-0.5">
          {items}
        </div>
      </div>
    </div>
  );
}

function NavLink({ to, icon, children }) {
  return (
    <Link
      to={to}
      className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-brand/5 hover:text-brand transition"
    >
      <i className={`${icon} w-6 text-center text-brand/70 mr-1`}></i>
      {children}
    </Link>
  );
}

function DevLink({ icon, children }) {
  return (
    <Link
      to="/under-development"
      className="flex items-center px-3 py-2 text-sm font-medium text-gray-400 rounded-md hover:bg-gray-50 transition"
      title="Under Development"
    >
      <i className={`${icon} w-6 text-center text-gray-300 mr-1`}></i>
      {children}
    </Link>
  );
}

export default function Nav() {
  const { isAdmin, refetchAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState("all");
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const searchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const dataCacheRef = useRef({
    loaded: false,
    franchises: [],
    anime: [],
    series: [],
    animeMovies: [],
    movies: [],
    tvShows: [],
    cartoons: [],
    mangas: [],
    novels: [],
    seasonal: [],
  });

  // Universal search — client-side filtering (case/punctuation/space insensitive)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        if (!dataCacheRef.current.loaded) {
          const [
            franRes,
            animeRes,
            seriesRes,
            cartoonRes,
            seasonalRes,
            amRes,
            mvRes,
            tvRes,
            mgRes,
            nvRes,
          ] = await Promise.all([
            fetch("/api/franchise/", { credentials: "include" }),
            fetch("/api/anime/", { credentials: "include" }),
            fetch("/api/series/", { credentials: "include" }),
            fetch("/api/cartoon/", { credentials: "include" }),
            fetch("/api/seasonal/", { credentials: "include" }),
            fetch("/api/anime-movie/", { credentials: "include" }),
            fetch("/api/movies/", { credentials: "include" }),
            fetch("/api/tv-shows/", { credentials: "include" }),
            fetch("/api/manga/", { credentials: "include" }),
            fetch("/api/novel/", { credentials: "include" }),
          ]);
          dataCacheRef.current.franchises = franRes.ok
            ? await franRes.json()
            : [];
          dataCacheRef.current.anime = animeRes.ok ? await animeRes.json() : [];
          dataCacheRef.current.series = seriesRes.ok
            ? await seriesRes.json()
            : [];
          dataCacheRef.current.cartoons = cartoonRes.ok
            ? await cartoonRes.json()
            : [];
          dataCacheRef.current.seasonal = seasonalRes.ok
            ? await seasonalRes.json()
            : [];
          dataCacheRef.current.animeMovies = amRes.ok ? await amRes.json() : [];
          dataCacheRef.current.movies = mvRes.ok ? await mvRes.json() : [];
          dataCacheRef.current.tvShows = tvRes.ok ? await tvRes.json() : [];
          dataCacheRef.current.mangas = mgRes.ok ? await mgRes.json() : [];
          dataCacheRef.current.novels = nvRes.ok ? await nvRes.json() : [];
          dataCacheRef.current.loaded = true;
        }
        const qClean = cleanString(searchQuery);
        const scope = searchScope;
        const results = [];

        if (scope === "all" || scope === "franchise") {
          const limit = scope === "all" ? 3 : 10;
          dataCacheRef.current.franchises
            .filter((f) =>
              [
                f.franchise_name_cn,
                f.franchise_name_en,
                f.franchise_name_roman,
                f.franchise_name_jp,
                f.franchise_name_alt,
              ].some((n) => cleanString(n).includes(qClean)),
            )
            .slice(0, limit)
            .forEach((f) => results.push({ type: "franchise", ...f }));
        }

        if (scope === "all" || scope === "series") {
          const limit = scope === "all" ? 3 : 10;
          dataCacheRef.current.series
            .filter((s) =>
              [s.series_name_cn, s.series_name_en, s.series_name_alt].some(
                (n) => cleanString(n).includes(qClean),
              ),
            )
            .slice(0, limit)
            .forEach((s) => results.push({ type: "series", ...s }));
        }

        if (scope === "all" || scope === "anime") {
          const limit = scope === "all" ? 10 : 10;
          dataCacheRef.current.anime
            .filter((a) =>
              [
                a.anime_name_cn,
                a.anime_name_en,
                a.anime_name_roman,
                a.anime_name_jp,
                a.anime_name_alt,
              ].some((n) => cleanString(n).includes(qClean)),
            )
            .slice(0, limit)
            .forEach((a) => results.push({ type: "anime", ...a }));
        }

        if (scope === "all" || scope === "anime-movie") {
          const limit = scope === "all" ? 3 : 10;
          dataCacheRef.current.animeMovies
            .filter((m) =>
              [
                m.anime_movie_name_cn,
                m.anime_movie_name_en,
                m.anime_movie_name_roman,
                m.anime_movie_name_jp,
                m.anime_movie_name_alt,
              ].some((n) => cleanString(n).includes(qClean)),
            )
            .slice(0, limit)
            .forEach((m) => results.push({ type: "anime-movie", ...m }));
        }

        if (scope === "all" || scope === "movie") {
          const limit = scope === "all" ? 3 : 10;
          dataCacheRef.current.movies
            .filter((m) =>
              [m.movie_name_cn, m.movie_name_en, m.movie_name_alt].some((n) =>
                cleanString(n).includes(qClean),
              ),
            )
            .slice(0, limit)
            .forEach((m) => results.push({ type: "movie", ...m }));
        }

        if (scope === "all" || scope === "tv-show") {
          const limit = scope === "all" ? 3 : 10;
          dataCacheRef.current.tvShows
            .filter((t) =>
              [t.tv_name_cn, t.tv_name_en, t.tv_name_alt].some((n) =>
                cleanString(n).includes(qClean),
              ),
            )
            .slice(0, limit)
            .forEach((t) => results.push({ type: "tv-show", ...t }));
        }

        if (scope === "all" || scope === "cartoon") {
          const limit = scope === "all" ? 5 : 10;
          dataCacheRef.current.cartoons
            .filter((c) =>
              [c.cartoon_name_cn, c.cartoon_name_en, c.cartoon_name_alt].some(
                (n) => cleanString(n).includes(qClean),
              ),
            )
            .slice(0, limit)
            .forEach((c) => results.push({ type: "cartoon", ...c }));
        }

        if (scope === "all" || scope === "manga") {
          const limit = scope === "all" ? 5 : 10;
          dataCacheRef.current.mangas
            .filter((m) =>
              [
                m.manga_name_cn,
                m.manga_name_en,
                m.manga_name_roman,
                m.manga_name_jp,
                m.manga_name_alt,
              ].some((n) => cleanString(n).includes(qClean)),
            )
            .slice(0, limit)
            .forEach((m) => results.push({ type: "manga", ...m }));
        }

        if (scope === "all" || scope === "novel") {
          const limit = scope === "all" ? 5 : 10;
          dataCacheRef.current.novels
            .filter((n) =>
              [
                n.novel_name_cn,
                n.novel_name_en,
                n.novel_name_roman,
                n.novel_name_jp,
                n.novel_name_alt,
              ].some((n) => cleanString(n).includes(qClean)),
            )
            .slice(0, limit)
            .forEach((n) => results.push({ type: "novel", ...n }));
        }

        if (scope === "all" || scope === "seasonal") {
          const limit = scope === "all" ? 10 : 10;
          dataCacheRef.current.seasonal
            .filter((s) => cleanString(s.seasonal).includes(qClean))
            .slice(0, limit)
            .forEach((s) => results.push({ type: "seasonal", ...s }));
        }

        // Exact match floats to top
        results.sort((a, b) => {
          const names = (item) => {
            if (item.type === "franchise")
              return [
                item.franchise_name_cn,
                item.franchise_name_en,
                item.franchise_name_roman,
              ];
            if (item.type === "series")
              return [
                item.series_name_cn,
                item.series_name_en,
                item.series_name_alt,
              ];
            if (item.type === "cartoon")
              return [
                item.cartoon_name_cn,
                item.cartoon_name_en,
                item.cartoon_name_alt,
              ];
            if (item.type === "manga")
              return [
                item.manga_name_cn,
                item.manga_name_en,
                item.manga_name_roman,
              ];
            if (item.type === "novel")
              return [
                item.novel_name_cn,
                item.novel_name_en,
                item.novel_name_roman,
              ];
            if (item.type === "anime-movie")
              return [
                item.anime_movie_name_cn,
                item.anime_movie_name_en,
                item.anime_movie_name_roman,
              ];
            if (item.type === "movie")
              return [
                item.movie_name_cn,
                item.movie_name_en,
                item.movie_name_alt,
              ];
            if (item.type === "tv-show")
              return [item.tv_name_cn, item.tv_name_en, item.tv_name_alt];
            if (item.type === "seasonal") return [item.seasonal];
            return [
              item.anime_name_cn,
              item.anime_name_en,
              item.anime_name_roman,
            ];
          };
          const aExact = names(a).some((n) => n && cleanString(n) === qClean);
          const bExact = names(b).some((n) => n && cleanString(n) === qClean);
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });

        setSearchResults(results.slice(0, 10));
        setShowResults(true);
      } catch {
        // ignore search errors
      }
    }, 250);
  }, [searchQuery, searchScope]);

  // Close search on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
        setShowScopeMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearchKey(e) {
    if (e.key === "Enter" && searchQuery.trim()) {
      clearTimeout(searchDebounceRef.current);
      const q = searchQuery.trim();
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      const params = new URLSearchParams({ q });
      if (searchScope !== "all") params.set("scope", searchScope);
      navigate(`/search?${params.toString()}`);
    }
  }

  function getDisplayName(item) {
    if (item.type === "franchise")
      return (
        item.franchise_name_cn ||
        item.franchise_name_en ||
        item.franchise_name_roman ||
        item.franchise_name_jp ||
        "—"
      );
    if (item.type === "series")
      return (
        item.series_name_cn ||
        item.series_name_en ||
        item.series_name_alt ||
        "—"
      );
    if (item.type === "cartoon")
      return (
        item.cartoon_name_cn ||
        item.cartoon_name_en ||
        item.cartoon_name_alt ||
        "—"
      );
    if (item.type === "manga")
      return (
        item.manga_name_cn ||
        item.manga_name_en ||
        item.manga_name_roman ||
        item.manga_name_jp ||
        "—"
      );
    if (item.type === "novel")
      return (
        item.novel_name_cn ||
        item.novel_name_en ||
        item.novel_name_roman ||
        item.novel_name_jp ||
        "—"
      );
    if (item.type === "anime-movie")
      return (
        item.anime_movie_name_cn ||
        item.anime_movie_name_en ||
        item.anime_movie_name_roman ||
        item.anime_movie_name_jp ||
        "—"
      );
    if (item.type === "movie")
      return (
        item.movie_name_cn || item.movie_name_en || item.movie_name_alt || "—"
      );
    if (item.type === "tv-show")
      return item.tv_name_cn || item.tv_name_en || item.tv_name_alt || "—";
    if (item.type === "seasonal") return item.seasonal || "—";
    return (
      item.anime_name_cn ||
      item.anime_name_en ||
      item.anime_name_roman ||
      item.anime_name_jp ||
      "—"
    );
  }

  function handleResultClick(item) {
    setShowResults(false);
    setSearchQuery("");
    if (item.type === "franchise") navigate(`/franchise/${item.system_id}`);
    else if (item.type === "series")
      navigate(`/franchise/${item.franchise_id}`);
    else if (item.type === "cartoon") navigate(`/cartoon/${item.system_id}`);
    else if (item.type === "manga") navigate(`/manga/${item.system_id}`);
    else if (item.type === "novel") navigate(`/novel/${item.system_id}`);
    else if (item.type === "anime-movie")
      navigate(`/anime-movie/${item.system_id}`);
    else if (item.type === "movie") navigate(`/movie/${item.system_id}`);
    else if (item.type === "tv-show") navigate(`/tv-show/${item.system_id}`);
    else if (item.type === "seasonal")
      navigate(`/seasonal/${encodeURIComponent(item.seasonal)}`);
    else navigate(`/anime/${item.system_id}`);
  }

  async function handleBackup() {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const res = await fetch("/api/data-control/backup", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        showToast("success", "Backup completed successfully");
      } else {
        showToast("error", "Backup failed");
      }
    } catch {
      showToast("error", "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refetchAuth();
    navigate(location.pathname + location.search, { replace: true });
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo & Primary Links */}
          <div className="flex items-center flex-1 min-w-0">
            <Link to="/" className="flex items-center group shrink-0">
              <i className="fas fa-layer-group text-brand text-2xl mr-2 group-hover:scale-110 transition-transform"></i>
              <span className="font-black text-xl tracking-tight text-gray-900 group-hover:text-brand transition-colors">
                CG1618
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex ml-6 xl:ml-8 space-x-1 xl:space-x-2">
              {/* ACG */}
              <DropdownMenu
                label="ACG"
                items={
                  <>
                    <NavLink to="/library/anime" icon="fas fa-tv">
                      Anime
                    </NavLink>
                    <NavLink to="/library/anime-movie" icon="fas fa-film">
                      Anime Movie
                    </NavLink>
                    <NavLink to="/library/manga" icon="fas fa-book">Manga Library</NavLink>
                    <NavLink to="/library/novel" icon="fas fa-book-open">Novel Library</NavLink>
                    <DevLink icon="fas fa-microphone">Seiyuu</DevLink>
                  </>
                }
              />

              {/* Library */}
              <DropdownMenu
                label="Reality"
                items={
                  <>
                    <NavLink to="/library/franchise" icon="fas fa-layer-group">
                      Franchise
                    </NavLink>
                    <NavLink to="/library/tv-show" icon="fas fa-video">
                      TV Show
                    </NavLink>
                    <NavLink to="/library/movie" icon="fas fa-ticket-alt">
                      Movie
                    </NavLink>
                    <NavLink to="/library/cartoon" icon="fas fa-laugh-squint">
                      Cartoon
                    </NavLink>
                  </>
                }
              />

              {/* More */}
              <DropdownMenu
                label="More"
                items={
                  <>
                    <NavLink to="/statistics" icon="fas fa-chart-bar">
                      Statistics
                    </NavLink>
                    <NavLink to="/future-releases" icon="fas fa-calendar-plus">
                      Future Release
                    </NavLink>
                    <NavLink to="/seasonal" icon="fas fa-leaf">
                      Seasonal
                    </NavLink>
                  </>
                }
              />

              {/* Admin */}
              {isAdmin && (
                <DropdownMenu
                  label="Admin"
                  icon="fas fa-shield-alt"
                  labelClassName="text-brand hover:bg-brand/5"
                  items={
                    <>
                      <NavLink to="/system" icon="fas fa-cog">
                        Control Center
                      </NavLink>
                      <Link
                        to="/data-history"
                        className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-violet-50 hover:text-violet-600 transition"
                      >
                        <i className="fas fa-history w-6 text-center text-violet-400 mr-1"></i>
                        Data History
                      </Link>
                      <Link
                        to="/review-queue"
                        className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <i className="fas fa-tasks w-6 text-center text-rose-400 mr-1"></i>
                        Review Queue
                      </Link>
                      <div className="border-t border-gray-50 my-1"></div>
                      <Link
                        to="/add"
                        className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-emerald-50 hover:text-emerald-600 transition"
                      >
                        <i className="fas fa-plus-circle w-6 text-center text-emerald-400 mr-1"></i>
                        Add Entry
                      </Link>
                      <Link
                        to="/modify"
                        className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-600 transition"
                      >
                        <i className="fas fa-edit w-6 text-center text-blue-400 mr-1"></i>
                        Modify Entry
                      </Link>
                      <Link
                        to="/delete"
                        className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <i className="fas fa-trash-alt w-6 text-center text-red-400 mr-1"></i>
                        Delete Entry
                      </Link>
                    </>
                  }
                />
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-3 ml-4 shrink-0">
            {/* Universal Search */}
            <div
              ref={searchRef}
              className="relative hidden md:flex items-center w-56 lg:w-80 xl:w-96 bg-gray-100 border border-transparent rounded-full focus-within:bg-white focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent transition shadow-inner"
            >
              {/* Scope selector */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowScopeMenu((s) => !s)}
                  className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 text-xs font-bold text-gray-500 hover:text-brand transition whitespace-nowrap"
                >
                  {SCOPES.find((s) => s.key === searchScope)?.label}
                  <i
                    className={`fas fa-chevron-down text-[8px] transition-transform ${showScopeMenu ? "rotate-180" : ""}`}
                  ></i>
                </button>
                {showScopeMenu && (
                  <div className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden min-w-[120px]">
                    {SCOPES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          setSearchScope(s.key);
                          setShowScopeMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm font-bold transition ${searchScope === s.key ? "text-brand bg-brand/5" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-3.5 bg-gray-300 shrink-0 mx-0.5"></div>

              {/* Search icon */}
              <i className="fas fa-search pl-2 pr-1 text-gray-400 text-sm pointer-events-none shrink-0"></i>

              {/* Input */}
              <input
                type="text"
                placeholder={
                  searchScope === "all"
                    ? "Quick search..."
                    : `Search ${SCOPES.find((s) => s.key === searchScope)?.label}...`
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKey}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                className="flex-1 min-w-0 bg-transparent pr-4 py-1.5 text-sm font-medium focus:outline-none"
                autoComplete="off"
              />

              {/* Results dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-[80vh] overflow-y-auto z-50">
                  {searchResults.map((item, i) => {
                    const badge = TYPE_BADGE[item.type];
                    const secondary =
                      item.type === "franchise"
                        ? item.franchise_type
                        : item.type === "anime"
                          ? item.airing_type
                          : item.type === "series"
                            ? null
                            : null;
                    return (
                      <button
                        key={i}
                        onClick={() => handleResultClick(item)}
                        className="w-full text-left flex items-center px-4 py-2.5 hover:bg-gray-50 transition border-b border-gray-50 last:border-0"
                      >
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 shrink-0 ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {getDisplayName(item)}
                          </div>
                          {secondary && (
                            <div className="text-[10px] text-gray-400 truncate">
                              {secondary}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Auth */}
            {isAdmin ? (
              <>
                <div
                  className="hidden sm:flex items-center bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-100 shadow-sm"
                  title="Logged in as Admin"
                >
                  <i className="fas fa-user-check mr-1.5"></i> Admin
                </div>
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="hidden md:flex bg-brand hover:bg-brand-hover text-white px-3 py-1.5 rounded-lg text-sm font-bold transition shadow-sm items-center disabled:opacity-50"
                >
                  <i
                    className={`fas fa-sync-alt mr-1.5 ${backingUp ? "animate-spin" : ""}`}
                  ></i>{" "}
                  Backup
                </button>
                <button
                  onClick={handleLogout}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg text-sm font-bold transition"
                  title="Logout"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </>
            ) : (
              <Link
                to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center"
              >
                <i className="fas fa-sign-in-alt mr-1.5"></i> Login
              </Link>
            )}

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="lg:hidden text-gray-500 hover:text-brand focus:outline-none p-2 rounded-md hover:bg-gray-50"
            >
              <i className="fas fa-bars text-xl"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-inner overflow-y-auto max-h-[80vh]">
          <div className="px-4 pt-2 pb-4 space-y-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 hover:text-brand transition"
            >
              <i className="fas fa-home w-6 text-center text-gray-400 mr-2"></i>
              Dashboard
            </Link>

            {/* ACG accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span>
                  <i className="fas fa-tv w-6 text-center text-brand/70 mr-2"></i>
                  ACG
                </span>
                <span className="transition-transform group-open:rotate-180">
                  <i className="fas fa-chevron-down text-xs text-gray-400"></i>
                </span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link
                  to="/library/anime"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Anime Library
                </Link>
                <Link
                  to="/library/anime-movie"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Anime Movie Library
                </Link>
                <Link
                  to="/library/manga"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Manga Library
                </Link>
                <Link
                  to="/library/novel"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Novel Library
                </Link>
                <Link
                  to="/under-development"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600"
                >
                  Seiyuu (Dev)
                </Link>
              </div>
            </details>

            {/* Reality accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span>
                  <i className="fas fa-layer-group w-6 text-center text-gray-400 mr-2"></i>
                  Reality
                </span>
                <span className="transition-transform group-open:rotate-180">
                  <i className="fas fa-chevron-down text-xs text-gray-400"></i>
                </span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link
                  to="/library/franchise"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Franchise Library
                </Link>
                <Link
                  to="/library/tv-show"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  TV Show Library
                </Link>
                <Link
                  to="/library/movie"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Movie Library
                </Link>
                <Link
                  to="/library/cartoon"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Cartoon Library
                </Link>
              </div>
            </details>

            {/* More accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span>
                  <i className="fas fa-compass w-6 text-center text-gray-400 mr-2"></i>
                  More
                </span>
                <span className="transition-transform group-open:rotate-180">
                  <i className="fas fa-chevron-down text-xs text-gray-400"></i>
                </span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link
                  to="/statistics"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Statistics
                </Link>
                <Link
                  to="/future-releases"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Future Release
                </Link>
                <Link
                  to="/seasonal"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                >
                  Seasonal
                </Link>
              </div>
            </details>

            {isAdmin && (
              <>
                <div className="border-t border-gray-100 my-2"></div>
                <details className="group">
                  <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-brand hover:bg-brand/5 cursor-pointer transition">
                    <span>
                      <i className="fas fa-shield-alt w-6 text-center mr-2"></i>
                      Admin Tools
                    </span>
                    <span className="transition-transform group-open:rotate-180">
                      <i className="fas fa-chevron-down text-xs"></i>
                    </span>
                  </summary>
                  <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-brand/20 ml-6 mb-2">
                    <Link
                      to="/system"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                    >
                      Control Center
                    </Link>
                    <Link
                      to="/data-history"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-violet-600"
                    >
                      Data History
                    </Link>
                    <Link
                      to="/review-queue"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-rose-600"
                    >
                      Review Queue
                    </Link>
                    <Link
                      to="/add"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-emerald-600"
                    >
                      Add Entry
                    </Link>
                    <Link
                      to="/modify"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-blue-600"
                    >
                      Modify Entry
                    </Link>
                    <Link
                      to="/delete"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm font-bold text-gray-700 hover:text-red-600"
                    >
                      Delete Entry
                    </Link>
                  </div>
                </details>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleBackup();
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-md text-base font-bold text-gray-700 hover:bg-gray-50 transition flex items-center"
                >
                  <i className="fas fa-sync-alt w-6 text-center mr-2 text-gray-400"></i>
                  Backup Data
                </button>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-md text-base font-bold text-red-600 hover:bg-red-50 transition flex items-center"
                >
                  <i className="fas fa-sign-out-alt w-6 text-center mr-2"></i>
                  Logout
                </button>
              </>
            )}
            {!isAdmin && (
              <>
                <div className="border-t border-gray-100 my-2"></div>
                <Link
                  to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 transition flex items-center"
                >
                  <i className="fas fa-sign-in-alt w-6 text-center mr-2 text-gray-400"></i>
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
