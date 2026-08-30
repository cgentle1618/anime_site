import {
  airingStatusColumn,
  franchiseColumn,
  imdbRatingColumn,
  imdbRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { WATCHING_STATUS_GROUP } from "../../../utils/media";

function getTitle(s)   { return s.tv_name_cn || s.tv_name_en || s.tv_name_alt || ""; }
function getSortKey(s) { return s.tv_name_en || s.tv_name_alt || s.tv_name_cn || ""; }

// ---------------------------------------------------------------------------
// TV Show library config
// ---------------------------------------------------------------------------
const TV_LIBRARY_CONFIG = {
  usesSeries: false,
  navPath: "/tv-show",
  defaultSort: "title",
  searchPlaceholder: "Search TV shows, franchise, region...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.tv_name_cn, item.tv_name_en, item.tv_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      item.season_part, item.region,
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
      key: "watchingStatus",
      label: "Watch Status",
      type: "set-grouped",
      groupOptions: ["Watching", "Planned", "Completed", "Dropped", "Might Watch"],
      match: (item, active) =>
        active.has(WATCHING_STATUS_GROUP[item.watching_status] ?? "Might Watch"),
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
      compare: (a, b) => getSortKey(a).toLowerCase().localeCompare(getSortKey(b).toLowerCase()),
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
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.tv_name_en || "";
        return (
          <>
            <div className="text-xs font-bold text-text leading-tight line-clamp-1">{main}</div>
            {sub && sub !== main && (
              <div className="text-[9px] text-text-faint line-clamp-1">{sub}</div>
            )}
          </>
        );
      },
    },
    {
      key: "season",
      header: "Season",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.season_part || "-",
    },
    airingStatusColumn(),
    {
      key: "ep",
      header: "EP",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.ep_fin ?? 0} / ${item.ep_total ?? "?"}`,
    },
    myRatingColumn(),
    imdbRatingColumn(),
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default TV_LIBRARY_CONFIG;
