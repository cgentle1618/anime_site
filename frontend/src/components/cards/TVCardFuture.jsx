import { useNavigate } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { useToast } from "../../hooks/useToast";

const WATCHING_OPTIONS = ["Might Watch", "Plan to Watch", "Watch When Airs"];

export default function TVCardFuture({ show, isAdmin, onUpdated }) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title =
    show.tv_name_cn || show.tv_name_en || show.tv_name_alt || "Unknown Title";
  const imageUrl = getCoverUrl(show.cover_image_file);

  const currentStatus = show.watching_status || "Might Watch";
  const needsExtra = !WATCHING_OPTIONS.includes(currentStatus);

  async function handleStatusChange(e) {
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      const res = await fetch(`/api/tv-shows/${show.system_id}`, {
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
      const res = await fetch(`/api/tv-shows/${show.system_id}`, {
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
      onClick={() => navigate(`/tv-show/${show.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
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

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1 bg-white">
        <h3
          className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight"
          title={title}
        >
          {title}
        </h3>
        <div className="text-[10px] text-gray-500 font-medium mt-1 flex items-center justify-between gap-1">
          {show.region && <span className="shrink-0">{show.region}</span>}
          <span className="truncate">{show.release_date || "TBD"}</span>
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
