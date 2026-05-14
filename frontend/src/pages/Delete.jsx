import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";

const TABS = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "franchise",
  "series",
  "options",
];

function getClean(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function getDisplayTitle(item, type) {
  if (type === "anime")
    return (
      item.anime_name_cn ||
      item.anime_name_en ||
      item.anime_name_roman ||
      item.anime_name_jp ||
      "Unknown"
    );
  if (type === "anime-movie")
    return (
      item.anime_movie_name_cn ||
      item.anime_movie_name_en ||
      item.anime_movie_name_roman ||
      item.anime_movie_name_jp ||
      "Unknown"
    );
  if (type === "movie")
    return (
      item.movie_name_cn ||
      item.movie_name_en ||
      item.movie_name_alt ||
      "Unknown"
    );
  if (type === "tv-show")
    return item.tv_name_cn || item.tv_name_en || item.tv_name_alt || "Unknown";
  if (type === "cartoon")
    return (
      item.cartoon_name_cn ||
      item.cartoon_name_en ||
      item.cartoon_name_alt ||
      "Unknown"
    );
  if (type === "manga")
    return (
      item.manga_name_cn ||
      item.manga_name_en ||
      item.manga_name_roman ||
      item.manga_name_jp ||
      item.manga_name_alt ||
      "Unknown"
    );
  if (type === "novel")
    return (
      item.novel_name_cn ||
      item.novel_name_en ||
      item.novel_name_roman ||
      item.novel_name_jp ||
      item.novel_name_alt ||
      "Unknown"
    );
  if (type === "franchise")
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_roman ||
      "Unknown"
    );
  if (type === "series")
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown"
    );
  return item.option_value || "Unknown";
}

