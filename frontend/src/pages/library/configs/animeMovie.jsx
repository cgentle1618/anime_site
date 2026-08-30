import {
  airingStatusColumn,
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { isBaha, WATCHING_STATUS_GROUP } from "../../../utils/media";

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
  usesSeries: false,
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
      options: ["Airing", "Finished Airing", "Not Yet Aired", "Canceled", "Rumored"],
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
    myRatingSort,
    malRatingSort,
  ],

  tableColumns: [
    franchiseColumn(),
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
    airingStatusColumn(),
    myRatingColumn(),
    malRatingColumn(),
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
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default ANIME_MOVIE_LIBRARY_CONFIG;
