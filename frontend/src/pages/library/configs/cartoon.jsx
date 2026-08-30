import {
  airingStatusColumn,
  franchiseColumn,
  imdbRatingColumn,
  imdbRatingSort,
  myRatingColumn,
  myRatingSort,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import {
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
} from "../../../utils/media";

function getTitle(c)   { return c.cartoon_name_cn || c.cartoon_name_en || c.cartoon_name_alt || ""; }
function getSortKey(c) { return c.cartoon_name_en || c.cartoon_name_alt || c.cartoon_name_cn || ""; }

// ---------------------------------------------------------------------------
// Cartoon library config
// ---------------------------------------------------------------------------
const CARTOON_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/cartoon",
  defaultSort: "title",
  searchPlaceholder: "Search cartoons, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    const releaseYear = item.release_date ? String(item.release_date).slice(0, 4) : "";
    return [
      item.cartoon_name_cn, item.cartoon_name_en, item.cartoon_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,    s?.series_name_en,    s?.series_name_alt,
      releaseYear,
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "airingStatus",
      label: "Airing Status",
      type: "set",
      options: ["Finished Airing", "Airing", "Not Yet Aired", "Canceled", "Rumored"],
      match: (item, active) => active.has(item.airing_status),
    },
    {
      key: "airingType",
      label: "Airing Type",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.airing_type).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.airing_type),
    },
    {
      key: "watchingStatus",
      label: "Watch Status",
      type: "set-grouped",
      groupOptions: ["Watching", "Planned", "Completed", "Dropped", "Might Watch"],
      match: (item, active) =>
        active.has(WATCHING_STATUS_GROUP[item.watching_status] ?? "Might Watch"),
    },
    {
      key: "officialSource",
      label: "Official Source",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.source_official).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.source_official),
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
      compare: (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
    },
    myRatingSort,
    imdbRatingSort,
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
      render: (item) => item.cartoon_name_en || "-",
    },
    {
      key: "type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center font-bold text-gray-600 hidden md:table-cell",
      render: (item) => item.airing_type || "-",
    },
    {
      key: "season",
      header: "Season",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden md:table-cell",
      render: (item) => item.season_part || "-",
    },
    airingStatusColumn({ key: "airing", header: "Airing" }),
    {
      key: "ep",
      header: "EP",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden lg:table-cell",
      render: (item) => `${item.ep_fin ?? 0} / ${item.ep_total ?? "?"}`,
    },
    {
      key: "source",
      header: "Source",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden lg:table-cell truncate max-w-[8rem]",
      render: (item) => item.source_official || "-",
    },
    myRatingColumn(),
    imdbRatingColumn(),
    watchButtonColumn(),
  ],
};

export default CARTOON_LIBRARY_CONFIG;
