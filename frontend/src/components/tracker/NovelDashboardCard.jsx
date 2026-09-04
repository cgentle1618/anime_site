import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
} from "../../utils/media";
import { Button, Chip, ProgressRule, RatingStamp } from "../ui/primitives";
import { arcStep, effectiveProgressDisplay } from "../../lib/novelUnits";

const STEPPER_INPUT =
  "font-mono text-[13px] text-text text-center px-1 py-0.5 border border-border-strong bg-surface focus:outline-none focus:ring-2 focus:ring-brand appearance-none";
const UNIT = "font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint";

function StepButton({ onClick, label, children }) {
  return (
    <Button kind="outline" size="sm" onClick={onClick} aria-label={label}>
      {children}
    </Button>
  );
}

export default function NovelDashboardCard({
  novel,
  franchise,
  isAdmin,
  onProgressChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title = getDisplayName(novel, "novel") || "Unknown Title";

  const subTitle = franchise
    ? getDisplayName(franchise, "franchise") || "Independent"
    : "Independent Series";

  const imageUrl = getCoverUrl(novel.cover_image_file);
  const pd = effectiveProgressDisplay(novel);

  // Decision B/D: arc rows are authoritative for arc_ch novels. ch_fin and
  // arc_total are derived server-side from arc_fin + ch_fin_in_arc + these
  // rows on every write (see derive_novel_progress), so the admin controls
  // below must drive that same two-stage cursor — patching ch_fin or
  // arc_fin alone gets silently recomputed away by the very PATCH that sent
  // it, or leaves a stale ch_fin_in_arc pointing into the wrong arc.
  const arcs = (novel.units || [])
    .filter((u) => u.unit_kind === "arc")
    .sort((a, b) => a.position - b.position);
  const arcFin = novel.arc_fin ?? 0;
  const chInArc = novel.ch_fin_in_arc ?? 0;
  const currentArc = arcs[arcFin] || null;

  // ── Progress % ───────────────────────────────────────────────────
  let progressPercent = 0;
  let progressLabel = "Ongoing";
  if (pd === "vol_tw" && novel.vol_total_tw != null) {
    progressPercent = Math.round(
      ((novel.vol_fin ?? 0) / novel.vol_total_tw) * 100,
    );
    progressLabel = `${progressPercent}%`;
  } else if (pd === "vol_original" && novel.vol_total_original != null) {
    progressPercent = Math.round(
      ((novel.vol_fin ?? 0) / novel.vol_total_original) * 100,
    );
    progressLabel = `${progressPercent}%`;
  } else if (pd === "arc_ch" && novel.ch_total) {
    // ch_fin is derived server-side from arc_fin/ch_fin_in_arc, so it
    // already accounts for the partial arc being read — no unit maths here.
    progressPercent = Math.round(
      Math.min(((novel.ch_fin ?? 0) / novel.ch_total) * 100, 100),
    );
    progressLabel = `${progressPercent}%`;
  } else if (pd === "ch" && novel.ch_total != null) {
    progressPercent = Math.round(((novel.ch_fin ?? 0) / novel.ch_total) * 100);
    progressLabel = `${progressPercent}%`;
  }

  // ── Admin change handlers ────────────────────────────────────────
  function handleVolChange(newVal) {
    const target = Math.max(0, newVal);
    const maxVol =
      pd === "vol_tw" ? novel.vol_total_tw : novel.vol_total_original;
    if (maxVol != null && target > maxVol) {
      showToast("error", "Cannot exceed total volumes.");
      return;
    }
    const prev = novel.vol_fin ?? 0;
    if (target === prev) return;
    onProgressChange(novel.system_id, { vol_fin: target }, { vol_fin: prev });
  }

  // The `pd === "ch"` branch renders only when there are no arc rows (see
  // renderTracker below), but a "ch"-labelled novel CAN still have arc rows
  // once one is added without a progress_display override — c80c84a fixed
  // this same snap-back for the arc_ch branch; route through the two-stage
  // cursor here too when rows exist, since _derive recomputes ch_fin from
  // them and would otherwise discard a bare ch_fin write in the same request.
  function handleChChange(newVal) {
    const target = Math.max(0, newVal);
    if (novel.ch_total != null && target > novel.ch_total) {
      showToast("error", "Cannot exceed total chapters.");
      return;
    }
    const prev = novel.ch_fin ?? 0;
    if (target === prev) return;
    if (arcs.length > 0) {
      const dir = target > prev ? 1 : -1;
      let next = { arc_fin: arcFin, ch_fin_in_arc: chInArc };
      for (let i = 0; i < Math.abs(target - prev); i += 1) {
        next = arcStep(arcs, next.arc_fin, next.ch_fin_in_arc, dir);
      }
      if (next.arc_fin === arcFin && next.ch_fin_in_arc === chInArc) return;
      onProgressChange(
        novel.system_id,
        { arc_fin: next.arc_fin, ch_fin_in_arc: next.ch_fin_in_arc },
        { arc_fin: arcFin, ch_fin_in_arc: chInArc },
      );
      return;
    }
    onProgressChange(novel.system_id, { ch_fin: target }, { ch_fin: prev });
  }

  // Chapter step buttons for arc_ch novels: one step = one chapter, folded
  // into the right arc by arcStep (frontend/src/lib/novelUnits.js), mirroring
  // the server's normalize_arc_progress. Both fields go in one PATCH so the
  // server sees a coherent cursor, not a half-updated one it then "fixes".
  function handleArcChapterStep(dir) {
    const next = arcStep(arcs, arcFin, chInArc, dir);
    if (next.arc_fin === arcFin && next.ch_fin_in_arc === chInArc) return;
    onProgressChange(
      novel.system_id,
      { arc_fin: next.arc_fin, ch_fin_in_arc: next.ch_fin_in_arc },
      { arc_fin: arcFin, ch_fin_in_arc: chInArc },
    );
  }

  // Direct edit of the arc number. There is no separate "position within the
  // new arc" input here, so ch_fin_in_arc resets to 0 rather than carrying a
  // stale value that may not even fit the newly chosen arc's width.
  function handleArcFinInput(newVal) {
    const target = Math.max(0, newVal);
    if (arcs.length && target > arcs.length) {
      showToast("error", "Cannot exceed total arcs.");
      return;
    }
    if (target === arcFin) return;
    onProgressChange(
      novel.system_id,
      { arc_fin: target, ch_fin_in_arc: 0 },
      { arc_fin: arcFin, ch_fin_in_arc: chInArc },
    );
  }

  // Direct edit of the chapter-within-arc number. arc_fin is unchanged;
  // the server still re-normalises on write, so an overshoot past the
  // current arc's width safely carries forward rather than corrupting state.
  function handleChInArcInput(newVal) {
    const target = Math.max(0, newVal);
    if (currentArc?.ch_count != null && target > currentArc.ch_count) {
      showToast("error", "Cannot exceed this arc's chapters.");
      return;
    }
    if (target === chInArc) return;
    onProgressChange(
      novel.system_id,
      { arc_fin: arcFin, ch_fin_in_arc: target },
      { arc_fin: arcFin, ch_fin_in_arc: chInArc },
    );
  }

  // ── Progress tracker ─────────────────────────────────────────────
  function renderTracker() {
    if (pd === "vol_tw" || pd === "vol_original") {
      const fin = novel.vol_fin ?? 0;
      const total =
        pd === "vol_tw"
          ? (novel.vol_total_tw ?? "?")
          : (novel.vol_total_original ?? "?");
      const unit = pd === "vol_tw" ? "vol tw" : "vol";

      if (isAdmin) {
        return (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <StepButton
              onClick={() => handleVolChange(Math.round(fin) - 1)}
              label="One volume back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </StepButton>
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none flex-1 whitespace-nowrap">
              <input
                type="number"
                className={`${STEPPER_INPUT} w-16`}
                value={fin}
                onChange={(e) =>
                  handleVolChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint w-12 text-center">{total}</span>
              <span className={`${UNIT} ml-1`}>{unit}</span>
            </div>
            <StepButton
              onClick={() => handleVolChange(Math.round(fin) + 1)}
              label="One volume forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </StepButton>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center border border-border h-[36px]">
          <div className="font-mono text-[13px] flex items-baseline justify-center select-none w-full px-1">
            <span className="text-text w-12 text-center">{fin}</span>
            <span className="text-text-faint mx-0.5 text-xs">/</span>
            <span className="text-text-faint w-12 text-center">{total}</span>
            <span className={`${UNIT} ml-1`}>{unit}</span>
          </div>
        </div>
      );
    }

    if (pd === "arc_ch") {
      const arcTotal = novel.arc_total ?? arcs.length ?? "?";
      const chInArcTotal = currentArc?.ch_count ?? "?";

      if (isAdmin) {
        return (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <StepButton
              onClick={() => handleArcChapterStep(-1)}
              label="One chapter back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </StepButton>
            <div className="font-mono text-[11px] flex items-baseline justify-center select-none flex-1 whitespace-nowrap gap-1">
              <span className={UNIT}>arc</span>
              <input
                type="number"
                className={`${STEPPER_INPUT} w-10 text-[11px]`}
                value={arcFin}
                onChange={(e) =>
                  handleArcFinInput(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{arcTotal}</span>
              <span className="text-text-faint mx-0.5">·</span>
              <span className={UNIT}>ch</span>
              <input
                type="number"
                className={`${STEPPER_INPUT} w-10 text-[11px]`}
                value={chInArc}
                onChange={(e) =>
                  handleChInArcInput(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{chInArcTotal}</span>
            </div>
            <StepButton
              onClick={() => handleArcChapterStep(1)}
              label="One chapter forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </StepButton>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center border border-border h-[36px]">
          <div className="font-mono text-[11px] flex items-baseline justify-center select-none w-full px-1 gap-1">
            <span className={UNIT}>arc</span>
            <span className="text-text">
              {arcFin}/{arcTotal}
            </span>
            <span className="text-text-faint mx-1">·</span>
            <span className={UNIT}>ch</span>
            <span className="text-text">
              {chInArc}/{chInArcTotal}
            </span>
          </div>
        </div>
      );
    }

    if (pd === "ch") {
      const fin = novel.ch_fin ?? 0;
      const total = novel.ch_total ?? "?";

      if (isAdmin) {
        return (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <StepButton
              onClick={() => handleChChange(Math.round(fin) - 1)}
              label="One chapter back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </StepButton>
            <div className="font-mono text-[13px] flex items-baseline justify-center select-none flex-1 whitespace-nowrap">
              <input
                type="number"
                className={`${STEPPER_INPUT} w-16`}
                value={fin}
                onChange={(e) =>
                  handleChChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint w-12 text-center">{total}</span>
              <span className={`${UNIT} ml-1`}>ch</span>
            </div>
            <StepButton
              onClick={() => handleChChange(Math.round(fin) + 1)}
              label="One chapter forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </StepButton>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center border border-border h-[36px]">
          <div className="font-mono text-[13px] flex items-baseline justify-center select-none w-full px-1">
            <span className="text-text w-14 text-center">{fin}</span>
            <span className="text-text-faint mx-0.5 text-xs">/</span>
            <span className="text-text-faint w-14 text-center">{total}</span>
            <span className={`${UNIT} ml-1`}>ch</span>
          </div>
        </div>
      );
    }
  }

  return (
    <div
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full cursor-pointer relative isolate"
      onClick={() => navigate(`/novel/${novel.system_id}`)}
    >
      <div className="flex p-3">
        <div className="flex shrink-0 h-28 border border-border">
          <div className="w-5 shrink-0 bg-ink text-ink-text flex items-center justify-center py-1">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ writingMode: "vertical-rl" }}
            >
              Novel
            </span>
          </div>
          <div className="relative w-20 h-full bg-surface-2 overflow-hidden">
            <RatingStamp
              rating={novel.my_rating}
              size="sm"
              className="absolute top-1.5 right-1.5 z-10"
            />
            {novel.region && (
              <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] z-10">
                {novel.region}
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
            className="font-display font-bold text-text text-base line-clamp-2 leading-tight mb-1"
            title={title}
          >
            {title}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint truncate mb-2">
            {subTitle}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            {novel.serialization_status && (
              <Chip tone="ink" className="truncate max-w-[130px]">
                {novel.serialization_status}
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
          <span className="text-text">{progressLabel}</span>
        </div>
        <ProgressRule
          value={progressLabel !== "Ongoing" ? progressPercent / 100 : 0}
          className="mb-3"
        />
        {renderTracker()}
      </div>
    </div>
  );
}
