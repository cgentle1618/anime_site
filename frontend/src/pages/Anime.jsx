import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG, isBaha } from "../utils/anime";
import AnimeNotes from "./AnimeNotes";
import InfoCard, { InfoRow } from "../components/InfoCard";
import NamingCard from "../components/NamingCard";
import ScoreBlock from "../components/ScoreBlock";
import SourcesCard from "../components/SourcesCard";
import MyTrackerCard from "../components/MyTrackerCard";
import SeriesModal from "../components/SeriesModal";

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
const MUSIC_OPTIONS = ["Pending", "Need", "Done"];

export default function Anime() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [anime, setAnime] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [series, setSeries] = useState(null);
  const [allAnime, setAllAnime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [aRes, fRes, sRes, allRes] = await Promise.all([
        fetch(`/api/anime/${system_id}`, { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
        fetch("/api/anime/", { credentials: "include" }),
      ]);
      if (!aRes.ok) throw new Error("Anime not found");
      const a = await aRes.json();
      const allFranchises = await fRes.json();
      const allSeries = await sRes.json();
      const all = await allRes.json();
      setAnime(a);
      setAllAnime(all);
      setFranchise(
        a.franchise_id
          ? allFranchises.find((f) => f.system_id === a.franchise_id) || null
          : null,
      );
      setSeries(
        a.series_id
          ? allSeries.find((s) => s.system_id === a.series_id) || null
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

  async function performUpdate(payload, msg) {
    if (!isAdmin) return;
    setAnime((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(`/api/anime/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const fresh = await fetch(`/api/anime/${system_id}`, {
        credentials: "include",
      });
      setAnime(await fresh.json());
    } catch {
      showToast("error", "Update failed");
      load();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(`/api/data-control/replace/anime/${system_id}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", data.message || "Jikan autofill completed");
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

  if (error || !anime) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Anime</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const titleMain =
    anime.anime_name_cn ||
    anime.anime_name_en ||
    anime.anime_name_roman ||
    "Unknown";
  const titleSub =
    anime.anime_name_en && anime.anime_name_en !== titleMain
      ? anime.anime_name_en
      : anime.anime_name_roman && anime.anime_name_roman !== titleMain
        ? anime.anime_name_roman
        : null;

  const imageUrl = getCoverUrl(anime.cover_image_file);

  const epFin = anime.ep_fin || 0;
  const epTotal = anime.ep_total != null ? anime.ep_total : "?";
  const hasCum = (anime.ep_previous || 0) > 0;
  const cumFin = anime.cum_ep_fin ?? epFin;
  const cumTotal = anime.cum_ep_total ?? epTotal;
  const epTotalDisplay =
    anime.ep_total != null
      ? hasCum && anime.cum_ep_total != null
        ? `${anime.ep_total} (${anime.cum_ep_total})`
        : String(anime.ep_total)
      : null;
  const progressPct =
    epTotal !== "?" ? Math.round((epFin / parseInt(epTotal)) * 100) : 0;

  let airingStatusColor = "bg-gray-100 text-gray-600 border border-gray-200";
  if (anime.airing_status === "Airing")
    airingStatusColor = "bg-green-100 text-green-700 border border-green-200";
  else if (anime.airing_status === "Finished Airing")
    airingStatusColor = "bg-blue-100 text-blue-700 border border-blue-200";
  else if (anime.airing_status === "Not Yet Aired")
    airingStatusColor =
      "bg-orange-100 text-orange-700 border border-orange-200";

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;
  const seriesName = series
    ? series.series_name_cn || series.series_name_en || series.series_name_alt
    : null;

  const relatedAnime = [];
  if (anime.prequel_id) {
    const p = allAnime.find((a) => a.system_id === anime.prequel_id);
    if (p)
      relatedAnime.push({ anime: p, tag: "Prequel", color: "text-orange-500" });
  }
  if (anime.sequel_id) {
    const s = allAnime.find((a) => a.system_id === anime.sequel_id);
    if (s)
      relatedAnime.push({ anime: s, tag: "Sequel", color: "text-green-500" });
  }
  if (anime.alternative) {
    String(anime.alternative)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((altId) => {
        const a = allAnime.find((x) => x.system_id === altId);
        if (a)
          relatedAnime.push({
            anime: a,
            tag: "Alternative",
            color: "text-blue-500",
          });
      });
  }

  const releaseSeasonYear =
    anime.release_season && anime.release_year
      ? `${anime.release_season} ${anime.release_year}`
      : anime.release_season || null;
  const releaseMonthYear =
    anime.release_month && anime.release_year
      ? `${anime.release_month} ${anime.release_year}`
      : anime.release_month || anime.release_year || null;

  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb */}
      <nav className="flex text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-2">
          <li>
            <Link to="/library/anime" className="hover:text-brand transition">
              <i className="fas fa-tv mr-1.5"></i>Anime
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
              onClick={() => navigate(`/modify?id=${system_id}`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={() =>
                performUpdate(
                  {
                    watching_status: "Completed",
                    airing_status: "Finished Airing",
                    ep_fin: anime.ep_total ? parseInt(anime.ep_total) : epFin,
                  },
                  "Marked as Completed!",
                )
              }
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
          <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm relative group overflow-hidden">
            {anime.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {anime.my_rating}
              </div>
            )}
            <div className="w-full aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative">
              <img
                src={imageUrl}
                alt="Cover"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
            </div>
            {/* Hover Progress Overlay */}
            <div className="absolute bottom-2 left-2 right-2 bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 shadow-xl transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
              <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                  Progress
                </span>
                <span className="text-[10px] font-bold text-white">
                  {epTotal !== "?" ? `${progressPct}%` : `${epFin} ep`}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-brand h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${epTotal !== "?" ? progressPct : epFin > 0 ? 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            showBaha={isBaha(anime)}
            bahaLink={anime.baha_link}
            sourceNetflix={anime.source_netflix}
            sourceOther={anime.source_other}
            malLink={anime.mal_link}
            anilistLink={anime.anilist_link}
            officialLink={anime.official_link}
            twitterLink={anime.twitter_link}
          />

          {/* Watch Order */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
              <i className="fas fa-list-ol mr-1.5"></i>Watch Order
            </h3>
            <div className="text-sm font-medium text-gray-800 bg-gray-50 px-3 py-2 rounded border border-gray-100 break-words">
              {anime.watch_order != null ? `#${anime.watch_order}` : "-"}
            </div>
          </div>

          {/* Related Entries (hidden if none) */}
          {relatedAnime.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                <i className="fas fa-project-diagram mr-1.5"></i>Related Entries
              </h3>
              <div className="flex flex-col gap-3">
                {relatedAnime.map(({ anime: rel, tag, color }) => (
                  <div
                    key={`${tag}-${rel.system_id}`}
                    onClick={() => navigate(`/anime/${rel.system_id}`)}
                    className="bg-gray-50 rounded-lg border border-gray-200 p-2 flex items-center gap-3 cursor-pointer hover:bg-brand/5 hover:border-brand/30 transition"
                  >
                    <img
                      src={getCoverUrl(rel.cover_image_file)}
                      className="w-10 h-14 object-cover rounded shadow-sm shrink-0"
                      onError={(e) => {
                        e.target.src = FALLBACK_SVG;
                      }}
                      alt=""
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[9px] font-bold uppercase tracking-wider ${color} mb-0.5`}
                      >
                        {tag}
                      </div>
                      <div className="text-sm font-bold text-gray-900 truncate">
                        {rel.anime_name_cn ||
                          rel.anime_name_en ||
                          rel.anime_name_roman}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {rel.airing_type || "TV"} · {rel.release_year || "TBA"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  {anime.system_id}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-8">
          {/* Header & Titles (no card wrapper) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {anime.airing_status && (
                <span
                  className={`${airingStatusColor} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {anime.airing_status}
                </span>
              )}
              {anime.airing_type && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {anime.airing_type}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-500 bg-gray-50 py-2 px-3 rounded-lg border border-gray-200 inline-flex mb-6">
              <div>
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
                    <i className="fas fa-unlink mr-1.5"></i>Independent
                  </span>
                )}
              </div>
              <div className="hidden sm:block text-gray-300">|</div>
              <div>
                {series ? (
                  <span>
                    <i className="fas fa-layer-group text-purple-400/50 mr-1.5"></i>
                    <button
                      onClick={() => setShowSeriesModal(true)}
                      className="font-medium text-purple-600 hover:text-purple-800 hover:underline transition bg-transparent border-none cursor-pointer p-0"
                    >
                      {seriesName}
                    </button>
                  </span>
                ) : (
                  <span className="text-gray-400">
                    <i className="fas fa-minus mr-1.5"></i>No Series Hub
                  </span>
                )}
              </div>
            </div>

            {/* Quick Stats: Scores */}
            <ScoreBlock
              malScore={anime.mal_rating}
              malRank={anime.mal_rank}
              anilistScore={anime.anilist_rating}
              updatedAt={anime.updated_at}
            />
          </div>

          {/* My Tracker Block */}
          <MyTrackerCard
            epFin={epFin}
            epTotal={epTotal}
            hasCum={hasCum}
            cumFin={cumFin}
            cumTotal={cumTotal}
            watchingStatus={anime.watching_status}
            myRating={anime.my_rating}
            isAdmin={isAdmin}
            onEpChange={(v) =>
              performUpdate({ ep_fin: v }, "Episode progress saved")
            }
            onStatusChange={(v) =>
              performUpdate({ watching_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performUpdate({ my_rating: v }, "Rating saved")
            }
            statusOptions={WATCHING_STATUSES}
            ratingOptions={MY_RATINGS}
          />

          {/* Naming / Information / Production (stacked) */}
          <div className="space-y-6">
            <NamingCard
              cn={anime.anime_name_cn}
              en={anime.anime_name_en}
              alt={anime.anime_name_alt}
              jp={anime.anime_name_jp}
              roman={anime.anime_name_roman}
            />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "本傳/外傳", value: anime.is_main },
                  { label: "Season Part", value: anime.season_part },
                  { label: "Special Episodes", value: anime.ep_special },
                  { label: "Total Episodes", value: epTotalDisplay },
                ],
                [
                  { label: "Airing Type", value: anime.airing_type },
                  { label: "Airing Status", value: anime.airing_status },
                  { label: "Release Season", value: releaseSeasonYear },
                  { label: "Release Date", value: releaseMonthYear },
                ],
                { label: "Genre (Main)", value: anime.genre_main },
                { label: "Genre (Sub)", value: anime.genre_sub },
              ]}
            />
            <InfoCard
              title="Production"
              icon="fa-video"
              fields={[
                [
                  { label: "Studio", value: anime.studio },
                  { label: "台灣代理", value: anime.distributor_tw },
                ],
                [
                  { label: "Director", value: anime.director },
                  { label: "Producer", value: anime.producer },
                ],
                { label: "Music", value: anime.music },
              ]}
            />
          </div>

          {/* Notes Section: Cast & Characters + Music */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cast & Characters (Under Development) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 shrink-0">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-users text-brand mr-2"></i>Cast &
                  Characters
                </h3>
              </div>
              <div className="p-6 flex flex-col items-center justify-center text-center flex-1 bg-gray-50/50 min-h-[180px]">
                <i className="fas fa-tools text-3xl text-brand/30 mb-3"></i>
                <p className="text-sm font-bold text-gray-600">
                  Under Development
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                  Character & Staff tracking pipeline is currently being
                  engineered.
                </p>
              </div>
            </div>

            {/* Music & OP/ED */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-music text-brand mr-2"></i>Music & OP/ED
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label: "OP (Opening)", field: "op", value: anime.op },
                  { label: "ED (Ending)", field: "ed", value: anime.ed },
                  {
                    label: "Insert / OST",
                    field: "insert_ost",
                    value: anime.insert_ost,
                  },
                ].map(({ label, field, value }) => (
                  <div key={field} className="space-y-1">
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      {label}
                    </label>
                    <select
                      value={value || ""}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        isAdmin &&
                        performUpdate(
                          { [field]: e.target.value },
                          `${label} saved`,
                        )
                      }
                      className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                    >
                      <option value="">-</option>
                      {MUSIC_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Notes & Remarks */}
          {anime.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Rough
                  Notes & Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={anime.system_id}
                  defaultValue={anime.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin &&
                    performUpdate({ remark: e.target.value }, "Remark saved")
                  }
                  rows={5}
                  placeholder="Add private overview notes, specific remarks, etc."
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                ></textarea>
              </div>
            </div>
          )}

          {/* Structured Notes */}
          <AnimeNotes
            key={anime.system_id}
            anime={anime}
            isAdmin={isAdmin}
            onSave={(updatedNotes) =>
              performUpdate({ notes: updatedNotes }, "Notes saved")
            }
          />
        </div>
      </div>

      {/* Series Modal */}
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
