// Canonical dropdown vocabularies for the Add/Modify forms.
//
// These were duplicated as inline literals across every add-tab and modify-tab.
// They live here now because the /defaults page must offer EXACTLY the values
// the Add form's <select> can display — otherwise an admin could save a default
// the form cannot render.

import { WEEKDAYS } from "./weekdays";

export const AIRING_STATUSES = [
  "Not Yet Aired",
  "Airing",
  "Finished Airing",
  "Canceled",
  "Rumored",
];

export const WATCHING_STATUSES = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Dropped",
  "Won't Watch",
];

export const READING_STATUSES = [
  "Might Read",
  "Plan to Read",
  "Active Reading",
  "Passive Reading",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Dropped",
  "Won't Read",
];

export const IS_MAIN = ["本傳", "外傳", "前傳", "後傳", "總集篇"];

export const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

export const ANIME_AIRING_TYPES = [
  "TV",
  "Movie",
  "ONA",
  "OVA",
  "OAD",
  "Special",
  "Other",
];

export const CARTOON_AIRING_TYPES = ["TV", "Movie", "OVA", "Special"];

export const MOVIE_TYPES = ["Reality", "Animation"];

export const TV_REGIONS = ["歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫"];

export const MANGA_REGIONS = ["日漫", "韓漫", "國漫", "台漫", "其他"];

export const NOVEL_REGIONS = ["JP", "CN", "TW", "KR", "Western"];

export const NOVEL_TYPES = ["Light Novel", "Novel", "Web", "Other"];

export const COMIC_TYPES = ["Ongoing", "Limited", "One-Shot", "Annual"];

export const MANGA_SERIALIZATION_STATUSES = ["連載中", "停更", "腰斬", "完結"];

export const NOVEL_SERIALIZATION_STATUSES = [
  "連載中",
  "連載中 (不穩定)",
  "連載中 (有生之年)",
  "停更",
  "完結",
  "腰斬",
  "可能更多",
  "未出",
];

// Progress display uses {value, label} pairs — the stored value is a short code.
export const PROGRESS_DISPLAY_OPTIONS = [
  { value: "", label: "— Default (VOL Original) —" },
  { value: "ch", label: "CH (Chapters)" },
  { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  { value: "vol_original", label: "VOL Original" },
  { value: "arc_ch", label: "ARC + CH" },
];

export const RELEASE_SEASONS = ["WIN", "SPR", "SUM", "FAL"];

export const RELEASE_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export const FRANCHISE_TYPES = [
  "ACG",
  "Anime Movie",
  "TV",
  "Movie",
  "Cartoon",
  "Comic",
  "Novel",
];

export const FRANCHISE_EXPECTATIONS = ["Highest", "High", "Medium", "Low"];

export const SEASON_NUMS = Array.from({ length: 10 }, (_, i) => String(i + 1));

export const PART_NUMS = Array.from({ length: 7 }, (_, i) => String(i + 1));

// Yes/No selects that store the STRING "true"/"false" (never a real boolean),
// with "" meaning "unset". Used by source_baha, source_netflix.
export const TRISTATE = ["true", "false"];

export const MUSIC_STATUSES = ["Need", "Pending", "Done"];

export const SEIYUU_STATUSES = ["Need", "Done"];

// Shape-matched to GET /api/constants. Rendered only until the fetch resolves.
export const CONSTANTS_FALLBACK = {
  watching_status: WATCHING_STATUSES,
  reading_status: READING_STATUSES,
  airing_status: AIRING_STATUSES,
  anime_airing_type: ANIME_AIRING_TYPES,
  cartoon_airing_type: CARTOON_AIRING_TYPES,
  franchise_type: FRANCHISE_TYPES,
  franchise_expectation: FRANCHISE_EXPECTATIONS,
  my_rating: MY_RATINGS,
  is_main: IS_MAIN,
  movie_type: MOVIE_TYPES,
  tv_region: TV_REGIONS,
  manga_region: MANGA_REGIONS,
  novel_region: NOVEL_REGIONS,
  novel_type: NOVEL_TYPES,
  comic_type: COMIC_TYPES,
  manga_serialization_status: MANGA_SERIALIZATION_STATUSES,
  novel_serialization_status: NOVEL_SERIALIZATION_STATUSES,
  day_of_week: WEEKDAYS,
  music_status: MUSIC_STATUSES,
  seiyuu_status: SEIYUU_STATUSES,
};

// Every Add/Modify tab imports the arrays above (e.g. `AIRING_STATUSES`) and
// maps over them directly, so they are the actual values rendered in every
// <select>. useConstants() calls this once, after GET /api/constants
// resolves, to overwrite each array's CONTENTS in place (never reassign the
// binding — every importer holds a reference to the same array object, and
// only an in-place mutation is visible to code that already imported it).
// That makes /api/constants the effective source of truth for every
// consumer without threading the hook through each tab: these arrays are
// the pre-fetch fallback only, exactly as CONSTANTS_FALLBACK documents.
//
// Deliberate trade-off: mutating an array a component already imported
// works ONLY because array identity never changes — React never sees a new
// prop/state value, so this mutation cannot trigger a re-render on its own.
// That is exactly why App.jsx also calls useConstants() once at the root:
// its setState is what forces the one re-render that lets every already-
// mounted <select> read the arrays' new contents. Skip that call and this
// function silently does nothing visible until the next unrelated render.
export function applyConstants(data) {
  if (!data) return;
  for (const [key, target] of Object.entries(CONSTANTS_FALLBACK)) {
    const values = data[key];
    if (!Array.isArray(values) || !Array.isArray(target)) continue;
    target.length = 0;
    target.push(...values);
  }
}
