// Frontend: page component file for LibraryTV.
import LibraryLayout from "../../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../../hooks/useMediaList";
import {
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
} from "../../utils/media";

function getTitle(s)   { return s.tv_name_cn || s.tv_name_en || s.tv_name_alt || ""; }
function getSortKey(s) { return s.tv_name_en || s.tv_name_alt || s.tv_name_cn || ""; }

// ---------------------------------------------------------------------------
// TV Show library config
// ---------------------------------------------------------------------------
const TV_LIBRARY_CONFIG = {
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
      options: ["Finished Airing", "Airing", "Not Yet Aired"],
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
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.tv_name_en || "";
        return (
          <>
            <div className="text-xs font-bold text-gray-900 leading-tight line-clamp-1">{main}</div>
            {sub && sub !== main && (
              <div className="text-[9px] text-gray-400 line-clamp-1">{sub}</div>
            )}
          </>
        );
      },
    },
    {
      key: "season",
      header: "Season",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden md:table-cell",
      render: (item) => item.season_part || "-",
    },
    {
      key: "status",
      header: "Status",
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
    {
      key: "watch_next",
      header: "Watch Next",
      thClass: "hidden xl:table-cell",
      tdClass: "text-center hidden xl:table-cell",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => (
        <input
          type="checkbox"
          checked={!!item.watch_next}
          disabled={!isAdmin}
          onChange={(e) => handleStatusToggle(e, item, e.target.checked, "watch_next")}
          className="w-4 h-4 rounded accent-brand disabled:opacity-40"
        />
      ),
    },
    {
      key: "to_rewatch",
      header: "To Rewatch",
      thClass: "hidden xl:table-cell",
      tdClass: "text-center hidden xl:table-cell",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => (
        <input
          type="checkbox"
          checked={!!item.to_rewatch}
          disabled={!isAdmin}
          onChange={(e) => handleStatusToggle(e, item, e.target.checked, "to_rewatch")}
          className="w-4 h-4 rounded accent-brand disabled:opacity-40"
        />
      ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LibraryTV() {
  const showsQuery    = useMediaList("tv-show",   LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);

  const isLoading = showsQuery.isLoading || franchiseQuery.isLoading;
  const error     = showsQuery.error?.message || franchiseQuery.error?.message || null;

  return (
    <LibraryLayout
      type="tv-show"
      config={TV_LIBRARY_CONFIG}
      data={showsQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={[]}
      isLoading={isLoading}
      error={error}
    />
  );
}

