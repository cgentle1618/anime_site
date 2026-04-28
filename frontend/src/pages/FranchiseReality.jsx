import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getRatingWeight } from "../utils/anime";
import MovieCard from "../components/MovieCard";
import SeriesModal from "../components/SeriesModal";

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

function releaseDateScore(movie) {
  const raw = movie.release_date_usa || movie.release_date_tw || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  const year = parseInt(parts[0]) || 0;
  const month = parseInt(parts[1]) || 0;
  const day = parseInt(parts[2]) || 0;
  return year * 10000 + month * 100 + day;
}

function movieDisplayName(m) {
  return m.movie_name_en || m.movie_name_cn || m.movie_name_alt || "";
}

export default function FranchiseReality() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [franchise, setFranchise] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [movieList, setMovieList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState("release_date");
  const [groupBySeries, setGroupBySeries] = useState(true);
  const [filters, setFilters] = useState({
    airingStatus: new Set(),
    watchingStatus: new Set(),
  });

  const [selectedSeries, setSelectedSeries] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);

  // Admin editable fields
  const [rating, setRating] = useState("");
  const [expectation, setExpectation] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [fRes, sRes, mRes] = await Promise.all([
          fetch(`/api/franchise/${system_id}`, { credentials: "include" }),
          fetch(`/api/series/?franchise_id=${system_id}`, {
            credentials: "include",
          }),
          fetch(`/api/movies/?franchise_id=${system_id}`, {
            credentials: "include",
          }),
        ]);
        if (!fRes.ok) throw new Error("Franchise not found");
        const [f, s, m] = await Promise.all([
          fRes.json(),
          sRes.json(),
          mRes.json(),
        ]);
        setFranchise(f);
        setSeriesList(s);
        setMovieList(m);
        setRating(f.my_rating || "");
        setExpectation(f.franchise_expectation || "");
        setRemark(f.remark || "");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [system_id]);

  const handleMovieUpdated = useCallback((updated) => {
    setMovieList((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
  }, []);

  async function saveField(field, value) {
    try {
      const res = await fetch(`/api/franchise/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        setFranchise(updated);
        showToast("success", "Franchise updated successfully");
      } else {
        showToast("error", "Save failed");
      }
    } catch {
      showToast("error", "Network error. Reverting.");
    }
  }

  function toggleFilter(group, value) {
    setFilters((prev) => {
      const next = { ...prev, [group]: new Set(prev[group]) };
      if (next[group].has(value)) next[group].delete(value);
      else next[group].add(value);
      return next;
    });
  }

  const filteredAndSorted = useMemo(() => {
    let result = movieList.filter((m) => {
      if (
        filters.airingStatus.size > 0 &&
        !filters.airingStatus.has(m.airing_status)
      )
        return false;
      if (filters.watchingStatus.size > 0) {
        const group = getWatchingGroup(m.watching_status || "Might Watch");
        if (!filters.watchingStatus.has(group)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sort === "release_date") {
        const diff = releaseDateScore(a) - releaseDateScore(b);
        if (diff !== 0) return diff;
      }
      if (sort === "my_rating") {
        const diff =
          getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      if (sort === "imdb_rating") {
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
      return movieDisplayName(a).localeCompare(movieDisplayName(b));
    });

    return result;
  }, [movieList, filters, sort]);

  const seriesGroups = useMemo(() => {
    const seriesMap = Object.fromEntries(
      seriesList.map((s) => [s.system_id, s]),
    );
    const grouped = {};
    const standalone = [];

    filteredAndSorted.forEach((m) => {
      if (m.series_id && seriesMap[m.series_id]) {
        if (!grouped[m.series_id]) grouped[m.series_id] = [];
        grouped[m.series_id].push(m);
      } else {
        standalone.push(m);
      }
    });

    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0) {
        result.push({
          type: "series",
          series: s,
          movies: grouped[s.system_id],
        });
      }
    });
    if (standalone.length > 0) {
      result.push({ type: "standalone", movies: standalone });
    }
    return result;
  }, [filteredAndSorted, seriesList]);

  const completedCount = movieList.filter(
    (m) => m.watching_status === "Completed",
  ).length;
  const completionPct =
    movieList.length > 0
      ? Math.round((completedCount / movieList.length) * 100)
      : 0;

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
    { label: "Alt", value: franchise.franchise_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
        <Link to="/library/movie" className="hover:text-brand font-medium">
          <i className="fas fa-film mr-1"></i>Movies
        </Link>
        <span>/</span>
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

      {/* Hero section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          {/* Left: title + info */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-2">
              <i className="fas fa-film mr-1"></i>
              {franchise.franchise_type || "Reality Franchise"}
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
              <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                {movieList.length} {movieList.length === 1 ? "Movie" : "Movies"}
              </span>
            </div>
          </div>

          {/* Right: completion + admin controls */}
          <div className="lg:w-52 shrink-0 space-y-3">
            {/* Completion */}
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
                {completedCount} / {movieList.length} watched
              </div>
            </div>

            {/* Admin-only selects */}
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
          placeholder="Add overview notes or franchise remarks..."
          className={`w-full border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 text-gray-500 cursor-default"}`}
        />
      </div>

      {/* Movie Section */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <i className="fas fa-film text-brand"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
              Movies
            </h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Live-action &amp; animated films
            </p>
          </div>
          <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
            {filteredAndSorted.length} entries
          </span>
        </div>

        {/* Sort + Filter controls */}
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
          >
            <option value="release_date">Sort: Release Date</option>
            <option value="title">Sort: Title</option>
            <option value="my_rating">Sort: My Rating</option>
            <option value="imdb_rating">Sort: IMDb Rating</option>
          </select>

          <div className="w-px h-5 bg-gray-200"></div>

          {/* Airing Status filters */}
          {[
            ["Finished", "Finished Airing"],
            ["Not Aired", "Not Yet Aired"],
          ].map(([label, val]) => (
            <button
              key={val}
              onClick={() => toggleFilter("airingStatus", val)}
              className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.airingStatus.has(val) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200"></div>

          {/* Watching Status filters */}
          {["Planned", "Watching", "Completed", "Dropped", "Might Watch"].map(
            (v) => (
              <button
                key={v}
                onClick={() => toggleFilter("watchingStatus", v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.watchingStatus.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ),
          )}

          <div className="w-px h-5 bg-gray-200"></div>

          <button
            onClick={() => setGroupBySeries((v) => !v)}
            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${groupBySeries ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
          >
            <i className="fas fa-layer-group mr-1"></i>Group by Series
          </button>
        </div>

        {/* Movie grid */}
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <i className="fas fa-ghost text-3xl mb-3"></i>
            <p className="font-medium">No entries match the current filters.</p>
          </div>
        ) : groupBySeries ? (
          <div className="space-y-10">
            {seriesGroups.map((group) => {
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {group.movies.map((m) => (
                      <MovieCard
                        key={m.system_id}
                        movie={m}
                        onUpdated={handleMovieUpdated}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredAndSorted.map((m) => (
              <MovieCard
                key={m.system_id}
                movie={m}
                onUpdated={handleMovieUpdated}
              />
            ))}
          </div>
        )}
      </div>

      {/* TV Show Section — Under Development */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <i className="fas fa-tv text-gray-400"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-400 tracking-tight leading-none">
              TV Shows
            </h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Live-action series
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <i className="fas fa-tools text-2xl text-gray-300 mb-2"></i>
          <p className="text-sm font-bold text-gray-400">Under Development</p>
        </div>
      </div>

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
