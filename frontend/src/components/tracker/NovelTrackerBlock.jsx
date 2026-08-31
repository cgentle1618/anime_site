// Frontend: tracker component file for NovelTrackerBlock.
import { Button, Chip, Eyebrow, Slip } from "../ui/primitives";
import { SELECT_CLS, STEP_INPUT_CLS } from "./MyTrackerCard";

const PROGRESS_DISPLAY_OPTIONS = [
  { value: "", label: "— Default (VOL Original) —" },
  { value: "ch", label: "CH (Chapters)" },
  { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  { value: "vol_original", label: "VOL Original" },
  { value: "arc_ch", label: "ARC + CH" },
];

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

function stepUp(v) {
  return Math.floor(v) + 1;
}
function stepDown(v) {
  return Math.ceil(v) - 1;
}

const UNIT_CLS =
  "font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint ml-1.5";

function StepButton({ onClick, label, children }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      aria-label={label}
      className="font-mono w-7 px-0"
    >
      {children}
    </Button>
  );
}

// The row for the progress mode in use gets the brand rule on its left;
// the others sit on a hairline.
function TrackerRow({ isHighlighted, label, children }) {
  return (
    <div
      className={`pl-3 pr-2 py-2.5 border-l-2 transition-colors ${
        isHighlighted ? "border-brand bg-brand-soft" : "border-border"
      }`}
    >
      <Eyebrow className="mb-2">{label}</Eyebrow>
      {children}
    </div>
  );
}

