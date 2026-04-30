import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getRatingWeight } from "../utils/anime";
import CartoonCard from "../components/CartoonCard";
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

function cartoonDisplayName(c) {
  return c.cartoon_name_en || c.cartoon_name_cn || c.cartoon_name_alt || "";
}

export default function FranchiseCartoon() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [franchise, setFranchise] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [cartoonList, setCartoonList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState("release_date");
  const [groupBySeries, setGroupBySeries] = useState(true);
  const [filters, setFilters] = useState({
    airingStatus: new Set(),
    airingType: new Set(),
    watchingStatus: new Set(),
  });

  const [selectedSeries, setSelectedSeries] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);

  const [rating, setRating] = useState("");
  const [expectation, setExpectation] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [fRes, sRes, cRes] = await Promise.all([
          fetch(`/api/franchise/${system_id}`, { credentials: "include" }),
          fetch(`/api/series/?franchise_id=${system_id}`, {
            credentials: "include",
          }),
          fetch(`/api/cartoon/?franchise_id=${system_id}`, {
            credentials: "include",
          }),
        ]);
        if (!fRes.ok) throw new Error("Franchise not found");
        const [f, s, c] = await Promise.all([
          fRes.json(),
          sRes.json(),
          cRes.json(),
        ]);
        setFranchise(f);
        setSeriesList(s);
        setCartoonList(c);
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

  const handleCartoonUpdated = useCallback((updated) => {
    setCartoonList((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
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

  const airingTypeOptions = useMemo(
    () =>
      [
        ...new Set(cartoonList.map((c) => c.airing_type).filter(Boolean)),
      ].sort(),
    [cartoonList],
  );

  const filteredAndSorted = useMemo(() => {
    let result = cartoonList.filter((c) => {
      if (
        filters.airingStatus.size > 0 &&
        !filters.airingStatus.has(c.airing_status)
      )
        return false;
      if (filters.airingType.size > 0 && !filters.airingType.has(c.airing_type))
        return false;
      if (filters.watchingStatus.size > 0) {
        const group = getWatchingGroup(c.watching_status || "Might Watch");
        if (!filters.watchingStatus.has(group)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sort === "release_date") {
        const dA = a.release_date ? new Date(a.release_date).getTime() : 0;
        const dB = b.release_date ? new Date(b.release_date).getTime() : 0;
        if (dA !== dB) return dA - dB;
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
      return cartoonDisplayName(a).localeCompare(cartoonDisplayName(b));
    });

    return result;
  }, [cartoonList, filters, sort]);

  const seriesGroups = useMemo(() => {
    const seriesMap = Object.fromEntries(
      seriesList.map((s) => [s.system_id, s]),
    );
    const grouped = {};
    const standalone = [];

    filteredAndSorted.forEach((c) => {
      if (c.series_id && seriesMap[c.series_id]) {
        if (!grouped[c.series_id]) grouped[c.series_id] = [];
        grouped[c.series_id].push(c);
      } else {
        standalone.push(c);
      }
    });

    const result = [];
    seriesList.forEach((s) => {
      if (grouped[s.system_id]?.length > 0) {
        result.push({
          type: "series",
          series: s,
          cartoons: grouped[s.system_id],
        });
      }
    });
    if (standalone.length > 0) {
      result.push({ type: "standalone", cartoons: standalone });
    }
    return result;
  }, [filteredAndSorted, seriesList]);

  const totalEntries = cartoonList.length;
  const completedCount = cartoonList.filter(
    (c) => c.watching_status === "Completed",
  ).length;
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

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
        <Link to="/library/cartoon" className="hover:text-brand font-medium">
          <i className="fas fa-tv mr-1"></i>Cartoons
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
              <i className="fas fa-tv mr-1"></i>
              {franchise.franchise_type || "Cartoon Franchise"}
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
              {cartoonList.length > 0 && (
                <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                  {cartoonList.length}{" "}
                  {cartoonList.length === 1 ? "Entry" : "Entries"}
                </span>
              )}
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
                {completedCount} / {totalEntries} watched
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

      {/* Cartoon Section */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <i className="fas fa-tv text-brand"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">
              Cartoons
            </h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {franchise.franchise_type || "Cartoon"} entries
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
            ["Airing", "Airing"],
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

          {airingTypeOptions.length > 0 && (
            <>
              <div className="w-px h-5 bg-gray-200"></div>
              {airingTypeOptions.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleFilter("airingType", v)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.airingType.has(v) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}
            </>
          )}

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

        {/* Cartoon grid */}
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
                        className={`fas ${group.type === "series" ? "fa-layer-group" : "fa-tv"} text-brand/70`}
                      ></i>
                      {label}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {group.cartoons.length}
                    </span>
                    <div className="flex-1 border-t border-gray-100"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {group.cartoons.map((c) => (
                      <CartoonCard
                        key={c.system_id}
                        cartoon={c}
                        onUpdated={handleCartoonUpdated}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredAndSorted.map((c) => (
              <CartoonCard
                key={c.system_id}
                cartoon={c}
                onUpdated={handleCartoonUpdated}
              />
            ))}
          </div>
        )}
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
