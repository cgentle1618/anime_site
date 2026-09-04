// Frontend: page component file for Anime.
import { useState, useEffect, useMemo } from "react";
import { releaseYear } from "../../lib/releaseDate";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG, isBaha } from "../../utils/media";
import RelationsSection from "../../components/tracker/RelationsSection";
import { endpoints } from "../../api/endpoints";
import AnimeNotes from "./AnimeNotes";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { Button, RatingStamp, ProgressRule, Eyebrow } from "../../components/ui/primitives";
import { WATCHING_STATUSES } from "../../config/fieldOptions";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Anime() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [anime, setAnime] = useState(null);
  const [autofilling, setAutofilling] = useState(false);
  const animeQuery = useMediaItem("anime", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("anime", system_id);

  useEffect(() => {
    if (animeQuery.data) setAnime(animeQuery.data);
  }, [animeQuery.data]);

  const allFranchises = franchiseQuery.data || [];
  const allSeries = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      anime?.franchise_id
        ? allFranchises.find((f) => f.system_id === anime.franchise_id) || null
        : null,
    [allFranchises, anime?.franchise_id],
  );
  const series = useMemo(
    () =>
      anime?.series_id
        ? allSeries.find((s) => s.system_id === anime.series_id) || null
        : null,
    [allSeries, anime?.series_id],
  );
  const loading =
    animeQuery.isLoading ||
    franchiseQuery.isLoading ||
    seriesQuery.isLoading;
  const error =
    animeQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performUpdate(payload, msg) {
    if (!isAdmin) return;
    setAnime((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("anime").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setAnime(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(endpoints.dataControl.replaceSingle("anime", system_id), {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", data.message || "Tenrai autofill completed");
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

  if (error || !anime) {
    return (
      <MediaLoadingState
        error={error || "Anime not found"}
        errorTitle="Error Loading Anime"
      />
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

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;
  const seriesName = series
    ? series.series_name_cn || series.series_name_en || series.series_name_alt
    : null;

  const releaseSeasonYear =
    anime.release_season && anime.release_date
      ? `${anime.release_season} ${releaseYear(anime.release_date)}`
      : anime.release_season || null;
  // Shown verbatim: a year-only date must not be dressed up as a month.
  const releaseDate = anime.release_date || null;

  const eyebrow = [
    "Anime",
    anime.airing_type,
    anime.airing_status,
    releaseSeasonYear,
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
        <Link to="/library/anime" className="hover:text-brand transition">
          Anime
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {titleMain}
        </span>
      </nav>

      {/* Admin toolbar: a plain instrument strip */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">Admin</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("anime").complete(system_id), {
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

      {/* Main Grid: 4 columns */}
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
                Anime · {anime.airing_type || "—"}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {anime.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={anime.my_rating}
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
              <ProgressRule
                value={epTotal !== "?" ? progressPct / 100 : epFin > 0 ? 1 : 0}
              />
              <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <span>Progress</span>
                <span className="text-text">
                  {epFin} / {epTotal}
                  {epTotal !== "?" ? ` · ${progressPct}%` : ""}
                </span>
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

          <RelationsSection mediaType="anime" entryId={anime.system_id} />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header & Titles */}
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
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                  Franchise
                </span>
                {franchise ? (
                  <Link
                    to={`/franchise/${franchise.system_id}`}
                    className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
                  >
                    {franchiseName}
                  </Link>
                ) : (
                  <span className="text-text-faint">Independent</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                  Series
                </span>
                {series ? (
                  <Link
                    to={`/series/${series.system_id}`}
                    className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
                  >
                    {seriesName}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>

            <ScoreBlock
              malScore={anime.mal_rating}
              malRank={anime.mal_rank}
              anilistScore={anime.anilist_rating}
              updatedAt={anime.updated_at}
            />
          </header>

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
            <NamingCard type="anime" item={anime} />
            <InfoCard
              title="Information"
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
                  { label: "Release Date", value: releaseDate },
                ],
                { label: "Genre (Main)", value: anime.genre_main },
                { label: "Genre (Sub)", value: anime.genre_sub },
                { label: "標籤 Label", value: anime.label },
                { label: "Quality 品質", value: anime.quality },
              ]}
            />
            <InfoCard
              title="Production"
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

          {/* Cast & Characters (not built yet): an empty slip, not a mood */}
          <section className="border border-dashed border-border-strong px-4 py-6 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
              Cast & characters
            </div>
            <p className="text-sm text-text-faint">
              Not tracked yet — the character and staff pipeline is still being built.
            </p>
          </section>

          {/* Structured Notes */}
          <AnimeNotes key={anime.system_id} anime={anime} isAdmin={isAdmin} />
        </div>
      </div>

    </div>
  );
}
