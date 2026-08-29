// Frontend: the size-bucket vocabularies and Plan page tabs.
//
// Mirrors app/utils/plan_next_kinds.py. Media type keys are the hyphenated
// ones the API stores. Previously these lived hardcoded in three separate
// files (FranchisePage, FranchiseModifyTab, PlanWatchNext), which is how they
// drifted out of docs/options.md entirely.

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
  manga: [],
  novel: [],
};

export const ALLOWED_SCOPES = {
  anime: ["entry", "series", "franchise"],
  movie: ["entry", "series", "franchise"],
  "tv-show": ["entry", "series", "franchise"],
  cartoon: ["entry", "series", "franchise"],
  comic: ["entry", "series"],
  "anime-movie": ["entry"],
  manga: ["entry"],
  novel: ["entry"],
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
