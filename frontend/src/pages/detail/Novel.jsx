// Frontend: page component file for Novel.
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
import NovelTrackerBlock from "../../components/tracker/NovelTrackerBlock";
import SourcesCard from "../../components/info/SourcesCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import NovelNotes from "./NovelNotes";
import NovelUnitsEditor from "../../components/forms/NovelUnitsEditor";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { countsChapters } from "../../lib/novelUnits";
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
import { useCasting } from "../../hooks/useCasting";

const textareaCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

// Main before Supporting, then whatever order the server already gave —
// castings unrelated to either role sort last rather than crowding the top.
const CAST_ROLE_ORDER = { Main: 0, Supporting: 1 };

// Read-only cast list, shared shape for every ACG detail page. Renders
// nothing when the entry has no cast — an empty "Cast" slip would just be a
// title over a blank box, same rule NovelUnitsCard follows for units. A
// novel's castings never carry a seiyuu (ck_casting_voice_scope), so a row
// with no person_id simply renders the character alone rather than an empty
// or broken "voiced by" link.
function CastSection({ cast }) {
  if (!cast || cast.length === 0) return null;
  const sorted = [...cast].sort((a, b) => {
    const ra = CAST_ROLE_ORDER[a.role] ?? 2;
    const rb = CAST_ROLE_ORDER[b.role] ?? 2;
    if (ra !== rb) return ra - rb;
    return (a.position ?? 0) - (b.position ?? 0);
  });
  return (
    <Slip title="Cast">
      <div className="space-y-2">
        {sorted.map((row) => (
          <div key={row.system_id} className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-surface-2 overflow-hidden rounded">
              <img
                src={getCoverUrl(row.photo_file)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              {row.role && <Chip>{row.role}</Chip>}
              <Link to={`/character/${row.character_id}`} className={lineageLinkCls}>
                {row.character_name || "Unknown"}
              </Link>
              {row.person_id && (
                <>
                  <span className="text-text-faint text-xs">voiced by</span>
                  <Link to={`/person/${row.person_id}`} className={lineageLinkCls}>
                    {row.person_name || "Unknown"}
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Slip>
  );
}

// BelongingNovelsCard (CN/EN per-volume title editor) used to live here; it
// read novel_name_each_cn/_en, which the backend replaced with the `units`
// relationship (see app/models/novel.py NovelUnit). NovelUnitsCard below is
// its replacement: same read-only/editor split, but backed by `units` and
// each row's server-computed `display_key` instead of a bare `{key, name}`.
function NovelUnitsCard({ novel, isAdmin, onSave }) {
  const [items, setItems] = useState(novel.units || []);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems(novel.units || []);
    setDirty(false);
  }, [novel.units]);

  function handleSave() {
    onSave({
      units: items.map((u, i) => ({
        ...u,
        position: i + 1,
        ch_count:
          u.ch_count === "" || u.ch_count == null ? null : Number(u.ch_count),
      })),
    });
    setDirty(false);
  }

  function handleCancel() {
    setItems(novel.units || []);
    setDirty(false);
  }

  const hasUnits = (novel.units || []).length > 0;
  // Read-only viewers see nothing when there are no units — an empty
  // "Units" card would just be a title over a blank box. Admins still get
  // the editor (with its own "+ Add" control) so they can create the first
  // one.
  if (!isAdmin && !hasUnits) return null;

  return (
    <Slip title="Units">
      <div className="space-y-4">
        {isAdmin ? (
          <>
            <NovelUnitsEditor
              items={items}
              novelType={novel.type}
              onChange={(v) => {
                setItems(v);
                setDirty(true);
              }}
            />
            {dirty && (
              <div className="flex gap-2 pt-3 border-t border-border">
                <Button type="button" kind="primary" size="sm" onClick={handleSave}>
                  Save
                </Button>
                <Button type="button" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-1.5">
            {(novel.units || []).map((u) => (
              <div key={u.system_id} className="flex items-center gap-2">
                <Chip className="shrink-0">{u.display_key}</Chip>
                {(u.name_cn || u.name_en) && (
                  <span className="text-sm text-text">
                    {[u.name_cn, u.name_en].filter(Boolean).join(" / ")}
                  </span>
                )}
                {u.unit_kind === "arc" && u.ch_count != null && (
                  <span className="text-xs font-mono text-text-faint">
                    {u.ch_count} ch
                  </span>
                )}
                {u.remark && (
                  <span className="text-xs text-text-faint">{u.remark}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Slip>
  );
}
const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Novel() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [novel, setNovel] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const novelQuery = useMediaItem("novel", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allNovelsQuery = useMediaList("novel", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("novel", system_id);
  const castingQuery = useCasting("novel", novel?.system_id);
  const cast = castingQuery.data?.cast || [];

  useEffect(() => {
    if (novelQuery.data) setNovel(novelQuery.data);
  }, [novelQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      novel?.franchise_id
        ? franchises.find((f) => f.system_id === novel.franchise_id) || null
        : null,
    [franchises, novel?.franchise_id],
  );
  const series = useMemo(
    () =>
      novel?.series_id
        ? seriesList.find((s) => s.system_id === novel.series_id) || null
        : null,
    [novel?.series_id, seriesList],
  );
  const loading =
    novelQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    novelQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setNovel((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("novel").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setNovel(updated);
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
        endpoints.dataControl.replaceSingle("novel", system_id),
        {
          method: "POST",
          credentials: "include",
        },
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

  if (error || !novel) {
    return (
      <MediaLoadingState
        error={error || "Novel not found"}
        errorTitle="Error Loading Novel"
      />
    );
  }

  const titleMain =
    novel.novel_name_cn ||
    novel.novel_name_en ||
    novel.novel_name_roman ||
    novel.novel_name_jp ||
    novel.novel_name_alt ||
    "Unknown";
  const titleSub =
    novel.novel_name_en && novel.novel_name_en !== titleMain
      ? novel.novel_name_en
      : null;

  const imageUrl = getCoverUrl(novel.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  // The rule along the cover counts whatever the type counts. A Light Novel
  // or a Novel counts volumes; its chapter columns are cleared server-side, so
  // reading them here produced the "CHAPTERS 0 / 110" a finished 11-volume
  // light novel used to show. The volume denominator follows the same TW/JP
  // preference the tracker uses.
  const countsCh = countsChapters(novel);
  const volDenominator = novel.progress_display === "vol_tw"
    ? (novel.vol_total_tw ?? novel.vol_total_original ?? null)
    : (novel.vol_total_original ?? novel.vol_total_tw ?? null);
  const progressLabel = countsCh ? "Chapters" : "Volumes";
  const progressFin = countsCh ? (novel.ch_fin ?? 0) : (novel.vol_fin ?? 0);
  const progressTotal = countsCh
    ? (novel.ch_total != null ? novel.ch_total : null)
    : volDenominator;
  const progress = progressTotal
    ? progressFin / progressTotal
    : progressFin > 0
      ? 1
      : 0;
  const progressPct = progressTotal ? Math.round(progress * 100) : null;

  const eyebrow = ["Novel", novel.region, novel.type, novel.serialization_status]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/novel" className="hover:text-brand transition">
          Novel
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
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=novel`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("novel").complete(system_id), {
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
                Novel{novel.type ? ` · ${novel.type}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {novel.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={novel.my_rating}
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
                <span>{progressLabel}</span>
                <span className="text-text">
                  {progressFin} / {progressTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={novel.sources}
            mediaType="novel"
            malLink={novel.mal_link}
            openLibraryLink={novel.openlibrary_link}
            serializationPlatform={novel.serialization_platform}
          />

          <RelationsSection mediaType="novel" entryId={novel.system_id} />
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
              malScore={novel.mal_rating}
              malRank={novel.mal_rank}
              anilistScore={novel.anilist_rating}
              updatedAt={novel.updated_at}
            />
          </header>

          {/* My Tracker Block */}
          <NovelTrackerBlock
            novel={novel}
            isAdmin={isAdmin}
            onChChange={(v) =>
              performPatch({ ch_fin: v }, "Chapter progress saved")
            }
            onVolChange={(v) =>
              performPatch({ vol_fin: v }, "Volume progress saved")
            }
            onArcProgressChange={(next) =>
              performPatch(next, "Arc progress saved")
            }
            onStatusChange={(v) =>
              performPatch({ reading_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v || null }, "Rating saved")
            }
            onReadNextChange={(v, msg) => performPatch({ read_next: v }, msg)}
            onToRerereadChange={(v, msg) => performPatch({ to_reread: v }, msg)}
            onProgressDisplayChange={(v) =>
              performPatch({ progress_display: v || null }, "Progress display updated")
            }
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="novel" item={novel} />
            <InfoCard
              title="Information"
              fields={[
                [
                  { label: "Region", value: novel.region },
                  { label: "Type", value: novel.type },
                  { label: "Version", value: novel.version },
                ],
                [
                  { label: "本傳 / 外傳", value: novel.is_main },
                  {
                    label: "Serialization Status",
                    value: novel.serialization_status,
                  },
                ],
                [
                  {
                    label: "Release Date",
                    value: novel.release_date || null,
                  },
                  {
                    label: "End Date",
                    value: novel.end_date || null,
                  },
                ],
                [
                  {
                    label: "Total Volumes (JP/KR)",
                    value:
                      novel.vol_total_original != null
                        ? String(novel.vol_total_original)
                        : null,
                  },
                  {
                    label: "Vol Total (TW)",
                    value:
                      novel.vol_total_tw != null
                        ? String(novel.vol_total_tw)
                        : null,
                  },
                ],
                [
                  {
                    label: "Arc Total",
                    value:
                      novel.arc_total != null ? String(novel.arc_total) : null,
                  },
                  {
                    label: "Chapter Total",
                    value:
                      novel.ch_total != null ? String(novel.ch_total) : null,
                  },
                ],
              ]}
            />
            {/* Production Card */}
            {(novel.author || novel.illustrator || novel.publisher_tw) && (
              <InfoCard
                title="Production"
                fields={[
                  ...(novel.author
                    ? [
                        {
                          label: creditLabel(novel, "author", "Author"),
                          value: creditValue(novel, "author", novel.author),
                        },
                      ]
                    : []),
                  ...(novel.illustrator
                    ? [
                        {
                          label: creditLabel(
                            novel,
                            "illustrator",
                            "Illustrator",
                          ),
                          value: creditValue(
                            novel,
                            "illustrator",
                            novel.illustrator,
                          ),
                        },
                      ]
                    : []),
                  ...(novel.publisher_tw
                    ? [{ label: "Publisher (TW)", value: novel.publisher_tw }]
                    : []),
                ]}
              />
            )}
          </div>

          {/* Cast */}
          <CastSection cast={cast} />

          {/* Remarks */}
          {novel.remark && (
            <Slip title="Remarks">
              <textarea
                key={novel.system_id}
                defaultValue={novel.remark || ""}
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

          {/* Units */}
          <NovelUnitsCard
            novel={novel}
            isAdmin={isAdmin}
            onSave={(payload) => performPatch(payload, "Units saved")}
          />

          {/* Structured Notes */}
          {/* The dedicated remark textarea above renders only when a remark
              exists; hide the notes page's `remark` section exactly then, so
              the singleton row never has two editors on one screen. */}
          <NovelNotes
            key={novel.system_id}
            novel={novel}
            isAdmin={isAdmin}
            hideSections={novel.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
