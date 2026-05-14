import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  isBaha,
  getStatusButtonConfig,
} from "../../utils/media";

function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

function getReleaseYearJp(releaseDate) {
  if (!releaseDate) return null;
  const parts = String(releaseDate).trim().split(" ");
  return parts[parts.length - 1];
}

export default function AnimeMovieCard({
  movie,
  franchises,
  isAdmin: isAdminProp,
  onUpdated,
}) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const title =
    movie.anime_movie_name_cn ||
    movie.anime_movie_name_en ||
    movie.anime_movie_name_alt ||
    movie.anime_movie_name_roman ||
    movie.anime_movie_name_jp ||
    "Unknown Title";
  const imageUrl = getCoverUrl(movie.cover_image_file);
  const bahaFlag = isBaha(movie);
  const hasBahaLink = bahaFlag && movie.baha_link && movie.baha_link !== "N/A";
  const length = formatLength(movie.length_min);
  const releaseYear = getReleaseYearJp(movie.release_date_jp);

  const btnConfig = getStatusButtonConfig(movie.watching_status);

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/anime-movie/${movie.system_id}`, {
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
      onClick={() => navigate(`/anime-movie/${movie.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {movie.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {movie.my_rating}
          </div>
        )}
        {movie.mal_rating && (
          <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {movie.mal_rating}
          </div>
        )}
        {bahaFlag &&
          (hasBahaLink ? (
            <a
              href={movie.baha_link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center"
              title="Watch on Bahamut"
            >
              <img
                src="https://i2.bahamut.com.tw/anime/logo.svg"
                className="h-3 opacity-90"
                alt="Baha"
              />
            </a>
          ) : (
            <div
              className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center"
              title="Available on Bahamut (no link)"
            >
              <img
                src="https://i2.bahamut.com.tw/anime/logo.svg"
                className="h-3 opacity-30 grayscale"
                alt="Baha"
              />
            </div>
          ))}
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
          {length && (
            <span className="flex items-center gap-0.5 shrink-0">
              <i className="fas fa-clock text-gray-400"></i>
              {length}
            </span>
          )}
          {releaseYear && <span className="truncate">{releaseYear}</span>}
        </div>
        {showAdmin && (
          <div className="mt-auto flex justify-end border-t border-gray-100 pt-2.5">
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
              title={`${movie.watching_status || "Might Watch"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
