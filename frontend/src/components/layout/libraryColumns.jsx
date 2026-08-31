// Frontend: table columns and sort comparators shared by every library config.
//
// Each library type declares its columns in pages/library/configs/*.jsx. The
// columns below were copied into all eight of them; a change to how a rating
// chip or the watch/read toggle looks now happens once, here.
//
// Colour never encodes a category here: airing status and the toggle's
// target are text in a chip, the rating figures are plain mono numerals.
import {
  getRatingWeight,
  getReadingButtonConfig,
  getStatusButtonConfig,
} from "../../utils/media";
import { Chip } from "../ui/primitives";

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

/** Airing status chip; `hidden` picks the breakpoint below which it collapses. */
export function airingStatusColumn({ key = "status", header = "Status", hidden = "md" } = {}) {
  const cls = hidden ? HIDDEN[hidden] : "";
  return {
    key,
    header,
    thClass: cls,
    tdClass: `text-center ${cls}`.trim(),
    render: (item) =>
      item.airing_status ? <Chip className="text-[9px]">{item.airing_status}</Chip> : "-",
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
        <span className="inline-flex items-center justify-center w-6 h-6 border border-brand text-brand font-display font-bold text-sm leading-none">
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
        <span className="font-mono text-text tabular-nums">{item.mal_rating}</span>
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
        <span className="font-mono text-text tabular-nums">{item.imdb_rating}</span>
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
            className="w-6 h-6 flex items-center justify-center border border-border-strong bg-surface text-text-muted hover:border-text hover:text-text transition-colors mx-auto font-mono text-[13px] leading-none"
            title={`${status ?? fallback} → ${btn.target}`}
          >
            {btn.symbol}
          </button>
        );
      }
      return status ? (
        <Chip tone="muted" className="text-[9px] max-w-full">
          {status}
        </Chip>
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
        className="w-4 h-4 accent-brand disabled:opacity-40"
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