function SearchBox({ placeholder, onSelect, items, renderItem, type }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = query
    ? items
        .filter((item) => {
          const str = Object.values(item)
            .filter((v) => typeof v === "string")
            .join("");
          return getClean(str).includes(getClean(query));
        })
        .slice(0, 10)
    : [];

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((item) => (
            <div
              key={item.system_id || item.id}
              className="px-4 py-2.5 hover:bg-red-50 cursor-pointer group"
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
                setQuery(getDisplayTitle(item, type));
              }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Delete() {
  const { showToast } = useToast();
  const [tab, setTab] = useState("anime");
  const [db, setDb] = useState({
    anime: [],
    "anime-movie": [],
    movie: [],
    "tv-show": [],
    cartoon: [],
    manga: [],
    novel: [],
    franchise: [],
    series: [],
    options: [],
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [selectedAnime, setSelectedAnime] = useState(null);
  const [selectedAnimeMovie, setSelectedAnimeMovie] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedTvShow, setSelectedTvShow] = useState(null);
  const [selectedCartoon, setSelectedCartoon] = useState(null);
  const [selectedManga, setSelectedManga] = useState(null);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [selectedFranchise, setSelectedFranchise] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [optCategoryFilter, setOptCategoryFilter] = useState("");

  const [modal, setModal] = useState(null); // { type, target, cascadeOptions }
  const [cascadeChecked, setCascadeChecked] = useState(false);
  const [orphanSeriesChecked, setOrphanSeriesChecked] = useState(false);
  const [orphanFranchiseChecked, setOrphanFranchiseChecked] = useState(false);

  const loadDb = useCallback(async () => {
    try {
      const [aRes, fRes, sRes, oRes, amRes, mRes, tvRes, ctRes, mgRes, nvRes] =
        await Promise.all([
          fetch("/api/anime/", { credentials: "include" }),
          fetch("/api/franchise/", { credentials: "include" }),
          fetch("/api/series/", { credentials: "include" }),
          fetch("/api/options/", { credentials: "include" }),
          fetch("/api/anime-movie/", { credentials: "include" }),
          fetch("/api/movies/", { credentials: "include" }),
          fetch("/api/tv-shows/", { credentials: "include" }),
          fetch("/api/cartoon/", { credentials: "include" }),
          fetch("/api/manga/", { credentials: "include" }),
          fetch("/api/novel/", { credentials: "include" }),
        ]);
      const [a, f, s, o, am, mv, tv, ct, mg, nv] = await Promise.all([
        aRes.json(),
        fRes.json(),
        sRes.json(),
        oRes.json(),
        amRes.json(),
        mRes.json(),
        tvRes.json(),
        ctRes.json(),
        mgRes.json(),
        nvRes.json(),
      ]);
      setDb({
        anime: a,
        "anime-movie": am,
        movie: mv,
        "tv-show": tv,
        cartoon: ct,
        manga: mg,
        novel: nv,
        franchise: f,
        series: s,
        options: o,
      });
    } catch {
      showToast("error", "Database load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDb();
  }, [loadDb]);

  function getFranchiseTitle(id) {
    if (!id) return "Standalone";
    const f = db.franchise.find((x) => x.system_id === id);
    return f ? getDisplayTitle(f, "franchise") : "Unknown";
  }
  function getSeriesTitle(id) {
    if (!id) return "No Series";
    const s = db.series.find((x) => x.system_id === id);
    return s ? getDisplayTitle(s, "series") : "Unknown";
  }

  function initDelete(type, item) {
    const t = { type, item };
    setCascadeChecked(false);
    setOrphanSeriesChecked(false);
    setOrphanFranchiseChecked(false);
    setModal(t);
  }

  async function executeDirectDelete(type, item) {
    setDeleting(true);
    try {
      if (type === "franchise") {
        for (const a of db.anime.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/anime/${a.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        for (const m of db["anime-movie"].filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/anime-movie/${m.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        for (const s of db.series.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/series/${s.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (type === "series") {
        for (const a of db.anime.filter(
          (x) => x.series_id === item.system_id,
        )) {
          await fetch(`/api/anime/${a.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      }
      const res = await fetch(`/api/${type}/${item.system_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to delete ${type}`);
      setSelectedFranchise(null);
      setSelectedSeries(null);
      showToast("success", "Deletion successful");
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeDelete() {
    if (!modal) return;
    const { type, item } = modal;
    setDeleting(true);
    try {
      if (type === "options") {
        const res = await fetch(`/api/options/${item.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete option");
        setSelectedOption(null);
        showToast("success", "Option deleted");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "anime-movie") {
        const res = await fetch(`/api/anime-movie/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete anime movie");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedAnimeMovie(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "movie") {
        const res = await fetch(`/api/movies/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete movie");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedMovie(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "tv-show") {
        const res = await fetch(`/api/tv-shows/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete TV show");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedTvShow(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "cartoon") {
        const res = await fetch(`/api/cartoon/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete cartoon");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedCartoon(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "manga") {
        const res = await fetch(`/api/manga/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete manga");
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedManga(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "novel") {
        const res = await fetch(`/api/novel/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete novel");
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedNovel(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      // Cascade deletions
      if (type === "franchise" && cascadeChecked) {
        for (const a of db.anime.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/anime/${a.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        for (const m of db["anime-movie"].filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/anime-movie/${m.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        for (const s of db.series.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/series/${s.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (type === "series" && cascadeChecked) {
        for (const a of db.anime.filter(
          (x) => x.series_id === item.system_id,
        )) {
          await fetch(`/api/anime/${a.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      }

      // Primary deletion
      const res = await fetch(`/api/${type}/${item.system_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to delete ${type}`);

      // Orphan cleanup
      if (type === "anime") {
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (
        type === "series" &&
        orphanFranchiseChecked &&
        item.franchise_id
      ) {
        await fetch(`/api/franchise/${item.franchise_id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }

      setSelectedAnime(null);
      setSelectedFranchise(null);
      setSelectedSeries(null);
      showToast("success", "Deletion successful");
      await loadDb();
      setModal(null);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  const optCategories = [...new Set(db.options.map((o) => o.category))].sort();
  const filteredOptions = optCategoryFilter
    ? db.options.filter((o) => o.category === optCategoryFilter)
    : db.options;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <i className="fas fa-spinner fa-spin text-brand text-3xl"></i>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <i className="fas fa-trash-alt text-red-500/70"></i> Delete Entry
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Permanently remove records from the database
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedAnime(null);
              setSelectedAnimeMovie(null);
              setSelectedMovie(null);
              setSelectedTvShow(null);
              setSelectedCartoon(null);
              setSelectedManga(null);
              setSelectedNovel(null);
              setSelectedFranchise(null);
              setSelectedSeries(null);
              setSelectedOption(null);
            }}
            className={`px-5 py-3 text-sm font-bold capitalize whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t ? "border-red-500 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ANIME TAB */}
      {tab === "anime" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search anime to delete..."
              items={db.anime}
              type="anime"
              onSelect={setSelectedAnime}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "anime")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.airing_type || "TV"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedAnime && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedAnime.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedAnime, "anime")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedAnime.anime_name_en ||
                      selectedAnime.anime_name_roman ||
                      "-"}
                  </p>
                  {selectedAnime.anime_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedAnime.anime_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnime.airing_type || "TV"}
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnime.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedAnime.franchise_id)} /{" "}
                    {getSeriesTitle(selectedAnime.series_id)}
                  </p>
                  {selectedAnime.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedAnime.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedAnime.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAnime(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("anime", selectedAnime)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ANIME MOVIE TAB */}
      {tab === "anime-movie" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search anime movie to delete..."
              items={db["anime-movie"]}
              type="anime-movie"
              onSelect={setSelectedAnimeMovie}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "anime-movie")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_date_jp || item.release_date_tw || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedAnimeMovie && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedAnimeMovie.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedAnimeMovie, "anime-movie")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedAnimeMovie.anime_movie_name_en ||
                      selectedAnimeMovie.anime_movie_name_roman ||
                      "-"}
                  </p>
                  {selectedAnimeMovie.anime_movie_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedAnimeMovie.anime_movie_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnimeMovie.airing_status || "Unknown"}
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnimeMovie.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedAnimeMovie.franchise_id)}
                  </p>
                  {selectedAnimeMovie.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedAnimeMovie.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedAnimeMovie.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAnimeMovie(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      initDelete("anime-movie", selectedAnimeMovie)
                    }
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MOVIE TAB */}
      {tab === "movie" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search movie to delete..."
              items={db.movie}
              type="movie"
              onSelect={setSelectedMovie}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "movie")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_date_usa || item.release_date_tw || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedMovie && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedMovie.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedMovie, "movie")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedMovie.movie_name_en || "-"}
                  </p>
                  {selectedMovie.movie_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedMovie.movie_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedMovie.movie_type && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedMovie.movie_type}
                      </span>
                    )}
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedMovie.airing_status || "Unknown"}
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedMovie.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedMovie.franchise_id)}
                    {selectedMovie.series_id &&
                      ` / ${getSeriesTitle(selectedMovie.series_id)}`}
                  </p>
                  {selectedMovie.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedMovie.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedMovie.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMovie(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("movie", selectedMovie)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TV SHOW TAB */}
      {tab === "tv-show" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search TV show to delete..."
              items={db["tv-show"]}
              type="tv-show"
              onSelect={setSelectedTvShow}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "tv-show")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)}
                    {item.season_part ? ` · ${item.season_part}` : ""}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedTvShow && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedTvShow.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedTvShow, "tv-show")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedTvShow.tv_name_en || "-"}
                  </p>
                  {selectedTvShow.tv_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedTvShow.tv_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedTvShow.airing_type && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedTvShow.airing_type}
                      </span>
                    )}
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedTvShow.airing_status || "Unknown"}
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedTvShow.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedTvShow.franchise_id)}
                    {selectedTvShow.series_id &&
                      ` / ${getSeriesTitle(selectedTvShow.series_id)}`}
                    {selectedTvShow.season_part &&
                      ` · ${selectedTvShow.season_part}`}
                  </p>
                  {selectedTvShow.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedTvShow.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedTvShow.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTvShow(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("tv-show", selectedTvShow)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARTOON TAB */}
      {tab === "cartoon" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search cartoon to delete..."
              items={db.cartoon}
              type="cartoon"
              onSelect={setSelectedCartoon}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "cartoon")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.airing_type || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedCartoon && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedCartoon.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedCartoon, "cartoon")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedCartoon.cartoon_name_en || "-"}
                  </p>
                  {selectedCartoon.cartoon_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedCartoon.cartoon_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedCartoon.airing_status || "Unknown"}
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedCartoon.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedCartoon.franchise_id)}
                    {selectedCartoon.series_id &&
                      ` / ${getSeriesTitle(selectedCartoon.series_id)}`}
                    {selectedCartoon.season_part &&
                      ` · ${selectedCartoon.season_part}`}
                  </p>
                  {selectedCartoon.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedCartoon.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedCartoon.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCartoon(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("cartoon", selectedCartoon)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANGA TAB */}
      {tab === "manga" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search manga to delete..."
              items={db.manga}
              type="manga"
              onSelect={setSelectedManga}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "manga")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_year || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedManga && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedManga.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedManga, "manga")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedManga.manga_name_en || "-"}
                  </p>
                  {selectedManga.manga_name_jp && (
                    <p className="text-xs text-gray-400">
                      {selectedManga.manga_name_jp}
                    </p>
                  )}
                  {selectedManga.manga_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedManga.manga_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedManga.reading_status && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedManga.reading_status}
                      </span>
                    )}
                    {selectedManga.region && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedManga.region}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedManga.franchise_id)}
                    {selectedManga.series_id &&
                      ` / ${getSeriesTitle(selectedManga.series_id)}`}
                  </p>
                  {selectedManga.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedManga.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedManga.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedManga(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("manga", selectedManga)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NOVEL TAB */}
      {tab === "novel" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search novel to delete..."
              items={db.novel}
              type="novel"
              onSelect={setSelectedNovel}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    {getDisplayTitle(item, "novel")}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {getFranchiseTitle(item.franchise_id)}
                    {item.type ? ` · ${item.type}` : ""}
                    {item.release_year ? ` · ${item.release_year}` : ""}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedNovel && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedNovel.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">
                    {getDisplayTitle(selectedNovel, "novel")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedNovel.novel_name_en || "-"}
                  </p>
                  {selectedNovel.novel_name_jp && (
                    <p className="text-xs text-gray-400">
                      {selectedNovel.novel_name_jp}
                    </p>
                  )}
                  {selectedNovel.novel_name_alt && (
                    <p className="text-xs text-gray-400">
                      {selectedNovel.novel_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedNovel.type && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.type}
                      </span>
                    )}
                    {selectedNovel.reading_status && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.reading_status}
                      </span>
                    )}
                    {selectedNovel.region && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.region}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedNovel.franchise_id)}
                    {selectedNovel.series_id &&
                      ` / ${getSeriesTitle(selectedNovel.series_id)}`}
                  </p>
                  {selectedNovel.notes?.remark && (
                    <p className="text-xs italic text-gray-400 mt-1">
                      {selectedNovel.notes.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-gray-400">
                    {selectedNovel.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedNovel(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("novel", selectedNovel)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FRANCHISE TAB */}
      {tab === "franchise" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search franchise to delete..."
              items={db.franchise}
              type="franchise"
              onSelect={setSelectedFranchise}
              renderItem={(item) => {
                const fid = item.system_id;
                const counts = [
                  {
                    label: "series",
                    n: db.series.filter((s) => s.franchise_id === fid).length,
                  },
                  {
                    label: "anime",
                    n: db.anime.filter((a) => a.franchise_id === fid).length,
                  },
                  {
                    label: "anime movie",
                    n: db["anime-movie"].filter((m) => m.franchise_id === fid)
                      .length,
                  },
                  {
                    label: "movie",
                    n: db.movie.filter((m) => m.franchise_id === fid).length,
                  },
                  {
                    label: "TV show",
                    n: db["tv-show"].filter((t) => t.franchise_id === fid)
                      .length,
                  },
                  {
                    label: "cartoon",
                    n: db.cartoon.filter((c) => c.franchise_id === fid).length,
                  },
                  {
                    label: "manga",
                    n: db.manga.filter((m) => m.franchise_id === fid).length,
                  },
                  {
                    label: "novel",
                    n: db.novel.filter((n) => n.franchise_id === fid).length,
                  },
                ].filter((x) => x.n > 0);
                return (
                  <div>
                    <div className="font-bold text-gray-800 text-sm">
                      {getDisplayTitle(item, "franchise")}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {counts.length > 0
                        ? counts.map((x) => `${x.n} ${x.label}`).join(" · ")
                        : "No entries"}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {selectedFranchise && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-gray-900 text-base">
                    {getDisplayTitle(selectedFranchise, "franchise")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {[
                      selectedFranchise.franchise_name_en,
                      selectedFranchise.franchise_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No alt names"}
                  </p>
                  {selectedFranchise.franchise_type && (
                    <span className="inline-block mt-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                      {selectedFranchise.franchise_type}
                    </span>
                  )}
                  <p className="text-xs font-mono text-gray-400 mt-1">
                    {selectedFranchise.system_id}
                  </p>
                  <p className="text-sm font-bold text-gray-600 mt-2">
                    {[
                      { label: "Series", n: db.series.filter((s) => s.franchise_id === selectedFranchise.system_id).length },
                      { label: "Anime", n: db.anime.filter((a) => a.franchise_id === selectedFranchise.system_id).length },
                      { label: "Anime Movie", n: db["anime-movie"].filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "Movie", n: db.movie.filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "TV Show", n: db["tv-show"].filter((t) => t.franchise_id === selectedFranchise.system_id).length },
                      { label: "Cartoon", n: db.cartoon.filter((c) => c.franchise_id === selectedFranchise.system_id).length },
                      { label: "Manga", n: db.manga.filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "Novel", n: db.novel.filter((n) => n.franchise_id === selectedFranchise.system_id).length },
                    ]
                      .filter((x) => x.n > 0)
                      .map((x) => `${x.n} ${x.label}`)
                      .join(" · ") || "No entries"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedFranchise(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      executeDirectDelete("franchise", selectedFranchise)
                    }
                    disabled={deleting}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <i
                      className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                    ></i>
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SERIES TAB */}
      {tab === "series" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search series to delete..."
              items={db.series}
              type="series"
              onSelect={setSelectedSeries}
              renderItem={(item) => {
                const sid = item.system_id;
                const counts = [
                  {
                    label: "anime",
                    n: db.anime.filter((a) => a.series_id === sid).length,
                  },
                  {
                    label: "manga",
                    n: db.manga.filter((m) => m.series_id === sid).length,
                  },
                  {
                    label: "novel",
                    n: db.novel.filter((n) => n.series_id === sid).length,
                  },
                ].filter((x) => x.n > 0);
                return (
                  <div>
                    <div className="font-bold text-gray-800 text-sm">
                      {getDisplayTitle(item, "series")}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {getFranchiseTitle(item.franchise_id)}
                      {counts.length > 0 &&
                        " · " +
                          counts.map((x) => `${x.n} ${x.label}`).join(" · ")}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {selectedSeries && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-gray-900 text-base">
                    {getDisplayTitle(selectedSeries, "series")}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {[
                      selectedSeries.series_name_en,
                      selectedSeries.series_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No alt names"}
                  </p>
                  <p className="text-xs font-mono text-gray-400 mt-1">
                    {selectedSeries.system_id}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {getFranchiseTitle(selectedSeries.franchise_id)}
                  </p>
                  <p className="text-sm font-bold text-gray-600 mt-1">
                    {[
                      { label: "Anime", n: db.anime.filter((a) => a.series_id === selectedSeries.system_id).length },
                      { label: "Manga", n: db.manga.filter((m) => m.series_id === selectedSeries.system_id).length },
                      { label: "Novel", n: db.novel.filter((n) => n.series_id === selectedSeries.system_id).length },
                    ]
                      .filter((x) => x.n > 0)
                      .map((x) => `${x.n} ${x.label}`)
                      .join(" · ") || "No entries"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSeries(null)}
                    className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      executeDirectDelete("series", selectedSeries)
                    }
                    disabled={deleting}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <i
                      className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                    ></i>
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OPTIONS TAB */}
      {tab === "options" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex gap-3">
            <select
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand flex-1"
              value={optCategoryFilter}
              onChange={(e) => setOptCategoryFilter(e.target.value)}
            >
              <option value="">— Select Category —</option>
              {optCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {optCategoryFilter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredOptions.length ? (
                filteredOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center group hover:bg-red-50 hover:border-red-200 transition shadow-sm"
                  >
                    <span className="font-bold text-gray-700 text-sm truncate pr-2">
                      {opt.option_value}
                    </span>
                    <button
                      onClick={() => initDelete("options", opt)}
                      className="text-gray-400 hover:text-red-600 transition w-7 h-7 flex items-center justify-center rounded-md bg-white shadow-sm border border-gray-200 shrink-0"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center text-sm text-gray-500 italic py-8 border border-dashed border-gray-300 rounded-xl">
                  No options in this category.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 scale-100 transition-transform">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-trash-alt text-red-600 text-xl"></i>
              </div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                {modal.type.toUpperCase()}
                {modal.item.category ? ` (${modal.item.category})` : ""}
              </div>
              <h3 className="font-black text-gray-900 text-lg mt-1">
                {getDisplayTitle(modal.item, modal.type)}
              </h3>
              <p className="text-xs font-mono text-gray-400 mt-1">
                {modal.item.system_id || modal.item.id}
              </p>
            </div>

            <div className="space-y-3 mb-5">
              {/* Cascade option for franchise */}
              {modal.type === "franchise" &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.system_id,
                ).length > 0 ||
                  db.anime.filter(
                    (a) => a.franchise_id === modal.item.system_id,
                  ).length > 0) && (
                  <label className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cascadeChecked}
                      onChange={(e) => setCascadeChecked(e.target.checked)}
                      className="mt-0.5 rounded border-red-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-red-800">
                        <i className="fas fa-trash-restore mr-1"></i> Cascade
                        Delete
                      </div>
                      <div className="text-xs text-red-700 mt-0.5">
                        Also delete{" "}
                        {
                          db.series.filter(
                            (s) => s.franchise_id === modal.item.system_id,
                          ).length
                        }{" "}
                        series,{" "}
                        {
                          db.anime.filter(
                            (a) => a.franchise_id === modal.item.system_id,
                          ).length
                        }{" "}
                        anime, and{" "}
                        {
                          db["anime-movie"].filter(
                            (m) => m.franchise_id === modal.item.system_id,
                          ).length
                        }{" "}
                        anime movie entries.
                      </div>
                    </div>
                  </label>
                )}

              {/* Cascade option for series */}
              {modal.type === "series" &&
                db.anime.filter((a) => a.series_id === modal.item.system_id)
                  .length > 0 && (
                  <label className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cascadeChecked}
                      onChange={(e) => setCascadeChecked(e.target.checked)}
                      className="mt-0.5 rounded border-red-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-red-800">
                        <i className="fas fa-trash-restore mr-1"></i> Cascade
                        Delete
                      </div>
                      <div className="text-xs text-red-700 mt-0.5">
                        Also delete{" "}
                        {
                          db.anime.filter(
                            (a) => a.series_id === modal.item.system_id,
                          ).length
                        }{" "}
                        anime entries.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning */}
              {modal.type === "anime" &&
                modal.item.series_id &&
                db.anime.filter((a) => a.series_id === modal.item.series_id)
                  .length === 1 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Anime in
                        Series
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (anime) */}
              {modal.type === "anime" &&
                !modal.item.series_id &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Anime in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (series) */}
              {modal.type === "series" &&
                modal.item.franchise_id &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.anime.filter(
                  (a) =>
                    a.franchise_id === modal.item.franchise_id && !a.series_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Series in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (movie) */}
              {modal.type === "movie" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.movie.filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (tv-show) */}
              {modal.type === "tv-show" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.movie.filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["tv-show"].filter(
                  (t) => t.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (cartoon) */}
              {modal.type === "cartoon" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.movie.filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["tv-show"].filter(
                  (t) => t.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.cartoon.filter(
                  (c) => c.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning (manga) */}
              {modal.type === "manga" &&
                modal.item.series_id &&
                db.anime.filter((a) => a.series_id === modal.item.series_id)
                  .length +
                  db.manga.filter((m) => m.series_id === modal.item.series_id)
                    .length ===
                  1 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Series
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (manga) */}
              {modal.type === "manga" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["tv-show"].filter(
                  (t) => t.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.cartoon.filter(
                  (c) => c.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.manga.filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 ||
                  orphanSeriesChecked) && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning (novel) */}
              {modal.type === "novel" &&
                modal.item.series_id &&
                db.anime.filter((a) => a.series_id === modal.item.series_id)
                  .length +
                  db.manga.filter((m) => m.series_id === modal.item.series_id)
                    .length +
                  db.novel.filter((n) => n.series_id === modal.item.series_id)
                    .length ===
                  1 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Series
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (novel) */}
              {modal.type === "novel" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["tv-show"].filter(
                  (t) => t.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.cartoon.filter(
                  (c) => c.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.manga.filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db.novel.filter(
                  (n) => n.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 ||
                  orphanSeriesChecked) && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (anime-movie) */}
              {modal.type === "anime-movie" &&
                modal.item.franchise_id &&
                db.anime.filter(
                  (a) => a.franchise_id === modal.item.franchise_id,
                ).length === 0 &&
                db["anime-movie"].filter(
                  (m) => m.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-orange-400 w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-orange-800">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-orange-700 mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <i
                  className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                ></i>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
