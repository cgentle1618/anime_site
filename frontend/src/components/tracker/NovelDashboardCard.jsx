import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
} from "../../utils/media";

const SERIALIZATION_COLORS = {
  完結: "bg-blue-100 text-blue-700 border-blue-200",
  連載中: "bg-green-100 text-green-700 border-green-200",
  "連載中 (不穩定)": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "連載中 (有生之年)": "bg-orange-100 text-orange-700 border-orange-200",
  停更: "bg-red-100 text-red-600 border-red-200",
  可能更多: "bg-surface-2 text-text-muted border-border",
  未出: "bg-surface-2 text-text-faint border-border",
};

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

  const serializationColor =
    SERIALIZATION_COLORS[novel.serialization_status] ||
    "bg-surface-2 text-text-muted border-border";

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
      const unit = pd === "vol_tw" ? "VOL TW" : "VOL";

      if (isAdmin) {
        return (
          <div className="flex items-center justify-between bg-surface rounded-lg p-1.5 border border-border shadow-sm relative z-20">
            <button
              onClick={() => handleVolChange(Math.round(fin) - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-surface-2 text-text-faint hover:text-text transition flex items-center justify-center"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1 whitespace-nowrap">
              <input
                type="number"
                className="text-text w-16 text-center bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={fin}
                onChange={(e) =>
                  handleVolChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-0.5 text-xs">/</span>
              <span className="text-text-faint text-[13px] w-16 text-center">
                {total}
              </span>
              <span className="text-text-faint ml-1 text-[10px] font-sans">
                {unit}
              </span>
            </div>
            <button
              onClick={() => handleVolChange(Math.round(fin) + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center bg-surface-2 rounded-lg p-1.5 border border-border shadow-inner h-[40px]">
          <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1">
            <span className="text-text w-12 text-center">{fin}</span>
            <span className="text-text-faint mx-0.5 text-xs">/</span>
            <span className="text-text-faint text-[13px] w-12 text-center">
              {total}
            </span>
            <span className="text-text-faint ml-1 text-[10px] font-sans">
              {unit}
            </span>
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
          <div className="flex items-center justify-between bg-surface rounded-lg p-1.5 border border-border shadow-sm relative z-20 gap-1">
            <button
              onClick={() => handleChChange(Math.round(chFin) - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-surface-2 text-text-faint hover:text-text transition flex items-center justify-center"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[11px] tracking-wide flex items-baseline justify-center select-none flex-1 whitespace-nowrap gap-1">
              <span className="text-[9px] text-text-faint font-sans">ARC</span>
              <input
                type="number"
                className="text-text w-10 text-center bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={arcFin}
                onChange={(e) =>
                  handleArcChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{arcTotal}</span>
              <span className="text-text-faint/60 mx-0.5">·</span>
              <span className="text-[9px] text-text-faint font-sans">CH</span>
              <input
                type="number"
                className="text-text w-10 text-center bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={chFin}
                onChange={(e) =>
                  handleChChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint text-[9px]">/{chTotal}</span>
            </div>
            <button
              onClick={() => handleChChange(Math.round(chFin) + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center bg-surface-2 rounded-lg p-1.5 border border-border shadow-inner h-[40px]">
          <div className="font-mono font-bold text-[11px] tracking-wide flex items-baseline justify-center select-none w-full px-1 gap-1">
            <span className="text-[9px] text-text-faint font-sans">ARC</span>
            <span className="text-text">
              {arcFin}/{arcTotal}
            </span>
            <span className="text-text-faint/60 mx-1">·</span>
            <span className="text-[9px] text-text-faint font-sans">CH</span>
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
          <div className="flex items-center justify-between bg-surface rounded-lg p-1.5 border border-border shadow-sm relative z-20">
            <button
              onClick={() => handleChChange(Math.round(fin) - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-surface-2 text-text-faint hover:text-text transition flex items-center justify-center"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1 whitespace-nowrap">
              <input
                type="number"
                className="text-text w-16 text-center bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={fin}
                onChange={(e) =>
                  handleChChange(parseFloat(e.target.value) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-text-faint mx-0.5 text-xs">/</span>
              <span className="text-text-faint text-[13px] w-16 text-center">
                {total}
              </span>
              <span className="text-text-faint ml-1 text-[10px] font-sans">
                CH
              </span>
            </div>
            <button
              onClick={() => handleChChange(Math.round(fin) + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center bg-surface-2 rounded-lg p-1.5 border border-border shadow-inner h-[40px]">
          <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1">
            <span className="text-text w-14 text-center">{fin}</span>
            <span className="text-text-faint mx-0.5 text-xs">/</span>
            <span className="text-text-faint text-[13px] w-14 text-center">
              {total}
            </span>
            <span className="text-text-faint ml-1 text-[10px] font-sans">CH</span>
          </div>
        </div>
      );
    }
  }

  return (
    <div
      className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative hover:shadow-md transition-shadow"
      onClick={() => navigate(`/novel/${novel.system_id}`)}
    >
      <div className="flex p-3">
        <div className="w-20 h-28 shrink-0 bg-surface-2 rounded-lg overflow-hidden border border-border relative">
          {novel.my_rating && (
            <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
              <i className="fas fa-star text-[8px] mr-1"></i>
              {novel.my_rating}
            </div>
          )}
          {novel.region && (
            <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 py-0.5 rounded-tl text-[8px] font-bold z-10">
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
        <div className="ml-4 flex-1 min-w-0 flex flex-col justify-center">
          <h3
            className="font-bold text-text text-sm line-clamp-2 leading-tight mb-1"
            title={title}
          >
            {title}
          </h3>
          <p className="text-xs text-text-faint truncate mb-2">
            From: {subTitle}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            {novel.serialization_status && (
              <span
                className={`${serializationColor} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm truncate max-w-[110px] text-center`}
              >
                {novel.serialization_status}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/modify?id=${novel.system_id}&type=novel`);
            }}
            className="absolute top-2 right-2 bg-surface/90 text-text-faint hover:text-brand hover:bg-surface rounded-md w-7 h-7 flex items-center justify-center shadow-sm backdrop-blur-sm transition-colors z-10 border border-border"
            title="Quick Edit"
          >
            <i className="fas fa-pencil-alt text-xs"></i>
          </button>
        )}
      </div>

      <div
        className="bg-surface-2 p-3 border-t border-border mt-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider">
            Progress
          </span>
          <span className="text-[10px] font-bold text-brand">
            {progressLabel}
          </span>
        </div>
        <div className="w-full bg-surface-3 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="bg-brand h-1.5 rounded-full transition-all duration-500"
            style={{
              width: progressLabel !== "Ongoing" ? `${progressPercent}%` : "0%",
            }}
          />
        </div>
        {renderTracker()}
      </div>
    </div>
  );
}
