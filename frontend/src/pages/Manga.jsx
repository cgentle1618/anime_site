import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/anime";
import InfoCard from "../components/InfoCard";
import NamingCard from "../components/NamingCard";
import SourcesCard from "../components/SourcesCard";
import ScoreBlock from "../components/ScoreBlock";
import SeriesModal from "../components/SeriesModal";
import MangaNotes from "./MangaNotes";

const READING_STATUSES = [
  "Might Read",
  "Plan to Read",
  "Active Reading",
  "Passive Reading",
  "Paused",
  "Temp Dropped",
  "Dropped",
  "Won't Read",
  "Completed",
];
const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function serializationStatusColor(status) {
  if (status === "連載中") return "bg-green-100 text-green-700 border border-green-200";
  if (status === "完結") return "bg-blue-100 text-blue-700 border border-blue-200";
  if (status === "腰斬") return "bg-red-100 text-red-700 border border-red-200";
  if (status === "停更") return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-gray-100 text-gray-600 border border-gray-200";
}

function MangaTrackerBlock({
  manga,
  isAdmin,
  onChChange,
  onVolChange,
  onPageChange,
  onStatusChange,
  onRatingChange,
}) {
  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  const chFin = manga.ch_fin ?? 0;
  const chTotal = manga.ch_total != null ? manga.ch_total : null;
  const volFin = manga.vol_fin ?? 0;
  const volTotal = manga.vol_total != null ? manga.vol_total : null;
  const volFinPage = manga.vol_fin_page ?? 0;

  function stepCh(delta) {
    if (!isAdmin) return;
    let next = (chFin || 0) + delta;
    if (chTotal !== null && next > chTotal) next = chTotal;
    if (next < 0) next = 0;
    if (next === chFin) return;
    onChChange(next);
  }

  function stepVol(delta) {
    if (!isAdmin) return;
    let next = (volFin || 0) + delta;
    if (volTotal !== null && next > volTotal) next = volTotal;
    if (next < 0) next = 0;
    if (next === volFin) return;
    onVolChange(next);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-brand">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3.5">
        <h3 className="font-bold text-gray-800 text-lg flex items-center">
          <i className="fas fa-book-reader text-brand mr-2"></i>My Tracker
        </h3>
      </div>
      <div className="p-5 space-y-5">
        {/* Chapter progress */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Chapters
          </div>
          <div className="flex items-center bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-fit">
            <button
              onClick={() => stepCh(-1)}
              disabled={!isAdmin}
              className="w-8 h-8 shrink-0 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition flex items-center justify-center disabled:opacity-40"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <div className="font-mono font-bold text-sm tracking-wide flex items-baseline justify-center px-2 min-w-[90px] whitespace-nowrap">
              <input
                type="number"
                value={chFin}
                disabled={!isAdmin}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseInt(e.target.value, 10) || 0;
                  if (chTotal !== null && v > chTotal) return;
                  onChChange(Math.max(0, v));
                }}
                className="text-gray-900 w-12 text-right bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60"
              />
              <span className="text-gray-400 mx-1 text-xs">/</span>
              <span className="text-gray-500 text-sm leading-none">
                {chTotal ?? "?"}
              </span>
              <span className="text-[9px] text-gray-400 font-sans ml-1.5">CH</span>
            </div>
            <button
              onClick={() => stepCh(1)}
              disabled={!isAdmin}
              className="w-8 h-8 shrink-0 rounded bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center disabled:opacity-40"
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </div>

        {/* Volume progress */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Volumes
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
              <button
                onClick={() => stepVol(-1)}
                disabled={!isAdmin}
                className="w-8 h-8 shrink-0 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition flex items-center justify-center disabled:opacity-40"
              >
                <i className="fas fa-minus text-xs"></i>
              </button>
              <div className="font-mono font-bold text-sm tracking-wide flex items-baseline justify-center px-2 min-w-[90px] whitespace-nowrap">
                <input
                  type="number"
                  value={volFin}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    if (!isAdmin) return;
                    const v = parseInt(e.target.value, 10) || 0;
                    if (volTotal !== null && v > volTotal) return;
                    onVolChange(Math.max(0, v));
                  }}
                  className="text-gray-900 w-12 text-right bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60"
                />
                <span className="text-gray-400 mx-1 text-xs">/</span>
                <span className="text-gray-500 text-sm leading-none">
                  {volTotal ?? "?"}
                </span>
                <span className="text-[9px] text-gray-400 font-sans ml-1.5">VOL</span>
              </div>
              <button
                onClick={() => stepVol(1)}
                disabled={!isAdmin}
                className="w-8 h-8 shrink-0 rounded bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center disabled:opacity-40"
              >
                <i className="fas fa-plus text-xs"></i>
              </button>
            </div>
            {/* Pages input */}
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                Page
              </span>
              <input
                type="number"
                value={volFinPage}
                disabled={!isAdmin}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseInt(e.target.value, 10) || 0;
                  onPageChange(Math.max(0, v));
                }}
                className="w-14 text-right font-mono font-bold text-sm bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60"
              />
            </div>
          </div>
          {(volFin > 0 || volFinPage > 0) && (
            <div className="text-xs text-gray-500 mt-1.5 font-medium">
              Vol. {volFin}{volFinPage > 0 ? ` Page ${volFinPage}` : ""}{" "}
              {volTotal != null ? `/ Vol. ${volTotal}` : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Reading Status */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Reading Status
            </label>
            <select
              value={manga.reading_status || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onStatusChange(e.target.value)}
              className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
            >
              {READING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {/* My Rating */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Rating
            </label>
            <select
              value={manga.my_rating || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onRatingChange(e.target.value)}
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
        </div>
      </div>
    </div>
  );
}

export default function Manga() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [manga, setManga] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [series, setSeries] = useState(null);
  const [prequel, setPrequel] = useState(null);
  const [sequel, setSequel] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, fRes, sRes] = await Promise.all([
        fetch(`/api/manga/${system_id}`, { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
      ]);
      if (!mRes.ok) throw new Error("Manga not found");
      const m = await mRes.json();
      const allFranchises = await fRes.json();
      const allSeries = await sRes.json();

      setManga(m);
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

      const relatedFetches = [];
      if (m.prequel_id)
        relatedFetches.push(
          fetch(`/api/manga/${m.prequel_id}`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        );
      if (m.sequel_id)
        relatedFetches.push(
          fetch(`/api/manga/${m.sequel_id}`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        );
      const results = await Promise.all(relatedFetches);
      setPrequel(m.prequel_id ? results[0] || null : null);
      setSequel(m.sequel_id ? results[m.prequel_id ? 1 : 0] || null : null);
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
    setManga((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(`/api/manga/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const fresh = await fetch(`/api/manga/${system_id}`, {
        credentials: "include",
      });
      setManga(await fresh.json());
    } catch {
      showToast("error", "Update failed");
      load();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(`/api/data-control/replace/manga/${system_id}`, {
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

  if (error || !manga) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Manga</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const titleMain =
    manga.manga_name_cn ||
    manga.manga_name_en ||
    manga.manga_name_roman ||
    manga.manga_name_jp ||
    manga.manga_name_alt ||
    "Unknown";
  const titleSub =
    manga.manga_name_en && manga.manga_name_en !== titleMain
      ? manga.manga_name_en
      : null;

  const imageUrl = getCoverUrl(manga.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const relatedEntries = [];
  if (prequel)
    relatedEntries.push({ entry: prequel, tag: "Prequel", color: "text-orange-500" });
  if (sequel)
    relatedEntries.push({ entry: sequel, tag: "Sequel", color: "text-green-500" });

  // Extract twitter from source_other so SourcesCard renders it as a dedicated button
  const rawSourceOther = manga.source_other || {};
  const twitterLink = rawSourceOther.Twitter || rawSourceOther.twitter || null;
  const filteredSourceOther = Object.fromEntries(
    Object.entries(rawSourceOther).filter(
      ([k]) => k.toLowerCase() !== "twitter",
    ),
  );

  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  const authorSame =
    manga.author_plot &&
    manga.author_draw &&
    manga.author_plot === manga.author_draw;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb */}
      <nav className="flex text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-2">
          <li>
            <Link to="/library/manga" className="hover:text-brand transition">
              <i className="fas fa-book mr-1.5"></i>Manga
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
              onClick={() => navigate(`/modify?id=${system_id}&type=manga`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={() =>
                performPatch(
                  { reading_status: "Completed" },
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

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster */}
          <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
            {manga.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {manga.my_rating}
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
            officialSource={manga.serialization_platform}
            twitterLink={twitterLink}
            malLink={manga.mal_link}
            anilistLink={manga.anilist_link}
            sourceOther={
              Object.keys(filteredSourceOther).length > 0
                ? filteredSourceOther
                : null
            }
          />

          {/* Watch Order */}
          {manga.watch_order != null && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2">
                <i className="fas fa-sort-numeric-up mr-1.5"></i>Read Order
              </h3>
              <div className="text-2xl font-black text-brand text-center py-1">
                #{manga.watch_order}
              </div>
            </div>
          )}

          {/* Related Entries */}
          {relatedEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                <i className="fas fa-project-diagram mr-1.5"></i>Related Entries
              </h3>
              <div className="flex flex-col gap-3">
                {relatedEntries.map(({ entry: rel, tag, color }) => {
                  const relTitle =
                    rel.manga_name_cn ||
                    rel.manga_name_en ||
                    rel.manga_name_roman ||
                    rel.manga_name_jp ||
                    rel.manga_name_alt ||
                    "Unknown";
                  return (
                    <div
                      key={`${tag}-${rel.system_id}`}
                      onClick={() => navigate(`/manga/${rel.system_id}`)}
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
                          {relTitle}
                        </div>
                        {rel.release_year && (
                          <div className="text-[10px] text-gray-500">
                            {rel.release_year}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  {manga.system_id}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {manga.region && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {manga.region}
                </span>
              )}
              {manga.serialization_status && (
                <span
                  className={`${serializationStatusColor(manga.serialization_status)} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {manga.serialization_status}
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

            {/* Score Block */}
            <ScoreBlock
              malScore={manga.mal_rating}
              malRank={manga.mal_rank}
              anilistScore={manga.anilist_rating}
              updatedAt={manga.updated_at}
            />
          </div>

          {/* My Tracker Block */}
          <MangaTrackerBlock
            manga={manga}
            isAdmin={isAdmin}
            onChChange={(v) => performPatch({ ch_fin: v }, "Chapter progress saved")}
            onVolChange={(v) => performPatch({ vol_fin: v }, "Volume progress saved")}
            onPageChange={(v) => performPatch({ vol_fin_page: v }, "Page saved")}
            onStatusChange={(v) => performPatch({ reading_status: v }, "Status updated")}
            onRatingChange={(v) => performPatch({ my_rating: v || null }, "Rating saved")}
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard
              cn={manga.manga_name_cn}
              en={manga.manga_name_en}
              jp={manga.manga_name_jp}
              roman={manga.manga_name_roman}
              alt={manga.manga_name_alt}
            />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "Region", value: manga.region },
                  { label: "本傳 / 外傳", value: manga.is_main },
                ],
                [
                  {
                    label: "Serialization Status",
                    value: manga.serialization_status,
                  },
                  {
                    label: "Serialization Platform",
                    value: manga.serialization_platform,
                  },
                ],
                [
                  { label: "Release Year", value: manga.release_year != null ? String(manga.release_year) : null },
                  { label: "End Year", value: manga.end_year != null ? String(manga.end_year) : null },
                ],
                [
                  { label: "Volume Total", value: manga.vol_total != null ? String(manga.vol_total) : null },
                  { label: "Chapter Total", value: manga.ch_total != null ? String(manga.ch_total) : null },
                ],
                [
                  { label: "Anime Studio", value: manga.anime_studio },
                  { label: "Distributor TW", value: manga.distributor_tw },
                ],
              ]}
            />
            {/* Production Card */}
            {(manga.author_plot || manga.author_draw || manga.anime_studio) && (
              <InfoCard
                title="Production"
                icon="fa-pen-nib"
                fields={[
                  ...(authorSame
                    ? [{ label: "作者", value: manga.author_plot }]
                    : [
                        ...(manga.author_plot
                          ? [{ label: "原作", value: manga.author_plot }]
                          : []),
                        ...(manga.author_draw
                          ? [{ label: "作畫", value: manga.author_draw }]
                          : []),
                      ]),
                ]}
              />
            )}
          </div>

          {/* Remarks */}
          {(manga.remark || isAdmin) && manga.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={manga.system_id}
                  defaultValue={manga.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin &&
                    performPatch({ remark: e.target.value || null }, "Remark saved")
                  }
                  rows={4}
                  placeholder="Add remarks..."
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                ></textarea>
              </div>
            </div>
          )}

          {/* Structured Notes */}
          <MangaNotes
            key={manga.system_id}
            manga={manga}
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
