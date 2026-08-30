// Frontend: table columns and sort comparators shared by every library config.
//
// Each library type declares its columns in pages/library/configs/*.jsx. The
// columns below were copied into all eight of them; a change to how a rating
// pill or the watch/read toggle looks now happens once, here.
import {
  getRatingWeight,
  getReadingButtonConfig,
  getStatusButtonConfig,
} from "../../utils/media";
import { AIRING_STATUS_CLS } from "../../config/statusGroups";

const HIDDEN = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/** Parent franchise, CN → EN → roman, or an italic "None". */
export function franchiseColumn() {
  return {
    key: "franchise",
    header: "Franchise",
    tdClass: "text-xs text-text-muted font-medium truncate max-w-[12rem]",
    render: (item, { franchiseDict }) => {
      const f = franchiseDict[item.franchise_id];
      return f ? (
        f.franchise_name_cn || f.franchise_name_en || f.franchise_name_roman || "Unknown"
      ) : (
        <span className="text-text-faint/60 italic">None</span>
      );
    },
  };
}

/** Airing status pill; `hidden` picks the breakpoint below which it collapses. */
export function airingStatusColumn({ key = "status", header = "Status", hidden = "md" } = {}) {
  const cls = hidden ? HIDDEN[hidden] : "";
  return {
    key,
    header,
    thClass: cls,
    tdClass: `text-center ${cls}`.trim(),
    render: (item) => (
      <span
        className={`px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${
          AIRING_STATUS_CLS[item.airing_status] ?? AIRING_STATUS_CLS._default
        }`}
      >
        {item.airing_status || "-"}
      </span>
    ),
  };
}

export function myRatingColumn() {
  return {
    key: "my",
    header: "My",
    thClass: HIDDEN.lg,
    tdClass: `text-center ${HIDDEN.lg}`,
    render: (item) =>
      item.my_rating ? (
        <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">
          {item.my_rating}
        </span>
      ) : (
        "-"
      ),
  };
}

export function malRatingColumn({ hidden = "lg" } = {}) {
  return {
    key: "mal",
    header: "MAL",
    thClass: HIDDEN[hidden],
    tdClass: `text-xs text-center ${HIDDEN[hidden]}`,
    render: (item) =>
      item.mal_rating != null && item.mal_rating !== "" ? (
        <span className="font-bold text-blue-600">{item.mal_rating}</span>
      ) : (
        "-"
      ),
  };
}

export function imdbRatingColumn() {
  return {
    key: "imdb",
    header: "IMDb",
    thClass: HIDDEN.lg,
    tdClass: `text-xs text-center ${HIDDEN.lg}`,
    render: (item) =>
      item.imdb_rating && item.imdb_rating !== "N/A" ? (
        <span className="font-bold text-yellow-600">{item.imdb_rating}</span>
      ) : (
        "-"
      ),
  };
}

function statusToggleColumn({ key, header, statusField, buttonConfig, fallback, hidden }) {
  const cls = hidden ? HIDDEN[hidden] : "";
  return {
    key,
    header,
    thClass: cls,
    tdClass: `text-center ${cls}`.trim(),
    stopPropagation: true,
    render: (item, { isAdmin, handleStatusToggle }) => {
      const status = item[statusField];
      const btn = buttonConfig(status);
      if (isAdmin) {
        return (
          <button
            type="button"
            onClick={(e) => handleStatusToggle(e, item, btn.target)}
            className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors mx-auto font-bold text-[13px] leading-none ${btn.cls}`}
            title={`${status ?? fallback} → ${btn.target}`}
          >
            {btn.symbol}
          </button>
        );
      }
      return status ? (
        <div className="text-[9px] font-bold text-text-faint bg-surface-2 border border-border rounded px-1 py-0.5 mx-auto max-w-full truncate">
          {status}
        </div>
      ) : (
        "-"
      );
    },
  };
}

/** Admin: one-click advance of watching_status; viewer: the status as text. */
export function watchButtonColumn() {
  return statusToggleColumn({
    key: "watch",
    header: "Watch",
    statusField: "watching_status",
    buttonConfig: getStatusButtonConfig,
    fallback: "Might Watch",
  });
}

/** Same for reading_status (manga, novel, comic). Collapses below xl. */
export function readButtonColumn() {
  return statusToggleColumn({
    key: "read",
    header: "Read",
    statusField: "reading_status",
    buttonConfig: getReadingButtonConfig,
    fallback: "Might Read",
    hidden: "xl",
  });
}

/** A plan-next / rewatch checkbox bound to one virtual boolean field. */
export function planFlagColumn(field, header) {
  return {
    key: field,
    header,
    thClass: HIDDEN.xl,
    tdClass: `text-center ${HIDDEN.xl}`,
    stopPropagation: true,
    render: (item, { isAdmin, handleStatusToggle }) => (
      <input
        type="checkbox"
        checked={!!item[field]}
        disabled={!isAdmin}
        onChange={(e) => handleStatusToggle(e, item, e.target.checked, field)}
        className="w-4 h-4 rounded accent-brand disabled:opacity-40"
      />
    ),
  };
}

// ---------------------------------------------------------------------------
// Sort comparators
// ---------------------------------------------------------------------------

export const myRatingSort = {
  key: "my_rating",
  label: "My Rating",
  compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
};

function numericDesc(read) {
  return (a, b) => read(b) - read(a);
}

export const malRatingSort = {
  key: "mal_rating",
  label: "MAL Rating",
  compare: numericDesc((x) => (x.mal_rating != null ? parseFloat(x.mal_rating) : -1)),
};

export const imdbRatingSort = {
  key: "imdb_rating",
  label: "IMDb Rating",
  compare: numericDesc((x) =>
    x.imdb_rating && x.imdb_rating !== "N/A" ? parseFloat(x.imdb_rating) : -1
  ),
};
