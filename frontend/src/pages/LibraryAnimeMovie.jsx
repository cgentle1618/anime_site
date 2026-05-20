import LibraryLayout from "../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../hooks/useMediaList";
import {
  isBaha,
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
} from "../utils/media";

// ---------------------------------------------------------------------------
// Release date sort score: year * 10000 + month * 100 + day
// ---------------------------------------------------------------------------
function getReleaseSortScore(m) {
  const raw = m.release_date_jp || m.release_date_tw || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return (parseInt(parts[0]) || 0) * 10000
       + (parseInt(parts[1]) || 0) * 100
       + (parseInt(parts[2]) || 0);
}

function getReleaseYearJp(releaseDate) {
  if (!releaseDate) return null;
  const parts = String(releaseDate).trim().split(/[-\s]/);
  return parts[0] && /^\d{4}$/.test(parts[0]) ? parts[0] : parts[parts.length - 1];
}

function getTitle(m) {
  return m.anime_movie_name_cn || m.anime_movie_name_en
      || m.anime_movie_name_roman || m.anime_movie_name_jp
      || m.anime_movie_name_alt  || "";
}

function getSortKey(m) {
  return m.anime_movie_name_en || m.anime_movie_name_roman
      || m.anime_movie_name_alt || m.anime_movie_name_cn
      || m.anime_movie_name_jp  || "";
}

// ---------------------------------------------------------------------------
// Anime Movie library config
// ---------------------------------------------------------------------------
const ANIME_MOVIE_LIBRARY_CONFIG = {
  navPath: "/anime-movie",
  defaultSort: "title",
  searchPlaceholder: "Search anime movies, franchise, release year...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.anime_movie_name_cn, item.anime_movie_name_en,
      item.anime_movie_name_roman, item.anime_movie_name_jp, item.anime_movie_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      f?.franchise_name_jp, f?.franchise_name_alt,
      getReleaseYearJp(item.release_date_jp),
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "airingStatus",
      label: "Airing Status",
      type: "set",
      options: ["Airing", "Finished Airing", "Not Yet Aired"],
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
      key: "bahaOnly",
      label: "Bahamut source only",
      type: "boolean",
      match: (item) => isBaha(item),
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
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.anime_movie_name_en || item.anime_movie_name_roman || "";
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
      key: "mal",
      header: "MAL",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center hidden lg:table-cell",
      render: (item) => item.mal_rating
        ? <span className="font-bold text-blue-600">{item.mal_rating}</span>
        : "-",
    },
    {
      key: "studio",
      header: "Studio",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.studio || "-",
    },
    {
      key: "director",
      header: "Director",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.director || "-",
    },
    {
      key: "baha",
      header: "Baha",
      tdClass: "text-center",
      stopPropagation: true,
      render: (item) => {
        if (!isBaha(item)) return "-";
        const logo = (
          <img
            src="https://i2.bahamut.com.tw/anime/logo.svg"
            className={`h-4 inline-block ${item.baha_link ? "opacity-90" : "opacity-50 grayscale"}`}
            alt="Baha"
          />
        );
        return item.baha_link
          ? <a href={item.baha_link} target="_blank" rel="noreferrer" className="hover:scale-110 transition-transform inline-block">{logo}</a>
          : logo;
      },
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
export default function LibraryAnimeMovie() {
  const moviesQuery   = useMediaList("anime-movie", LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise",  LIST_OPTIONS);

  const isLoading = moviesQuery.isLoading || franchiseQuery.isLoading;
  const error     = moviesQuery.error?.message || franchiseQuery.error?.message || null;

  return (
    <LibraryLayout
      type="anime-movie"
      config={ANIME_MOVIE_LIBRARY_CONFIG}
      data={moviesQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={[]}
      isLoading={isLoading}
      error={error}
    />
  );
}
