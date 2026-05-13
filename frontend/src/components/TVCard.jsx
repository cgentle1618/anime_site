import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getStatusButtonConfig,
} from "../utils/media";

export default function TVCard({ show, isAdmin: isAdminProp, onUpdated }) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const title =
    show.tv_name_cn ||
    show.tv_name_en ||
    show.tv_name_alt ||
    "Unknown Title";
  const imageUrl = getCoverUrl(show.cover_image_file);
  const btnConfig = getStatusButtonConfig(show.watching_status);

  const epFin = show.ep_fin ?? 0;
  const epTotal =
    show.ep_total !== null && show.ep_total !== undefined && show.ep_total !== ""
      ? parseInt(show.ep_total, 10)
      : "?";

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/tv-shows/${show.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watching_status: target }),
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
      onClick={() => navigate(`/tv-show/${show.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {show.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {show.my_rating}
          </div>
        )}
        {show.imdb_rating && show.imdb_rating !== "N/A" && (
          <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {show.imdb_rating}
          </div>
        )}
        {show.region && (
          <div className="absolute bottom-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {show.region}
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
        <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between gap-1">
          {show.season_part && (
            <span className="truncate pr-1">{show.season_part}</span>
          )}
          {show.airing_status && (
            <span className="shrink-0 truncate">{show.airing_status}</span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
            {epFin} <span className="text-gray-400">/</span> {epTotal}{" "}
            <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
              EP
            </span>
          </div>
          {showAdmin ? (
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
              title={`${show.watching_status || "Might Watch"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          ) : show.watching_status ? (
            <div
              className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
              title={show.watching_status}
            >
              {show.watching_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
