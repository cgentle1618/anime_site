const BUCKET_NAME = "cg1618-anime-covers";

export function cleanString(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}
const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

export { FALLBACK_SVG };

export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  return isLocal
    ? `/static/covers/${coverFile}`
    : `https://storage.googleapis.com/${BUCKET_NAME}/${coverFile}`;
}

export function getDisplayName(item, type) {
  if (!item) return "";
  const prefix =
    type === "anime-movie"
      ? "anime_movie"
      : type === "tv-show"
        ? "tv"
        : type;
  if (type === "series") {
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown Series"
    );
  }
  return (
    item[`${prefix}_name_cn`] ||
    item[`${prefix}_name_en`] ||
    item[`${prefix}_name_alt`] ||
    item[`${prefix}_name_roman`] ||
    item[`${prefix}_name_jp`] ||
    "Unknown Title"
  );
}

export const NAMING_CONFIGS = {
  anime: [
    "anime_name_cn",
    "anime_name_en",
    "anime_name_roman",
    "anime_name_jp",
    "anime_name_alt",
  ],
  "anime-movie": [
    "anime_movie_name_cn",
    "anime_movie_name_en",
    "anime_movie_name_roman",
    "anime_movie_name_jp",
    "anime_movie_name_alt",
  ],
  movie: ["movie_name_cn", "movie_name_en", "movie_name_alt"],
  "tv-show": ["tv_name_cn", "tv_name_en", "tv_name_alt"],
  cartoon: ["cartoon_name_cn", "cartoon_name_en", "cartoon_name_alt"],
  manga: [
    "manga_name_cn",
    "manga_name_en",
    "manga_name_roman",
    "manga_name_jp",
    "manga_name_alt",
  ],
  novel: [
    "novel_name_cn",
    "novel_name_en",
    "novel_name_roman",
    "novel_name_jp",
    "novel_name_alt",
  ],
  franchise: [
    "franchise_name_cn",
    "franchise_name_en",
    "franchise_name_alt",
  ],
};

const NAMING_LABELS = {
  cn: "Chinese",
  en: "English",
  jp: "Japanese",
  roman: "Roman",
  alt: "Alternative",
};

export function getNamingFields(item, type) {
  const fields = NAMING_CONFIGS[type] || [];
  return fields.map((field) => {
    const suffix = field.split("_").pop();
    return {
      label: NAMING_LABELS[suffix] || field,
      value: item?.[field],
    };
  });
}

export function getSortName(item, type) {
  if (!item) return "";
  const prefix =
    type === "anime-movie"
      ? "anime_movie"
      : type === "tv-show"
        ? "tv"
        : type;
  if (type === "series") {
    return (
      item.series_name_en || item.series_name_cn || item.series_name_alt || ""
    );
  }
  return (
    item[`${prefix}_name_en`] ||
    item[`${prefix}_name_roman`] ||
    item[`${prefix}_name_cn`] ||
    item[`${prefix}_name_alt`] ||
    item[`${prefix}_name_jp`] ||
    ""
  );
}

export function isBaha(anime) {
  return (
    anime.source_baha === true ||
    String(anime.source_baha).toLowerCase() === "true"
  );
}

// Watching status cycle: same order as base.js
const STATUS_CYCLE = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Temp Dropped",
  "Won't Watch",
  "Dropped",
];

const STATUS_STYLES = {
  "Active Watching": {
    cls: "bg-green-50 text-green-600 border-green-200",
    icon: "fa-play",
  },
  "Passive Watching": {
    cls: "bg-teal-50 text-teal-600 border-teal-200",
    icon: "fa-headphones",
  },
  Paused: {
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    icon: "fa-pause",
  },
  Completed: {
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    icon: "fa-check",
  },
  "Plan to Watch": {
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    icon: "fa-bookmark",
  },
  "Watch When Airs": {
    cls: "bg-orange-50 text-orange-600 border-orange-200",
    icon: "fa-clock",
  },
  "Temp Dropped": {
    cls: "bg-red-50 text-red-400 border-red-200",
    icon: "fa-pause-circle",
  },
  Dropped: {
    cls: "bg-red-50 text-red-600 border-red-200",
    icon: "fa-times-circle",
  },
  "Won't Watch": {
    cls: "bg-gray-50 text-gray-400 border-gray-200",
    icon: "fa-ban",
  },
  "Might Watch": {
    cls: "bg-gray-50 text-gray-400 border-gray-200",
    icon: "fa-question",
  },
};

