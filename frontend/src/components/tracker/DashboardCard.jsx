// Frontend: tracker component file for DashboardCard.
import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
  getBahaRow,
} from "../../utils/media";
import { Button, Chip, ProgressRule, RatingStamp } from "../ui/primitives";

const STEPPER_INPUT =
  "font-mono text-[13px] text-text text-center w-14 px-1 py-0.5 border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-brand appearance-none";

export default function DashboardCard({
  anime,
  franchise,
  isAdmin,
  onEpChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isTV = anime._ui_type === "TV Show";
  const isCartoon = anime._ui_type === "Cartoon";
  const isManga = anime._ui_type === "Manga";
  const isNovel = anime._ui_type === "Novel";
  const isReading = isManga || isNovel;

  const titleType = isNovel
    ? "novel"
    : isManga
      ? "manga"
      : isCartoon
        ? "cartoon"
        : isTV
          ? "tv-show"
          : "anime";
  const title = getDisplayName(anime, titleType) || "Unknown Title";
  const subTitle = franchise
    ? getDisplayName(franchise, "franchise") || "Independent"
    : "Independent Series";
  const spineLabel = anime._ui_type || "Anime";

  const navigatePath = isNovel
    ? `/novel/${anime.system_id}`
    : isManga
      ? `/manga/${anime.system_id}`
      : isCartoon
        ? `/cartoon/${anime.system_id}`
        : isTV
          ? `/tv-show/${anime.system_id}`
          : `/anime/${anime.system_id}`;

  const imageUrl = getCoverUrl(anime.cover_image_file);
  const bahaRow = getBahaRow(anime);
  const netflixRow = (anime.sources || []).find(
    (s) => s.kind === "access" && s.name === "Netflix",
  );
  const bahaFlag =
    isTV || isCartoon || isReading ? false : bahaRow?.available === true;

  const prevEps = isTV || isCartoon || isReading ? 0 : anime.ep_previous || 0;
  const localFin = isReading ? anime.ch_fin || 0 : anime.ep_fin || 0;
  const localTotal = isReading
    ? anime.ch_total != null
      ? parseInt(anime.ch_total, 10) || "?"
      : "?"
    : anime.ep_total !== null && anime.ep_total !== undefined
      ? parseInt(anime.ep_total, 10) || "?"
      : "?";
  const cumFin = anime.cum_ep_fin ?? localFin;
  const cumTotal = anime.cum_ep_total ?? localTotal;

  let progressPercent = 0;
  if (localTotal !== "?") {
    progressPercent = Math.round((localFin / localTotal) * 100);
  } else if (localFin > 0) {
    progressPercent = "Ongoing";
  }
  const progressValue =
    localTotal !== "?" ? localFin / localTotal : localFin > 0 ? 1 : 0;

  const statusText = isReading
    ? anime.reading_status || "Might Read"
    : anime.airing_status || "Unknown";

  async function handleEpChange(newVal) {
    if (!isAdmin) return;
    const target = Math.max(0, newVal);
    if (localTotal !== "?" && target > localTotal) {
      showToast("error", "Cannot exceed total episodes.");
      return;
    }
    if (target === localFin) return;
    onEpChange(anime.system_id, target, localFin, anime._ui_type);
  }

  const unitSuffix = isReading ? (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint ml-1">
      ch
    </span>
  ) : !isReading && prevEps > 0 ? (
    <span
      className="font-mono text-[10px] text-text-faint ml-1"
      title="Cumulative total"
    >
      ({cumFin}/{cumTotal})
    </span>
  ) : null;

  return (
    <div
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full cursor-pointer relative isolate"
      onClick={() => navigate(navigatePath)}
    >
      <div className="flex p-3">
        <div className="flex shrink-0 h-28 border border-border">
          <div className="w-5 shrink-0 bg-ink text-ink-text flex items-center justify-center py-1">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ writingMode: "vertical-rl" }}
            >
              {spineLabel}
            </span>
          </div>
          <div className="relative w-20 h-full bg-surface-2 overflow-hidden">
            <RatingStamp
              rating={anime.my_rating}
              size="sm"
              className="absolute top-1.5 right-1.5 z-10"
            />
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
        <div className="ml-4 flex-1 min-w-0 flex flex-col justify-center">
          <h3
            className="font-display font-bold text-text text-base line-clamp-2 leading-tight mb-1"
            title={title}
          >
            {title}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint truncate mb-2">
            {subTitle}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            <Chip tone="ink">{statusText}</Chip>
            {!isTV && !isCartoon && !isReading && (
              <Chip tone="ink">{anime.airing_type || "TV"}</Chip>
            )}
            {bahaFlag && bahaRow?.url && (
              <a
                href={bahaRow.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-block"
                title="Watch on Bahamut"
              >
                <img
                  src="https://i2.bahamut.com.tw/anime/logo.svg"
                  className="h-3.5 opacity-90"
                  alt="Baha"
                />
              </a>
            )}
            {bahaFlag && !bahaRow?.url && (
              <span className="inline-block" title="Available on Bahamut">
                <img
                  src="https://i2.bahamut.com.tw/anime/logo.svg"
                  className="h-3.5 opacity-50 grayscale"
                  alt="Baha"
                />
              </span>
            )}
            {!isTV && netflixRow?.available && (
              <Chip tone="ink" title="Available on Netflix">
                Netflix
              </Chip>
            )}
          </div>
        </div>
      </div>

      <div
        className="p-3 border-t border-border mt-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-end mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          <span>Progress</span>
          <span className="text-text">
            {localTotal !== "?" ? `${progressPercent}%` : ""}
          </span>
        </div>
        <ProgressRule value={progressValue} className="mb-3" />

        {isAdmin ? (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <Button
              kind="outline"
              size="sm"
              onClick={() => handleEpChange(localFin - 1)}
              aria-label="One back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </Button>
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none flex-1 whitespace-nowrap">
              <input
                type="number"
                className={STEPPER_INPUT}
                value={localFin}
                onChange={(e) =>
                  handleEpChange(parseInt(e.target.value, 10) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint w-10 text-center">
                {localTotal}
              </span>
              {unitSuffix}
            </div>
            <Button
              kind="outline"
              size="sm"
              onClick={() => handleEpChange(localFin + 1)}
              aria-label="One forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center border border-border h-[36px]">
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none w-full px-1">
              <span className="text-text w-14 text-center">{localFin}</span>
              <span className="text-text-faint mx-0.5 text-xs">/</span>
              <span className="text-text-faint w-14 text-center">
                {localTotal}
              </span>
              {unitSuffix}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
