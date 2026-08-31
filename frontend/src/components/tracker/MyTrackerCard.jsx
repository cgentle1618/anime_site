// Frontend: tracker component file for MyTrackerCard.
//
// A slip: mono title on a dotted rule, the episode stepper as outline
// buttons around a mono input, selects on hairlines. Status is text, never
// a coloured background.
import { Button, Chip, Eyebrow, Slip } from "../ui/primitives";

export const SELECT_CLS =
  "block w-full bg-surface border border-border-strong text-text text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";

export const STEP_INPUT_CLS =
  "font-mono text-text text-sm w-12 text-right bg-surface border border-border-strong px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand appearance-none disabled:opacity-60";

export default function MyTrackerCard({
  epFin,
  epTotal,
  hasCum,
  cumFin,
  cumTotal,
  watchingStatus,
  myRating,
  watchNext,
  toRewatch,
  isAdmin,
  onEpChange,
  onStatusChange,
  onRatingChange,
  onWatchNextChange,
  onToRewatchChange,
  statusOptions,
  ratingOptions,
  statusLabel = "Watching status",
  rewatchLabel = "To rewatch",
}) {
  function stepEp(delta) {
    if (!isAdmin) return;
    const cur = epFin || 0;
    const total =
      epTotal != null && epTotal !== "?" ? parseInt(epTotal, 10) : null;
    let next = cur + delta;
    if (total !== null && next > total) next = total;
    if (next < 0) next = 0;
    if (next === cur) return;
    onEpChange(next);
  }

  function handleInputChange(e) {
    if (!isAdmin) return;
    const v = parseInt(e.target.value, 10) || 0;
    if (epTotal !== "?" && epTotal != null && v > parseInt(epTotal)) return;
    onEpChange(Math.max(0, v));
  }

  const stepper = (
    <div className="flex items-center gap-1.5">
      {hasCum && (
        <Chip tone="muted" title="Cumulative episodes" className="mr-1">
          Cum {cumFin}/{cumTotal}
        </Chip>
      )}
      <Button
        size="sm"
        onClick={() => stepEp(-1)}
        disabled={!isAdmin}
        aria-label="Previous episode"
        className="font-mono w-7 px-0"
      >
        −
      </Button>
      <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
        <input
          type="number"
          value={epFin}
          disabled={!isAdmin}
          onChange={handleInputChange}
          className={STEP_INPUT_CLS}
          aria-label="Episodes finished"
        />
        <span className="text-text-faint text-xs">/</span>
        <span className="text-text-muted">{epTotal}</span>
      </div>
      <Button
        size="sm"
        onClick={() => stepEp(1)}
        disabled={!isAdmin}
        aria-label="Next episode"
        className="font-mono w-7 px-0"
      >
        +
      </Button>
    </div>
  );

  return (
    <Slip title="My tracker" actions={stepper}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status */}
        <div className="space-y-1.5">
          <Eyebrow as="label" className="block">
            {statusLabel}
          </Eyebrow>
          {isAdmin ? (
            <select
              value={watchingStatus || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onStatusChange(e.target.value)}
              className={SELECT_CLS}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <Chip>{watchingStatus || "—"}</Chip>
            </div>
          )}
        </div>
        {/* Rating */}
        <div className="space-y-1.5">
          <Eyebrow as="label" className="block">
            Rating
          </Eyebrow>
          {isAdmin ? (
            <select
              value={myRating || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onRatingChange(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Unrated</option>
              {ratingOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <Chip>{myRating || "Unrated"}</Chip>
            </div>
          )}
        </div>
        {onWatchNextChange !== undefined && (
          <div className="space-y-1.5">
            <Eyebrow className="block">Watch next</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!watchNext}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onWatchNextChange(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">Watch next</span>
            </label>
          </div>
        )}
        {onToRewatchChange !== undefined && (
          <div className="space-y-1.5">
            <Eyebrow className="block">{rewatchLabel}</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!toRewatch}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onToRewatchChange(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">{rewatchLabel}</span>
            </label>
          </div>
        )}
      </div>
    </Slip>
  );
}
