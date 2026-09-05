// Frontend: page component file for Cartoon.
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
import CartoonNotes from "./CartoonNotes";
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

export default function Cartoon() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [cartoon, setCartoon] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const cartoonQuery = useMediaItem("cartoon", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allCartoonsQuery = useMediaList("cartoon", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "cartoon",
    system_id,
  );

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
      const res = await fetch(endpoints.resource("cartoon").patch(system_id), {
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
        endpoints.dataControl.replaceSingle("cartoon", system_id),
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

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const epFin = cartoon.ep_fin ?? 0;
  const epTotal =
    cartoon.ep_total !== null && cartoon.ep_total !== undefined
      ? cartoon.ep_total
      : null;
  const progress = epTotal ? epFin / epTotal : epFin > 0 ? 1 : 0;
  const progressPct = epTotal ? Math.round(progress * 100) : null;

  const eyebrow = [
    "Cartoon",
    cartoon.airing_type,
    cartoon.airing_status,
    cartoon.season_part,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const imdbScore =
    cartoon.imdb_rating && cartoon.imdb_rating !== "N/A"
      ? cartoon.imdb_rating
      : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/cartoon" className="hover:text-brand transition">
          Cartoons
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
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=cartoon`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(
                    endpoints.resource("cartoon").complete(system_id),
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
                Cartoon{cartoon.airing_type ? ` · ${cartoon.airing_type}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {cartoon.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={cartoon.my_rating}
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
            sources={cartoon.sources}
            mediaType="tv-show"
            imdbLink={cartoon.imdb_link}
            originalSource={cartoon.original_source}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="cartoon" entryId={cartoon.system_id} />
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
              {cartoon.updated_at && (
                <div className="ml-auto text-right">
                  <Eyebrow>Last updated</Eyebrow>
                  <div className="font-mono text-xs text-text-muted mt-1">
                    {new Date(cartoon.updated_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* My Tracker Block */}
          <MyTrackerCard
            epFin={epFin}
            epTotal={epTotal ?? "?"}
            watchingStatus={cartoon.watching_status}
            myRating={cartoon.my_rating}
            watchNext={cartoon.watch_next}
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
            statusOptions={WATCHING_STATUSES}
            ratingOptions={MY_RATINGS}
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="cartoon" item={cartoon} />
            <InfoCard
              title="Information"
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
            <Slip title="Remarks">
              <textarea
                key={cartoon.system_id}
                defaultValue={cartoon.remark || ""}
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
          <CartoonNotes
            key={cartoon.system_id}
            cartoon={cartoon}
            isAdmin={isAdmin}
            hideSections={cartoon.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