const STATUS_BUTTON_CONFIG = {
  "Might Watch": {
    symbol: "+",
    cls: "bg-gray-50 text-gray-400 border-gray-200",
    target: "Plan to Watch",
  },
  "Plan to Watch": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Watch",
  },
  "Watch When Airs": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Watch",
  },
  "Active Watching": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Watch",
  },
  "Passive Watching": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Watch",
  },
  Paused: {
    symbol: "~",
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    target: "Might Watch",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    target: "Might Watch",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-red-50 text-red-500 border-red-200",
    target: "Might Watch",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-red-50 text-red-600 border-red-200",
    target: "Might Watch",
  },
  "Won't Watch": {
    symbol: "✕",
    cls: "bg-red-50 text-red-400 border-red-200",
    target: "Might Watch",
  },
};

export function getStatusButtonConfig(status) {
  return STATUS_BUTTON_CONFIG[status] || STATUS_BUTTON_CONFIG["Might Watch"];
}

export function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES["Might Watch"];
}

export function getNextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(current);
  if (idx === -1) return "Might Watch";
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

export function getReleaseFallback(anime) {
  if (anime.release_season && anime.release_year)
    return `${anime.release_season} ${anime.release_year}`;
  if (anime.release_month && anime.release_year)
    return `${anime.release_month} ${anime.release_year}`;
  if (anime.release_year) return String(anime.release_year);
  return "TBA";
}

const RATING_WEIGHT = { S: 0, "A+": 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };
export function getRatingWeight(rating) {
  return RATING_WEIGHT[rating] !== undefined ? RATING_WEIGHT[rating] : 99;
}

export function getOptions(allOptions, category) {
  return allOptions
    .filter((o) => o.category === category)
    .map((o) => o.option_value);
}

export function buildAnimeMoviePayload(
  amf,
  { franchiseId, notes = null } = {},
) {
  return {
    anime_movie_name_en: amf.anime_movie_name_en || null,
    anime_movie_name_cn: amf.anime_movie_name_cn || null,
    anime_movie_name_roman: amf.anime_movie_name_roman || null,
    anime_movie_name_jp: amf.anime_movie_name_jp || null,
    anime_movie_name_alt: amf.anime_movie_name_alt || null,
    franchise_id:
      franchiseId !== undefined
        ? franchiseId || null
        : amf.franchise_id || null,
    airing_status: amf.airing_status || null,
    watching_status: amf.watching_status || "Might Watch",
    my_rating: amf.my_rating || null,
    mal_rating: amf.mal_rating !== "" ? parseFloat(amf.mal_rating) : null,
    mal_rank: amf.mal_rank || null,
    anilist_rating: amf.anilist_rating || null,
    release_date_jp: amf.release_date_jp || null,
    release_date_tw: amf.release_date_tw || null,
    length_min: amf.length_min !== "" ? parseInt(amf.length_min) : null,
    studio: amf.studio || null,
    director: amf.director || null,
    mal_id: amf.mal_id !== "" ? parseInt(amf.mal_id) : null,
    mal_link: amf.mal_link || null,
    anilist_link: amf.anilist_link || null,
    official_link: amf.official_link || null,
    twitter_link: amf.twitter_link || null,
    source_baha:
      amf.source_baha === "true"
        ? true
        : amf.source_baha === "false"
          ? false
          : null,
    baha_link: amf.baha_link || null,
    source_netflix:
      amf.source_netflix === "true"
        ? true
        : amf.source_netflix === "false"
          ? false
          : null,
    source_other:
      amf.source_other.filter((e) => e.name.trim()).length > 0
        ? Object.fromEntries(
            amf.source_other
              .filter((e) => e.name.trim())
              .map((e) => [e.name.trim(), e.url.trim()]),
          )
        : null,
    watch_next: amf.watch_next ?? null,
    to_rewatch: amf.to_rewatch ?? false,
    cover_image_file: amf.cover_image_file || null,
    remark: amf.remark || null,
    notes: notes,
  };
}

