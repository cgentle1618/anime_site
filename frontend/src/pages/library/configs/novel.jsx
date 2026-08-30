import {
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
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
  getNovelProgress,
} from "../../../utils/media";

function getTitle(n)   {
  return n.novel_name_cn || n.novel_name_en || n.novel_name_roman
      || n.novel_name_jp  || n.novel_name_alt || "";
}
function getSortKey(n) {
  return n.novel_name_en || n.novel_name_roman || n.novel_name_cn
      || n.novel_name_jp  || n.novel_name_alt  || "";
}

// ---------------------------------------------------------------------------
// Novel library config
// ---------------------------------------------------------------------------
const NOVEL_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/novel",
  defaultSort: "title",
  searchPlaceholder: "Search novels, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.novel_name_cn, item.novel_name_en, item.novel_name_roman,
      item.novel_name_jp, item.novel_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      String(item.release_date ?? ""),
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "serializationStatus",
      label: "Serialization Status",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.serialization_status).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.serialization_status),
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
      key: "region",
      label: "Region",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.region).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.region),
    },
    {
      key: "type",
      label: "Type",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.type).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.type),
    },
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: (a, b) =>
        getSortKey(a).localeCompare(getSortKey(b), undefined, { numeric: true }),
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    {
      key: "end_date",
      label: "Ending Date",
      compare: (a, b) => releaseScore(b.end_date) - releaseScore(a.end_date),
    },
    myRatingSort,
    malRatingSort,
  ],

  tableColumns: [
    franchiseColumn(),
    {
      key: "title_cn",
      header: "Title CN",
      tdClass: "text-xs font-bold text-gray-900",
      render: (item) => getTitle(item),
    },
    {
      key: "title_en",
      header: "Title EN",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-gray-500 hidden md:table-cell",
      render: (item) => item.novel_name_en || item.novel_name_roman || "-",
    },
    {
      key: "status",
      header: "Status",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden md:table-cell",
      render: (item) => item.serialization_status || "-",
    },
    {
      key: "progress",
      header: "Progress",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden lg:table-cell",
      render: (item) => getNovelProgress(item),
    },
    myRatingColumn(),
    malRatingColumn(),
    readButtonColumn(),
    planFlagColumn("read_next", "Read Next"),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default NOVEL_LIBRARY_CONFIG;
