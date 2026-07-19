// Frontend: page component file for LibraryCartoon.
import LibraryLayout from "../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../hooks/useMediaList";
import {
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
} from "../utils/media";

function getTitle(c)   { return c.cartoon_name_cn || c.cartoon_name_en || c.cartoon_name_alt || ""; }
function getSortKey(c) { return c.cartoon_name_en || c.cartoon_name_alt || c.cartoon_name_cn || ""; }

// ---------------------------------------------------------------------------
// Cartoon library config
// ---------------------------------------------------------------------------
const CARTOON_LIBRARY_CONFIG = {
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
      options: ["Finished Airing", "Airing", "Not Yet Aired"],
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
    {
      key: "my_rating",
      label: "My Rating",
      compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
    },
    {
      key: "imdb_rating",
      label: "IMDb Rating",
      compare: (a, b) => {
        const wA = a.imdb_rating && a.imdb_rating !== "N/A" ? parseFloat(a.imdb_rating) : -1;
        const wB = b.imdb_rating && b.imdb_rating !== "N/A" ? parseFloat(b.imdb_rating) : -1;
        return wB - wA;
      },
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
    {
      key: "airing",
      header: "Airing",
      thClass: "hidden md:table-cell",
      tdClass: "text-center hidden md:table-cell",
      render: (item) => (
        <span className={`px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${
          AIRING_STATUS_CLS[item.airing_status] ?? AIRING_STATUS_CLS._default
        }`}>
          {item.airing_status || "-"}
        </span>
      ),
    },
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
      key: "imdb",
      header: "IMDb",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center hidden lg:table-cell",
      render: (item) =>
        item.imdb_rating && item.imdb_rating !== "N/A"
          ? <span className="font-bold text-yellow-600">{item.imdb_rating}</span>
          : "-",
    },
    {
      key: "watch",
      header: "Watch",
      tdClass: "text-center",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => {
        const btn = getStatusButtonConfig(item.watching_status);
        return isAdmin ? (
          <button
            onClick={(e) => handleStatusToggle(e, item, btn.target)}
            className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors mx-auto font-bold text-[13px] leading-none ${btn.cls}`}
            title={`${item.watching_status ?? "Might Watch"} → ${btn.target}`}
          >
            {btn.symbol}
          </button>
        ) : item.watching_status ? (
          <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate">
            {item.watching_status}
          </div>
        ) : "-";
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LibraryCartoon() {
  const cartoonsQuery  = useMediaList("cartoon",   LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise",  LIST_OPTIONS);
  const seriesQuery    = useMediaList("series",     LIST_OPTIONS);

  const isLoading =
    cartoonsQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    cartoonsQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  return (
    <LibraryLayout
      type="cartoon"
      config={CARTOON_LIBRARY_CONFIG}
      data={cartoonsQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={seriesQuery.data ?? []}
      isLoading={isLoading}
      error={error}
    />
  );
}

