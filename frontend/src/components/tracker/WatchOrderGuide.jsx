// Frontend: read-only renderer for one watch order's steps.
//
// Used in two places at two densities: compact inside the Franchise/Collection
// page tab, roomy on the standalone /watch-order/:id page. Guests see it too,
// so nothing here writes.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { getCardStatusConfig } from "../../lib/status";

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
};

/** "Ep 1-10", "Ep 5", "Ch 1-40" — or nothing when the step is the whole entry. */
function rangeLabel(item) {
  if (item.ep_start == null && item.ep_end == null) return null;
  const unit = item.media_type === "manga" || item.media_type === "novel" ? "Ch" : "Ep";
  if (item.ep_start != null && item.ep_end != null) {
    return item.ep_start === item.ep_end
      ? `${unit} ${item.ep_start}`
      : `${unit} ${item.ep_start}-${item.ep_end}`;
  }
  return item.ep_start != null
    ? `${unit} ${item.ep_start}+`
    : `${unit} up to ${item.ep_end}`;
}

function entryPath(item) {
  const navPath = MEDIA_CONFIG[item.media_type]?.navPath;
  return navPath ? `${navPath}/${item.entry_id}` : null;
}

function StepRow({ item, index, roomy }) {
  const label = rangeLabel(item);
  const path = entryPath(item);
  // getCardStatusConfig, not getStatusStyle: reading statuses ("Active
  // Reading", "Might Read") have no entry in the watching style map and would
  // all fall back to the same grey.
  const statusStyle = item.status
    ? getCardStatusConfig(item.media_type, item.status)
    : null;

  // A deleted entry leaves the step behind on purpose, so it stays visible and
  // can be removed rather than silently vanishing from the guide.
  if (item.missing) {
    return (
      <li className="flex items-center gap-3 py-3 px-3 rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <span className="w-7 h-7 shrink-0 rounded-full bg-gray-200 text-gray-500 text-xs font-black flex items-center justify-center">
          {index}
        </span>
        <i className="fas fa-triangle-exclamation text-gray-400"></i>
        <span className="text-sm font-medium text-gray-400">
          Entry no longer exists
        </span>
      </li>
    );
  }

  const body = (
    <>
      <span
        className={`shrink-0 rounded-full bg-brand/10 text-brand font-black flex items-center justify-center ${
          roomy ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs"
        }`}
      >
        {index}
      </span>

      <img
        src={getCoverUrl(item.cover_image_file)}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.src = FALLBACK_SVG;
        }}
        className={`shrink-0 rounded-lg object-cover bg-gray-100 ${
          roomy ? "w-14 h-20" : "w-10 h-14"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`font-bold text-gray-900 truncate ${
              roomy ? "text-base" : "text-sm"
            }`}
          >
            {item.display_name}
          </span>
          {label && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 whitespace-nowrap">
              {label}
            </span>
          )}
          {item.is_optional && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
              Optional
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-[11px] font-bold text-gray-400">
            {TYPE_LABELS[item.media_type] || item.media_type}
          </span>
          {item.total_episodes != null && (
            <span className="text-[11px] font-medium text-gray-400">
              {item.total_episodes} total
            </span>
          )}
          {statusStyle && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusStyle.cls}`}
            >
              {item.status}
            </span>
          )}
        </div>

        {item.note && (
          <p
            className={`text-gray-500 font-medium mt-1 ${
              roomy ? "text-sm" : "text-xs"
            }`}
          >
            {item.note}
          </p>
        )}
      </div>
    </>
  );

  const rowClass = `flex items-center gap-3 rounded-xl border transition-colors ${
    roomy ? "py-3 px-4" : "py-2.5 px-3"
  } ${
    item.is_optional
      ? "border-gray-100 bg-gray-50/60 opacity-75 hover:opacity-100"
      : "border-gray-200 bg-white hover:border-brand/40"
  }`;

  return (
    <li>
      {path ? (
        <Link to={path} className={rowClass}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

export default function WatchOrderGuide({ list, roomy = false }) {
  const [hideOptional, setHideOptional] = useState(false);

  const items = useMemo(() => list?.items || [], [list]);
  const optionalCount = items.filter((i) => i.is_optional).length;
  const visible = hideOptional ? items.filter((i) => !i.is_optional) : items;

  if (!list) return null;

  if (!items.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <i className="fas fa-list-ol text-2xl mb-2"></i>
        <p className="font-medium text-sm">This watch order has no steps yet.</p>
      </div>
    );
  }

  return (
    <div>
      {list.remark && (
        <p
          className={`text-gray-600 font-medium mb-3 ${
            roomy ? "text-sm" : "text-xs"
          }`}
        >
          {list.remark}
        </p>
      )}

      {optionalCount > 0 && (
        <label className="inline-flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideOptional}
            onChange={(e) => setHideOptional(e.target.checked)}
            className="accent-brand"
          />
          Hide optional ({optionalCount})
        </label>
      )}

      {/*
        Numbering follows the visible rows, so hiding optional steps renumbers
        1..N instead of leaving gaps the reader has to mentally close.
      */}
      <ol className="flex flex-col gap-2">
        {visible.map((item, index) => (
          <StepRow
            key={item.system_id}
            item={item}
            index={index + 1}
            roomy={roomy}
          />
        ))}
      </ol>
    </div>
  );
}
