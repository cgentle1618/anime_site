// Frontend: page component file for Comic.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
  parseTypes,
} from "../../utils/media";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import ComicNotes from "./ComicNotes";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";

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

const LIST_OPTIONS = { params: { limit: 2000 } };

function serializationStatusColor(status) {
  if (status === "連載中")
    return "bg-green-100 text-green-700 border border-green-200";
  if (status === "完結")
    return "bg-blue-100 text-blue-700 border border-blue-200";
  if (status === "腰斬") return "bg-red-100 text-red-700 border border-red-200";
  if (status === "停更")
    return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-gray-100 text-gray-600 border border-gray-200";
}

/**
 * events is a comma-joined multi-select. Chips rather than a comma string:
 * a Krakoan run can carry nine of them, and the list is the main thing that
 * places a run inside the era.
 */
function EventsCard({ events }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h3 className="font-bold text-gray-800">
          <i className="fas fa-bolt text-brand mr-2"></i>Events
        </h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {events.map((ev) => (
          <span
            key={ev}
            className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-md text-xs font-bold shadow-sm"
          >
            {ev}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Comic() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [comic, setComic] = useState(null);

  const comicQuery = useMediaItem("comic", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("comic", system_id);

  useEffect(() => {
    if (comicQuery.data) setComic(comicQuery.data);
  }, [comicQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      comic?.franchise_id
        ? franchises.find((f) => f.system_id === comic.franchise_id) || null
        : null,
    [franchises, comic?.franchise_id],
  );
  const series = useMemo(
    () =>
      comic?.series_id
        ? seriesList.find((s) => s.system_id === comic.series_id) || null
        : null,
    [comic?.series_id, seriesList],
  );

  const loading =
    comicQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    comicQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setComic((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("comic").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setComic(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !comic) {
    return (
      <MediaLoadingState
        error={error || "Comic not found"}
        errorTitle="Error Loading Comic"
      />
    );
  }

  // EN leads for comics; the CN title becomes the subtitle when it differs.
  const titleMain = getDisplayName(comic, "comic");
  const titleSub =
    comic.comic_name_cn && comic.comic_name_cn !== titleMain
      ? comic.comic_name_cn
      : null;

  const imageUrl = getCoverUrl(comic.cover_image_file);
  const events = parseTypes(comic.events);

  const franchiseName = franchise
    ? getDisplayName(franchise, "franchise")
    : null;

  const sourceOther = comic.source_other || {};

  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  const yearRange =
    comic.release_year != null
      ? `${comic.release_year}${
          comic.end_year && comic.end_year !== comic.release_year
            ? ` – ${comic.end_year}`
            : ""
        }`
      : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb */}
      <nav className="flex text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-2">
          <li>
            <Link to="/library/comic" className="hover:text-brand transition">
              <i className="fas fa-book-open mr-1.5"></i>Comic
            </Link>
          </li>
          {franchise && (
            <>
              <li>
                <i className="fas fa-chevron-right text-[10px]"></i>
              </li>
              <li>
                <Link
                  to={`/franchise/${franchise.system_id}`}
                  className="hover:text-brand transition"
                >
                  {franchiseName}
                </Link>
              </li>
            </>
          )}
          <li>
            <i className="fas fa-chevron-right text-[10px]"></i>
          </li>
          <li className="font-medium text-gray-900 truncate max-w-xs">
            {titleMain}
          </li>
        </ol>
      </nav>

      {/* Admin Toolbar — no Autofill: comics are manual-entry, with no
          external metadata source to pull from. */}
      {isAdmin && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between mb-8 shadow-sm">
          <div className="flex items-center text-brand font-bold text-sm uppercase tracking-wider">
            <i className="fas fa-shield-alt mr-2"></i> Admin Tools
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate(`/modify?id=${system_id}&type=comic`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(
                    endpoints.resource("comic").complete(system_id),
                    { method: "POST", credentials: "include" },
                  );
                  if (!res.ok) throw new Error("Request failed");
                  showToast("success", "Marked as Completed!");
                  await invalidateMedia();
                  await fetchMediaItem();
                } catch {
                  showToast("error", "Update failed");
                }
              }}
              className="bg-white hover:bg-green-50 border border-gray-200 text-gray-700 hover:text-green-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-check-double mr-2 text-green-500"></i> Mark
              Completed
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
            {comic.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {comic.my_rating}
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

          <SourcesCard
            sourceOther={Object.keys(sourceOther).length > 0 ? sourceOther : null}
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
                  {comic.system_id}
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
              {comic.is_main_entry && (
                <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider flex items-center">
                  <i className="fas fa-star text-[9px] mr-1.5"></i>Main Line
                </span>
              )}
              {comic.comic_type && (
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {comic.comic_type}
                </span>
              )}
              {comic.era && (
                <span className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {comic.era}
                </span>
              )}
              {comic.serialization_status && (
                <span
                  className={`${serializationStatusColor(comic.serialization_status)} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {comic.serialization_status}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap mb-1">
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
                {titleMain}
              </h1>
              {comic.volume_label && (
                <span className="font-mono text-xl text-gray-400 font-bold">
                  {comic.volume_label}
                </span>
              )}
            </div>
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
                    <Link
                      to={`/series/${series.system_id}`}
                      className="font-medium text-purple-600 hover:text-purple-800 hover:underline transition"
                    >
                      {getDisplayName(series, "series")}
                    </Link>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* My Tracker — comic tracks issues only, so the shared single-counter
              card fits without a comic-specific tracker block. */}
          <MyTrackerCard
            epFin={comic.issue_fin ?? 0}
            epTotal={comic.issue_total != null ? comic.issue_total : "?"}
            watchingStatus={comic.reading_status || "Might Read"}
            myRating={comic.my_rating}
            isAdmin={isAdmin}
            onEpChange={(v) =>
              performPatch({ issue_fin: v }, "Issue progress saved")
            }
            onStatusChange={(v) =>
              performPatch({ reading_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v || null }, "Rating saved")
            }
            statusOptions={READING_STATUSES}
            ratingOptions={MY_RATINGS}
            statusLabel="Reading Status"
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="comic" item={comic} />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "Type", value: comic.comic_type },
                  { label: "Volume Label", value: comic.volume_label },
                  { label: "Continuity", value: comic.continuity },
                ],
                [
                  { label: "Era", value: comic.era },
                  {
                    label: "Main Line",
                    value:
                      comic.is_main_entry == null
                        ? null
                        : comic.is_main_entry
                          ? "Yes"
                          : "No",
                  },
                ],
                [
                  {
                    label: "Serialization Status",
                    value: comic.serialization_status,
                  },
                  { label: "Reading Status", value: comic.reading_status },
                ],
                [
                  { label: "Release Year", value: yearRange },
                  {
                    label: "Issue Total",
                    value:
                      comic.issue_total != null
                        ? String(comic.issue_total)
                        : null,
                  },
                ],
              ]}
            />
            {events.length > 0 && <EventsCard events={events} />}
            {(comic.writer ||
              comic.artist ||
              comic.publisher ||
              comic.imprint ||
              comic.publisher_tw) && (
              <InfoCard
                title="Production"
                icon="fa-pen-nib"
                fields={[
                  ...(comic.writer
                    ? [{ label: "Writer", value: comic.writer }]
                    : []),
                  ...(comic.artist
                    ? [{ label: "Artist", value: comic.artist }]
                    : []),
                  ...(comic.publisher
                    ? [{ label: "Publisher", value: comic.publisher }]
                    : []),
                  ...(comic.imprint
                    ? [{ label: "Imprint", value: comic.imprint }]
                    : []),
                  ...(comic.publisher_tw
                    ? [{ label: "Publisher (TW)", value: comic.publisher_tw }]
                    : []),
                ]}
              />
            )}
          </div>

          {/* Remarks */}
          {comic.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={comic.system_id}
                  defaultValue={comic.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin &&
                    performPatch(
                      { remark: e.target.value || null },
                      "Remark saved",
                    )
                  }
                  rows={4}
                  placeholder="Add remarks..."
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                ></textarea>
              </div>
            </div>
          )}

          {/* Structured Notes — the remark textarea above renders only when a
              remark exists; hide the notes page's `remark` section exactly
              then, so the singleton row never has two editors on one screen. */}
          <ComicNotes
            key={comic.system_id}
            comic={comic}
            isAdmin={isAdmin}
            hideSections={comic.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
