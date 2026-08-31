import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
} from "../../utils/media";
import { Button, Chip, ProgressRule, RatingStamp } from "../ui/primitives";

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
  const pd = novel.progress_display;

  // ── Progress % ───────────────────────────────────────────────────
  let progressPercent = 0;
  let progressLabel = "Ongoing";
  if (pd === "vol_tw" && novel.vol_total_tw != null) {
    progressPercent = Math.round(
      ((novel.vol_fin ?? 0) / novel.vol_total_tw) * 100,
    );
    progressLabel = `${progressPercent}%`;
  } else if (
    (pd === "vol_original" || !pd) &&
    novel.vol_total_original != null
  ) {
    progressPercent = Math.round(
      ((novel.vol_fin ?? 0) / novel.vol_total_original) * 100,
    );
    progressLabel = `${progressPercent}%`;
  } else if (pd === "arc_ch" && novel.arc_total != null) {
    progressPercent = Math.round(
      ((novel.arc_fin ?? 0) / novel.arc_total) * 100,
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

  function handleChChange(newVal) {
    const target = Math.max(0, newVal);
    if (novel.ch_total != null && target > novel.ch_total) {
      showToast("error", "Cannot exceed total chapters.");
      return;
    }
    const prev = novel.ch_fin ?? 0;
    if (target === prev) return;
    onProgressChange(novel.system_id, { ch_fin: target }, { ch_fin: prev });
  }

  function handleArcChange(newVal) {
    const target = Math.max(0, newVal);
    if (novel.arc_total != null && target > novel.arc_total) {
      showToast("error", "Cannot exceed total arcs.");
      return;
    }
    const prev = novel.arc_fin ?? 0;
    if (target === prev) return;
    onProgressChange(novel.system_id, { arc_fin: target }, { arc_fin: prev });
  }

  // ── Progress tracker ─────────────────────────────────────────────
  function renderTracker() {
    if (pd === "vol_tw" || pd === "vol_original" || !pd) {
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
      const arcFin = novel.arc_fin ?? 0;
      const arcTotal = novel.arc_total ?? "?";
      const chFin = novel.ch_fin ?? 0;
      const chTotal = novel.ch_total ?? "?";

      if (isAdmin) {
        return (
          <div className="flex items-center justify-between gap-2 relative z-20">
            <StepButton
              onClick={() => handleChChange(Math.round(chFin) - 1)}
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
                  handleArcChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{arcTotal}</span>
              <span className="text-text-faint mx-0.5">·</span>
              <span className={UNIT}>ch</span>
              <input
                type="number"
                className={`${STEPPER_INPUT} w-10 text-[11px]`}
                value={chFin}
                onChange={(e) =>
                  handleChChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{chTotal}</span>
            </div>
            <StepButton
              onClick={() => handleChChange(Math.round(chFin) + 1)}
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
              {chFin}/{chTotal}
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
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full cursor-pointer relative"
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
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/modify?id=${novel.system_id}&type=novel`);
            }}
            className="absolute top-2 right-2 bg-surface text-text-faint hover:text-brand hover:border-brand w-7 h-7 flex items-center justify-center transition-colors z-10 border border-border"
            title="Quick edit"
          >
            <i className="fas fa-pencil-alt text-xs"></i>
          </button>
        )}
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
