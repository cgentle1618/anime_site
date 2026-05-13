import { useNavigate } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";
import { useToast } from "../hooks/useToast";

function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

function getReleaseYear(movie) {
  const d = movie.release_date_usa || movie.release_date_tw || "";
  if (!d) return "TBD";
  const parts = String(d).trim().split(/[\s-]/);
  const year = parts[parts.length - 1];
  return /^\d{4}$/.test(year) ? year : "TBD";
}

export default function MovieCardFuture({ movie, isAdmin, onUpdated }) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title =
    movie.movie_name_cn ||
    movie.movie_name_en ||
    movie.movie_name_alt ||
    "Unknown Title";
  const imageUrl = getCoverUrl(movie.cover_image_file);
  const length = formatLength(movie.length_min);
  const releaseYear = getReleaseYear(movie);

  async function handleMarkAiring(e) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/movies/${movie.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airing_status: "Finished Airing" }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated?.(updated);
        showToast("success", `${title} marked as Finished Airing`);
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
      onClick={() => navigate(`/movie/${movie.system_id}`)}
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
          {length && (
            <span className="flex items-center gap-0.5 shrink-0">
              <i className="fas fa-clock text-gray-400"></i>
              {length}
            </span>
          )}
          <span className="truncate">{releaseYear}</span>
        </div>
        <div className="mt-auto flex items-center justify-end border-t border-gray-100 pt-2.5">
          {isAdmin && (
            <button
              onClick={handleMarkAiring}
              className="w-6 h-6 flex items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-[10px] shrink-0"
              title="Mark as Airing"
            >
              <i className="fas fa-bolt"></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
