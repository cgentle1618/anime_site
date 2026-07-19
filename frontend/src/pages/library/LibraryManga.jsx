// Frontend: page component file for LibraryManga.
import LibraryLayout from "../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../hooks/useMediaList";
import {
  READING_STATUS_GROUP,
  getRatingWeight,
  getReadingButtonConfig,
} from "../utils/media";

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
      String(item.release_year ?? ""),
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
      key: "release_year",
      label: "Release Year",
      compare: (a, b) => (b.release_year ?? 0) - (a.release_year ?? 0),
    },
    {
      key: "end_year",
      label: "Ending Year",
      compare: (a, b) => (b.end_year ?? 0) - (a.end_year ?? 0),
    },
    {
      key: "my_rating",
      label: "My Rating",
      compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
    },
    {
      key: "mal_rating",
      label: "MAL Rating",
      compare: (a, b) => {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1;
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1;
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
      render: (item) => item.manga_name_en || item.manga_name_roman || "-",
    },
    {
      key: "status",
      header: "Status",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden md:table-cell",
      render: (item) => item.serialization_status || "-",
    },
    {
      key: "ch",
      header: "CH",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden lg:table-cell",
      render: (item) => `${item.ch_fin ?? 0} / ${item.ch_total ?? "?"}`,
    },
    {
      key: "vol",
      header: "VOL",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden lg:table-cell",
      render: (item) => `${item.vol_fin ?? 0} / ${item.vol_total ?? "?"}`,
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
      key: "mal",
      header: "MAL",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center hidden lg:table-cell",
      render: (item) => item.mal_rating != null
        ? <span className="font-bold text-blue-600">{item.mal_rating}</span>
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
      key: "read_next",
      header: "Read Next",
      thClass: "hidden xl:table-cell",
      tdClass: "text-center hidden xl:table-cell",
      stopPropagation: true,
      render: (item, { isAdmin, handleStatusToggle }) => (
        <input
          type="checkbox"
          checked={!!item.read_next}
          disabled={!isAdmin}
          onChange={(e) => handleStatusToggle(e, item, e.target.checked, "read_next")}
          className="w-4 h-4 rounded accent-brand disabled:opacity-40"
        />
      ),
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
export default function LibraryManga() {
  const mangaQuery    = useMediaList("manga",     LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery   = useMediaList("series",    LIST_OPTIONS);

  const isLoading =
    mangaQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    mangaQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  return (
    <LibraryLayout
      type="manga"
      config={MANGA_LIBRARY_CONFIG}
      data={mangaQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={seriesQuery.data ?? []}
      isLoading={isLoading}
      error={error}
    />
  );
}

