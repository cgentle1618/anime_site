import {
  airingStatusColumn,
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
  myRatingColumn,
  myRatingSort,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { releaseScore, releaseYear } from "../../../lib/releaseDate";
import {
  getDisplayName,
  getSortName,
  isBaha,
  WATCHING_STATUS_GROUP,
} from "../../../utils/media";

// ---------------------------------------------------------------------------
// Release date sort score: the ISO release date, first-of-period for the
// precision an entry does not carry.
// ---------------------------------------------------------------------------
function getReleaseSortScore(item) {
  return releaseScore(item.release_date);
}

// ---------------------------------------------------------------------------
// Anime library config
// ---------------------------------------------------------------------------
const ANIME_LIBRARY_CONFIG = {
  usesSeries: true,
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
    const year = releaseYear(item.release_date) || "";
    const seasonYear =
      item.release_season && year ? `${item.release_season}${year}` : "";
    const fullSeasonYear = fullSeason && year ? `${fullSeason}${year}` : "";
    return [
      item.anime_name_cn, item.anime_name_en, item.anime_name_roman,
      item.anime_name_jp,  item.anime_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      f?.franchise_name_jp, f?.franchise_name_alt,
      s?.series_name_cn,    s?.series_name_en,
      item.release_season,  fullSeason, item.release_date,
      seasonYear,           fullSeasonYear,
      item.genre_main,      item.genre_sub,      item.studio,
      item.label,
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

  // -- Sorts -----------------------------------------------------------------
  sortDefs: [
    { key: "title",        label: "Title",        compare: titleCompare },
    { key: "release_date", label: "Release Date",  compare: (a, b) => getReleaseSortScore(b) - getReleaseSortScore(a) },
    myRatingSort,
    malRatingSort,
  ],

  // -- Table columns ---------------------------------------------------------
  tableColumns: [
    franchiseColumn(),
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
    airingStatusColumn({ hidden: null }),
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
    myRatingColumn(),
    malRatingColumn({ hidden: "xl" }),
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
    watchButtonColumn(),
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

export default ANIME_LIBRARY_CONFIG;
