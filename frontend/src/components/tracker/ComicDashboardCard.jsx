import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
  parseTypes,
} from "../../utils/media";
import { Button, Chip, ProgressRule, RatingStamp } from "../ui/primitives";

const STEPPER_INPUT =
  "font-mono text-[13px] text-text text-center w-16 px-1 py-0.5 border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-brand appearance-none";
const UNIT = "font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint";

export default function ComicDashboardCard({
  comic,
  franchise,
  isAdmin,
  onProgressChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title = getDisplayName(comic, "comic") || "Unknown Title";
  const subTitle = franchise
    ? getDisplayName(franchise, "franchise") || "Independent"
    : "Independent Run";

  const imageUrl = getCoverUrl(comic.cover_image_file);

  // Comic has exactly one progress mode - issues - so there is no tracker
  // branching here the way Novel needs for its progress_display modes.
  const fin = comic.issue_fin ?? 0;
  const total = comic.issue_total;
  const hasTotal = total != null;
  const progressPercent = hasTotal
    ? Math.min(100, Math.round((fin / Math.max(total, 1)) * 100))
    : 0;

  // events is a comma-joined multi-select sharing franchise_type's idiom.
  const events = parseTypes(comic.events);

  function handleIssueChange(newVal) {
    const target = Math.max(0, newVal);
    if (hasTotal && target > total) {
      showToast("error", "Cannot exceed total issues.");
      return;
    }
    if (target === fin) return;
    onProgressChange(
      comic.system_id,
      { issue_fin: target },
      { issue_fin: fin },
    );
  }

  return (
    <div
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full cursor-pointer relative isolate"
      onClick={() => navigate(`/comic/${comic.system_id}`)}
    >
      <div className="flex p-3">
        <div className="flex shrink-0 h-28 border border-border">
          <div className="w-5 shrink-0 bg-ink text-ink-text flex items-center justify-center py-1">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ writingMode: "vertical-rl" }}
            >
              Comic
            </span>
          </div>
          <div className="relative w-20 h-full bg-surface-2 overflow-hidden">
            <RatingStamp
              rating={comic.my_rating}
              size="sm"
              className="absolute top-1.5 right-1.5 z-10"
            />
            {comic.comic_type && (
              <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] z-10">
                {comic.comic_type}
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
          <div className="flex items-baseline gap-1.5 min-w-0">
            <h3
              className="font-display font-bold text-text text-base line-clamp-2 leading-tight min-w-0"
              title={title}
            >
              {title}
            </h3>
            {comic.volume_label && (
              <span className="shrink-0 font-mono text-[10px] text-text-faint">
                {comic.volume_label}
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint truncate mt-1 mb-2">
            {subTitle}
            {hasTotal ? ` · ${total} iss` : ""}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            {comic.era && (
              <Chip tone="ink" className="truncate max-w-[110px]">
                {comic.era}
              </Chip>
            )}
            {events.length > 0 && (
              <Chip
                tone="ink"
                className="truncate max-w-[130px]"
                title={events.join(", ")}
              >
                {events[0]}
                {events.length > 1 && (
                  <span className="text-text-faint"> +{events.length - 1}</span>
                )}
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
            {hasTotal ? `${progressPercent}%` : ""}
          </span>
        </div>
        <ProgressRule
          value={hasTotal ? progressPercent / 100 : 0}
          className="mb-3"
        />

        {isAdmin ? (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <Button
              kind="outline"
              size="sm"
              onClick={() => handleIssueChange(fin - 1)}
              title="One issue back"
              aria-label="One issue back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </Button>
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none flex-1 whitespace-nowrap">
              <input
                type="number"
                className={STEPPER_INPUT}
                value={fin}
                onChange={(e) =>
                  handleIssueChange(parseInt(e.target.value, 10) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint w-12 text-center">
                {hasTotal ? total : "?"}
              </span>
              <span className={`${UNIT} ml-1`}>iss</span>
            </div>
            <Button
              kind="outline"
              size="sm"
              onClick={() => handleIssueChange(fin + 1)}
              title="One issue forward"
              aria-label="One issue forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center border border-border h-[36px]">
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none w-full px-1">
              <span className="text-text w-14 text-center">{fin}</span>
              <span className="text-text-faint mx-0.5 text-xs">/</span>
              <span className="text-text-faint w-14 text-center">
                {hasTotal ? total : "?"}
              </span>
              <span className={`${UNIT} ml-1`}>iss</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
