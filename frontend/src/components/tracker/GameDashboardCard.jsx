// Frontend: tracker component file for GameDashboardCard.
//
// Mirrors ComicDashboardCard, minus the stepper: a game has no unit to count
// off, so its progress bar is playtime measured against the main-story
// estimate and the figure below it is read-only for everyone. Achievements
// take the bar instead when the game reports a total and no estimate exists.
import { useNavigate } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG, getDisplayName } from "../../utils/media";
import { Chip, ProgressRule, RatingStamp } from "../ui/primitives";
import { entityPath } from "../../lib/entityPath";

const UNIT = "font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint";

export default function GameDashboardCard({ game, franchise }) {
  const navigate = useNavigate();

  const title = getDisplayName(game, "game") || "Unknown Title";
  const subTitle = franchise
    ? getDisplayName(franchise, "franchise") || "Independent"
    : "Independent Title";

  const imageUrl = getCoverUrl(game.cover_image_file);

  const played = game.hours_played != null ? Number(game.hours_played) : null;
  const estimate = game.hltb_main != null ? Number(game.hltb_main) : null;
  const hasEstimate = estimate != null && estimate > 0;
  const progressPercent =
    hasEstimate && played != null
      ? Math.min(100, Math.round((played / estimate) * 100))
      : 0;

  return (
    <div
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full cursor-pointer relative isolate"
      onClick={() => {
        const path = entityPath("game", game);
        if (path) navigate(path);
      }}
    >
      <div className="flex p-3">
        <div className="flex shrink-0 h-28 border border-border">
          <div className="w-5 shrink-0 bg-ink text-ink-text flex items-center justify-center py-1">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ writingMode: "vertical-rl" }}
            >
              Game
            </span>
          </div>
          <div className="relative w-20 h-full bg-surface-2 overflow-hidden">
            <RatingStamp
              rating={game.my_rating}
              size="sm"
              className="absolute top-1.5 right-1.5 z-10"
            />
            {game.game_type && (
              <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] z-10">
                {game.game_type}
              </div>
            )}
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
            className="font-display font-bold text-text text-base line-clamp-2 leading-tight min-w-0"
            title={title}
          >
            {title}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint truncate mt-1 mb-2">
            {subTitle}
            {hasEstimate ? ` · ~${estimate} h` : ""}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            {game.ownership && (
              <Chip tone="ink" className="truncate max-w-[110px]">
                {game.ownership}
              </Chip>
            )}
            {game.completion_level && (
              <Chip tone="ink" className="truncate max-w-[130px]">
                {game.completion_level}
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
          <span>Playtime</span>
          <span className="text-text">{hasEstimate ? `${progressPercent}%` : ""}</span>
        </div>
        <ProgressRule
          value={hasEstimate ? progressPercent / 100 : 0}
          className="mb-3"
        />

        <div className="flex items-center justify-center border border-border h-[36px]">
          <div className="font-mono text-[13px] flex items-baseline justify-center select-none w-full px-1">
            <span className="text-text w-14 text-center">
              {played != null ? played : "—"}
            </span>
            <span className="text-text-faint mx-0.5 text-xs">/</span>
            <span className="text-text-faint w-14 text-center">
              {hasEstimate ? estimate : "?"}
            </span>
            <span className={`${UNIT} ml-1`}>h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
