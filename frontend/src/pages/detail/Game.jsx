// Frontend: page component file for Game.
//
// Shaped after Comic.jsx — the same two-column layout, the same optimistic
// PATCH helper — with one difference the play axis forces: a game has no
// episode/issue counter, so the tracker card carries no stepper and
// GameProgress renders playtime and achievements instead.
import { useState, useEffect, useMemo } from "react";
import { releaseYear } from "../../lib/releaseDate";
import { useParams, useNavigate, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG, getDisplayName } from "../../utils/media";
import CommunityCard from "../../components/info/CommunityCard";
import InfoCard from "../../components/info/InfoCard";
import { creditLabel, creditValue } from "../../components/info/PersonLinks";
import {
  publisherLabel,
  publisherValue,
  studioValue,
} from "../../components/info/StudioLinks";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import GameNotes from "./GameNotes";
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
import { MY_RATINGS, PLAYING_STATUSES } from "../../config/fieldOptions";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";

const LIST_OPTIONS = { params: { limit: 2000 } };

const textareaCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

function hours(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${n} h` : null;
}

/**
 * A score with its denominator: "96 / 100", "8.6 / 10".
 *
 * Metacritic's two figures sit on different scales, so the denominator has to
 * travel with the number - a bare "8.6" beside a bare "96" reads as a
 * catastrophe rather than a good user score. Returns null when there is no
 * score, so the InfoCard drops the row instead of showing a zero.
 */
export function outOf(value, max) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${n} / ${max}` : null;
}

// Tristate: null is "never recorded", and the InfoCard drops a null field
// rather than showing a misleading "No".
export function yesNo(value) {
  if (value == null) return null;
  return value ? "Yes" : "No";
}

/**
 * Playtime against the main-story estimate, and achievements when the game
 * reports a total.
 *
 * Renders nothing at all when neither figure exists: a game with no recorded
 * playtime would otherwise show "0 h / ? h", which reads as "played none of
 * it" rather than "never measured". The achievements row is likewise gated on
 * the TOTAL, not the earned count — "12 earned" with no denominator says
 * nothing about progress.
 */
export function GameProgress({ game }) {
  const played = hours(game.hours_played);
  const estimate = hours(game.hltb_main);
  const total = game.achievements_total;
  const earned = game.achievements_earned ?? 0;
  const hasAchievements = total != null && total !== "" && Number(total) > 0;

  if (!played && !estimate && !hasAchievements) return null;

  const pct = hasAchievements
    ? Math.min(100, Math.round((earned / Number(total)) * 100))
    : null;

  return (
    <div className="space-y-3">
      {(played || estimate) && (
        <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          <span>Playtime</span>
          <span className="text-text normal-case tracking-normal">
            {played || "—"}
            {estimate && <span className="text-text-faint"> / ~{estimate}</span>}
          </span>
        </div>
      )}
      {hasAchievements && (
        <div>
          <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-1.5">
            <span>Achievements</span>
            <span className="text-text normal-case tracking-normal">
              {earned} / {total}
              <span className="text-text-faint"> · {pct}%</span>
            </span>
          </div>
          <ProgressRule value={pct / 100} />
        </div>
      )}
    </div>
  );
}

function money(amount, currency) {
  if (amount == null || amount === "") return null;
  return `${currency} ${amount}`;
}

/**
 * What a single copy cost, currency first: "USD 9.99".
 *
 * Not `money`: that one is called with a literal currency per price column,
 * while a copy carries its own and may carry none. A price recorded without
 * a currency is still worth showing; a currency with no price is not.
 */
function copyPrice(copy) {
  if (copy.price_paid == null || copy.price_paid === "") return null;
  return [copy.price_currency, copy.price_paid].filter(Boolean).join(" ");
}

/**
 * Read-only list of the copies a game is owned in, one row per storefront.
 *
 * Copies are created and edited in the Add/Modify form (GameCopiesEditor);
 * the detail page only shows them, which is why there is no inline editor
 * here. Renders nothing when there are no copies - the rule CastSection
 * follows on the ACG pages, since an empty "Copies" slip is a title over a
 * blank box. The Info card's "Copies" figure counts these same rows.
 */
