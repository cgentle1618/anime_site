// Frontend: page component file for TV.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import RelationsSection from "../../components/tracker/RelationsSection";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import TVShowNotes from "./TVShowNotes";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import {
  Button,
  Eyebrow,
  ProgressRule,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { WATCHING_STATUSES } from "../../config/fieldOptions";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];
const LIST_OPTIONS = { params: { limit: 2000 } };

const textareaCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

export default function TV() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [show, setShow] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const showQuery = useMediaItem("tv-show", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allShowsQuery = useMediaList("tv-show", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "tv-show",
    system_id,
  );

  useEffect(() => {
    if (showQuery.data) setShow(showQuery.data);
  }, [showQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      show?.franchise_id
        ? franchises.find((f) => f.system_id === show.franchise_id) || null
        : null,
    [franchises, show?.franchise_id],
  );
  const series = useMemo(
    () =>
      show?.series_id
        ? seriesList.find((s) => s.system_id === show.series_id) || null
        : null,
    [seriesList, show?.series_id],
  );
  const loading =
    showQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    showQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setShow((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("tv-show").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setShow(updated);
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
        endpoints.dataControl.replaceSingle("tv-show", system_id),
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

  if (error || !show) {
    return (
      <MediaLoadingState
        error={error || "TV show not found"}
        errorTitle="Error Loading TV Show"
      />
    );
  }

  const titleMain =
    show.tv_name_cn || show.tv_name_en || show.tv_name_alt || "Unknown";
  const titleSub =
    show.tv_name_en && show.tv_name_en !== titleMain ? show.tv_name_en : null;

  const imageUrl = getCoverUrl(show.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const sourceOtherDict = show.source_other || null;

  const epFin = show.ep_fin ?? 0;
  const epTotal =
    show.ep_total !== null && show.ep_total !== undefined
      ? show.ep_total
      : null;
  const progress =
    epTotal ? epFin / epTotal : epFin > 0 ? 1 : 0;
  const progressPct = epTotal ? Math.round(progress * 100) : null;

  const eyebrow = ["TV show", show.season_part, show.region, show.airing_status]
    .filter(Boolean)
    .join("  ·  ");

  const imdbScore =
    show.imdb_rating && show.imdb_rating !== "N/A" ? show.imdb_rating : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/tv-show" className="hover:text-brand transition">
          TV shows
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {titleMain}
        </span>
      </nav>

      {/* Admin toolbar: a plain instrument strip */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">
            Admin
          </Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=tv-show`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(
                    endpoints.resource("tv-show").complete(system_id),
                    {
                      method: "POST",
                      credentials: "include",
                    },
                  );
                  if (!res.ok) throw new Error("Request failed");
                  showToast("success", "Marked as Completed!");
                  await invalidateMedia();
                  await fetchMediaItem();
                } catch {
                  showToast("error", "Update failed");
                }
              }}
            >
              Mark completed
            </Button>
            <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
              {autofilling ? "Autofilling…" : "Autofill & update"}
            </Button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster: cover with a spine strip and the rating stamp */}
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center justify-between py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                TV{show.season_part ? ` · ${show.season_part}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {show.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={show.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <img
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
              {/* Progress rule along the bottom edge of the cover */}
              <ProgressRule value={progress} />
              <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <span>Progress</span>
                <span className="text-text">
                  {epFin} / {epTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sourceOther={sourceOtherDict}
            officialSource={show.source_official}
            imdbLink={show.imdb_link}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="tv-show" entryId={show.system_id} />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header */}
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {titleMain}
            </h1>
            {titleSub && (
              <h2 className="text-lg text-text-muted font-normal mb-4">
                {titleSub}
              </h2>
            )}

            {/* Franchise / Series lineage */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm mb-8 pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Franchise</Eyebrow>
                {franchise ? (
                  <Link to={`/franchise/${franchise.system_id}`} className={lineageLinkCls}>
                    {franchiseName}
                  </Link>
                ) : (
                  <span className="text-text-faint">Independent</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <Eyebrow>Series</Eyebrow>
                {series ? (
                  <Link to={`/series/${series.system_id}`} className={lineageLinkCls}>
                    {series.series_name_cn ||
                      series.series_name_en ||
                      series.series_name_alt}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>

            {/* IMDb score: display figures on a hairline */}
            <div className="flex flex-wrap items-end gap-8 border-t border-b border-border py-3">
              <div>
                <Eyebrow>IMDb score</Eyebrow>
                <div className="font-display text-3xl font-semibold text-text leading-none mt-1">
                  {imdbScore}
                </div>
              </div>
              {/* Absent, not blanked: an em-dash would announce a
                  withheld date. See ScoreBlock for the shared version. */}
              {show.updated_at && (
                <div className="ml-auto text-right">
                  <Eyebrow>Last updated</Eyebrow>
                  <div className="font-mono text-xs text-text-muted mt-1">
                    {new Date(show.updated_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* My Tracker Block */}
          <MyTrackerCard
            epFin={epFin}
            epTotal={epTotal ?? "?"}
            watchingStatus={show.watching_status}
            myRating={show.my_rating}
            watchNext={show.watch_next}
            toRewatch={show.to_rewatch}
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
            <NamingCard type="tv-show" item={show} />
            <InfoCard
              title="Information"
              fields={[
                [
                  { label: "本傳 / 外傳", value: show.is_main },
                  { label: "Season", value: show.season_part },
                ],
                [
                  {
                    label: "Total Ep",
                    value: show.ep_total != null ? String(show.ep_total) : null,
                  },
                  { label: "Official Source", value: show.source_official },
                ],
                [
                  { label: "Airing Status", value: show.airing_status },
                  { label: "Release Date", value: show.release_date },
                ],
              ]}
            />
          </div>

          {/* Remarks */}
          {show.remark && (
            <Slip title="Remarks">
              <textarea
                key={show.system_id}
                defaultValue={show.remark || ""}
                disabled={!isAdmin}
                onBlur={(e) =>
                  isAdmin &&
                  performPatch({ remark: e.target.value }, "Remark saved")
                }
                rows={4}
                placeholder="Add remarks…"
                className={textareaCls}
              ></textarea>
            </Slip>
          )}

          {/* Structured Notes */}
          {/* The dedicated remark textarea above renders only when a remark
              exists; hide the notes page's `remark` section exactly then, so
              the singleton row never has two editors on one screen. */}
          <TVShowNotes
            key={show.system_id}
            show={show}
            isAdmin={isAdmin}
            hideSections={show.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
