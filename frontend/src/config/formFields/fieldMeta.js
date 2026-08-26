// Hand-authored metadata for the Add-form fields, consumed by getFieldRegistry().
//
// Field KEYS are never written here as the source of truth — they are derived
// from the form factories in config/formFactories.js. This file only says how a
// field should be *presented* on the /defaults page and how it should behave
// during auto-fill. Anything absent falls back to a humanized label and a plain
// text input, so a newly added form field shows up automatically.
//
// Layered: COMMON_FIELD_META covers fields that repeat across media types,
// TYPE_FIELD_META adds per-type fields and overrides.
//
// Recognized keys per entry:
//   label           display name on /defaults (default: humanized field key)
//   control         "select" | "tags" | "checkbox" | "text" | "number" |
//                   "date" | "time" | "url" | "textarea" | "none"
//   options         string[] or {value,label}[] for control: "select"
//   optionsCategory /api/options category name for control: "tags"
//   group           section heading on /defaults (default: "Other")
//   defaultable     false = no default can be set (entity pickers, repeaters)
//   autofillable    false = cannot be copied by auto-fill
//   lookup          "franchise" | "series" — resolves the paired _text field
//   coerce          "tristate" — boolean source value becomes "true"/"false"/""
//   hidden          true = not shown at all (paired _text fields, FK ids)

import {
  AIRING_STATUSES,
  ANIME_AIRING_TYPES,
  CARTOON_AIRING_TYPES,
  COMIC_TYPES,
  FRANCHISE_EXPECTATIONS,
  FRANCHISE_TYPES,
  IS_MAIN,
  MANGA_REGIONS,
  MANGA_SERIALIZATION_STATUSES,
  MOVIE_TYPES,
  MY_RATINGS,
  NOVEL_REGIONS,
  NOVEL_SERIALIZATION_STATUSES,
  NOVEL_TYPES,
  PART_NUMS,
  PROGRESS_DISPLAY_OPTIONS,
  READING_STATUSES,
  RELEASE_MONTHS,
  RELEASE_SEASONS,
  SEASON_NUMS,
  TRISTATE,
  TV_REGIONS,
  WATCHING_STATUSES,
} from "../fieldOptions";
import { WEEKDAYS } from "../weekdays";

