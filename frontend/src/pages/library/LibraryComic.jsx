// Frontend: page component file for LibraryComic.
import LibraryLayout from "../../components/layout/LibraryLayout";
import { releaseScore } from "../../lib/releaseDate";
import { useMediaList, LIST_OPTIONS } from "../../hooks/useMediaList";
import {
  READING_STATUS_GROUP,
  getRatingWeight,
  getReadingButtonConfig,
  parseTypes,
} from "../../utils/media";

// EN leads for comics, matching Comic.display_name on the backend and
// NAMING_CONFIGS. Every other library type leads with CN.
function getTitle(c) {
  return c.comic_name_en || c.comic_name_cn || c.comic_name_alt || "";
}

// ---------------------------------------------------------------------------
// Comic library config
// ---------------------------------------------------------------------------
const COMIC_LIBRARY_CONFIG = {
  navPath: "/comic",
  defaultSort: "title",
  searchPlaceholder: "Search comics, franchise, series, writer...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.comic_name_en, item.comic_name_cn, item.comic_name_alt,
      item.volume_label, item.writer,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      String(item.release_date ?? ""),
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "comicType",
      label: "Type",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.comic_type).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.comic_type),
    },
    {
      key: "readingStatus",
      label: "Read Status",
      type: "set-grouped",
      groupOptions: ["Reading", "Planned", "Completed", "Dropped", "Might Read"],
      match: (item, active) =>
        active.has(READING_STATUS_GROUP[item.reading_status] ?? "Might Read"),
    },
    {
      key: "era",
      label: "Era",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.era).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.era),
    },
    {
      // events is comma-joined multi-value, so both the option list and the
      // match test work over the split list rather than the raw column - the
      // one filter here that cannot compare a single field.
      key: "events",
      label: "Event",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.flatMap((d) => parseTypes(d.events)))].sort(),
      match: (item, active) =>
        parseTypes(item.events).some((ev) => active.has(ev)),
    },
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: (a, b) =>
        getTitle(a).localeCompare(getTitle(b), undefined, { numeric: true }),
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    {
      key: "my_rating",
      label: "My Rating",
      compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
    },
  ],

  tableColumns: [
    {
      key: "franchise",
      header: "Franchise",
      tdClass: "text-xs text-gray-600 font-medium truncate max-w-[12rem]",
      render: (item, { franchiseDict }) => {
        const f = franchiseDict[item.franchise_id];
        return f
          ? f.franchise_name_cn || f.franchise_name_en || f.franchise_name_roman || "Unknown"
          : <span className="text-gray-300 italic">None</span>;
      },
    },
    {
      key: "title_en",
      header: "Title EN",
      tdClass: "text-xs font-bold text-gray-900",
      render: (item) => getTitle(item),
    },
    {
      key: "title_cn",
      header: "Title CN",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-gray-500 hidden md:table-cell",
      render: (item) => item.comic_name_cn || "-",
    },
    {
      key: "volume_label",
      header: "Vol",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-600 hidden md:table-cell",
      render: (item) => item.volume_label || "-",
    },
    {
      key: "comic_type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden md:table-cell",
      render: (item) => item.comic_type || "-",
    },
    {
      key: "era",
      header: "Era",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center hidden lg:table-cell",
      render: (item) =>
        item.era ? (
          <span className="bg-red-50 text-red-700 border border-red-100 font-bold px-2 py-0.5 rounded text-[10px]">
            {item.era}
          </span>
        ) : "-",
    },
    {
      key: "progress",
      header: "Progress",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden lg:table-cell",
      render: (item) =>
        `${item.issue_fin ?? 0} / ${item.issue_total ?? "?"} ISS`,
    },
    {
      key: "my",
      header: "My",
      thClass: "hidden lg:table-cell",
      tdClass: "text-center hidden lg:table-cell",
      render: (item) => item.my_rating
        ? <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">{item.my_rating}</span>
        : "-",
    },
    {
      key: "read",
      header: "Read",
      thClass: "hidden xl:table-cell",
      tdClass: "text-center hidden xl:table-cell",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => {
        const btn = getReadingButtonConfig(item.reading_status);
        return isAdmin ? (
          <button
            onClick={(e) => handleStatusToggle(e, item, btn.target)}
            className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors mx-auto font-bold text-[13px] leading-none ${btn.cls}`}
            title={`${item.reading_status ?? "Might Read"} → ${btn.target}`}
          >
            {btn.symbol}
          </button>
        ) : item.reading_status ? (
          <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate">
            {item.reading_status}
          </div>
        ) : "-";
      },
    },
    {
      key: "to_reread",
      header: "To Reread",
      thClass: "hidden xl:table-cell",
      tdClass: "text-center hidden xl:table-cell",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => (
        <input
          type="checkbox"
          checked={!!item.to_reread}
          disabled={!isAdmin}
          onChange={(e) => handleStatusToggle(e, item, e.target.checked, "to_reread")}
          className="w-4 h-4 rounded accent-brand disabled:opacity-40"
        />
      ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LibraryComic() {
  const comicsQuery    = useMediaList("comic",     LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery    = useMediaList("series",    LIST_OPTIONS);

  const isLoading =
    comicsQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    comicsQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  return (
    <LibraryLayout
      type="comic"
      config={COMIC_LIBRARY_CONFIG}
      data={comicsQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={seriesQuery.data ?? []}
      isLoading={isLoading}
      error={error}
    />
  );
}
