import { useNavigate } from "react-router-dom";
import LibraryLayout from "../components/layout/LibraryLayout";
import { useMediaList, LIST_OPTIONS } from "../hooks/useMediaList";
import {
  getDisplayName,
  getSortName,
  isBaha,
  WATCHING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  getRatingWeight,
  getStatusButtonConfig,
  cleanString,
} from "../utils/media";

// ---------------------------------------------------------------------------
// Release date sort score: year * 100 + month-index (anime uses season+month)
// ---------------------------------------------------------------------------
const MONTH_MAP = {
  JAN: 1, FEB: 2,  MAR: 3,  APR: 4,  MAY: 5,  JUN: 6,
  JUL: 7, AUG: 8,  SEP: 9,  OCT: 10, NOV: 11, DEC: 12,
};

function getReleaseSortScore(item) {
  const y = item.release_year ? parseInt(item.release_year, 10) : 0;
  const m = MONTH_MAP[item.release_month?.toUpperCase()] ?? 0;
  return y * 100 + m;
}

// ---------------------------------------------------------------------------
// Anime library config
// ---------------------------------------------------------------------------
const ANIME_LIBRARY_CONFIG = {
  navPath: "/anime",
  defaultSort: "title",
  searchPlaceholder: "Search anime, franchise, season, studio...",

  // -- Search ----------------------------------------------------------------
  buildSearchString(item, franchiseDict, seriesDict) {
    const SEASON_MAP = { WIN: "Winter", SPR: "Spring", SUM: "Summer", FAL: "Fall" };
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    const fullSeason = item.release_season
      ? SEASON_MAP[item.release_season.toUpperCase()] ?? ""
      : "";
    const seasonYear =
      item.release_season && item.release_year
        ? `${item.release_season}${item.release_year}`
        : "";
    const fullSeasonYear =
      fullSeason && item.release_year ? `${fullSeason}${item.release_year}` : "";
    return [
      item.anime_name_cn, item.anime_name_en, item.anime_name_roman,
      item.anime_name_jp,  item.anime_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      f?.franchise_name_jp, f?.franchise_name_alt,
      s?.series_name_cn,    s?.series_name_en,
      item.release_season,  fullSeason, item.release_year,
      seasonYear,           fullSeasonYear,
      item.genre_main,      item.genre_sub,      item.studio,
    ]
      .filter(Boolean)
      .join(" ");
  },

  // -- Filters ---------------------------------------------------------------
  filterDefs: [
    {
      key: "airingType",
      label: "Airing Type",
      type: "set",
      options: ["TV", "Movie", "ONA", "OVA", "Special"],
      match: (item, active) => active.has(item.airing_type),
    },
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

  // -- Sorts -----------------------------------------------------------------
  sortDefs: [
    { key: "title",        label: "Title",        compare: titleCompare },
    { key: "release_date", label: "Release Date",  compare: (a, b) => getReleaseSortScore(b) - getReleaseSortScore(a) },
    { key: "my_rating",    label: "My Rating",     compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating) },
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

  // -- Table columns ---------------------------------------------------------
  tableColumns: [
    {
      key: "franchise",
      header: "Franchise",
      tdClass: "text-xs text-gray-600 font-medium truncate max-w-[12rem]",
      render: (item, { franchiseDict }) => {
        const f = franchiseDict[item.franchise_id];
        return f ? (
          getDisplayName(f, "franchise")
        ) : (
          <span className="text-gray-300 italic">None</span>
        );
      },
    },
    {
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getDisplayName(item, "anime");
        const sub  = item.anime_name_en || item.anime_name_roman || "";
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
      key: "type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center font-bold text-gray-600 hidden md:table-cell",
      render: (item) => item.airing_type || "-",
    },
    {
      key: "season",
      header: "Season",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden lg:table-cell",
      render: (item) => item.season_part || "-",
    },
    {
      key: "status",
      header: "Status",
      tdClass: "text-center",
      render: (item) => (
        <span
          className={`px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${
            AIRING_STATUS_CLS[item.airing_status] ?? AIRING_STATUS_CLS._default
          }`}
        >
          {item.airing_status || "-"}
        </span>
      ),
    },
    {
      key: "ep",
      header: "EP",
      thClass: "hidden sm:table-cell",
      tdClass: "text-xs text-center font-mono text-gray-700 hidden sm:table-cell",
      render: (item) => {
        const fin   = item.cum_ep_fin   ?? (item.ep_fin   || 0);
        const total = item.cum_ep_total ?? (item.ep_total  != null ? item.ep_total : "?");
        return `${fin} / ${total}`;
      },
    },
    {
      key: "my",
      header: "My",
      thClass: "hidden lg:table-cell",
      tdClass: "text-center hidden lg:table-cell",
      render: (item) =>
        item.my_rating ? (
          <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">
            {item.my_rating}
          </span>
        ) : "-",
    },
    {
      key: "mal",
      header: "MAL",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center hidden xl:table-cell",
      render: (item) =>
        item.mal_rating ? (
          <span className="font-bold text-blue-600">{item.mal_rating}</span>
        ) : "-",
    },
    {
      key: "studio",
      header: "Studio",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-gray-500 hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.studio || "-",
    },
    {
      key: "baha",
      header: "Baha",
      tdClass: "text-center",
      stopPropagation: true,
      render: (item) => {
        const hasBaha = isBaha(item);
        if (!hasBaha) return "-";
        const logo = (
          <img
            src="https://i2.bahamut.com.tw/anime/logo.svg"
            className={`h-4 inline-block ${item.baha_link ? "opacity-90" : "opacity-50 grayscale"}`}
            alt="Baha"
          />
        );
        return item.baha_link ? (
          <a
            href={item.baha_link}
            target="_blank"
            rel="noreferrer"
            className="hover:scale-110 transition-transform inline-block"
          >
            {logo}
          </a>
        ) : logo;
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
  ],
};

// ---------------------------------------------------------------------------
// 3-tier title sort: franchise → series → anime
// ---------------------------------------------------------------------------
function titleCompare(a, b, franchiseDict, seriesDict) {
  const fA = franchiseDict[a.franchise_id];
  const fB = franchiseDict[b.franchise_id];
  const anameA = getSortName(a, "anime");
  const anameB = getSortName(b, "anime");
  const fnA = fA ? getSortName(fA, "franchise") : anameA;
  const fnB = fB ? getSortName(fB, "franchise") : anameB;
  const cmpF = fnA.localeCompare(fnB);
  if (cmpF !== 0) return cmpF;
  const snA = seriesDict[a.series_id] ? getSortName(seriesDict[a.series_id], "series") : "";
  const snB = seriesDict[b.series_id] ? getSortName(seriesDict[b.series_id], "series") : "";
  const cmpS = snA.localeCompare(snB);
  if (cmpS !== 0) return cmpS;
  return anameA.localeCompare(anameB);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LibraryAnime() {
  const animeQuery    = useMediaList("anime",     LIST_OPTIONS);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery   = useMediaList("series",    LIST_OPTIONS);

  const isLoading =
    animeQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    animeQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  return (
    <LibraryLayout
      type="anime"
      config={ANIME_LIBRARY_CONFIG}
      data={animeQuery.data ?? []}
      franchises={franchiseQuery.data ?? []}
      series={seriesQuery.data ?? []}
      isLoading={isLoading}
      error={error}
    />
  );
}