const TRISTATE_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export const COMMON_FIELD_META = {
  // ---- Relations -------------------------------------------------------
  // Entity pickers: no meaningful default, but very useful to auto-fill.
  collection_id: {
    label: "Collection",
    control: "none",
    lookup: "collection",
    pairText: "collection_text",
    defaultable: false,
    group: "Relations",
  },
  franchise_id: {
    label: "Franchise",
    control: "none",
    lookup: "franchise",
    pairText: "franchise_text",
    defaultable: false,
    group: "Relations",
  },
  series_id: {
    label: "Series",
    control: "none",
    lookup: "series",
    pairText: "series_text",
    defaultable: false,
    group: "Relations",
  },
  collection_text: { hidden: true },
  franchise_text: { hidden: true },
  series_text: { hidden: true },

  // ---- Status ----------------------------------------------------------
  airing_status: {
    label: "Airing Status",
    control: "select",
    options: AIRING_STATUSES,
    group: "Status",
  },
  watching_status: {
    label: "Watching Status",
    control: "select",
    options: WATCHING_STATUSES,
    group: "Status",
  },
  reading_status: {
    label: "Reading Status",
    control: "select",
    options: READING_STATUSES,
    group: "Status",
  },
  is_main: {
    label: "Main / Spinoff",
    control: "select",
    options: IS_MAIN,
    group: "Status",
  },
  my_rating: {
    label: "My Rating",
    control: "select",
    options: MY_RATINGS,
    group: "Status",
  },

  // ---- Progress & ratings ---------------------------------------------
  ep_total: { label: "Total Episodes", control: "number", group: "Progress" },
  ep_fin: { label: "Episodes Finished", control: "number", group: "Progress" },
  vol_fin: { label: "Volumes Finished", control: "number", group: "Progress" },
  ch_total: { label: "Total Chapters", control: "number", group: "Progress" },
  ch_fin: { label: "Chapters Finished", control: "number", group: "Progress" },
  mal_rating: { label: "MAL Rating", control: "number", group: "Ratings" },
  mal_rank: { label: "MAL Rank", control: "number", group: "Ratings" },
  anilist_rating: {
    label: "AniList Rating",
    control: "number",
    group: "Ratings",
  },
  imdb_rating: { label: "IMDb Rating", group: "Ratings" },

  // ---- Credits ---------------------------------------------------------
  studio: {
    label: "Studio",
    control: "tags",
    optionsCategory: "Studio",
    group: "Credits",
  },
  director: {
    label: "Director",
    control: "tags",
    optionsCategory: "Director",
    group: "Credits",
  },

  // ---- Release ---------------------------------------------------------
  release_year: { label: "Release Year", control: "number", group: "Release" },
  end_year: { label: "End Year", control: "number", group: "Release" },
  release_date: { label: "Release Date", group: "Release" },
  length_min: { label: "Length (min)", control: "number", group: "Release" },

  // ---- Derivation ------------------------------------------------------
  watch_order: { label: "Watch Order", control: "number", group: "Derivation" },
  read_order: { label: "Read Order", control: "number", group: "Derivation" },

  // ---- Links -----------------------------------------------------------
  mal_id: { label: "MAL ID", control: "number", group: "Links" },
  mal_link: { label: "MAL Link", control: "url", group: "Links" },
  anilist_link: { label: "AniList Link", control: "url", group: "Links" },
  official_link: { label: "Official Link", control: "url", group: "Links" },
  twitter_link: { label: "Twitter Link", control: "url", group: "Links" },
  imdb_id: { label: "IMDb ID", group: "Links" },
  imdb_link: { label: "IMDb Link", control: "url", group: "Links" },

  // ---- Sources ---------------------------------------------------------
  source_official: { label: "Source Official", group: "Sources" },
  source_baha: {
    label: "Bahamut Source",
    control: "select",
    options: TRISTATE_OPTIONS,
    group: "Sources",
  },
  baha_link: { label: "Bahamut Link", control: "url", group: "Sources" },
  source_netflix: {
    label: "Netflix Source",
    control: "select",
    options: TRISTATE_OPTIONS,
    group: "Sources",
  },
  // Repeatable {name, url} rows — a default here would make no sense.
  source_other: {
    label: "Other Sources",
    control: "none",
    defaultable: false,
    group: "Sources",
  },

  // ---- Flags -----------------------------------------------------------
  watch_next: { label: "Watch Next", control: "checkbox", group: "Flags" },
  to_rewatch: { label: "To Rewatch", control: "checkbox", group: "Flags" },
  read_next: { label: "Read Next", control: "checkbox", group: "Flags" },
  to_reread: { label: "To Reread", control: "checkbox", group: "Flags" },

  // ---- Media & notes ---------------------------------------------------
  cover_image_file: {
    label: "Cover Image File",
    control: "none",
    defaultable: false,
    autofillable: false,
    group: "Media",
  },
  remark: { label: "Remark", control: "textarea", group: "Notes" },
};

