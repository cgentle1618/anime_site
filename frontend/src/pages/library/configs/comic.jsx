import {
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  readButtonColumn,
} from "../../../components/layout/libraryColumns";
import {
  releaseScore,
} from "../../../lib/releaseDate";
import {
  READING_STATUS_GROUP,
  getRatingWeight,
  getReadingButtonConfig,
  parseTypes,
} from "../../../utils/media";

// EN leads for comics, matching Comic.display_name on the backend and
// NAMING_CONFIGS. Every other library type leads with CN.
function getTitle(c) {
  return c.comic_name_en || c.comic_name_cn || c.comic_name_alt || "";
}

// ---------------------------------------------------------------------------
// Comic library config
// ---------------------------------------------------------------------------
const COMIC_LIBRARY_CONFIG = {
  usesSeries: true,
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
    myRatingSort,
  ],

  tableColumns: [
    franchiseColumn(),
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
    myRatingColumn(),
    readButtonColumn(),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default COMIC_LIBRARY_CONFIG;
