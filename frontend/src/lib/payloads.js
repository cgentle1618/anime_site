// Build request payloads from anime / anime-movie form state.

// Which form fields feed the credits endpoint for each media type, and what
// credit role / tag field key they map to there. Mirrors
// app/utils/credit_roles.py (CREDIT_ROLES, TAG_FIELDS) - keep the two in
// sync if either side's vocabulary changes.
const CREDITS_FIELD_MAP = {
  anime: {
    credits: {
      studio: "studio",
      director: "director",
      producer: "producer",
      music: "composer",
    },
    tags: {
      genre_main: "genre_main",
      genre_sub: "genre_sub",
      label: "label",
      quality: "quality",
      distributor_tw: "publisher_tw",
    },
  },
  "anime-movie": {
    credits: { studio: "studio", director: "director" },
    tags: {},
  },
  movie: {
    credits: { director: "director" },
    tags: {},
  },
  "tv-show": {
    credits: {},
    tags: { source_official: "source_official" },
  },
  cartoon: {
    credits: {},
    tags: { source_official: "source_official" },
  },
  manga: {
    credits: {
      author_plot: "manga_author_plot",
      author_draw: "manga_author_draw",
    },
    tags: { publisher_tw: "publisher_tw" },
  },
  novel: {
    credits: { author: "novel_author", illustrator: "novel_illustrator" },
    tags: { publisher_tw: "publisher_tw" },
  },
  comic: {
    credits: { writer: "comic_writer", artist: "comic_artist" },
    tags: {
      publisher: "comic_publisher",
      imprint: "comic_imprint",
      continuity: "comic_continuity",
      era: "comic_era",
      events: "comic_event",
      publisher_tw: "publisher_tw",
    },
  },
};

// Form fields that hold an array value directly (comic.events, via its
// checkbox-style multi-select) rather than a comma-joined MultiSelect string.
const ARRAY_FORM_FIELDS = new Set(["events"]);

// Splits a comma-joined MultiSelect value, or passes an already-array value
// (e.g. comic.events) through, into trimmed, non-empty names.
function creditValues(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Builds the PUT /api/credits/{media_type}/{entry_id} body from a form's
// current values.
//
// Only fields the form actually holds state for are included - a field whose
// value is `undefined` is left out of the body entirely, not sent as an empty
// array. The credits endpoint replaces exactly the roles/fields named in the
// body and leaves the rest alone, so this partial-payload shape is what makes
// it safe to call after every save: a field the form never loaded (e.g. an
// in-flight or failed GET /api/credits prefill) is skipped rather than wiped.
// A field the form DID load - even one the user emptied on purpose - is a
// real "" or [] value, not undefined, so it's still sent and still clears.
export function buildCreditsPayload(mediaType, form) {
  const map = CREDITS_FIELD_MAP[mediaType];
  if (!map) return { credits: {}, tags: {} };
  const credits = {};
  for (const [field, role] of Object.entries(map.credits)) {
    if (form[field] === undefined) continue;
    credits[role] = creditValues(form[field]);
  }
  const tags = {};
  for (const [field, tagKey] of Object.entries(map.tags)) {
    if (form[field] === undefined) continue;
    tags[tagKey] = creditValues(form[field]);
  }
  return { credits, tags };
}

// Reshapes GET /api/credits/{media_type}/{entry_id}'s response back into the
// form-field shape buildCreditsPayload consumes, for prefilling Modify's
// forms. Every field the media type supports is set - as "" or [], when the
// entry has no rows for that role/field - so the form ends up holding real,
// current state for all of them (not left `undefined`), and a save right
// after opening the editor reflects the database rather than clearing it.
export function creditsResponseToForm(mediaType, data) {
  const map = CREDITS_FIELD_MAP[mediaType];
  if (!map) return {};
  const credits = (data && data.credits) || {};
  const tags = (data && data.tags) || {};
  const form = {};
  for (const [field, role] of Object.entries(map.credits)) {
    form[field] = formValue(field, credits[role]);
  }
  for (const [field, tagKey] of Object.entries(map.tags)) {
    form[field] = formValue(field, tags[tagKey]);
  }
  return form;
}

function formValue(field, values) {
  const list = values || [];
  return ARRAY_FORM_FIELDS.has(field) ? list : list.join(", ");
}

export function buildAnimeMoviePayload(amf, { franchiseId } = {}) {
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
  };
}

export function buildAnimePayload(af, { franchiseId, seriesId } = {}) {
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
    release_date: af.release_date || null,
    broadcast_day: af.broadcast_day || null,
    broadcast_time: af.broadcast_time || null,
    my_watch_day: af.my_watch_day || null,
    is_main_entry: af.is_main_entry || null,
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
    seiyuu: af.seiyuu || null,
    watch_next: af.watch_next ?? null,
    cover_image_file: af.cover_image_file || null,
    remark: af.remark || null,
  };
}
