// Frontend: tracker component file for NovelTrackerBlock.
import { Button, Chip, Eyebrow, Slip } from "../ui/primitives";
import { SELECT_CLS, STEP_INPUT_CLS } from "./MyTrackerCard";
import StatusOptions from "../ui/StatusOptions";
import {
  READING_STATUSES,
  withLegacyProgressDisplay,
} from "../../config/fieldOptions";
import {
  arcStep,
  countsChapters,
  countsVolumes,
  effectiveProgressDisplay,
  progressDisplayOptions,
  unitDisplayKey,
  wholeArcStep,
} from "../../lib/novelUnits";

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
  onArcProgressChange,
  onStatusChange,
  onRatingChange,
  onReadNextChange,
  onToRerereadChange,
  onProgressDisplayChange,
}) {
  const pd = effectiveProgressDisplay(novel);
  const volHighlighted = pd === "vol_original" || pd === "vol_tw";
  const chHighlighted = pd === "ch" || pd === "arc" || pd === "arc_ch";

  const volFin = novel.vol_fin ?? 0;
  const volTotalTw = novel.vol_total_tw ?? null;
  const volTotalOrig = novel.vol_total_original ?? null;
  const chFin = novel.ch_fin ?? 0;
  const chTotal = novel.ch_total ?? null;

  const primaryIsTw = pd === "vol_tw";
  const primaryVolTotal = primaryIsTw ? volTotalTw : volTotalOrig;

  // Which chapter-side row renders is the chosen display, not just whether
  // arc rows exist: "arc_ch" is the two-stage stepper, "arc" the whole-arc
  // one, "ch" the flat pair. The flat pair goes read-only when arc rows are
  // present, because ch_fin is then derived from them and an editable
  // stepper here would fight derive_novel_progress on the next save.
  const arcs = (novel.units || [])
    .filter((u) => u.unit_kind === "arc")
    .sort((a, b) => a.position - b.position);
  const arcFin = novel.arc_fin ?? 0;
  const currentArc = arcs[arcFin] || null;
  const chInArc = novel.ch_fin_in_arc ?? 0;
  const chIsDerived = arcs.length > 0;

  function handleVolStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(volFin) : stepDown(volFin);
    const bounded = primaryVolTotal !== null ? Math.min(next, primaryVolTotal) : next;
    if (bounded < 0 || bounded === volFin) return;
    onVolChange(bounded);
  }

  function handleWholeArcStep(dir) {
    if (!isAdmin) return;
    const next = wholeArcStep(arcs, arcFin, chInArc, dir);
    if (next.arc_fin === arcFin && next.ch_fin_in_arc === chInArc) return;
    onArcProgressChange(next);
  }

  function handleArcChapterStep(dir) {
    if (!isAdmin) return;
    const next = arcStep(arcs, novel.arc_fin ?? 0, chInArc, dir);
    if (next.arc_fin === (novel.arc_fin ?? 0) && next.ch_fin_in_arc === chInArc) {
      return;
    }
    onArcProgressChange(next);
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
                <StatusOptions statuses={READING_STATUSES} />
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
              aria-label="Progress display"
            >
              {withLegacyProgressDisplay(
                progressDisplayOptions(novel),
                novel.progress_display,
              ).map(
                ({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ),
              )}
            </select>
          </div>
        </div>

        {/* Vol tracker. Not for Web: a web novel is read in chapters, and its
            volume columns are kept only so a later print run (or a type
            change back) is not lost — see countsVolumes(). */}
        {countsVolumes(novel) && (
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
        )}

        {/* Chapter-side tracker. Volume-only types (Light Novel, Novel) count
            volumes and nothing else, so nothing here renders for them — the
            server clears those columns, and an empty "Chapters 0 / ?" row
            would only advertise a counter the type does not have.

            Otherwise the chosen display picks the row: "arc_ch" the two-stage
            stepper, "arc" the whole-arc one, "ch" the flat pair. */}
        {!countsChapters(novel) ? null : pd === "arc_ch" ? (
          <TrackerRow isHighlighted label="Arc / Chapter">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">
                arc {arcFin + 1}
                <span className={UNIT_CLS}>of {arcs.length}</span>
              </span>
              <span className="text-text-faint">·</span>
              {isAdmin && (
                <StepButton onClick={() => handleArcChapterStep(-1)} label="Previous chapter">
                  −
                </StepButton>
              )}
              <span className="font-mono text-sm">
                {chInArc}
                <span className={UNIT_CLS}>/ {currentArc?.ch_count ?? "?"} ch</span>
              </span>
              {isAdmin && (
                <StepButton onClick={() => handleArcChapterStep(1)} label="Next chapter">
                  +
                </StepButton>
              )}
            </div>
          </TrackerRow>
        ) : pd === "arc" ? (
          /* Whole-arc stepper: position of the arc being read, its name, and
             how many arcs there are. Stepping closes or reopens an entire arc
             and resets the in-arc cursor. */
          <TrackerRow isHighlighted label="Arcs">
            <div className="flex items-center gap-1.5 w-fit">
              {isAdmin && (
                <StepButton onClick={() => handleWholeArcStep(-1)} label="Previous arc">
                  −
                </StepButton>
              )}
              <span className="font-mono text-sm whitespace-nowrap">
                arc {arcFin + 1}
                <span className={UNIT_CLS}>/ {arcs.length}</span>
                {currentArc && (
                  <span className="text-text-muted">
                    {" · "}
                    {currentArc.name_cn ||
                      currentArc.name_en ||
                      unitDisplayKey("arc", currentArc.position, currentArc.unit_key)}
                  </span>
                )}
              </span>
              {isAdmin && (
                <StepButton onClick={() => handleWholeArcStep(1)} label="Next arc">
                  +
                </StepButton>
              )}
            </div>
          </TrackerRow>
        ) : chIsDerived ? (
          /* Flat pair, read-only: with arc rows present ch_fin and ch_total
             are derived from them, so this shows the number without offering
             an edit that the next save would overwrite. */
          <TrackerRow isHighlighted={chHighlighted} label="Chapters">
            <div className="font-mono text-sm flex items-center gap-1 whitespace-nowrap">
              <span className="text-text">{chFin}</span>
              <span className="text-text-faint text-xs">/</span>
              <span className="text-text-muted">{chTotal ?? "?"}</span>
              <span className={UNIT_CLS}>ch</span>
              <span className="text-text-faint text-xs">· from arcs</span>
            </div>
          </TrackerRow>
        ) : (
          /* Ch tracker (flat, editable) — novels with no arc rows */
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
        )}

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
