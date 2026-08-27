import { useNavigate } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  getCoverUrl,
  FALLBACK_SVG,
  getDisplayName,
  parseTypes,
} from "../../utils/media";

export default function ComicDashboardCard({
  comic,
  franchise,
  isAdmin,
  onProgressChange,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const title = getDisplayName(comic, "comic") || "Unknown Title";
  const subTitle = franchise
    ? getDisplayName(franchise, "franchise") || "Independent"
    : "Independent Run";

  const imageUrl = getCoverUrl(comic.cover_image_file);

  // Comic has exactly one progress mode - issues - so there is no tracker
  // branching here the way Novel needs for its progress_display modes.
  const fin = comic.issue_fin ?? 0;
  const total = comic.issue_total;
  const hasTotal = total != null;
  const progressPercent = hasTotal
    ? Math.min(100, Math.round((fin / Math.max(total, 1)) * 100))
    : 0;

  // events is a comma-joined multi-select sharing franchise_type's idiom.
  const events = parseTypes(comic.events);

  function handleIssueChange(newVal) {
    const target = Math.max(0, newVal);
    if (hasTotal && target > total) {
      showToast("error", "Cannot exceed total issues.");
      return;
    }
    if (target === fin) return;
    onProgressChange(
      comic.system_id,
      { issue_fin: target },
      { issue_fin: fin },
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative hover:shadow-md transition-shadow"
      onClick={() => navigate(`/comic/${comic.system_id}`)}
    >
      <div className="flex p-3">
        <div className="w-20 h-28 shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative">
          {comic.my_rating && (
            <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
              <i className="fas fa-star text-[8px] mr-1"></i>
              {comic.my_rating}
            </div>
          )}
          {comic.comic_type && (
            <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 py-0.5 rounded-tl text-[8px] font-bold z-10">
              {comic.comic_type}
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
          <div className="flex items-baseline gap-1.5 min-w-0">
            <h3
              className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight min-w-0"
              title={title}
            >
              {title}
            </h3>
            {comic.volume_label && (
              <span className="shrink-0 font-mono text-[10px] font-bold text-gray-500">
                {comic.volume_label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-1 mb-2">
            From: {subTitle}
          </p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            {comic.era && (
              <span className="bg-red-50 text-red-700 border-red-100 px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm truncate max-w-[110px] text-center">
                {comic.era}
              </span>
            )}
            {events.length > 0 && (
              <span
                className="bg-gray-100 text-gray-600 border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm truncate max-w-[130px]"
                title={events.join(", ")}
              >
                {events[0]}
                {events.length > 1 && (
                  <span className="text-gray-400"> +{events.length - 1}</span>
                )}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/modify?id=${comic.system_id}&type=comic`);
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
            {hasTotal ? `${progressPercent}%` : "Ongoing"}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="bg-brand h-1.5 rounded-full transition-all duration-500"
            style={{ width: hasTotal ? `${progressPercent}%` : "0%" }}
          />
        </div>

        {isAdmin ? (
          <div className="flex items-center justify-between bg-white rounded-lg p-1.5 border border-gray-200 shadow-sm relative z-20">
            <button
              onClick={() => handleIssueChange(fin - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition flex items-center justify-center"
              title="One issue back"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1 whitespace-nowrap">
              <input
                type="number"
                className="text-gray-900 w-16 text-center bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={fin}
                onChange={(e) =>
                  handleIssueChange(parseInt(e.target.value, 10) || 0)
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-16 text-center">
                {hasTotal ? total : "?"}
              </span>
              <span className="text-gray-400 ml-1 text-[10px] font-sans">
                ISS
              </span>
            </div>
            <button
              onClick={() => handleIssueChange(fin + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
              title="One issue forward"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-gray-50 rounded-lg p-1.5 border border-gray-200 shadow-inner h-[40px]">
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1">
              <span className="text-gray-900 w-14 text-center">{fin}</span>
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-14 text-center">
                {hasTotal ? total : "?"}
              </span>
              <span className="text-gray-400 ml-1 text-[10px] font-sans">
                ISS
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
