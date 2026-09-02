// Frontend: page component file for Comic.
import { useState, useEffect, useMemo } from "react";
import { releaseYear } from "../../lib/releaseDate";
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
import {
  Button,
  Chip,
  Eyebrow,
  ProgressRule,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
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
  "Completed (解說)",
];
const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

const LIST_OPTIONS = { params: { limit: 2000 } };

const textareaCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

/**
 * events is a comma-joined multi-select. Chips rather than a comma string:
 * a Krakoan run can carry nine of them, and the list is the main thing that
 * places a run inside the era.
 */
function EventsCard({ events }) {
  return (
    <Slip title="Events">
      <div className="flex flex-wrap gap-2">
        {events.map((ev) => (
          <Chip key={ev}>{ev}</Chip>
        ))}
      </div>
    </Slip>
  );
}

export default function Comic() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
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

  const startYear = releaseYear(comic.release_date);
  const endYear = releaseYear(comic.end_date);
  const yearRange = startYear
    ? `${startYear}${endYear && endYear !== startYear ? ` – ${endYear}` : ""}`
    : null;

  const issueFin = comic.issue_fin ?? 0;
  const issueTotal = comic.issue_total != null ? comic.issue_total : null;
  const progress = issueTotal ? issueFin / issueTotal : issueFin > 0 ? 1 : 0;
  const progressPct = issueTotal ? Math.round(progress * 100) : null;

  const eyebrow = [
    "Comic",
    comic.comic_type,
    comic.era,
    comic.serialization_status,
    comic.is_main_entry ? "Main line" : null,
    yearRange,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/comic" className="hover:text-brand transition">
          Comic
        </Link>
        {franchise && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              to={`/franchise/${franchise.system_id}`}
              className="hover:text-brand transition truncate max-w-xs normal-case tracking-normal"
            >
              {franchiseName}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {titleMain}
        </span>
      </nav>

      {/* Admin toolbar — no Autofill: comics are manual-entry, with no
          external metadata source to pull from. */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">
            Admin
          </Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=comic`)}>
              Quick edit
            </Button>
            <Button
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
            >
              Mark completed
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
                Comic{comic.comic_type ? ` · ${comic.comic_type}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {comic.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={comic.my_rating}
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
                <span>Issues</span>
                <span className="text-text">
                  {issueFin} / {issueTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          <SourcesCard
            sourceOther={Object.keys(sourceOther).length > 0 ? sourceOther : null}
          />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header */}
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <div className="flex items-baseline gap-4 flex-wrap mb-2">
              <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95]">
                {titleMain}
              </h1>
              {comic.volume_label && (
                <span className="font-mono text-xl text-text-faint">
                  {comic.volume_label}
                </span>
              )}
            </div>
            {titleSub && (
              <h2 className="text-lg text-text-muted font-normal mb-4">
                {titleSub}
              </h2>
            )}

            {/* Franchise / Series lineage */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
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
                    {getDisplayName(series, "series")}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>
          </header>

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
            toRewatch={comic.to_reread}
            onToRewatchChange={(v) =>
              performPatch(
                { to_reread: v },
                v ? "Marked for reread" : "Removed from reread",
              )
            }
            rewatchLabel="To Reread"
            statusOptions={READING_STATUSES}
            ratingOptions={MY_RATINGS}
            statusLabel="Reading Status"
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="comic" item={comic} />
            <InfoCard
              title="Information"
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
            <Slip title="Remarks">
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
                placeholder="Add remarks…"
                className={textareaCls}
              ></textarea>
            </Slip>
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
