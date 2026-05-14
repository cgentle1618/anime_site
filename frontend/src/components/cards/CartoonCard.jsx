import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getStatusButtonConfig,
} from "../../utils/media";

export default function CartoonCard({
  cartoon,
  isAdmin: isAdminProp,
  onUpdated,
}) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const title =
    cartoon.cartoon_name_cn ||
    cartoon.cartoon_name_en ||
    cartoon.cartoon_name_alt ||
    "Unknown Title";
  const imageUrl = getCoverUrl(cartoon.cover_image_file);
  const btnConfig = getStatusButtonConfig(cartoon.watching_status);

  const epFin = cartoon.ep_fin ?? 0;
  const epTotal =
    cartoon.ep_total !== null &&
    cartoon.ep_total !== undefined &&
    cartoon.ep_total !== ""
      ? parseInt(cartoon.ep_total, 10)
      : "?";

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/cartoon/${cartoon.system_id}`, {
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
      onClick={() => navigate(`/cartoon/${cartoon.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {cartoon.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {cartoon.my_rating}
          </div>
        )}
        {cartoon.airing_type && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {cartoon.airing_type}
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
          <span className="truncate pr-1">{cartoon.release_date || "TBD"}</span>
          {cartoon.imdb_rating && cartoon.imdb_rating !== "N/A" && (
            <span className="shrink-0 flex items-center gap-0.5 text-yellow-600 font-bold">
              <i className="fas fa-star text-[8px]"></i>
              {cartoon.imdb_rating}
            </span>
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
              title={`${cartoon.watching_status || "Might Watch"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          ) : cartoon.watching_status ? (
            <div
              className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
              title={cartoon.watching_status}
            >
              {cartoon.watching_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
