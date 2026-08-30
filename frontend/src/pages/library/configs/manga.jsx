import {
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  readButtonColumn,
} from "../../../components/layout/libraryColumns";
import { releaseScore } from "../../../lib/releaseDate";
import { READING_STATUS_GROUP } from "../../../utils/media";

function getTitle(m)   {
  return m.manga_name_cn || m.manga_name_en || m.manga_name_roman
      || m.manga_name_jp  || m.manga_name_alt || "";
}
function getSortKey(m) {
  return m.manga_name_en || m.manga_name_roman || m.manga_name_cn
      || m.manga_name_jp  || m.manga_name_alt  || "";
}

// ---------------------------------------------------------------------------
// Manga library config
// ---------------------------------------------------------------------------
const MANGA_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/manga",
  defaultSort: "title",
  searchPlaceholder: "Search manga, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.manga_name_cn, item.manga_name_en, item.manga_name_roman,
      item.manga_name_jp, item.manga_name_alt,
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
      tdClass: "text-xs font-bold text-text",
      render: (item) => getTitle(item),
    },
    {
      key: "title_en",
      header: "Title EN",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-text-faint hidden md:table-cell",
      render: (item) => item.manga_name_en || item.manga_name_roman || "-",
    },
    {
      key: "status",
      header: "Status",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.serialization_status || "-",
    },
    {
      key: "ch",
      header: "CH",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.ch_fin ?? 0} / ${item.ch_total ?? "?"}`,
    },
    {
      key: "vol",
      header: "VOL",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.vol_fin ?? 0} / ${item.vol_total ?? "?"}`,
    },
    myRatingColumn(),
    malRatingColumn(),
    readButtonColumn(),
    planFlagColumn("read_next", "Read Next"),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default MANGA_LIBRARY_CONFIG;
