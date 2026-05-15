import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";
import InfoCard from "../components/info/InfoCard";
import NamingCard from "../components/info/NamingCard";
import SourcesCard from "../components/info/SourcesCard";
import MyTrackerCard from "../components/tracker/MyTrackerCard";
import SeriesModal from "../components/modals/SeriesModal";
import CartoonNotes from "./CartoonNotes";
import MediaLoadingState from "../components/layout/MediaLoadingState";
import { useMediaCacheUpdate } from "../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../hooks/useMediaItem";
import { useMediaList } from "../hooks/useMediaList";

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
const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Cartoon() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [cartoon, setCartoon] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  const cartoonQuery = useMediaItem("cartoon", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allCartoonsQuery = useMediaList("cartoon", LIST_OPTIONS);
    enabled: !!cartoon?.prequel_id,
  });
  const sequelQuery = useMediaItem("cartoon", cartoon?.sequel_id, {
    enabled: !!cartoon?.sequel_id,
  });
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("cartoon", system_id);

  useEffect(() => {
    if (cartoonQuery.data) setCartoon(cartoonQuery.data);
  }, [cartoonQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      cartoon?.franchise_id
        ? franchises.find((f) => f.system_id === cartoon.franchise_id) || null
        : null,
    [cartoon?.franchise_id, franchises],
  );
  const series = useMemo(
    () =>
      cartoon?.series_id
        ? seriesList.find((s) => s.system_id === cartoon.series_id) || null
        : null,
    [cartoon?.series_id, seriesList],
  );
  const prequel = prequelQuery.data || null;
  const sequel = sequelQuery.data || null;
  const loading =
    cartoonQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    cartoonQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setCartoon((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(`/api/cartoon/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setCartoon(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(
        `/api/data-control/replace/cartoon/${system_id}`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", "Autofill completed");
      await invalidateMedia();
      await fetchMediaItem();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setAutofilling(false);
    }
  }

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !cartoon) {
    return (
      <MediaLoadingState
        error={error || "Cartoon not found"}
        errorTitle="Error Loading Cartoon"
      />
    );
  }

  const titleMain =
    cartoon.cartoon_name_cn ||
    cartoon.cartoon_name_en ||
    cartoon.cartoon_name_alt ||
    "Unknown";
  const titleSub =
    cartoon.cartoon_name_en && cartoon.cartoon_name_en !== titleMain
      ? cartoon.cartoon_name_en
      : null;

  const imageUrl = getCoverUrl(cartoon.cover_image_file);

  let airingStatusColor = "bg-gray-100 text-gray-600 border border-gray-200";
  if (cartoon.airing_status === "Airing")
    airingStatusColor = "bg-green-100 text-green-700 border border-green-200";
  else if (cartoon.airing_status === "Finished Airing")
    airingStatusColor = "bg-blue-100 text-blue-700 border border-blue-200";
  else if (cartoon.airing_status === "Not Yet Aired")
    airingStatusColor =
      "bg-orange-100 text-orange-700 border border-orange-200";

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const relatedEntries = [];
  if (prequel)
    relatedEntries.push({
      entry: prequel,
      tag: "Prequel",
      color: "text-orange-500",
    });
  if (sequel)
    relatedEntries.push({
      entry: sequel,
      tag: "Sequel",
      color: "text-green-500",
    });

  const epFin = cartoon.ep_fin ?? 0;
  const epTotal =
    cartoon.ep_total !== null && cartoon.ep_total !== undefined
      ? cartoon.ep_total
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
            <Link to="/library/cartoon" className="hover:text-brand transition">
              <i className="fas fa-tv mr-1.5"></i>Cartoons
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
              onClick={() => navigate(`/modify?id=${system_id}&type=cartoon`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(`/api/cartoon/${system_id}/complete`, {
                    method: "POST",
                    credentials: "include",
                  });
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
            {cartoon.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {cartoon.my_rating}
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
            sourceOther={cartoon.source_other}
            officialSource={cartoon.source_official}
            imdbLink={cartoon.imdb_link}
          />

          {/* Watch Order */}
          {cartoon.watch_order != null && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2">
                <i className="fas fa-sort-numeric-up mr-1.5"></i>Watch Order
              </h3>
              <div className="text-2xl font-black text-brand text-center py-1">
                #{cartoon.watch_order}
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
                    rel.cartoon_name_cn ||
                    rel.cartoon_name_en ||
                    rel.cartoon_name_alt ||
                    "Unknown";
                  return (
                    <div
                      key={`${tag}-${rel.system_id}`}
                      onClick={() => navigate(`/cartoon/${rel.system_id}`)}
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
                        {rel.season_part && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {rel.season_part}
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
                  {cartoon.system_id}
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
              {cartoon.airing_type && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {cartoon.airing_type}
                </span>
              )}
              {cartoon.airing_status && (
                <span
                  className={`${airingStatusColor} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {cartoon.airing_status}
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

            {/* IMDb Score + Updated */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="bg-yellow-50 text-yellow-800 border border-yellow-100 px-4 py-2 rounded-lg flex items-center shadow-sm">
                <i className="fas fa-star text-yellow-500 mr-2 text-lg"></i>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 leading-none mb-0.5">
                    IMDb Score
                  </div>
                  <div className="font-black text-base leading-none">
                    {cartoon.imdb_rating && cartoon.imdb_rating !== "N/A"
                      ? cartoon.imdb_rating
                      : "-"}
                  </div>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Last Updated
                </div>
                <div className="text-sm font-mono text-gray-600">
                  {cartoon.updated_at
                    ? new Date(cartoon.updated_at).toLocaleString()
                    : "-"}
                </div>
              </div>
            </div>
          </div>

          {/* My Tracker Block */}
          <MyTrackerCard
            epFin={epFin}
            epTotal={epTotal ?? "?"}
            watchingStatus={cartoon.watching_status}
            myRating={cartoon.my_rating}
            watchNext={cartoon.watch_next}
            toRewatch={cartoon.to_rewatch}
            isAdmin={isAdmin}
            onEpChange={(v) =>
              performPatch({ ep_fin: v }, "Episode progress saved")
            }
            onStatusChange={(v) =>
              performPatch({ watching_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v }, "Rating saved")
            }
            onWatchNextChange={(v) =>
              performPatch(
                { watch_next: v },
                v ? "Added to Watch Next" : "Removed from Watch Next",
              )
            }
            onToRewatchChange={(v) =>
              performPatch(
                { to_rewatch: v },
                v ? "Marked for rewatch" : "Removed from rewatch",
              )
            }
            statusOptions={WATCHING_STATUSES}
            ratingOptions={MY_RATINGS}
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="cartoon" item={cartoon} />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "本傳 / 外傳", value: cartoon.is_main },
                  { label: "Season", value: cartoon.season_part },
                ],
                [
                  { label: "Airing Type", value: cartoon.airing_type },
                  { label: "Airing Status", value: cartoon.airing_status },
                ],
                [
                  {
                    label: "Length Per Ep (min)",
                    value:
                      cartoon.length_ep_min != null
                        ? String(cartoon.length_ep_min)
                        : null,
                  },
                  { label: "Official Source", value: cartoon.source_official },
                ],
                [
                  { label: "Release Date", value: cartoon.release_date },
                  {
                    label: "Total Ep",
                    value:
                      cartoon.ep_total != null
                        ? String(cartoon.ep_total)
                        : null,
                  },
                ],
              ]}
            />
          </div>

          {/* Remarks */}
          {cartoon.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={cartoon.system_id}
                  defaultValue={cartoon.remark || ""}
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

          {/* Structured Notes */}
          <CartoonNotes
            key={cartoon.system_id}
            cartoon={cartoon}
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