export const TYPE_FIELD_META = {
  anime: {
    anime_name_en: { label: "Name (EN)", group: "Names" },
    anime_name_cn: { label: "Name (CN)", group: "Names" },
    anime_name_roman: { label: "Name (Romaji)", group: "Names" },
    anime_name_jp: { label: "Name (JP)", group: "Names" },
    anime_name_alt: { label: "Name (Alt)", group: "Names" },
    season_num: {
      label: "Season",
      control: "select",
      options: SEASON_NUMS,
      group: "Classification",
    },
    part_num: {
      label: "Part",
      control: "select",
      options: PART_NUMS,
      group: "Classification",
    },
    airing_type: {
      label: "Airing Type",
      control: "select",
      options: ANIME_AIRING_TYPES,
      group: "Classification",
    },
    genre_main: {
      label: "Genre Main",
      control: "tags",
      optionsCategory: "Genre Main",
      group: "Classification",
    },
    genre_sub: {
      label: "Genre Sub",
      control: "tags",
      optionsCategory: "Genre Sub",
      group: "Classification",
    },
    ep_previous: {
      label: "Previous Episodes",
      control: "number",
      group: "Progress",
    },
    ep_special: {
      label: "Special Episodes",
      control: "number",
      group: "Progress",
    },
    release_season: {
      label: "Release Season",
      control: "select",
      options: RELEASE_SEASONS,
      group: "Release",
    },
    release_month: {
      label: "Release Month",
      control: "select",
      options: RELEASE_MONTHS,
      group: "Release",
    },
    broadcast_day: {
      label: "Broadcast Day",
      control: "select",
      options: WEEKDAYS,
      group: "Schedule",
    },
    broadcast_time: {
      label: "Broadcast Time",
      control: "time",
      group: "Schedule",
    },
    my_watch_day: {
      label: "My Watch Day",
      control: "select",
      options: WEEKDAYS,
      group: "Schedule",
    },
    producer: {
      label: "Producer",
      control: "tags",
      optionsCategory: "Producer",
      group: "Credits",
    },
    music: {
      label: "Music / Composer",
      control: "tags",
      optionsCategory: "Music / Composer",
      group: "Credits",
    },
    distributor_tw: {
      label: "Distributor TW",
      control: "tags",
      optionsCategory: "Distributor TW",
      group: "Credits",
    },
    seiyuu: { label: "Seiyuu", group: "Credits" },
    is_main_entry: {
      label: "Is Main Entry",
      control: "checkbox",
      group: "Derivation",
    },
    op: { label: "Opening Theme", group: "Music" },
    ed: { label: "Ending Theme", group: "Music" },
    insert_ost: { label: "Insert / OST", group: "Music" },
  },

  "anime-movie": {
    anime_movie_name_en: { label: "Name (EN)", group: "Names" },
    anime_movie_name_cn: { label: "Name (CN)", group: "Names" },
    anime_movie_name_roman: { label: "Name (Romaji)", group: "Names" },
    anime_movie_name_jp: { label: "Name (JP)", group: "Names" },
    anime_movie_name_alt: { label: "Name (Alt)", group: "Names" },
    release_date_jp: {
      label: "Release Date (JP)",
      control: "date",
      group: "Release",
    },
    release_date_tw: {
      label: "Release Date (TW)",
      control: "date",
      group: "Release",
    },
  },

  movie: {
    movie_name_en: { label: "Name (EN)", group: "Names" },
    movie_name_cn: { label: "Name (CN)", group: "Names" },
    movie_name_alt: { label: "Name (Alt)", group: "Names" },
    // Auto-fill used to pin a literal "Not Yet Aired" here, which contradicted
    // this tab's own default. It now falls back to whatever is configured.
    airing_status: { autofillFallback: "default" },
    movie_type: {
      label: "Movie Type",
      control: "select",
      options: MOVIE_TYPES,
      group: "Classification",
    },
    release_date_usa: { label: "Release Date (USA)", group: "Release" },
    release_date_tw: { label: "Release Date (TW)", group: "Release" },
    director: { label: "Director", control: "text", group: "Credits" },
  },

  "tv-show": {
    tv_name_en: { label: "Name (EN)", group: "Names" },
    tv_name_cn: { label: "Name (CN)", group: "Names" },
    tv_name_alt: { label: "Name (Alt)", group: "Names" },
    region: {
      label: "Region",
      control: "select",
      options: TV_REGIONS,
      group: "Classification",
    },
    season_part: { label: "Season Part", group: "Classification" },
  },

  cartoon: {
    cartoon_name_en: { label: "Name (EN)", group: "Names" },
    cartoon_name_cn: { label: "Name (CN)", group: "Names" },
    cartoon_name_alt: { label: "Name (Alt)", group: "Names" },
    airing_type: {
      label: "Airing Type",
      control: "select",
      options: CARTOON_AIRING_TYPES,
      group: "Classification",
    },
    season_part: { label: "Season Part", group: "Classification" },
    length_ep_min: {
      label: "Episode Length (min)",
      control: "number",
      group: "Progress",
    },
  },

  manga: {
    manga_name_cn: { label: "Name (CN)", group: "Names" },
    manga_name_en: { label: "Name (EN)", group: "Names" },
    manga_name_roman: { label: "Name (Romaji)", group: "Names" },
    manga_name_jp: { label: "Name (JP)", group: "Names" },
    manga_name_alt: { label: "Name (Alt)", group: "Names" },
    region: {
      label: "Region",
      control: "select",
      options: MANGA_REGIONS,
      group: "Classification",
    },
    serialization_status: {
      label: "Serialization Status",
      control: "select",
      options: MANGA_SERIALIZATION_STATUSES,
      group: "Status",
    },
    vol_total: { label: "Total Volumes", control: "number", group: "Progress" },
    vol_fin_page: {
      label: "Page in Current Volume",
      control: "number",
      group: "Progress",
    },
    author_plot: {
      label: "Author (Plot)",
      control: "tags",
      optionsCategory: "Manga Author",
      group: "Credits",
    },
    author_draw: {
      label: "Author (Art)",
      control: "tags",
      optionsCategory: "Manga Author",
      group: "Credits",
    },
    anime_studio: {
      label: "Anime Studio",
      control: "tags",
      optionsCategory: "Studio",
      group: "Credits",
    },
    serialization_platform: {
      label: "Serialization Platform",
      group: "Credits",
    },
    publisher_tw: {
      label: "Publisher TW",
      control: "tags",
      optionsCategory: "Manga Publisher TW",
      group: "Credits",
    },
  },

  novel: {
    novel_name_cn: { label: "Name (CN)", group: "Names" },
    novel_name_en: { label: "Name (EN)", group: "Names" },
    novel_name_roman: { label: "Name (Romaji)", group: "Names" },
    novel_name_jp: { label: "Name (JP)", group: "Names" },
    novel_name_alt: { label: "Name (Alt)", group: "Names" },
    // Per-volume title lists, edited with a dedicated repeater component.
    novel_name_each_cn: {
      label: "Per-Volume Names (CN)",
      control: "none",
      defaultable: false,
      group: "Names",
    },
    novel_name_each_en: {
      label: "Per-Volume Names (EN)",
      control: "none",
      defaultable: false,
      group: "Names",
    },
    region: {
      label: "Region",
      control: "select",
      options: NOVEL_REGIONS,
      group: "Classification",
    },
    type: {
      label: "Type",
      control: "select",
      options: NOVEL_TYPES,
      group: "Classification",
    },
    version: { label: "Version", group: "Classification" },
    serialization_status: {
      label: "Serialization Status",
      control: "select",
      options: NOVEL_SERIALIZATION_STATUSES,
      group: "Status",
    },
    progress_display: {
      label: "Progress Display",
      control: "select",
      options: PROGRESS_DISPLAY_OPTIONS,
      group: "Progress",
    },
    vol_total_original: {
      label: "Total Volumes (Original)",
      control: "number",
      group: "Progress",
    },
    vol_total_tw: {
      label: "Total Volumes (TW)",
      control: "number",
      group: "Progress",
    },
    arc_total: { label: "Total Arcs", control: "number", group: "Progress" },
    arc_fin: { label: "Arcs Finished", control: "number", group: "Progress" },
    author: {
      label: "Author",
      control: "tags",
      optionsCategory: "Novel Author",
      group: "Credits",
    },
    illustrator: {
      label: "Illustrator",
      control: "tags",
      optionsCategory: "Novel Illustrator",
      group: "Credits",
    },
    publisher_tw: {
      label: "Publisher TW",
      control: "tags",
      optionsCategory: "Novel Publisher TW",
      group: "Credits",
    },
  },

  comic: {
    // EN leads: Western comics are known by their English titles.
    comic_name_en: { label: "Name (EN)", group: "Names" },
    comic_name_cn: { label: "Name (CN)", group: "Names" },
    comic_name_alt: { label: "Name (Alt)", group: "Names" },
    // The run designator: "Vol. 5", "(2018)", "Legacy". Free text — Marvel
    // run labels are not consistently numbered.
    volume_label: { label: "Volume Label", group: "Classification" },
    comic_type: {
      label: "Comic Type",
      control: "select",
      options: COMIC_TYPES,
      group: "Classification",
    },
    continuity: {
      label: "Continuity",
      control: "tags",
      optionsCategory: "Comic Continuity",
      group: "Classification",
    },
    era: {
      label: "Era",
      control: "tags",
      optionsCategory: "Comic Era",
      group: "Classification",
    },
    events: {
      label: "Events",
      control: "tags",
      optionsCategory: "Comic Event",
      group: "Classification",
    },
    serialization_status: {
      label: "Serialization Status",
      control: "select",
      options: MANGA_SERIALIZATION_STATUSES,
      group: "Status",
    },
    issue_total: {
      label: "Total Issues",
      control: "number",
      group: "Progress",
    },
    issue_fin: {
      label: "Issues Finished",
      control: "number",
      group: "Progress",
    },
    writer: {
      label: "Writer",
      control: "tags",
      optionsCategory: "Comic Writer",
      group: "Credits",
    },
    artist: {
      label: "Artist",
      control: "tags",
      optionsCategory: "Comic Artist",
      group: "Credits",
    },
    publisher: {
      label: "Publisher",
      control: "tags",
      optionsCategory: "Comic Publisher",
      group: "Credits",
    },
    imprint: {
      label: "Imprint",
      control: "tags",
      optionsCategory: "Comic Imprint",
      group: "Credits",
    },
    // Reuses the shared TW distributor category, not a comic-specific one —
    // this matches the backend's _COMIC_OPTION_FIELD_MAP.
    publisher_tw: {
      label: "Publisher TW",
      control: "tags",
      optionsCategory: "Distributor TW",
      group: "Credits",
    },
    // is_main_entry has no COMMON_FIELD_META entry — only anime's block
    // defines it. Copied here rather than promoting it to common.
    is_main_entry: {
      label: "Is Main Entry",
      control: "checkbox",
      group: "Derivation",
    },
  },

  collection: {
    collection_name_en: { label: "Name (EN)", group: "Names" },
    collection_name_cn: { label: "Name (CN)", group: "Names" },
    collection_name_roman: { label: "Name (Romaji)", group: "Names" },
    collection_name_jp: { label: "Name (JP)", group: "Names" },
    collection_name_alt: { label: "Name (Alt)", group: "Names" },
    collection_expectation: {
      label: "Expectation",
      control: "select",
      options: FRANCHISE_EXPECTATIONS,
      group: "Status",
    },
  },

  franchise: {
    franchise_name_en: { label: "Name (EN)", group: "Names" },
    franchise_name_cn: { label: "Name (CN)", group: "Names" },
    franchise_name_roman: { label: "Name (Romaji)", group: "Names" },
    franchise_name_jp: { label: "Name (JP)", group: "Names" },
    franchise_name_alt: { label: "Name (Alt)", group: "Names" },
    // Comma-joined multi-select of FRANCHISE_TYPES.
    franchise_type: {
      label: "Franchise Type",
      control: "tags",
      options: FRANCHISE_TYPES,
      group: "Classification",
    },
    franchise_expectation: {
      label: "Expectation",
      control: "select",
      options: FRANCHISE_EXPECTATIONS,
      group: "Status",
    },
  },

  series: {
    series_name_en: { label: "Name (EN)", group: "Names" },
    series_name_cn: { label: "Name (CN)", group: "Names" },
    series_name_alt: { label: "Name (Alt)", group: "Names" },
  },
};

