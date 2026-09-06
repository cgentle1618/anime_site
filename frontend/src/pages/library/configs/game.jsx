import {
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  playButtonColumn,
} from "../../../components/layout/libraryColumns";
import { PLAYING_STATUS_GROUP } from "../../../config/statusGroups";
import { releaseScore } from "../../../lib/releaseDate";

// CN leads, as everywhere but comic.
function getTitle(g) {
  return (
    g.game_name_cn ||
    g.game_name_en ||
    g.game_name_alt ||
    g.game_name_roman ||
    g.game_name_jp ||
    ""
  );
}

// Playtime reads as one decimal place — "32.5 h" — because half an hour is
// the smallest difference worth showing and hours_played is a float.
function formatHours(hours) {
  if (hours == null || hours === "") return "-";
  const n = Number(hours);
  if (Number.isNaN(n)) return "-";
  return `${n.toFixed(1)} h`;
}

function hoursValue(g) {
  const n = Number(g.hours_played);
  return Number.isFinite(n) ? n : -1;
}

// ---------------------------------------------------------------------------
// Game library config
// ---------------------------------------------------------------------------
const GAME_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/game",
  defaultSort: "title",
  searchPlaceholder: "Search games, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.game_name_cn, item.game_name_en, item.game_name_roman,
      item.game_name_jp, item.game_name_alt,
      item.game_type, item.release_status,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      String(item.release_date ?? ""),
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "gameType",
      label: "Type",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.game_type).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.game_type),
    },
    {
      key: "playingStatus",
      label: "Play Status",
      type: "set-grouped",
      groupOptions: ["Playing", "Planned", "Completed", "Dropped", "Might Play"],
      match: (item, active) =>
        active.has(PLAYING_STATUS_GROUP[item.playing_status] ?? "Might Play"),
    },
    {
      // `ownership` is derived server-side from the game's copy rows, so it is
      // a plain string here like any other column.
      key: "ownership",
      label: "Ownership",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.ownership).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.ownership),
    },
    {
      key: "releaseStatus",
      label: "Release",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.release_status).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.release_status),
    },
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: (a, b) =>
        getTitle(a).localeCompare(getTitle(b), undefined, { numeric: true }),
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    {
      key: "hours_played",
      label: "Playtime",
      compare: (a, b) => hoursValue(b) - hoursValue(a),
    },
    myRatingSort,
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
      render: (item) => item.game_name_en || "-",
    },
    {
      key: "game_type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.game_type || "-",
    },
    {
      key: "hours_played",
      header: "Playtime",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => formatHours(item.hours_played),
    },
    myRatingColumn(),
    playButtonColumn(),
    planFlagColumn("to_replay", "To Replay"),
  ],
};

export default GAME_LIBRARY_CONFIG;
