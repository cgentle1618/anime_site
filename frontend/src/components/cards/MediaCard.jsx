import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useStatusToggle } from "../../hooks/useStatusToggle";
import {
  getDisplayName,
  getCoverUrl,
  FALLBACK_SVG,
  isBaha,
  getStatusButtonConfig,
  getReadingButtonConfig,
  getReleaseFallback,
  formatLength,
  MEDIA_CONFIG,
} from "../../utils/media";

const EXPECTATION_COLOR = {
  Highest: "bg-purple-500/80",
  High: "bg-amber-500/80",
  Medium: "bg-sky-500/80",
  Low: "bg-gray-500/70",
};

const FUTURE_WATCHING_OPTIONS = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
];

const BOLT_AIRING_STATUS = {
  anime: "Airing",
  "anime-movie": "Finished Airing",
  movie: "Finished Airing",
  "tv-show": "Airing",
  cartoon: "Airing",
};

function getReleaseYearFromDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr)
    .trim()
    .split(/[\s\-]/);
  const year = parts[parts.length - 1];
  return /^\d{4}$/.test(year) ? year : null;
}

function serializationStatusCls(status) {
  if (status === "連載中")
    return "bg-green-100 text-green-700 border-green-200";
  if (status === "完結") return "bg-blue-100 text-blue-700 border-blue-200";
  if (status === "連載中 (不穩定)" || status === "連載中 (有生之年)")
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (status === "停更") return "bg-red-100 text-red-700 border-red-200";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

function PosterBadges({ type, variant, data, franchiseDict }) {
  const bahaFlag = (type === "anime" || type === "anime-movie") && isBaha(data);
  const hasBahaLink = bahaFlag && data.baha_link && data.baha_link !== "N/A";
  const franchise = franchiseDict?.[data.franchise_id];
  const expectation = franchise?.franchise_expectation;

  if (variant === "future") {
    return (
      <>
        {expectation && (type === "anime" || type === "cartoon") && (
          <div
            className={`absolute top-1 left-1 ${EXPECTATION_COLOR[expectation] || "bg-gray-500/70"} text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20`}
          >
            {expectation}
          </div>
        )}
        {(type === "anime" || type === "cartoon") && data.airing_type && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {type === "anime" && <i className="fas fa-tv mr-1 text-brand"></i>}
            {data.airing_type}
          </div>
        )}
        {bahaFlag &&
          (hasBahaLink ? (
            <a
              href={data.baha_link}
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
      </>
    );
  }

  return (
    <>
      {data.my_rating && (
        <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
          <i className="fas fa-star text-[8px] mr-1"></i>
          {data.my_rating}
        </div>
      )}
      {(type === "anime" || type === "cartoon") && data.airing_type && (
        <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
          {type === "anime" && <i className="fas fa-tv mr-1 text-brand"></i>}
          {data.airing_type}
        </div>
      )}
      {type === "anime-movie" && data.mal_rating && (
        <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg z-10 flex items-center shadow-sm">
          <i className="fas fa-star text-[8px] mr-1"></i>
          {data.mal_rating}
        </div>
      )}
      {(type === "movie" || type === "tv-show") &&
        data.imdb_rating &&
        data.imdb_rating !== "N/A" && (
          <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {data.imdb_rating}
          </div>
        )}
      {type === "tv-show" && data.region && (
        <div className="absolute bottom-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
          {data.region}
        </div>
      )}
      {(type === "manga" || type === "novel") && data.region && (
        <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
          {data.region}
        </div>
      )}
      {bahaFlag && (
        <div
          className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center"
          title="Available on Bahamut"
        >
          <img
            src="https://i2.bahamut.com.tw/anime/logo.svg"
            className="h-3 opacity-90"
            alt="Baha"
          />
        </div>
      )}
    </>
  );
}

function LibraryMeta({ type, data }) {
  if (type === "anime") {
    const malText = data.mal_rating ? (
      <>
        <i className="fas fa-star text-blue-500 mr-0.5"></i>
        {data.mal_rating}
      </>
    ) : (
      <>
        <i className="fas fa-star text-gray-300 mr-0.5"></i>-
      </>
    );
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between">
        <span className="truncate pr-1">{getReleaseFallback(data)}</span>
        <span className="shrink-0 flex items-center">{malText}</span>
      </div>
    );
  }

  if (type === "tv-show") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between gap-1">
        {data.season_part && (
          <span className="truncate pr-1">{data.season_part}</span>
        )}
        {data.airing_status && (
          <span className="shrink-0 truncate">{data.airing_status}</span>
        )}
      </div>
    );
  }

  if (type === "cartoon") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between gap-1">
        <span className="truncate pr-1">{data.release_date || "TBD"}</span>
        {data.imdb_rating && data.imdb_rating !== "N/A" && (
          <span className="shrink-0 flex items-center gap-0.5 text-yellow-600 font-bold">
            <i className="fas fa-star text-[8px]"></i>
            {data.imdb_rating}
          </span>
        )}
      </div>
    );
  }

  if (type === "anime-movie") {
    const length = formatLength(data.length_min);
    const releaseYear = getReleaseYearFromDate(data.release_date_jp);
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between gap-1">
        {length && (
          <span className="flex items-center gap-0.5 shrink-0">
            <i className="fas fa-clock text-gray-400"></i>
            {length}
          </span>
        )}
        {releaseYear && <span className="truncate">{releaseYear}</span>}
      </div>
    );
  }

  if (type === "movie") {
    const length = formatLength(data.length_min);
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between gap-1">
        {length && (
          <span className="flex items-center gap-0.5 shrink-0">
            <i className="fas fa-clock text-gray-400"></i>
            {length}
          </span>
        )}
        {data.release_date_usa && (
          <span className="truncate">{data.release_date_usa}</span>
        )}
      </div>
    );
  }

  if (type === "manga") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-1 flex items-center justify-between gap-1">
        <span className="truncate pr-1">
          {data.release_year || "?"}
          {data.end_year && data.end_year !== data.release_year
            ? ` – ${data.end_year}`
            : ""}
        </span>
        {data.mal_rating && (
          <span className="shrink-0 flex items-center gap-0.5 text-blue-600 font-bold">
            <i className="fas fa-star text-[8px]"></i>
            {data.mal_rating}
          </span>
        )}
      </div>
    );
  }

  if (type === "novel") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mb-1 flex items-end justify-between gap-1">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {(data.type || data.serialization_status || data.version) && (
            <div className="flex items-center gap-1">
              {data.type && (
                <span className="shrink-0 text-[9px] font-black px-1 py-0.5 rounded bg-gray-100 text-gray-500">
                  {data.type}
                </span>
              )}
              {data.serialization_status && (
                <span
                  className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded border ${serializationStatusCls(data.serialization_status)}`}
                >
                  {data.serialization_status}
                </span>
              )}
              {data.version && (
                <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                  {data.version}
                </span>
              )}
            </div>
          )}
          <span className="truncate">
            {data.release_year || "?"}
            {data.end_year && data.end_year !== data.release_year
              ? ` – ${data.end_year}`
              : ""}
          </span>
        </div>
        {data.mal_rating && (
          <span className="shrink-0 flex items-center gap-0.5 text-blue-600 font-bold">
            <i className="fas fa-star text-[8px]"></i>
            {data.mal_rating}
          </span>
        )}
      </div>
    );
  }

  return null;
}

function ProgressDisplay({ type, data, showVol, onToggleVol }) {
  if (type === "anime") {
    const localFin = data.ep_fin || 0;
    const localTotal =
      data.ep_total != null && data.ep_total !== ""
        ? parseInt(data.ep_total, 10)
        : "?";
    return (
      <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
        {localFin} <span className="text-gray-400">/</span> {localTotal}
        <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
          EP
        </span>
      </div>
    );
  }

  if (type === "tv-show" || type === "cartoon") {
    const epFin = data.ep_fin ?? 0;
    const epTotal =
      data.ep_total != null && data.ep_total !== ""
        ? parseInt(data.ep_total, 10)
        : "?";
    return (
      <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
        {epFin} <span className="text-gray-400">/</span> {epTotal}
        <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
          EP
        </span>
      </div>
    );
  }

  if (type === "manga") {
    const chFin = data.ch_fin ?? 0;
    const chTotal = data.ch_total != null ? data.ch_total : "?";
    const volFin = data.vol_fin ?? 0;
    const volTotal = data.vol_total != null ? data.vol_total : "?";
    const volFinPage = data.vol_fin_page ?? 0;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVol();
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
            <span className="text-gray-400">/</span> {volTotal}
            <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
              VOL
            </span>
          </div>
        ) : (
          <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
            {chFin} <span className="text-gray-400">/</span> {chTotal}
            <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">
              CH
            </span>
          </div>
        )}
      </div>
    );
  }

  if (type === "novel") {
    const pd = data.progress_display;
    if (pd === "vol_tw") {
      return (
        <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700 tracking-tight">
          <span className="font-mono">
            {data.vol_fin ?? 0} /{" "}
            {data.vol_total_tw != null ? data.vol_total_tw : "?"}
          </span>
          <span className="text-[9px] text-gray-400">VOL TW</span>
        </div>
      );
    }
    if (pd === "arc_ch") {
      return (
        <span className="font-mono text-[10px] font-bold text-gray-700">
          {data.arc_fin ?? 0}/{data.arc_total ?? "?"} ARC &nbsp;
          {data.ch_fin ?? 0}/{data.ch_total ?? "?"} CH
        </span>
      );
    }
    if (pd === "ch") {
      return (
        <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700 tracking-tight">
          <span className="font-mono">
            {data.ch_fin ?? 0} / {data.ch_total != null ? data.ch_total : "?"}
          </span>
          <span className="text-[9px] text-gray-400">CH</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700 tracking-tight">
        <span className="font-mono">
          {data.vol_fin ?? 0} /{" "}
          {data.vol_total_original != null ? data.vol_total_original : "?"}
        </span>
        <span className="text-[9px] text-gray-400">VOL</span>
      </div>
    );
  }

  return null;
}

function FutureMeta({ type, data }) {
  if (type === "anime") {
    return data.studio ? (
      <p className="text-[10px] text-gray-400 truncate mt-0.5">{data.studio}</p>
    ) : null;
  }
  if (type === "anime-movie") {
    const length = formatLength(data.length_min);
    const releaseYear = getReleaseYearFromDate(data.release_date_jp);
    return (
      <div className="text-[10px] text-gray-500 font-medium mt-1 flex items-center justify-between gap-1">
        {length && (
          <span className="flex items-center gap-0.5 shrink-0">
            <i className="fas fa-clock text-gray-400"></i>
            {length}
          </span>
        )}
        {releaseYear && <span className="truncate">{releaseYear}</span>}
      </div>
    );
  }
  if (type === "movie") {
    const length = formatLength(data.length_min);
    const d = data.release_date_usa || data.release_date_tw || "";
    const parts = String(d).trim().split(/[\s-]/);
    const lastPart = parts[parts.length - 1];
    const releaseYear = /^\d{4}$/.test(lastPart) ? lastPart : "TBD";
    return (
      <div className="text-[10px] text-gray-500 font-medium mt-1 flex items-center justify-between gap-1">
        {length && (
          <span className="flex items-center gap-0.5 shrink-0">
            <i className="fas fa-clock text-gray-400"></i>
            {length}
          </span>
        )}
        <span className="truncate">{releaseYear}</span>
      </div>
    );
  }
  if (type === "tv-show") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mt-1 flex items-center justify-between gap-1">
        {data.region && <span className="shrink-0">{data.region}</span>}
        <span className="truncate">{data.release_date || "TBD"}</span>
      </div>
    );
  }
  if (type === "cartoon") {
    return (
      <div className="text-[10px] text-gray-500 font-medium mt-1 truncate">
        {data.release_date || "TBD"}
      </div>
    );
  }
  return null;
}

const HAS_PROGRESS = new Set(["anime", "tv-show", "cartoon", "manga", "novel"]);
const ADMIN_ONLY_STATUS = new Set(["movie", "anime-movie"]);

export default function MediaCard({
  type,
  variant = "library",
  data,
  franchiseDict = {},
  isAdmin: isAdminProp,
  onUpdated,
}) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showVol, setShowVol] = useState(false);
  const statusMutation = useStatusToggle(type);

  const config = MEDIA_CONFIG[type];
  const { statusField, navPath, statusType } = config;

  const title = getDisplayName(data, type);
  const imageUrl = getCoverUrl(data.cover_image_file);
  const currentStatus =
    data[statusField] || (statusType === "read" ? "Might Read" : "Might Watch");
  const btnConfig =
    statusType === "read"
      ? getReadingButtonConfig(currentStatus)
      : getStatusButtonConfig(currentStatus);
  const needsExtra = !FUTURE_WATCHING_OPTIONS.includes(currentStatus);

  async function handleStatusToggle(e) {
    e.stopPropagation();
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        value: btnConfig.target,
      });
      showToast("success", `Status -> ${btnConfig.target}`);
      onUpdated?.(updated);
    } catch {
      showToast("error", "Network error");
    }
  }

  async function handleStatusChange(e) {
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        value: newStatus,
      });
      onUpdated?.(updated);
    } catch {
      showToast("error", "Network error");
    }
  }

  async function handleBoltAction(e) {
    e.stopPropagation();
    const airingStatus = BOLT_AIRING_STATUS[type];
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        field: "airing_status",
        value: airingStatus,
      });
      onUpdated?.(updated);
      showToast("success", `${title} marked as ${airingStatus}`);
    } catch {
      showToast("error", "Network error");
    }
  }

  const statusBtn = showAdmin ? (
    <button
      onClick={handleStatusToggle}
      className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
      title={`${currentStatus} → ${btnConfig.target}`}
    >
      {btnConfig.symbol}
    </button>
  ) : !ADMIN_ONLY_STATUS.has(type) && currentStatus ? (
    <div
      className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
      title={currentStatus}
    >
      {currentStatus}
    </div>
  ) : null;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navPath && navigate(`${navPath}/${data.system_id}`)}
    >
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        <PosterBadges
          type={type}
          variant={variant}
          data={data}
          franchiseDict={franchiseDict}
        />
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

      <div className="p-3 flex flex-col flex-1 relative z-20 bg-white">
        <h3
          className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5"
          title={title}
        >
          {title}
        </h3>

        {variant === "future" ? (
          <>
            <FutureMeta type={type} data={data} />
            <div className="mt-auto flex items-center gap-1 border-t border-gray-100 pt-2.5">
              {showAdmin && (
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
                    {FUTURE_WATCHING_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBoltAction}
                    className="w-6 h-6 flex items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-[10px] shrink-0"
                    title={`Mark as ${BOLT_AIRING_STATUS[type]}`}
                  >
                    <i className="fas fa-bolt"></i>
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <LibraryMeta type={type} data={data} />
            <div
              className={`mt-auto flex items-center border-t border-gray-100 pt-2.5 ${HAS_PROGRESS.has(type) ? "justify-between" : "justify-end"}`}
            >
              {HAS_PROGRESS.has(type) && (
                <ProgressDisplay
                  type={type}
                  data={data}
                  showVol={showVol}
                  onToggleVol={() => setShowVol((v) => !v)}
                />
              )}
              {statusBtn}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
