// Frontend: page component file for Manga.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import RelationsSection from "../../components/tracker/RelationsSection";
import InfoCard from "../../components/info/InfoCard";
import { creditLabel, creditValue } from "../../components/info/PersonLinks";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import MangaNotes from "./MangaNotes";
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
import StatusOptions from "../../components/ui/StatusOptions";
import { READING_STATUSES } from "../../config/fieldOptions";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";
const stepBtnCls =
  "w-8 h-8 shrink-0 text-text-muted hover:text-text hover:bg-surface-2 transition flex items-center justify-center disabled:opacity-40";
const counterInputCls =
  "text-text w-12 text-right bg-transparent border-b border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60";

function MangaTrackerBlock({
  manga,
  isAdmin,
  onChChange,
  onVolChange,
  onPageChange,
  onStatusChange,
  onRatingChange,
  onWatchNextChange,
  onToRewatchChange,
}) {
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
    <Slip title="My tracker">
      <div className="space-y-5">
        {/* Chapter progress */}
        <div>
          <Eyebrow className="mb-2">Chapters</Eyebrow>
          <div className="flex items-center border border-border-strong w-fit">
            <button
              onClick={() => stepCh(-1)}
              disabled={!isAdmin}
              aria-label="Previous chapter"
              className={stepBtnCls}
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <div className="font-mono text-sm flex items-baseline justify-center px-2 min-w-[90px] whitespace-nowrap border-l border-r border-border">
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
                className={counterInputCls}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint text-sm leading-none">
                {chTotal ?? "?"}
              </span>
              <span className="text-[9px] text-text-faint ml-1.5 uppercase">
                ch
              </span>
            </div>
            <button
              onClick={() => stepCh(1)}
              disabled={!isAdmin}
              aria-label="Next chapter"
              className={`${stepBtnCls} text-brand`}
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </div>

        {/* Volume progress */}
        <div>
          <Eyebrow className="mb-2">Volumes</Eyebrow>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border border-border-strong">
              <button
                onClick={() => stepVol(-1)}
                disabled={!isAdmin}
                aria-label="Previous volume"
                className={stepBtnCls}
              >
                <i className="fas fa-minus text-xs"></i>
              </button>
              <div className="font-mono text-sm flex items-baseline justify-center px-2 min-w-[90px] whitespace-nowrap border-l border-r border-border">
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
                  className={counterInputCls}
                />
                <span className="text-text-faint mx-1 text-xs">/</span>
                <span className="text-text-faint text-sm leading-none">
                  {volTotal ?? "?"}
                </span>
                <span className="text-[9px] text-text-faint ml-1.5 uppercase">
                  vol
                </span>
              </div>
              <button
                onClick={() => stepVol(1)}
                disabled={!isAdmin}
                aria-label="Next volume"
                className={`${stepBtnCls} text-brand`}
              >
                <i className="fas fa-plus text-xs"></i>
              </button>
            </div>
            {/* Pages input */}
            <div className="flex items-center gap-1.5 border border-border-strong px-3 py-2">
              <Eyebrow>Page</Eyebrow>
              <input
                type="number"
                value={volFinPage}
                disabled={!isAdmin}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseInt(e.target.value, 10) || 0;
                  onPageChange(Math.max(0, v));
                }}
                className="w-14 text-right font-mono text-sm text-text bg-transparent border-b border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60"
              />
            </div>
          </div>
          {(volFin > 0 || volFinPage > 0) && (
            <div className="font-mono text-[11px] text-text-faint mt-1.5">
              Vol. {volFin}
              {volFinPage > 0 ? ` Page ${volFinPage}` : ""}{" "}
              {volTotal != null ? `/ Vol. ${volTotal}` : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
          {/* Reading Status */}
          <div className="space-y-1">
            <Eyebrow as="label">Reading status</Eyebrow>
            <select
              value={manga.reading_status || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onStatusChange(e.target.value)}
              className={selectCls}
            >
              <StatusOptions statuses={READING_STATUSES} />
            </select>
          </div>
          {/* My Rating */}
          <div className="space-y-1">
            <Eyebrow as="label">Rating</Eyebrow>
            <select
              value={manga.my_rating || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onRatingChange(e.target.value)}
              className={selectCls}
            >
              <option value="">Unrated</option>
              {MY_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {/* Read Next */}
          <div className="space-y-1">
            <Eyebrow>Read next</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!manga.read_next}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onWatchNextChange(
                    e.target.checked,
                    e.target.checked
                      ? "Added to Read Next"
                      : "Removed from Read Next",
                  )
                }
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">Read next</span>
            </label>
          </div>
          {/* To Reread */}
          <div className="space-y-1">
            <Eyebrow>To reread</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!manga.to_reread}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onToRewatchChange(
                    e.target.checked,
                    e.target.checked
                      ? "Marked for rewatch"
                      : "Removed from rewatch",
                  )
                }
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">To reread</span>
            </label>
          </div>
        </div>
      </div>
    </Slip>
  );
}
const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Manga() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [manga, setManga] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const mangaQuery = useMediaItem("manga", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allMangaQuery = useMediaList("manga", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "manga",
    system_id,
  );

  useEffect(() => {
    if (mangaQuery.data) setManga(mangaQuery.data);
  }, [mangaQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      manga?.franchise_id
        ? franchises.find((f) => f.system_id === manga.franchise_id) || null
        : null,
    [franchises, manga?.franchise_id],
  );
  const series = useMemo(
    () =>
      manga?.series_id
        ? seriesList.find((s) => s.system_id === manga.series_id) || null
        : null,
    [manga?.series_id, seriesList],
  );
  const loading =
    mangaQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    mangaQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setManga((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("manga").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setManga(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(endpoints.dataControl.replaceSingle("manga", system_id), {
        method: "POST",
        credentials: "include",
      });
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

  if (error || !manga) {
    return (
      <MediaLoadingState
        error={error || "Manga not found"}
        errorTitle="Error Loading Manga"
      />
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

  const authorSame =
    manga.author_plot &&
    manga.author_draw &&
    manga.author_plot === manga.author_draw;

  const chFin = manga.ch_fin ?? 0;
  const chTotal = manga.ch_total != null ? manga.ch_total : null;
  const progress = chTotal ? chFin / chTotal : chFin > 0 ? 1 : 0;
  const progressPct = chTotal ? Math.round(progress * 100) : null;

  const eyebrow = ["Manga", manga.region, manga.serialization_status]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/manga" className="hover:text-brand transition">
          Manga
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
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=manga`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("manga").complete(system_id), {
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
                Manga{manga.region ? ` · ${manga.region}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {manga.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={manga.my_rating}
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
                <span>Chapters</span>
                <span className="text-text">
                  {chFin} / {chTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={manga.sources}
            mediaType="manga"
            malLink={manga.mal_link}
            serializationPlatform={manga.serialization_platform}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="manga" entryId={manga.system_id} />
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

            {/* Score Block */}
            <ScoreBlock
              malScore={manga.mal_rating}
              malRank={manga.mal_rank}
              anilistScore={manga.anilist_rating}
              updatedAt={manga.updated_at}
            />
          </header>

          {/* My Tracker Block */}
          <MangaTrackerBlock
            manga={manga}
            isAdmin={isAdmin}
            onChChange={(v) =>
              performPatch({ ch_fin: v }, "Chapter progress saved")
            }
            onVolChange={(v) =>
              performPatch({ vol_fin: v }, "Volume progress saved")
            }
            onPageChange={(v) =>
              performPatch({ vol_fin_page: v }, "Page saved")
            }
            onStatusChange={(v) =>
              performPatch({ reading_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v || null }, "Rating saved")
            }
            onWatchNextChange={(v, msg) => performPatch({ read_next: v }, msg)}
            onToRewatchChange={(v, msg) => performPatch({ to_reread: v }, msg)}
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="manga" item={manga} />
            <InfoCard
              title="Information"
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
                ],
                [
                  {
                    label: "Release Date",
                    value: manga.release_date || null,
                  },
                  {
                    label: "End Date",
                    value: manga.end_date || null,
                  },
                ],
                [
                  {
                    label: "Volume Total",
                    value:
                      manga.vol_total != null ? String(manga.vol_total) : null,
                  },
                  {
                    label: "Chapter Total",
                    value:
                      manga.ch_total != null ? String(manga.ch_total) : null,
                  },
                ],
              ]}
            />
            {/* Production Card */}
            {(manga.author_plot ||
              manga.author_draw ||
              manga.anime_studio ||
              manga.publisher_tw) && (
              <InfoCard
                title="Production"
                fields={[
                  ...(authorSame
                    ? [
                        {
                          label: "作者",
                          value: creditValue(
                            manga,
                            "author",
                            manga.author_plot,
                          ),
                        },
                      ]
                    : [
                        ...(manga.author_plot
                          ? [
                              {
                                label: creditLabel(manga, "author", "原作"),
                                value: creditValue(
                                  manga,
                                  "author",
                                  manga.author_plot,
                                ),
                              },
                            ]
                          : []),
                        ...(manga.author_draw
                          ? [
                              {
                                label: creditLabel(
                                  manga,
                                  "illustrator",
                                  "作畫",
                                ),
                                value: creditValue(
                                  manga,
                                  "illustrator",
                                  manga.author_draw,
                                ),
                              },
                            ]
                          : []),
                      ]),
                  [
                    { label: "Publisher TW", value: manga.publisher_tw },
                    { label: "Anime Studio", value: manga.anime_studio },
                  ],
                ]}
              />
            )}
          </div>

          {/* Remarks */}
          {(manga.remark || isAdmin) && manga.remark && (
            <Slip title="Remarks">
              <textarea
                key={manga.system_id}
                defaultValue={manga.remark || ""}
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
                className={selectCls}
              ></textarea>
            </Slip>
          )}

          {/* Structured Notes */}
          {/* The dedicated remark textarea above renders only when a remark
              exists; hide the notes page's `remark` section exactly then, so
              the singleton row never has two editors on one screen. */}
          <MangaNotes
            key={manga.system_id}
            manga={manga}
            isAdmin={isAdmin}
            hideSections={manga.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
