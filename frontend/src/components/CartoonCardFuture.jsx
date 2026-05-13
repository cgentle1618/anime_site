import { useNavigate } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";
import { useToast } from "../hooks/useToast";

const WATCHING_OPTIONS = ["Might Watch", "Plan to Watch", "Watch When Airs"];

const EXPECTATION_COLOR = {
  Highest: "bg-purple-500/80",
  High: "bg-amber-500/80",
  Medium: "bg-sky-500/80",
  Low: "bg-gray-500/70",
};

export default function CartoonCardFuture({
  cartoon,
  franchiseDict,
  isAdmin,
  onUpdated,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title =
    cartoon.cartoon_name_cn ||
    cartoon.cartoon_name_en ||
    cartoon.cartoon_name_alt ||
    "Unknown";
  const imageUrl = getCoverUrl(cartoon.cover_image_file);
  const franchise = franchiseDict?.[cartoon.franchise_id];
  const expectation = franchise?.franchise_expectation;

  const currentStatus = cartoon.watching_status || "Might Watch";
  const needsExtra = !WATCHING_OPTIONS.includes(currentStatus);

  async function handleStatusChange(e) {
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      const res = await fetch(`/api/cartoon/${cartoon.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watching_status: newStatus }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated?.(updated);
      } else {
        showToast("error", "Update failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  }

  async function handleMarkAiring(e) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/cartoon/${cartoon.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airing_status: "Airing" }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated?.(updated);
        showToast("success", `${title} marked as Airing`);
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
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {expectation && (
          <div
            className={`absolute top-1 left-1 ${EXPECTATION_COLOR[expectation] || "bg-gray-500/70"} text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20`}
          >
            {expectation}
          </div>
        )}
        {cartoon.airing_type && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {cartoon.airing_type}
          </div>
        )}
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>

      <div className="p-3 flex flex-col flex-1 bg-white">
        <h3
          className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight"
          title={title}
        >
          {title}
        </h3>
        <div className="text-[10px] text-gray-500 font-medium mt-1 truncate">
          {cartoon.release_date || "TBD"}
        </div>
        <div className="mt-auto flex items-center gap-1 border-t border-gray-100 pt-2.5">
          {isAdmin && (
            <>
              <select
                value={currentStatus}
                onChange={handleStatusChange}
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] font-bold rounded border border-gray-200 px-1 py-0.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-brand w-full"
                title="Watching status"
              >
                {needsExtra && (
                  <option value={currentStatus} disabled>
                    {currentStatus}
                  </option>
                )}
                {WATCHING_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={handleMarkAiring}
                className="w-6 h-6 flex items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-[10px] shrink-0"
                title="Mark as Airing"
              >
                <i className="fas fa-bolt"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
