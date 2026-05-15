import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";
import InfoCard from "../components/info/InfoCard";
import NamingCard from "../components/info/NamingCard";
import SourcesCard from "../components/info/SourcesCard";
import SeriesModal from "../components/modals/SeriesModal";
import MovieNotes from "./MovieNotes";

const WATCHING_STATUSES = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Temp Dropped",
  "Dropped",
  "Won't Watch",
  "Completed",
];
const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

export default function Movie() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [movie, setMovie] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [series, setSeries] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, fRes, sRes] = await Promise.all([
        fetch(`/api/movies/${system_id}`, { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
      ]);
      if (!mRes.ok) throw new Error("Movie not found");
      const m = await mRes.json();
      const allFranchises = await fRes.json();
      const allSeries = await sRes.json();
      setMovie(m);
      setFranchise(
        m.franchise_id
          ? allFranchises.find((f) => f.system_id === m.franchise_id) || null
          : null,
      );
      setSeries(
        m.series_id
          ? allSeries.find((s) => s.system_id === m.series_id) || null
          : null,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [system_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setMovie((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(`/api/movies/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const fresh = await fetch(`/api/movies/${system_id}`, {
        credentials: "include",
      });
      setMovie(await fresh.json());
    } catch {
      showToast("error", "Update failed");
      load();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(`/api/data-control/replace/movie/${system_id}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", "Autofill completed");
      await load();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setAutofilling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <i className="fas fa-circle-notch fa-spin text-4xl text-brand mb-4"></i>
        <p className="text-gray-500 font-medium">Loading details...</p>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Movie</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const titleMain =
    movie.movie_name_cn ||
    movie.movie_name_en ||
    movie.movie_name_alt ||
    "Unknown";
  const titleSub =
    movie.movie_name_en && movie.movie_name_en !== titleMain
      ? movie.movie_name_en
      : null;

  const imageUrl = getCoverUrl(movie.cover_image_file);

  let airingStatusColor = "bg-gray-100 text-gray-600 border border-gray-200";
  if (movie.airing_status === "Airing")
    airingStatusColor = "bg-green-100 text-green-700 border border-green-200";
  else if (movie.airing_status === "Finished Airing")
    airingStatusColor = "bg-blue-100 text-blue-700 border border-blue-200";
  else if (movie.airing_status === "Not Yet Aired")
    airingStatusColor =
      "bg-orange-100 text-orange-700 border border-orange-200";

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb */}
      <nav className="flex text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-2">
          <li>
            <Link to="/library/movie" className="hover:text-brand transition">
              <i className="fas fa-ticket-alt mr-1.5"></i>Movies
            </Link>
          </li>
          <li>
            <i className="fas fa-chevron-right text-[10px]"></i>
          </li>
          <li className="font-medium text-gray-900 truncate max-w-xs">
            {titleMain}
          </li>
        </ol>
      </nav>

      {/* Admin Toolbar */}
      {isAdmin && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between mb-8 shadow-sm">
          <div className="flex items-center text-brand font-bold text-sm uppercase tracking-wider">
            <i className="fas fa-shield-alt mr-2"></i> Admin Tools
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate(`/modify?id=${system_id}&type=movie`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(`/api/movies/${system_id}/complete`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("Request failed");
                  showToast("success", "Marked as Completed!");
                  await load();
                } catch {
                  showToast("error", "Update failed");
                }
              }}
              className="bg-white hover:bg-green-50 border border-gray-200 text-gray-700 hover:text-green-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-check-double mr-2 text-green-500"></i> Mark
              Completed
            </button>
            <button
              onClick={handleAutofill}
              disabled={autofilling}
              className="bg-brand hover:bg-brand-hover text-white px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center disabled:opacity-50"
            >
              <i
                className={`fas ${autofilling ? "fa-circle-notch fa-spin" : "fa-magic"} mr-2`}
              ></i>
              {autofilling ? "Autofilling..." : "Autofill & Update"}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: 4 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster */}
          <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
            {movie.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {movie.my_rating}
              </div>
            )}
            <div className="w-full aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
              <img
                src={imageUrl}
                alt="Cover"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sourceOther={movie.source_other}
            imdbLink={movie.imdb_link}
          />

          {/* System Info — admin only */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                <i className="fas fa-microchip mr-1.5"></i>System Info
              </h3>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">
                  System ID
                </div>
                <div className="text-xs font-mono text-gray-800 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 break-all select-all">
                  {movie.system_id}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-8">
          {/* Header & Titles */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {movie.airing_status && (
                <span
                  className={`${airingStatusColor} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {movie.airing_status}
                </span>
              )}
              {movie.movie_type && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {movie.movie_type}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight mb-1">
              {titleMain}
            </h1>
            {titleSub && (
              <h2 className="text-lg text-gray-500 font-medium mb-3">
                {titleSub}
              </h2>
            )}

            {/* Franchise / Series Bar */}
            <div className="flex items-center gap-4 text-sm text-gray-500 bg-gray-50 py-2 px-3 rounded-lg border border-gray-200 mb-6">
              {franchise ? (
                <span>
                  <i className="fas fa-sitemap text-brand/50 mr-1.5"></i>
                  <Link
                    to={`/franchise/${franchise.system_id}`}
                    className="text-brand hover:underline font-medium"
                  >
                    {franchiseName}
                  </Link>
                </span>
              ) : (
                <span className="text-gray-400">
                  <i className="fas fa-unlink mr-1.5"></i>No Franchise
                </span>
              )}
              {series && (
                <>
                  <div className="hidden sm:block text-gray-300">|</div>
                  <span>
                    <i className="fas fa-layer-group text-purple-400/50 mr-1.5"></i>
                    <button
                      onClick={() => setShowSeriesModal(true)}
                      className="font-medium text-purple-600 hover:text-purple-800 hover:underline transition bg-transparent border-none cursor-pointer p-0"
                    >
                      {series.series_name_cn ||
                        series.series_name_en ||
                        series.series_name_alt}
                    </button>
                  </span>
                </>
              )}
            </div>

            {/* IMDb Score Block */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="bg-yellow-50 text-yellow-800 border border-yellow-100 px-4 py-2 rounded-lg flex items-center shadow-sm">
                <i className="fas fa-star text-yellow-500 mr-2 text-lg"></i>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 leading-none mb-0.5">
                    IMDb Score
                  </div>
                  <div className="font-black text-base leading-none">
                    {movie.imdb_rating && movie.imdb_rating !== "N/A"
                      ? movie.imdb_rating
                      : "-"}
                  </div>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Last Updated
                </div>
                <div className="text-sm font-mono text-gray-600">
                  {movie.updated_at
                    ? new Date(movie.updated_at).toLocaleString()
                    : "-"}
                </div>
              </div>
            </div>
          </div>

          {/* My Tracker Block */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-brand">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3.5">
              <h3 className="font-bold text-gray-800 text-lg flex items-center">
                <i className="fas fa-chart-line text-brand mr-2"></i>My Tracker
              </h3>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Watching Status
                </label>
                <select
                  value={movie.watching_status || ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    isAdmin &&
                    performPatch(
                      { watching_status: e.target.value },
                      "Status updated",
                    )
                  }
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                >
                  {WATCHING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Rating
                </label>
                <select
                  value={movie.my_rating || ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    isAdmin &&
                    performPatch({ my_rating: e.target.value }, "Rating saved")
                  }
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                >
                  <option value="">Unrated</option>
                  {MY_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Watch Next
                </label>
                <label
                  className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={!!movie.watch_next}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      isAdmin &&
                      performPatch(
                        { watch_next: e.target.checked },
                        e.target.checked
                          ? "Added to Watch Next"
                          : "Removed from Watch Next",
                      )
                    }
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Watch Next
                  </span>
                </label>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  To Rewatch
                </label>
                <label
                  className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={!!movie.to_rewatch}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      isAdmin &&
                      performPatch(
                        { to_rewatch: e.target.checked },
                        e.target.checked
                          ? "Marked for rewatch"
                          : "Removed from rewatch",
                      )
                    }
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    To Rewatch
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="movie" item={movie} />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "本傳 / 外傳", value: movie.is_main },
                  { label: "Airing Status", value: movie.airing_status },
                  { label: "Length", value: formatLength(movie.length_min) },
                ],
                { label: "Director", value: movie.director },
                [
                  { label: "Release Date TW", value: movie.release_date_tw },
                  { label: "Release Date USA", value: movie.release_date_usa },
                ],
              ]}
            />
          </div>

          {/* Remarks */}
          {movie.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={movie.system_id}
                  defaultValue={movie.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin &&
                    performPatch({ remark: e.target.value }, "Remark saved")
                  }
                  rows={4}
                  placeholder="Add remarks..."
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                ></textarea>
              </div>
            </div>
          )}

          <MovieNotes
            key={movie.system_id}
            movie={movie}
            isAdmin={isAdmin}
            onSave={(updatedNotes) =>
              performPatch({ notes: updatedNotes }, "Notes saved")
            }
          />
        </div>
      </div>

      {showSeriesModal && series && (
        <SeriesModal
          series={series}
          isAdmin={isAdmin}
          onClose={() => setShowSeriesModal(false)}
        />
      )}
    </div>
  );
}
