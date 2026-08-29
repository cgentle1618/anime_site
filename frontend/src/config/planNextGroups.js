// Frontend: the size-bucket vocabularies and Plan page tabs.
//
// This is a hand-maintained copy of app/utils/plan_next_kinds.py
// (SIZE_THRESHOLDS/ALLOWED_SCOPES) - there is no runtime guard keeping the
// two in sync (GET /api/plan-next/kinds exists but is unused by the
// frontend), so update both by hand whenever one changes. Media type keys
// are the hyphenated ones the API stores. Previously these lived hardcoded
// in three separate files (FranchisePage, FranchiseModifyTab,
// PlanWatchNext), which is how they drifted out of docs/options.md entirely.

export const SIZE_GROUPS = {
  anime: [
    { key: "12ep", label: "12 EP" },
    { key: "24ep", label: "24 EP" },
    { key: "30ep_plus", label: "30+ EP" },
  ],
  "tv-show": [
    { key: "1season", label: "1 Season" },
    { key: "2season", label: "2 Seasons" },
    { key: "3season_plus", label: "3+ Seasons" },
  ],
  cartoon: [
    { key: "1season", label: "1 Season" },
    { key: "2season", label: "2 Seasons" },
    { key: "3season_plus", label: "3+ Seasons" },
  ],
  movie: [
    { key: "standalone", label: "Standalone" },
    { key: "2_3movies", label: "2-3 Movies" },
    { key: "4movies_plus", label: "4+ Movies" },
  ],
  comic: [
    { key: "1_3", label: "1-3 Issues" },
    { key: "4_10", label: "4-10 Issues" },
    { key: "11_plus", label: "11+ Issues" },
  ],
  "anime-movie": [],
  // Manga and novel do NOT have a size bucket. They group by a column on the
  // entry itself - the way the pre-plan_next Plan page did - so these two
  // vocabularies exist only here, never in app/utils/plan_next_kinds.py, which
  // is about size buckets Calculate derives. See entryBucket in
  // frontend/src/utils/planNext.js.
  manga: [
    { key: "完結", label: "完結" },
    { key: "連載中", label: "連載中" },
    { key: "腰斬", label: "腰斬" },
    { key: "停更", label: "停更" },
  ],
  // Keys must stay a subset of NOVEL_TYPES in frontend/src/config/fieldOptions.js,
  // which is the form dropdown's source of truth. Only the ORDER differs: Web
  // leads here, where the dropdown lists it third. "Web Novel" is a display
  // relabel of the stored value "Web" and changes no data.
  novel: [
    { key: "Web", label: "Web Novel" },
    { key: "Light Novel", label: "Light Novel" },
    { key: "Novel", label: "Novel" },
    { key: "Other", label: "Other" },
  ],
};

// What a tab calls its trailing catch-all group. Manga has no "other" value in
// its own vocabulary, so its empties land here under the label the old page
// used. Novel is absent because it has a real "Other" key that entryBucket maps
// empties onto directly - giving it a label here would produce two
// near-identical trailing sections.
export const UNGROUPED_LABELS = {
  manga: "其他",
};

// Tab order on the Plan page. Comic is new - the page had no comic tab before
// plan_next made every type render the same way.
export const PLAN_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv" },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film" },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt" },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower" },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint" },
  { key: "comic", label: "Comic", icon: "fa-book-dead" },
  { key: "manga", label: "Manga", icon: "fa-book" },
  { key: "novel", label: "Novel", icon: "fa-book-open" },
];

export const SCOPE_LABELS = {
  entry: null, // an entry card carries no tier badge
  series: "Series",
  franchise: "Franchise",
};

// Mirrors app/utils/plan_next_kinds.py. Kept as a literal rather than fetched
// so the Plan page renders without waiting on a vocabulary request; the
// table-driven test in planNext.test.js guards the two copies against drift.
export const KINDS = ["next", "rewatch"];

const SCOPE_ORDER = ["entry", "series", "franchise"];

export const ALLOWED_SCOPES = {
  next: {
    anime: ["entry", "series", "franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["entry", "series", "franchise"],
    manga: ["entry"],
    novel: ["entry"],
    comic: ["entry", "series"],
  },
  rewatch: {
    // Anime and cartoon are rewatched as whole franchises; novels are reread
    // at every tier though they are only ever queued one book at a time.
    anime: ["franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["franchise"],
    manga: ["entry"],
    novel: ["entry", "series", "franchise"],
    comic: ["entry", "series"],
  },
};

export const REWATCH_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv" },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film" },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt" },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower" },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint" },
  { key: "manga", label: "Manga", icon: "fa-book" },
  { key: "novel", label: "Novel", icon: "fa-book-open" },
  { key: "comic", label: "Comic", icon: "fa-book-dead" },
];

export function scopesFor(kind, mediaType) {
  const scopes = ALLOWED_SCOPES[kind]?.[mediaType];
  if (!scopes) return [];
  return SCOPE_ORDER.filter((scope) => scopes.includes(scope));
}