export function buildAnimePayload(
  af,
  { franchiseId, seriesId, notes = null } = {},
) {
  let season_part = "";
  if (af.season_num) season_part = `Season ${af.season_num}`;
  if (af.season_num && af.part_num) season_part += ` Part ${af.part_num}`;
  else if (!af.season_num && af.part_num) season_part = `Part ${af.part_num}`;

  return {
    anime_name_en: af.anime_name_en || null,
    anime_name_cn: af.anime_name_cn || null,
    anime_name_roman: af.anime_name_roman || null,
    anime_name_jp: af.anime_name_jp || null,
    anime_name_alt: af.anime_name_alt || null,
    franchise_id:
      franchiseId !== undefined ? franchiseId || null : af.franchise_id || null,
    series_id: seriesId !== undefined ? seriesId || null : af.series_id || null,
    season_part: season_part || null,
    airing_type: af.airing_type || null,
    airing_status: af.airing_status || null,
    watching_status: af.watching_status || "Might Watch",
    is_main: af.is_main || null,
    ep_previous: af.ep_previous !== "" ? parseInt(af.ep_previous) : null,
    ep_total: af.ep_total !== "" ? parseInt(af.ep_total) : null,
    ep_fin: af.ep_fin !== "" ? parseInt(af.ep_fin) : 0,
    ep_special: af.ep_special !== "" ? parseFloat(af.ep_special) : null,
    my_rating: af.my_rating || null,
    mal_rating: af.mal_rating !== "" ? parseFloat(af.mal_rating) : null,
    mal_rank: af.mal_rank || null,
    anilist_rating: af.anilist_rating || null,
    release_season: af.release_season || null,
    release_month: af.release_month || null,
    release_year: af.release_year || null,
    genre_main: af.genre_main || null,
    genre_sub: af.genre_sub || null,
    studio: af.studio || null,
    director: af.director || null,
    producer: af.producer || null,
    music: af.music || null,
    distributor_tw: af.distributor_tw || null,
    prequel_id: af.prequel_id || null,
    sequel_id: af.sequel_id || null,
    alternative: af.alternative || null,
    is_main_entry: af.is_main_entry || null,
    watch_order: af.watch_order !== "" ? parseFloat(af.watch_order) : null,
    derive_related:
      af.derive_related === "true"
        ? true
        : af.derive_related === "false"
          ? false
          : null,
    mal_id: af.mal_id !== "" ? parseInt(af.mal_id) : null,
    mal_link: af.mal_link || null,
    anilist_link: af.anilist_link || null,
    official_link: af.official_link || null,
    twitter_link: af.twitter_link || null,
    source_baha:
      af.source_baha === "true"
        ? true
        : af.source_baha === "false"
          ? false
          : null,
    baha_link: af.baha_link || null,
    source_netflix:
      af.source_netflix === "true"
        ? true
        : af.source_netflix === "false"
          ? false
          : null,
    source_other:
      af.source_other.filter((e) => e.name.trim()).length > 0
        ? Object.fromEntries(
            af.source_other
              .filter((e) => e.name.trim())
              .map((e) => [e.name.trim(), e.url.trim()]),
          )
        : null,
    op: af.op || null,
    ed: af.ed || null,
    insert_ost: af.insert_ost || null,
    seiyuu: af.seiyuu || null,
    cover_image_file: af.cover_image_file || null,
    remark: af.remark || null,
    notes,
  };
}

export function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

const READING_BUTTON_CONFIG = {
  "Might Read": { symbol: "+", cls: "bg-gray-50 text-gray-400 border-gray-200", target: "Plan to Read" },
  "Plan to Read": { symbol: "…", cls: "bg-purple-50 text-purple-600 border-purple-200", target: "Might Read" },
  "Active Reading": { symbol: "~", cls: "bg-green-50 text-green-600 border-green-200", target: "Might Read" },
  "Passive Reading": { symbol: "~", cls: "bg-green-50 text-green-600 border-green-200", target: "Might Read" },
  Paused: { symbol: "~", cls: "bg-yellow-50 text-yellow-600 border-yellow-200", target: "Might Read" },
  Completed: { symbol: "✓", cls: "bg-blue-50 text-blue-600 border-blue-200", target: "Might Read" },
  "Temp Dropped": { symbol: "✕", cls: "bg-red-50 text-red-500 border-red-200", target: "Might Read" },
  Dropped: { symbol: "✕", cls: "bg-red-50 text-red-600 border-red-200", target: "Might Read" },
  "Won't Read": { symbol: "✕", cls: "bg-red-50 text-red-400 border-red-200", target: "Might Read" },
};

export function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export function getCardStatusConfig(type, status) {
  if (type === "manga" || type === "novel") return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}

export const MEDIA_CONFIG = {
  anime:         { statusField: "watching_status", apiEndpoint: "/api/anime",       navPath: "/anime",        statusType: "watch" },
  "anime-movie": { statusField: "watching_status", apiEndpoint: "/api/anime-movie", navPath: "/anime-movie",  statusType: "watch" },
  movie:         { statusField: "watching_status", apiEndpoint: "/api/movies",      navPath: "/movie",        statusType: "watch" },
  "tv-show":     { statusField: "watching_status", apiEndpoint: "/api/tv-shows",    navPath: "/tv-show",      statusType: "watch" },
  cartoon:       { statusField: "watching_status", apiEndpoint: "/api/cartoon",     navPath: "/cartoon",      statusType: "watch" },
  manga:         { statusField: "reading_status",  apiEndpoint: "/api/manga",       navPath: "/manga",        statusType: "read"  },
  novel:         { statusField: "reading_status",  apiEndpoint: "/api/novel",       navPath: "/novel",        statusType: "read"  },
  franchise:     { statusField: null,              apiEndpoint: "/api/franchise",   navPath: "/franchise",    statusType: null    },
  series:        { statusField: null,              apiEndpoint: "/api/series",      navPath: null,            statusType: null    },
};

export function parseTypes(franchiseType) {
  if (!franchiseType) return [];
  return franchiseType
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
