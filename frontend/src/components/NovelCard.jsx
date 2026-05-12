import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/anime";

const READING_BUTTON_CONFIG = {
  "Might Read": {
    symbol: "+",
    cls: "bg-gray-50 text-gray-400 border-gray-200",
    target: "Plan to Read",
  },
  "Plan to Read": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Read",
  },
  "Active Reading": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Read",
  },
  "Passive Reading": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Read",
  },
  Paused: {
    symbol: "~",
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    target: "Might Read",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    target: "Might Read",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-red-50 text-red-500 border-red-200",
    target: "Might Read",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-red-50 text-red-600 border-red-200",
    target: "Might Read",
  },
  "Won't Read": {
    symbol: "✕",
    cls: "bg-red-50 text-red-400 border-red-200",
    target: "Might Read",
  },
};

export function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export default function NovelCard({ novel, isAdmin: isAdminProp, onUpdated }) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const title =
    novel.novel_name_cn ||
    novel.novel_name_en ||
    novel.novel_name_roman ||
    novel.novel_name_jp ||
    novel.novel_name_alt ||
    "Unknown Title";

  const imageUrl = getCoverUrl(novel.cover_image_file);
  const btnConfig = getReadingButtonConfig(novel.reading_status);

  const pd = novel.progress_display;
  const showVolTw = pd === "vol_tw";
  const showVolOrig = pd === "vol_original";
  const showArcCh = pd === "arc_ch";
  const showCh = pd === "ch" || (!pd && novel.ch_total != null);

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/novel/${novel.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_status: target }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        showToast("success", `Status → ${target}`);
        onUpdated?.(updated);
      } else {
        showToast("error", "Update failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  }

  function renderProgress() {
    if (showVolTw) {
      const fin = novel.vol_fin ?? 0;
      const total = novel.vol_total_tw != null ? novel.vol_total_tw : "?";
      return (
        <>
          <span className="font-mono">
            {fin} / {total}
          </span>
          <span className="text-[9px] text-gray-400 ml-0.5">VOL TW</span>
        </>
      );
    }
    if (showVolOrig) {
      const fin = novel.vol_fin ?? 0;
      const total =
        novel.vol_total_original != null ? novel.vol_total_original : "?";
      return (
        <>
          <span className="font-mono">
            {fin} / {total}
          </span>
          <span className="text-[9px] text-gray-400 ml-0.5">VOL</span>
        </>
      );
    }
    if (showArcCh) {
      return (
        <span className="font-mono text-[10px]">
          {novel.arc_fin ?? 0}/{novel.arc_total ?? "?"} ARC &nbsp;
          {novel.ch_fin ?? 0}/{novel.ch_total ?? "?"} CH
        </span>
      );
    }
    const fin = novel.ch_fin ?? 0;
    const total = novel.ch_total != null ? novel.ch_total : "?";
    return (
      <>
        <span className="font-mono">
          {fin} / {total}
        </span>
        <span className="text-[9px] text-gray-400 ml-0.5">CH</span>
      </>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navigate(`/novel/${novel.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {novel.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {novel.my_rating}
          </div>
        )}
        {novel.region && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {novel.region}
          </div>
        )}
        <img
          src={imageUrl}
          alt="Cover"
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1 relative z-20 bg-white">
        <h3
          className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5"
          title={title}
        >
          {title}
        </h3>
        <div className="text-[10px] text-gray-500 font-medium mb-1 flex items-center justify-between gap-1">
          <span className="truncate pr-1">
            {novel.release_year || "?"}
            {novel.end_year && novel.end_year !== novel.release_year
              ? ` – ${novel.end_year}`
              : ""}
          </span>
          {novel.mal_rating && (
            <span className="shrink-0 flex items-center gap-0.5 text-blue-600 font-bold">
              <i className="fas fa-star text-[8px]"></i>
              {novel.mal_rating}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700 tracking-tight">
            {renderProgress()}
          </div>
          {showAdmin ? (
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
              title={`${novel.reading_status || "Might Read"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          ) : novel.reading_status ? (
            <div
              className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
              title={novel.reading_status}
            >
              {novel.reading_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
