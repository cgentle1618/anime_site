// Canonical dropdown vocabularies for the Add/Modify forms.
//
// These were duplicated as inline literals across every add-tab and modify-tab.
// They live here now because the /defaults page must offer EXACTLY the values
// the Add form's <select> can display — otherwise an admin could save a default
// the form cannot render.

export const AIRING_STATUSES = ["Not Yet Aired", "Airing", "Finished Airing"];

export const WATCHING_STATUSES = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
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
