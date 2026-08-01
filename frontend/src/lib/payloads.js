// Build request payloads from anime / anime-movie form state.

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
    broadcast_day: af.broadcast_day || null,
    broadcast_time: af.broadcast_time || null,
    my_watch_day: af.my_watch_day || null,
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