export function GameCopiesSection({ copies }) {
  const rows = copies || [];
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    <Slip title="Copies">
      <div className="space-y-1.5">
        {sorted.map((copy, i) => (
          <div
            key={copy.system_id || i}
            className="flex items-center gap-2 flex-wrap"
          >
            {copy.storefront && (
              <Chip className="shrink-0">{copy.storefront}</Chip>
            )}
            {copy.ownership && <Chip className="shrink-0">{copy.ownership}</Chip>}
            {copy.copy_format && (
              <span className="text-sm text-text">{copy.copy_format}</span>
            )}
            {copy.acquisition && (
              <span className="text-xs text-text-faint">{copy.acquisition}</span>
            )}
            {copyPrice(copy) && (
              <span className="text-xs font-mono text-text-faint">
                {copyPrice(copy)}
              </span>
            )}
            {copy.acquired_date && (
              <span className="text-xs font-mono text-text-faint">
                {copy.acquired_date}
              </span>
            )}
            {copy.remark && (
              <span className="text-xs text-text-faint">{copy.remark}</span>
            )}
          </div>
        ))}
      </div>
    </Slip>
  );
}

export default function Game() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has, isSuperuser } = useAuth();
  const { showToast } = useToast();

  const [game, setGame] = useState(null);

  const gameQuery = useMediaItem("game", publicId);
  useCanonicalPath("game", gameQuery.data);
  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = gameQuery.data?.system_id;
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("game", publicId);

  useEffect(() => {
    if (gameQuery.data) setGame(gameQuery.data);
  }, [gameQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      game?.franchise_id
        ? franchises.find((f) => f.system_id === game.franchise_id) || null
        : null,
    [franchises, game?.franchise_id],
  );
  const series = useMemo(
    () =>
      game?.series_id
        ? seriesList.find((s) => s.system_id === game.series_id) || null
        : null,
    [game?.series_id, seriesList],
  );

  const loading =
    gameQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    gameQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setGame((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("game").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setGame(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !game) {
    return (
      <MediaLoadingState
        error={error || "Game not found"}
        errorTitle="Error Loading Game"
      />
    );
  }

  const titleMain = getDisplayName(game, "game");
  const titleSub =
    game.game_name_en && game.game_name_en !== titleMain
      ? game.game_name_en
      : null;

  const imageUrl = getCoverUrl(game.cover_image_file);
  const franchiseName = franchise
    ? getDisplayName(franchise, "franchise")
    : null;

  const year = releaseYear(game.release_date);

  // The cover rule shows playtime, per the design: how far in you are is the
  // one number worth reading off the poster.
  const coverProgress =
    game.hours_played != null && game.hltb_main
      ? Math.min(1, Number(game.hours_played) / Number(game.hltb_main))
      : 0;

  const eyebrow = [
    "Game",
    game.game_type,
    game.release_status,
    game.completion_level,
    year,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/game" className="hover:text-brand transition">
          Game
        </Link>
        {franchise && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              to={entityPath("franchise", franchise)}
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

      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">
            Admin
          </Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=game`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(
                    endpoints.resource("game").complete(system_id),
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center justify-between py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                Game{game.game_type ? ` · ${game.game_type}` : ""}
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding it
                  tidies the spine rather than concealing the value. Gated on
                  is_superuser rather than a permission - `super` is
                  deliberately NOT a superuser, and this is the one thing in
                  the app only the owner's own account sees. */}
              {isSuperuser && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {game.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={game.my_rating}
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
              <ProgressRule value={coverProgress} />
              <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <span>Played</span>
                <span className="text-text">
                  {game.hours_played != null ? `${game.hours_played} h` : "—"}
                  {game.hltb_main ? ` / ~${game.hltb_main} h` : ""}
                </span>
              </div>
            </div>
          </div>

          <SourcesCard
            sources={game.sources}
            mediaType="game"
            igdbLink={game.igdb_link}
          />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <div className="flex items-baseline gap-4 flex-wrap mb-2">
              <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95]">
                {titleMain}
              </h1>
            </div>
            {titleSub && (
              <h2 className="text-lg text-text-muted font-normal mb-4">
                {titleSub}
              </h2>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Franchise</Eyebrow>
                {franchise ? (
                  <Link
                    to={entityPath("franchise", franchise)}
                    className={lineageLinkCls}
                  >
                    {franchiseName}
                  </Link>
                ) : (
                  <span className="text-text-faint">Independent</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <Eyebrow>Series</Eyebrow>
                {series ? (
                  <Link
                    to={entityPath("series", series)}
                    className={lineageLinkCls}
                  >
                    {getDisplayName(series, "series")}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>
          </header>

          {/* My Tracker — no stepper: a game has no unit to count off, so the
              playtime and achievement figures live in GameProgress below. */}
          <MyTrackerCard
            watchingStatus={game.playing_status || "Might Play"}
            statusOptions={PLAYING_STATUSES}
            statusLabel="Playing Status"
            myRating={game.my_rating}
            ratingOptions={MY_RATINGS}
            isAdmin={isAdmin}
            onStatusChange={(v) =>
              performPatch({ playing_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v || null }, "Rating saved")
            }
            toRewatch={game.to_replay}
            rewatchLabel="To Replay"
            onToRewatchChange={(v) =>
              performPatch(
                { to_replay: v },
                v ? "Marked to replay" : "Removed from replay",
              )
            }
          />

          {/* What every public list says about it, beside what I say.
              Renders nothing when no public list holds this entry. */}
          <CommunityCard mediaId={game.system_id} />

          <Slip title="Progress">
            <GameProgress game={game} />
          </Slip>

          <div className="space-y-6">
            <NamingCard type="game" item={game} />
            <InfoCard
              title="Information"
              fields={[
                [
                  { label: "Type", value: game.game_type },
                  {
                    label: "Base Game",
                    value: game.base_game ? (
                      <Link
                        to={entityPath("game", game.base_game)}
                        className="text-brand hover:underline"
                      >
                        {game.base_game.display_name}
                      </Link>
                    ) : null,
                  },
                ],
                [
                  // The only vocabulary shown here: which platform the game is
                  // on is the one a reader looks for on the page.
                  { label: "Platform", value: game.game_platform },
                ],
                [
                  { label: "Release Status", value: game.release_status },
                  { label: "Release Date", value: game.release_date },
                  { label: "Current Patch", value: game.current_patch },
                ],
                [
                  { label: "Playing Status", value: game.playing_status },
                  { label: "Completion Level", value: game.completion_level },
                ],
                [
                  // Three independent axes; null is "unknown", not "no".
                  { label: "All Endings", value: yesNo(game.all_endings) },
                  {
                    label: "All Achievements",
                    value: yesNo(game.all_achievements),
                  },
                  { label: "All Collected", value: yesNo(game.all_collected) },
                  {
                    label: "Steam Progress Sync",
                    value: yesNo(game.steam_progress_sync),
                  },
                ],
                [
                  // Metacritic's public verdict, not mine - my_rating is the
                  // stamp on the cover.
                  {
                    label: "Metacritic",
                    value: outOf(game.metacritic_score, 100),
                  },
                  {
                    label: "Metacritic User",
                    value: outOf(game.metacritic_user_score, 10),
                  },
                ],
                [
                  // Derived from the copy rows server-side, never stored.
                  { label: "Ownership", value: game.ownership },
                  {
                    label: "Copies",
                    value: game.copies?.length
                      ? String(game.copies.length)
                      : null,
                  },
                ],
              ]}
            />
            <InfoCard
              title="Prices"
              fields={[
                [
                  {
                    label: "MSRP (US)",
                    value: money(game.price_original_us, "USD"),
                  },
                  {
                    label: "MSRP (JP)",
                    value: money(game.price_original_jp, "JPY"),
                  },
                  {
                    label: "MSRP (TW)",
                    value: money(game.price_original_tw, "TWD"),
                  },
                ],
                [
                  {
                    label: "Current (US)",
                    value: money(game.price_current_us, "USD"),
                  },
                  {
                    label: "Current (JP)",
                    value: money(game.price_current_jp, "JPY"),
                  },
                  {
                    label: "Current (TW)",
                    value: money(game.price_current_tw, "TWD"),
                  },
                ],
              ]}
            />
            {(game.studio ||
              game.studio_refs?.length ||
              game.publisher ||
              game.publisher_refs?.length ||
              game.director ||
              game.composer) && (
              <InfoCard
                title="Production"
                fields={[
                  ...(game.studio || game.studio_refs?.length
                    ? [{ label: "Developer", value: studioValue(game) }]
                    : []),
                  ...(game.publisher || game.publisher_refs?.length
                    ? [
                        {
                          label: publisherLabel(game, "發行商"),
                          value: publisherValue(game),
                        },
                      ]
                    : []),
                  ...(game.director
                    ? [
                        {
                          label: creditLabel(game, "director", "Director"),
                          value: creditValue(game, "director", game.director),
                        },
                      ]
                    : []),
                  ...(game.composer
                    ? [
                        {
                          label: creditLabel(game, "composer", "Composer"),
                          value: creditValue(game, "composer", game.composer),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </div>

          <GameCopiesSection copies={game.copies} />

          {game.remark && (
            <Slip title="Remarks">
              <textarea
                key={game.system_id}
                defaultValue={game.remark || ""}
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

          <GameNotes
            key={game.system_id}
            game={game}
            isAdmin={isAdmin}
            hideSections={game.remark ? ["remark"] : []}
          />
        </div>
      </div>
    </div>
  );
}