// The field sets auto-fill copies when nothing is configured. Lifted verbatim
// from the six applyXAutofill functions that used to live in Add.jsx, so
// behavior is unchanged out of the box. anime-movie is new — it had no
// auto-fill at all before.
export const BUILTIN_AUTOFILL = {
  anime: [
    "anime_name_en",
    "anime_name_cn",
    "anime_name_roman",
    "anime_name_jp",
    "anime_name_alt",
    "franchise_id",
    "series_id",
    "airing_type",
    "is_main",
    "genre_main",
    "genre_sub",
    "studio",
  ],
  "anime-movie": [
    "anime_movie_name_en",
    "anime_movie_name_cn",
    "anime_movie_name_roman",
    "anime_movie_name_jp",
    "anime_movie_name_alt",
    "franchise_id",
    "studio",
    "director",
  ],
  movie: [
    "movie_name_en",
    "movie_name_cn",
    "movie_name_alt",
    "franchise_id",
    "series_id",
    "is_main",
    "airing_status",
    "movie_type",
  ],
  "tv-show": [
    "tv_name_en",
    "tv_name_cn",
    "tv_name_alt",
    "franchise_id",
    "series_id",
    "season_part",
    "is_main",
    "region",
    "imdb_link",
  ],
  cartoon: [
    "cartoon_name_en",
    "cartoon_name_cn",
    "cartoon_name_alt",
    "franchise_id",
    "series_id",
    "airing_type",
    "is_main",
    "source_official",
    "season_part",
    "imdb_link",
  ],
  manga: [
    "manga_name_cn",
    "manga_name_en",
    "manga_name_roman",
    "manga_name_jp",
    "manga_name_alt",
    "franchise_id",
    "series_id",
    "region",
    "is_main",
  ],
  novel: [
    "novel_name_cn",
    "novel_name_en",
    "novel_name_roman",
    "novel_name_jp",
    "novel_name_alt",
    "franchise_id",
    "series_id",
    "region",
    "type",
    "is_main",
  ],
  comic: [
    "comic_name_en",
    "comic_name_cn",
    "comic_name_alt",
    "franchise_id",
    "series_id",
    "publisher",
    "imprint",
    "continuity",
    "era",
    "comic_type",
  ],
  franchise: [],
  series: [],
};

// Order sections appear in on the /defaults page. Anything unlisted sorts last.
export const GROUP_ORDER = [
  "Names",
  "Relations",
  "Classification",
  "Status",
  "Progress",
  "Ratings",
  "Release",
  "Schedule",
  "Credits",
  "Music",
  "Derivation",
  "Links",
  "Sources",
  "Flags",
  "Media",
  "Notes",
  "Other",
];
