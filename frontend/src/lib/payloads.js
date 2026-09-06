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
      exclusive_source: "exclusive_source",
    },
  },
  "anime-movie": {
    credits: { studio: "studio", director: "director" },
    tags: { exclusive_source: "exclusive_source" },
  },
  movie: {
    credits: { director: "director" },
    tags: { original_source: "original_source" },
  },
  "tv-show": {
    credits: {},
    tags: { original_source: "original_source" },
  },
  cartoon: {
    credits: {},
    tags: { original_source: "original_source" },
  },
  manga: {
    credits: {
      author_plot: "manga_author_plot",
      author_draw: "manga_author_draw",
    },
    tags: {
      publisher_tw: "publisher_tw",
      serialization_platform: "serialization_platform",
    },
  },
  novel: {
    credits: { author: "novel_author", illustrator: "novel_illustrator" },
    tags: {
      publisher_tw: "publisher_tw",
      serialization_platform: "serialization_platform",
    },
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
  // The third credit target: `publisher` resolves to a Publisher row the way
  // `studio` resolves to a Studio one, so both sit under credits, not tags.
  game: {
    credits: {
      studio: "studio",
      publisher: "publisher",
      director: "director",
      composer: "composer",
    },
    tags: {
      game_genre: "game_genre",
      game_theme: "game_theme",
      game_mode: "game_mode",
      combat_mode: "combat_mode",
      game_platform: "game_platform",
      label: "label",
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
    sources: (amf.sources || [])
      .filter((s) => (s.name || "").trim())
      .map((s) => ({
        kind: s.kind || "access",
        bucket: s.bucket || "other",
        name: s.name.trim(),
        url: (s.url || "").trim() || null,
        available: s.available ?? null,
      })),
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
    sources: (af.sources || [])
      .filter((s) => (s.name || "").trim())
      .map((s) => ({
        kind: s.kind || "access",
        bucket: s.bucket || "other",
        name: s.name.trim(),
        url: (s.url || "").trim() || null,
        available: s.available ?? null,
      })),
    seiyuu: af.seiyuu || null,
    watch_next: af.watch_next ?? null,
    cover_image_file: af.cover_image_file || null,
    remark: af.remark || null,
  };
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

const num = (v) => (v === "" || v == null ? null : Number(v));
const int = (v) => (v === "" || v == null ? null : parseInt(v, 10));
// The tristate convention every form uses: "" is unset, "true"/"false" the two
// answers. A real boolean can also arrive here, straight off a GET response.
const tri = (v) => {
  if (v === "" || v == null) return null;
  if (typeof v === "boolean") return v;
  return v === "true";
};

/**
 * The scalar half of a game's create/update body — everything but the
 * franchise and series ids, which the caller resolves (and may have just
 * created) before calling.
 *
 * `copies` follows GameCopyIO's nested-collection contract: rows the payload
 * omits are deleted, so a row with nothing in it is dropped here rather than
 * sent as an empty copy the server would have to store.
 */
export function gameFieldsPayload(f) {
  return {
    game_name_cn: f.game_name_cn || null,
    game_name_en: f.game_name_en || null,
    game_name_roman: f.game_name_roman || null,
    game_name_jp: f.game_name_jp || null,
    game_name_alt: f.game_name_alt || null,
    game_type: f.game_type || null,
    // ck_games_base_no_parent: a Base Game may never carry one.
    base_game_id: f.game_type === "Base Game" ? null : f.base_game_id || null,
    completion_level: f.completion_level || null,
    all_endings: tri(f.all_endings),
    all_achievements: tri(f.all_achievements),
    all_collected: tri(f.all_collected),
    achievements_earned: int(f.achievements_earned),
    achievements_total: int(f.achievements_total),
    release_status: f.release_status || null,
    release_date: f.release_date || null,
    current_patch: f.current_patch || null,
    hours_played: num(f.hours_played),
    hltb_main: num(f.hltb_main),
    hltb_main_extra: num(f.hltb_main_extra),
    hltb_completionist: num(f.hltb_completionist),
    price_original_us: num(f.price_original_us),
    price_original_jp: num(f.price_original_jp),
    price_original_tw: num(f.price_original_tw),
    price_current_us: num(f.price_current_us),
    price_current_jp: num(f.price_current_jp),
    price_current_tw: num(f.price_current_tw),
    my_rating: f.my_rating || null,
    // The numeric id travels on its own: `igdb_link` holds the public
    // www.igdb.com URL, which carries a slug rather than an id, so the
    // backend's link -> id derivation cannot recover it.
    igdb_id: int(f.igdb_id),
    igdb_link: f.igdb_link || null,
    steam_link: f.steam_link || null,
    sources: (f.sources || [])
      .filter((s) => (s.name || "").trim())
      .map((s) => ({
        kind: s.kind || "access",
        bucket: s.bucket || "other",
        name: s.name.trim(),
        url: (s.url || "").trim() || null,
        available: s.available ?? null,
      })),
    copies: (f.copies || [])
      .filter((c) => c.storefront || c.ownership || c.copy_format)
      .map((c, i) => ({
        ...(c.system_id ? { system_id: c.system_id } : {}),
        storefront: c.storefront || null,
        ownership: c.ownership || null,
        copy_format: c.copy_format || null,
        acquisition: c.acquisition || null,
        price_paid: num(c.price_paid),
        price_currency: c.price_currency || null,
        acquired_date: c.acquired_date || null,
        remark: c.remark || null,
        position: i + 1,
      })),
    play_next: f.play_next ?? false,
    to_replay: f.to_replay ?? false,
    cover_image_file: f.cover_image_file || null,
    remark: f.remark || null,
  };
}
