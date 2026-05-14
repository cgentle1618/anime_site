import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";

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

function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export { getReadingButtonConfig };

export default function MangaCard({ manga, isAdmin: isAdminProp, onUpdated }) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showVol, setShowVol] = useState(false);

  const title =
    manga.manga_name_cn ||
    manga.manga_name_en ||
    manga.manga_name_roman ||
    manga.manga_name_jp ||
    manga.manga_name_alt ||
    "Unknown Title";

  const imageUrl = getCoverUrl(manga.cover_image_file);
  const btnConfig = getReadingButtonConfig(manga.reading_status);

  const chFin = manga.ch_fin ?? 0;
  const chTotal = manga.ch_total != null ? manga.ch_total : "?";
  const volFin = manga.vol_fin ?? 0;
  const volTotal = manga.vol_total != null ? manga.vol_total : "?";
  const volFinPage = manga.vol_fin_page ?? 0;

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/manga/${manga.system_id}`, {
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

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navigate(`/manga/${manga.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {manga.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {manga.my_rating}
          </div>
        )}
        {manga.region && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {manga.region}
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
            {manga.release_year || "?"}
            {manga.end_year && manga.end_year !== manga.release_year
              ? ` – ${manga.end_year}`
              : ""}
          </span>
          {manga.mal_rating && (
            <span className="shrink-0 flex items-center gap-0.5 text-blue-600 font-bold">
              <i className="fas fa-star text-[8px]"></i>
              {manga.mal_rating}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVol((v) => !v);
              }}
              className="text-[9px] text-gray-400 hover:text-brand border border-gray-200 rounded px-1 py-0.5 transition-colors shrink-0"
              title="Toggle Ch/Vol"
            >
              {showVol ? "CH" : "VOL"}
            </button>
            {showVol ? (
              <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
                {volFin}
                {volFinPage > 0 && (
                  <span className="text-[9px] text-gray-400 font-sans ml-0.5">
                    p{volFinPage}
                  </span>
                )}{" "}
                <span className="text-gray-400">/</span> {volTotal}{" "}
                <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
                  VOL
                </span>
              </div>
            ) : (
              <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
                {chFin} <span className="text-gray-400">/</span> {chTotal}{" "}
                <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
                  CH
                </span>
              </div>
            )}
          </div>
          {showAdmin ? (
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
              title={`${manga.reading_status || "Might Read"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          ) : manga.reading_status ? (
            <div
              className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
              title={manga.reading_status}
            >
              {manga.reading_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
