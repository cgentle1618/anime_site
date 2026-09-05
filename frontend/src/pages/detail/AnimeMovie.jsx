// Frontend: page component file for AnimeMovie.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import InfoCard from "../../components/info/InfoCard";
import { studioValue } from "../../components/info/StudioLinks";
import { creditValue } from "../../components/info/PersonLinks";
import NamingCard from "../../components/info/NamingCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import SourcesCard from "../../components/info/SourcesCard";
import RelationsSection from "../../components/tracker/RelationsSection";
import AnimeMovieNotes from "./AnimeMovieNotes";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Button, Eyebrow, RatingStamp, Slip } from "../../components/ui/primitives";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import StatusOptions from "../../components/ui/StatusOptions";
import { WATCHING_STATUSES } from "../../config/fieldOptions";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

const LIST_OPTIONS = { params: { limit: 2000 } };

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

export default function AnimeMovie() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [movie, setMovie] = useState(null);
  const [autofilling, setAutofilling] = useState(false);
  const movieQuery = useMediaItem("anime-movie", system_id);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("anime-movie", system_id);

  useEffect(() => {
    if (movieQuery.data) setMovie(movieQuery.data);
  }, [movieQuery.data]);

  const allFranchises = franchiseQuery.data || [];
  const franchise = useMemo(
    () =>
      movie?.franchise_id
        ? allFranchises.find((f) => f.system_id === movie.franchise_id) || null
        : null,
    [allFranchises, movie?.franchise_id],
  );
  const loading = movieQuery.isLoading || franchiseQuery.isLoading;
  const error =
    movieQuery.error?.message || franchiseQuery.error?.message || null;

  async function performUpdate(payload, msg) {
    if (!isAdmin) return;
    setMovie((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("anime-movie").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setMovie(updated);
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
        endpoints.dataControl.replaceSingle("anime-movie", system_id),
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", data.message || "Autofill completed");
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

  if (error || !movie) {
    return (
      <MediaLoadingState
        error={error || "Anime movie not found"}
        errorTitle="Error Loading Anime Movie"
      />
    );
  }

  const titleMain =
    movie.anime_movie_name_cn ||
    movie.anime_movie_name_en ||
    movie.anime_movie_name_roman ||
    "Unknown";
  const titleSub =
    movie.anime_movie_name_en && movie.anime_movie_name_en !== titleMain
      ? movie.anime_movie_name_en
      : movie.anime_movie_name_roman &&
          movie.anime_movie_name_roman !== titleMain
        ? movie.anime_movie_name_roman
        : null;

  const imageUrl = getCoverUrl(movie.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const eyebrow = [
    "Anime movie",
    movie.airing_status,
    formatLength(movie.length_min),
    movie.release_date_jp,
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
        <Link to="/library/anime-movie" className="hover:text-brand transition">
          Anime movies
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
            <Button onClick={() => navigate(`/modify?id=${system_id}`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("anime-movie").complete(system_id), {
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
                Anime · Movie
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding
                  it tidies the spine rather than concealing the value. */}
              {has("field_group.system_info") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {movie.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={movie.my_rating}
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
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={movie.sources}
            mediaType="anime"
            malLink={movie.mal_link}
            exclusiveSource={movie.exclusive_source}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="anime-movie" entryId={movie.system_id} />
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

            {/* Franchise lineage */}
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
            </div>

            <ScoreBlock
              malScore={movie.mal_rating}
              malRank={movie.mal_rank}
              anilistScore={movie.anilist_rating}
              updatedAt={movie.updated_at}
            />
          </header>

          {/* My Tracker Block */}
          <Slip title="My tracker">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <Eyebrow as="label">Watching status</Eyebrow>
                <select
                  value={movie.watching_status || ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    isAdmin &&
                    performUpdate(
                      { watching_status: e.target.value },
                      "Status updated",
                    )
                  }
                  className={selectCls}
                >
                  <StatusOptions statuses={WATCHING_STATUSES} />
                </select>
              </div>
              <div className="space-y-1">
                <Eyebrow as="label">Rating</Eyebrow>
                <select
                  value={movie.my_rating || ""}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    isAdmin &&
                    performUpdate({ my_rating: e.target.value }, "Rating saved")
                  }
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
              <div className="space-y-1">
                <Eyebrow>Watch next</Eyebrow>
                <label
                  className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={!!movie.watch_next}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      isAdmin &&
                      performUpdate(
                        { watch_next: e.target.checked },
                        e.target.checked
                          ? "Added to Watch Next"
                          : "Removed from Watch Next",
                      )
                    }
                    className="w-4 h-4 accent-brand"
                  />
                  <span className="text-sm text-text-muted">Watch next</span>
                </label>
              </div>
              <div className="space-y-1">
                <Eyebrow>To rewatch</Eyebrow>
                <label
                  className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={!!movie.to_rewatch}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      isAdmin &&
                      performUpdate(
                        { to_rewatch: e.target.checked },
                        e.target.checked
                          ? "Marked for rewatch"
                          : "Removed from rewatch",
                      )
                    }
                    className="w-4 h-4 accent-brand"
                  />
                  <span className="text-sm text-text-muted">To rewatch</span>
                </label>
              </div>
            </div>
          </Slip>

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard type="anime-movie" item={movie} />
            <InfoCard
              title="Information"
              fields={[
                [
                  { label: "Airing Status", value: movie.airing_status },
                  { label: "Length", value: formatLength(movie.length_min) },
                ],
                [
                  { label: "Release Date JP", value: movie.release_date_jp },
                  { label: "Release Date TW", value: movie.release_date_tw },
                ],
              ]}
            />
            <InfoCard
              title="Production"
              fields={[
                { label: "Studio", value: studioValue(movie) },
                {
                  label: "Director",
                  value: creditValue(movie, "director", movie.director),
                },
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

          {/* Remarks */}
          {movie.remark && (
            <Slip title="Remarks">
              <textarea
                key={movie.system_id}
                defaultValue={movie.remark || ""}
                disabled={!isAdmin}
                onBlur={(e) =>
                  isAdmin &&
                  performUpdate({ remark: e.target.value }, "Remark saved")
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
          <AnimeMovieNotes
            key={movie.system_id}
            movie={movie}
            isAdmin={isAdmin}
            hideSections={movie.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
