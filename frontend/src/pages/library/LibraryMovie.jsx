// Frontend: page component file for LibraryMovie.
import LibraryLayout from "../../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../../hooks/useMediaList";
import {
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
} from "../../utils/media";

function getTitle(m)   { return m.movie_name_cn || m.movie_name_en || m.movie_name_alt || ""; }
function getSortKey(m) { return m.movie_name_en || m.movie_name_alt || m.movie_name_cn || ""; }

/** Year extracted from the last whitespace/dash segment of release_date_usa */
function getReleaseSortScore(m) {
  const raw = m.release_date_usa || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return parseInt(parts[parts.length - 1]) || 0;
}

// ---------------------------------------------------------------------------
// Movie library config
// ---------------------------------------------------------------------------
const MOVIE_LIBRARY_CONFIG = {
  navPath: "/movie",
  defaultSort: "title",
  searchPlaceholder: "Search movies, franchise, director...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.movie_name_cn, item.movie_name_en, item.movie_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      item.director, item.release_date_usa,
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "airingStatus",
      label: "Release Status",
      type: "set",
      options: ["Finished Airing", "Not Yet Aired", "Airing"],
      match: (item, active) => active.has(item.airing_status),
    },
    {
      key: "movieType",
      label: "Type",
      type: "set",
      options: ["Reality", "Animation"],
      match: (item, active) => active.has(item.movie_type),
    },
    {
      key: "watchingStatus",
      label: "Watch Status",
      type: "set-grouped",
      groupOptions: ["Watching", "Planned", "Completed", "Dropped", "Might Watch"],
      match: (item, active) =>
        active.has(WATCHING_STATUS_GROUP[item.watching_status] ?? "Might Watch"),
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
      compare: (a, b) => getReleaseSortScore(b) - getReleaseSortScore(a),
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
        const sub  = item.movie_name_en || "";
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
      key: "director",
      header: "Director",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.director || "-",
    },
    {
      key: "release",
      header: "Release",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden xl:table-cell",
      render: (item) => item.release_date_usa || "-",
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
export default function LibraryMovie() {
  const moviesQuery   = useMediaList("movie",     LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);

  const isLoading = moviesQuery.isLoading || franchiseQuery.isLoading;
  const error     = moviesQuery.error?.message || franchiseQuery.error?.message || null;

  return (
    <LibraryLayout
      type="movie"
      config={MOVIE_LIBRARY_CONFIG}
      data={moviesQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={[]}
      isLoading={isLoading}
      error={error}
    />
  );
}

