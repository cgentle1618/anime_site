import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG, isBaha } from "../utils/media";

export default function DashboardCard({
  anime,
  franchise,
  isAdmin,
  onEpChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isTV = anime._ui_type === "TV Show";
  const isCartoon = anime._ui_type === "Cartoon";
  const isManga = anime._ui_type === "Manga";
  const isNovel = anime._ui_type === "Novel";
  const isReading = isManga || isNovel;

  const title = isNovel
    ? anime.novel_name_cn ||
      anime.novel_name_en ||
      anime.novel_name_roman ||
      anime.novel_name_jp ||
      anime.novel_name_alt ||
      "Unknown Title"
    : isManga
      ? anime.manga_name_cn ||
        anime.manga_name_en ||
        anime.manga_name_roman ||
        anime.manga_name_jp ||
        anime.manga_name_alt ||
        "Unknown Title"
      : isCartoon
        ? anime.cartoon_name_cn ||
          anime.cartoon_name_en ||
          anime.cartoon_name_alt ||
          "Unknown Title"
        : isTV
          ? anime.tv_name_cn ||
            anime.tv_name_en ||
            anime.tv_name_alt ||
            "Unknown Title"
          : anime.anime_name_cn ||
            anime.anime_name_en ||
            anime.anime_name_roman ||
            "Unknown Title";
  const subTitle = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman ||
      "Independent"
    : "Independent Series";

  const navigatePath = isNovel
    ? `/novel/${anime.system_id}`
    : isManga
      ? `/manga/${anime.system_id}`
      : isCartoon
        ? `/cartoon/${anime.system_id}`
        : isTV
          ? `/tv-show/${anime.system_id}`
          : `/anime/${anime.system_id}`;
  const editPath = isNovel
    ? `/modify?id=${anime.system_id}&type=novel`
    : isManga
      ? `/modify?id=${anime.system_id}&type=manga`
      : isCartoon
        ? `/modify?id=${anime.system_id}&type=cartoon`
        : isTV
          ? `/modify?id=${anime.system_id}&type=tv-show`
          : `/modify?id=${anime.system_id}`;

  const imageUrl = getCoverUrl(anime.cover_image_file);
  const bahaFlag = isTV || isCartoon || isReading ? false : isBaha(anime);

  const prevEps = isTV || isCartoon || isReading ? 0 : anime.ep_previous || 0;
  const localFin = isReading ? anime.ch_fin || 0 : anime.ep_fin || 0;
  const localTotal = isReading
    ? anime.ch_total != null
      ? parseInt(anime.ch_total, 10) || "?"
      : "?"
    : anime.ep_total !== null && anime.ep_total !== undefined
      ? parseInt(anime.ep_total, 10) || "?"
      : "?";
  const cumFin = anime.cum_ep_fin ?? localFin;
  const cumTotal = anime.cum_ep_total ?? localTotal;

  let progressPercent = 0;
  if (localTotal !== "?") {
    progressPercent = Math.round((localFin / localTotal) * 100);
  } else if (localFin > 0) {
    progressPercent = "Ongoing";
  }

  const statusText = isReading
    ? anime.reading_status || "Might Read"
    : anime.airing_status || "Unknown";

  let statusColor = "bg-gray-100 text-gray-600 border-gray-200";
  if (isReading) {
    if (anime.reading_status === "Active Reading")
      statusColor = "bg-green-100 text-green-700 border-green-200";
    else if (anime.reading_status === "Passive Reading")
      statusColor = "bg-teal-100 text-teal-700 border-teal-200";
    else if (anime.reading_status === "Paused")
      statusColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
  } else if (anime.airing_status === "Airing")
    statusColor = "bg-green-100 text-green-700 border-green-200";
  else if (anime.airing_status === "Finished Airing")
    statusColor = "bg-blue-100 text-blue-700 border-blue-200";
  else if (anime.airing_status === "Not Yet Aired")
    statusColor = "bg-orange-100 text-orange-700 border-orange-200";

  async function handleEpChange(newVal) {
    if (!isAdmin) return;
    const target = Math.max(0, newVal);
    if (localTotal !== "?" && target > localTotal) {
      showToast("error", "Cannot exceed total episodes.");
      return;
    }
    if (target === localFin) return;
    onEpChange(anime.system_id, target, localFin, anime._ui_type);
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative hover:shadow-md transition-shadow"
      onClick={() => navigate(navigatePath)}
    >
      <div className="flex p-3">
        <div className="w-20 h-28 shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative">
          {anime.my_rating && (
            <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
              <i className="fas fa-star text-[8px] mr-1"></i>
              {anime.my_rating}
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
            className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight mb-1"
            title={title}
          >
            {title}
          </h3>
          <p className="text-xs text-gray-500 truncate mb-2">
            From franchise: {subTitle}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            <span
              className={`${statusColor} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm truncate max-w-[90px] text-center`}
            >
              {statusText}
            </span>
            {!isTV && !isCartoon && !isReading && (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200 shadow-sm">
                <i className="fas fa-tv mr-1"></i>
                {anime.airing_type || "TV"}
              </span>
            )}
            {bahaFlag && anime.baha_link && (
              <a
                href={anime.baha_link}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-block hover:scale-110 transition-transform"
                title="Watch on Bahamut"
              >
                <img
                  src="https://i2.bahamut.com.tw/anime/logo.svg"
                  className="h-3.5 opacity-90"
                  alt="Baha"
                />
              </a>
            )}
            {bahaFlag && !anime.baha_link && (
              <span className="inline-block" title="Available on Bahamut">
                <img
                  src="https://i2.bahamut.com.tw/anime/logo.svg"
                  className="h-3.5 opacity-50 grayscale"
                  alt="Baha"
                />
              </span>
            )}
            {!isTV && anime.source_netflix && (
              <span
                className="bg-red-50 border border-red-200 text-[#E50914] font-black px-1.5 py-0.5 rounded text-[10px] leading-none"
                title="Available on Netflix"
              >
                N
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(editPath);
            }}
            className="absolute top-2 right-2 bg-white/90 text-gray-500 hover:text-brand hover:bg-white rounded-md w-7 h-7 flex items-center justify-center shadow-sm backdrop-blur-sm transition-colors z-10 border border-gray-100"
            title="Quick Edit"
          >
            <i className="fas fa-pencil-alt text-xs"></i>
          </button>
        )}
      </div>

      <div
        className="bg-gray-50 p-3 border-t border-gray-100 mt-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Progress
          </span>
          <span className="text-[10px] font-bold text-brand">
            {progressPercent}
            {localTotal !== "?" ? "%" : ""}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="bg-brand h-1.5 rounded-full transition-all duration-500"
            style={{
              width:
                localTotal !== "?"
                  ? `${progressPercent}%`
                  : localFin > 0
                    ? "100%"
                    : "0%",
            }}
          ></div>
        </div>

        {isAdmin ? (
          <div className="flex items-center justify-between bg-white rounded-lg p-1.5 border border-gray-200 shadow-sm relative z-20">
            <button
              onClick={() => handleEpChange(localFin - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition flex items-center justify-center"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1 whitespace-nowrap">
              <input
                type="number"
                className="text-gray-900 w-14 text-center bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={localFin}
                onChange={(e) =>
                  handleEpChange(parseInt(e.target.value, 10) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-14 text-center">
                {localTotal}
              </span>
              {isReading && (
                <span className="text-gray-400 ml-1 text-[10px] font-sans">
                  CH
                </span>
              )}
              {!isReading && prevEps > 0 && (
                <span
                  className="text-gray-400 ml-1 text-[11px] font-normal tracking-tighter"
                  title="Cumulative Total"
                >
                  ({cumFin}/{cumTotal})
                </span>
              )}
            </div>
            <button
              onClick={() => handleEpChange(localFin + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-gray-50 rounded-lg p-1.5 border border-gray-200 shadow-inner h-[40px]">
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1">
              <span className="text-gray-900 w-14 text-center">{localFin}</span>
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-14 text-center">
                {localTotal}
              </span>
              {isReading && (
                <span className="text-gray-400 ml-1 text-[10px] font-sans">
                  CH
                </span>
              )}
              {!isReading && prevEps > 0 && (
                <span className="text-gray-400 ml-1 text-[11px] font-normal tracking-tighter">
                  ({cumFin}/{cumTotal})
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