export default function NovelTrackerBlock({
  novel,
  isAdmin,
  onChChange,
  onVolChange,
  onArcChange,
  onStatusChange,
  onRatingChange,
  onReadNextChange,
  onToRerereadChange,
  onProgressDisplayChange,
}) {
  const pd = novel.progress_display;
  const volHighlighted = !pd || pd === "vol_original" || pd === "vol_tw";
  const arcHighlighted = pd === "arc_ch";
  const chHighlighted = pd === "ch" || pd === "arc_ch";
  const primaryIsTw = pd === "vol_tw";

  const volFin = novel.vol_fin ?? 0;
  const volTotalTw = novel.vol_total_tw ?? null;
  const volTotalOrig = novel.vol_total_original ?? null;
  const arcFin = novel.arc_fin ?? 0;
  const arcTotal = novel.arc_total ?? null;
  const chFin = novel.ch_fin ?? 0;
  const chTotal = novel.ch_total ?? null;

  const primaryVolTotal = primaryIsTw ? volTotalTw : volTotalOrig;

  function handleVolStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(volFin) : stepDown(volFin);
    const bounded = primaryVolTotal !== null ? Math.min(next, primaryVolTotal) : next;
    if (bounded < 0 || bounded === volFin) return;
    onVolChange(bounded);
  }

  function handleArcStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(arcFin) : stepDown(arcFin);
    const bounded = arcTotal !== null ? Math.min(next, arcTotal) : next;
    if (bounded < 0 || bounded === arcFin) return;
    onArcChange(bounded);
  }

  function handleChStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(chFin) : stepDown(chFin);
    const bounded = chTotal !== null ? Math.min(next, chTotal) : next;
    if (bounded < 0 || bounded === chFin) return;
    onChChange(bounded);
  }

  return (
    <Slip title="My tracker">
      <div className="space-y-4">
        {/* Status, Rating & Progress Display */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Reading status
            </Eyebrow>
            {isAdmin ? (
              <select
                value={novel.reading_status || ""}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onStatusChange(e.target.value)}
                className={SELECT_CLS}
              >
                {READING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <div>
                <Chip>{novel.reading_status || "—"}</Chip>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Rating
            </Eyebrow>
            {isAdmin ? (
              <select
                value={novel.my_rating || ""}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onRatingChange(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Unrated</option>
                {MY_RATINGS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            ) : (
              <div>
                <Chip>{novel.my_rating || "Unrated"}</Chip>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Eyebrow as="label" className="block">
              Progress display
            </Eyebrow>
            <select
              value={novel.progress_display || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onProgressDisplayChange(e.target.value)}
              className={SELECT_CLS}
            >
              {PROGRESS_DISPLAY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Vol tracker */}
        <TrackerRow isHighlighted={volHighlighted} label="Volumes">
          <div className="flex items-center gap-1.5 w-fit">
            {isAdmin && (
              <StepButton onClick={() => handleVolStep(-1)} label="Previous volume">−</StepButton>
            )}
            <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
              <input
                type="number"
                value={volFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (primaryVolTotal !== null && v > primaryVolTotal) return;
                  onVolChange(Math.max(0, v));
                }}
                className={STEP_INPUT_CLS}
                aria-label="Volumes finished"
              />
              <span className="text-text-faint text-xs">/</span>
              {/* TW total — always first when present */}
              {volTotalTw !== null && (
                <span className={primaryIsTw ? "text-text" : "text-text-faint"}>
                  {volTotalTw}
                </span>
              )}
              {/* Separator only when both totals present */}
              {volTotalTw !== null && volTotalOrig !== null && (
                <span className="text-text-faint/60 text-xs">;</span>
              )}
              {/* Orig total — always second when present */}
              {volTotalOrig !== null && (
                <span className={!primaryIsTw ? "text-text" : "text-text-faint"}>
                  {volTotalOrig}
                </span>
              )}
              {/* Fallback when neither total is set */}
              {volTotalTw === null && volTotalOrig === null && (
                <span className="text-text-faint">?</span>
              )}
              <span className={UNIT_CLS}>vol</span>
            </div>
            {isAdmin && (
              <StepButton onClick={() => handleVolStep(1)} label="Next volume">+</StepButton>
            )}
          </div>
        </TrackerRow>

        {/* Arc tracker */}
        <TrackerRow isHighlighted={arcHighlighted} label="Arcs">
          <div className="flex items-center gap-1.5 w-fit">
            {isAdmin && (
              <StepButton onClick={() => handleArcStep(-1)} label="Previous arc">−</StepButton>
            )}
            <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
              <input
                type="number"
                value={arcFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (arcTotal !== null && v > arcTotal) return;
                  onArcChange(Math.max(0, v));
                }}
                className={STEP_INPUT_CLS}
                aria-label="Arcs finished"
              />
              <span className="text-text-faint text-xs">/</span>
              <span className="text-text-muted">{arcTotal ?? "?"}</span>
              <span className={UNIT_CLS}>arc</span>
            </div>
            {isAdmin && (
              <StepButton onClick={() => handleArcStep(1)} label="Next arc">+</StepButton>
            )}
          </div>
        </TrackerRow>

        {/* Ch tracker */}
        <TrackerRow isHighlighted={chHighlighted} label="Chapters">
          <div className="flex items-center gap-1.5 w-fit">
            {isAdmin && (
              <StepButton onClick={() => handleChStep(-1)} label="Previous chapter">−</StepButton>
            )}
            <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
              <input
                type="number"
                value={chFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (chTotal !== null && v > chTotal) return;
                  onChChange(Math.max(0, v));
                }}
                className={STEP_INPUT_CLS}
                aria-label="Chapters finished"
              />
              <span className="text-text-faint text-xs">/</span>
              <span className="text-text-muted">{chTotal ?? "?"}</span>
              <span className={UNIT_CLS}>ch</span>
            </div>
            {isAdmin && (
              <StepButton onClick={() => handleChStep(1)} label="Next chapter">+</StepButton>
            )}
          </div>
        </TrackerRow>

        {/* Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Eyebrow className="block">Read next</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!novel.read_next}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onReadNextChange(
                    e.target.checked,
                    e.target.checked ? "Added to Read Next" : "Removed from Read Next",
                  )
                }
                className="w-4 h-4 accent-brand"
              />
              <span className="text-sm text-text-muted">Read next</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Eyebrow className="block">To reread</Eyebrow>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!novel.to_reread}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onToRerereadChange(
                    e.target.checked,
                    e.target.checked ? "Marked for reread" : "Removed from reread",
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
