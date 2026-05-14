import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import {
  getDisplayName,
  cleanString,
  buildAnimePayload,
  buildAnimeMoviePayload,
} from "../utils/media";
import AnimeMovieNotes from "./AnimeMovieNotes";
import MovieNotes from "./MovieNotes";
import TVShowNotes from "./TVShowNotes";
import CartoonNotes from "./CartoonNotes";
import MangaNotes from "./MangaNotes";
import { selectCls } from "../components/FormField";
import FranchiseCreateModal from "../components/FranchiseCreateModal";
import CreateNewEntityModal from "../components/CreateNewEntityModal";
import FranchiseModifyTab from "./modify-tabs/FranchiseModifyTab";
import SeriesModifyTab from "./modify-tabs/SeriesModifyTab";
import OptionsModifyTab from "./modify-tabs/OptionsModifyTab";
import MangaModifyTab from "./modify-tabs/MangaModifyTab";
import NovelModifyTab from "./modify-tabs/NovelModifyTab";
import CartoonModifyTab from "./modify-tabs/CartoonModifyTab";
import TvShowModifyTab from "./modify-tabs/TvShowModifyTab";
import MovieModifyTab from "./modify-tabs/MovieModifyTab";
import AnimeMovieModifyTab from "./modify-tabs/AnimeMovieModifyTab";
import AnimeModifyTab from "./modify-tabs/AnimeModifyTab";

function parseSeasonPart(sp) {
  if (!sp) return { season_num: "", part_num: "" };
  const sMatch = sp.match(/Season (\d+)/i);
  const pMatch = sp.match(/Part (\d+)/i);
  return {
    season_num: sMatch ? sMatch[1] : "",
    part_num: pMatch ? pMatch[1] : "",
  };
}

function animeToForm(anime, allFranchises, allSeries) {
  const { season_num, part_num } = parseSeasonPart(anime.season_part);
  const f = allFranchises.find((x) => x.system_id === anime.franchise_id);
  const s = allSeries.find((x) => x.system_id === anime.series_id);
  return {
    anime_name_en: anime.anime_name_en || "",
    anime_name_cn: anime.anime_name_cn || "",
    anime_name_roman: anime.anime_name_roman || "",
    anime_name_jp: anime.anime_name_jp || "",
    anime_name_alt: anime.anime_name_alt || "",
    franchise_id: anime.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_id: anime.series_id || null,
    series_text: s ? getDisplayName(s, "series") : "",
    season_num,
    part_num,
    airing_type: anime.airing_type || "",
    airing_status: anime.airing_status || "",
    watching_status: anime.watching_status || "Might Watch",
    is_main: anime.is_main || "",
    ep_previous: anime.ep_previous ?? "",
    ep_total: anime.ep_total ?? "",
    ep_fin: anime.ep_fin ?? "",
    ep_special: anime.ep_special ?? "",
    my_rating: anime.my_rating || "",
    mal_rating: anime.mal_rating ?? "",
    mal_rank: anime.mal_rank || "",
    anilist_rating: anime.anilist_rating || "",
    release_season: anime.release_season || "",
    release_month: anime.release_month || "",
    release_year: anime.release_year || "",
    genre_main: anime.genre_main || "",
    genre_sub: anime.genre_sub || "",
    studio: anime.studio || "",
    director: anime.director || "",
    producer: anime.producer || "",
    music: anime.music || "",
    distributor_tw: anime.distributor_tw || "",
    prequel_id: anime.prequel_id || null,
    sequel_id: anime.sequel_id || null,
    alternative: anime.alternative || "",
    is_main_entry: anime.is_main_entry === true,
    derive_related:
      anime.derive_related === true
        ? "true"
        : anime.derive_related === false
          ? "false"
          : "",
    watch_order: anime.watch_order ?? "",
    mal_id: anime.mal_id ?? "",
    mal_link: anime.mal_link || "",
    anilist_link: anime.anilist_link || "",
    official_link: anime.official_link || "",
    twitter_link: anime.twitter_link || "",
    source_baha:
      anime.source_baha === true
        ? "true"
        : anime.source_baha === false
          ? "false"
          : "",
    baha_link: anime.baha_link || "",
    source_netflix:
      anime.source_netflix === true
        ? "true"
        : anime.source_netflix === false
          ? "false"
          : "",
    source_other: Object.entries(anime.source_other || {}).map(
      ([name, url]) => ({ name, url: url || "" }),
    ),
    op: anime.op || "",
    ed: anime.ed || "",
    insert_ost: anime.insert_ost || "",
    seiyuu: anime.seiyuu || "",
    cover_image_file: anime.cover_image_file || "",
    remark: anime.remark || "",
    notes: anime.notes || {},
  };
}

function franchiseToForm(f) {
  return {
    franchise_name_en: f.franchise_name_en || "",
    franchise_name_cn: f.franchise_name_cn || "",
    franchise_name_roman: f.franchise_name_roman || "",
    franchise_name_jp: f.franchise_name_jp || "",
    franchise_name_alt: f.franchise_name_alt || "",
    franchise_type: f.franchise_type || "",
    my_rating: f.my_rating || "",
    franchise_expectation: f.franchise_expectation || "",
    favorite_3x3_slot: f.favorite_3x3_slot ?? "",
    cover_entry_id: f.cover_entry_id ?? null,
    type_covers: f.type_covers ?? null,
    type_slots: f.type_slots ?? null,
    watch_next_group: f.watch_next_group ?? null,
    to_rewatch: f.to_rewatch ?? false,
    remark: f.remark || "",
  };
}

function seriesToForm(s, allFranchises) {
  const f = allFranchises.find((x) => x.system_id === s.franchise_id);
  return {
    franchise_id: s.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_name_en: s.series_name_en || "",
    series_name_cn: s.series_name_cn || "",
    series_name_alt: s.series_name_alt || "",
    remark: s.remark || "",
  };
}

function movieToForm(movie, allFranchises) {
  const f = allFranchises.find((x) => x.system_id === movie.franchise_id);
  return {
    anime_movie_name_en: movie.anime_movie_name_en || "",
    anime_movie_name_cn: movie.anime_movie_name_cn || "",
    anime_movie_name_roman: movie.anime_movie_name_roman || "",
    anime_movie_name_jp: movie.anime_movie_name_jp || "",
    anime_movie_name_alt: movie.anime_movie_name_alt || "",
    franchise_id: movie.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    airing_status: movie.airing_status || "",
    watching_status: movie.watching_status || "Might Watch",
    my_rating: movie.my_rating || "",
    mal_rating: movie.mal_rating ?? "",
    mal_rank: movie.mal_rank || "",
    anilist_rating: movie.anilist_rating || "",
    release_date_jp: movie.release_date_jp || "",
    release_date_tw: movie.release_date_tw || "",
    length_min: movie.length_min ?? "",
    studio: movie.studio || "",
    director: movie.director || "",
    mal_id: movie.mal_id ?? "",
    mal_link: movie.mal_link || "",
    anilist_link: movie.anilist_link || "",
    official_link: movie.official_link || "",
    twitter_link: movie.twitter_link || "",
    source_baha:
      movie.source_baha === true
        ? "true"
        : movie.source_baha === false
          ? "false"
          : "",
    baha_link: movie.baha_link || "",
    source_netflix:
      movie.source_netflix === true
        ? "true"
        : movie.source_netflix === false
          ? "false"
          : "",
    source_other: Object.entries(movie.source_other || {}).map(
      ([name, url]) => ({
        name,
        url: url || "",
      }),
    ),
    watch_next: movie.watch_next ?? false,
    to_rewatch: movie.to_rewatch ?? false,
    cover_image_file: movie.cover_image_file || "",
    remark: movie.remark || "",
    notes: movie.notes || {},
  };
}

export default function Modify() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [allAnime, setAllAnime] = useState([]);
  const [allFranchises, setAllFranchises] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  const [allOptions, setAllOptions] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTvShows, setAllTvShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allMangas, setAllMangas] = useState([]);
  const [allNovels, setAllNovels] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("anime");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingType, setEditingType] = useState("anime");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const [optCatFilter, setOptCatFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createModal, setCreateModal] = useState(null);
  const [franchiseCreateModal, setFranchiseCreateModal] = useState(null);

  const [af, setAf] = useState({});
  const [ff, setFf] = useState({});
  const [sf, setSf] = useState({});
  const [amf, setAmf] = useState({});
  const [mmf, setMmf] = useState({});
  const [tvmf, setTvmf] = useState({});
  const [cmf, setCmf] = useState({});
  const [cmgf, setCmgf] = useState({});
  const [cnvf, setCnvf] = useState({});
  const [optValue, setOptValue] = useState("");

  const ua = (k, v) => setAf((p) => ({ ...p, [k]: v }));
  const uf = (k, v) => setFf((p) => ({ ...p, [k]: v }));
  const us = (k, v) => setSf((p) => ({ ...p, [k]: v }));
  const uam = (k, v) => setAmf((p) => ({ ...p, [k]: v }));
  const umm = (k, v) => setMmf((p) => ({ ...p, [k]: v }));
  const utv = (k, v) => setTvmf((p) => ({ ...p, [k]: v }));
  const uc = (k, v) => setCmf((p) => ({ ...p, [k]: v }));
  const umg = (k, v) => setCmgf((p) => ({ ...p, [k]: v }));
  const unv = (k, v) => setCnvf((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    async function load() {
      try {
        const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, ctRes, mgRes, nvRes] =
          await Promise.all([
            fetch("/api/anime/", { credentials: "include" }),
            fetch("/api/franchise/", { credentials: "include" }),
            fetch("/api/series/", { credentials: "include" }),
            fetch("/api/options/", { credentials: "include" }),
            fetch("/api/anime-movie/", { credentials: "include" }),
            fetch("/api/movies/", { credentials: "include" }),
            fetch("/api/tv-shows/", { credentials: "include" }),
            fetch("/api/cartoon/", { credentials: "include" }),
            fetch("/api/manga/", { credentials: "include" }),
            fetch("/api/novel/", { credentials: "include" }),
          ]);
        const [
          anime,
          franchises,
          series,
          options,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          novels,
        ] = await Promise.all([
          aRes.json(),
          fRes.json(),
          sRes.json(),
          oRes.json(),
          amRes.json(),
          mvRes.json(),
          tvRes.json(),
          ctRes.json(),
          mgRes.json(),
          nvRes.json(),
        ]);
        setAllAnime(anime);
        setAllFranchises(franchises);
        setAllSeries(series);
        setAllOptions(options);
        setAllAnimeMovies(animeMovies);
        setAllMovies(movies);
        setAllTvShows(tvShows);
        setAllCartoons(cartoons);
        setAllMangas(mangas);
        setAllNovels(novels);

        const urlId = searchParams.get("id");
        const urlType = searchParams.get("type");
        if (urlId) {
          if (urlType === "cartoon") {
            const ct = cartoons.find((x) => x.system_id === urlId);
            if (ct) {
              openEditorWith(ct, "cartoon", franchises, series);
              setActiveTab("cartoon");
              return;
            }
          }
          if (urlType === "manga") {
            const mg = mangas.find((x) => x.system_id === urlId);
            if (mg) {
              openEditorWith(mg, "manga", franchises, series);
              setActiveTab("manga");
              return;
            }
          }
          if (urlType === "novel") {
            const nv = novels.find((x) => x.system_id === urlId);
            if (nv) {
              openEditorWith(nv, "novel", franchises, series);
              setActiveTab("novel");
              return;
            }
          }
          if (urlType === "tv-show") {
            const tv = tvShows.find((x) => x.system_id === urlId);
            if (tv) {
              openEditorWith(tv, "tv-show", franchises, series);
              setActiveTab("tv-show");
              return;
            }
          }
          if (urlType === "movie") {
            const mv = movies.find((x) => x.system_id === urlId);
            if (mv) {
              openEditorWith(mv, "movie", franchises, series);
              setActiveTab("movie");
              return;
            }
          }
          const a = anime.find((x) => x.system_id === urlId);
          if (a) {
            openEditorWith(a, "anime", franchises, series);
            return;
          }
          const f = franchises.find((x) => x.system_id === urlId);
          if (f) {
            openEditorWith(f, "franchise", franchises, series);
            setActiveTab("franchise");
            return;
          }
          const s = series.find((x) => x.system_id === urlId);
          if (s) {
            openEditorWith(s, "series", franchises, series);
            setActiveTab("series");
            return;
          }
          const m = animeMovies.find((x) => x.system_id === urlId);
          if (m) {
            openEditorWith(m, "anime-movie", franchises, series);
            setActiveTab("anime-movie");
            return;
          }
        }
      } catch {
        showToast("error", "Database load failed.");
      } finally {
        setDataLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function liveMovieToForm(m, allFranchises, seriesList) {
    const f = allFranchises.find((x) => x.system_id === m.franchise_id);
    const s = (seriesList || allSeries).find(
      (x) => x.system_id === m.series_id,
    );
    return {
      movie_name_en: m.movie_name_en || "",
      movie_name_cn: m.movie_name_cn || "",
      movie_name_alt: m.movie_name_alt || "",
      franchise_id: m.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: m.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      airing_status: m.airing_status || "",
      watching_status: m.watching_status || "Might Watch",
      my_rating: m.my_rating || "",
      is_main: m.is_main || "",
      movie_type: m.movie_type || "",
      length_min: m.length_min ?? "",
      release_date_usa: m.release_date_usa || "",
      release_date_tw: m.release_date_tw || "",
      director: m.director || "",
      prequel_id: m.prequel_id || null,
      sequel_id: m.sequel_id || null,
      watch_order: m.watch_order ?? "",
      derive_related:
        m.derive_related === true
          ? "true"
          : m.derive_related === false
            ? "false"
            : "",
      imdb_id: m.imdb_id ?? "",
      imdb_link: m.imdb_link || "",
      source_other: Object.entries(m.source_other || {}).map(([name, url]) => ({
        name,
        url: url || "",
      })),
      watch_next: m.watch_next ?? false,
      to_rewatch: m.to_rewatch ?? false,
      cover_image_file: m.cover_image_file || "",
      remark: m.remark || "",
      notes: m.notes || {},
    };
  }

  function tvShowToForm(t, allFranchises, seriesList) {
    const f = allFranchises.find((x) => x.system_id === t.franchise_id);
    const s = (seriesList || allSeries).find(
      (x) => x.system_id === t.series_id,
    );
    return {
      tv_name_cn: t.tv_name_cn || "",
      tv_name_en: t.tv_name_en || "",
      tv_name_alt: t.tv_name_alt || "",
      franchise_id: t.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: t.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      season_part: t.season_part || "",
      region: t.region || "",
      source_official: t.source_official || "",
      is_main: t.is_main || "",
      airing_status: t.airing_status || "",
      watching_status: t.watching_status || "Might Watch",
      ep_total: t.ep_total ?? "",
      ep_fin: t.ep_fin ?? "",
      my_rating: t.my_rating || "",
      imdb_rating: t.imdb_rating || "",
      release_date: t.release_date || "",
      prequel_id: t.prequel_id || null,
      sequel_id: t.sequel_id || null,
      watch_order: t.watch_order ?? "",
      derive_related:
        t.derive_related === true
          ? "true"
          : t.derive_related === false
            ? "false"
            : "",
      imdb_id: t.imdb_id ?? "",
      imdb_link: t.imdb_link || "",
      watch_next: t.watch_next ?? false,
      to_rewatch: t.to_rewatch ?? false,
      source_other: Object.entries(t.source_other || {}).map(([name, url]) => ({
        name,
        url: url || "",
      })),
      remark: t.remark || "",
      notes: t.notes || {},
    };
  }

  function cartoonToForm(c, allFranchises, seriesList) {
    const f = allFranchises.find((x) => x.system_id === c.franchise_id);
    const s = (seriesList || allSeries).find(
      (x) => x.system_id === c.series_id,
    );
    return {
      cartoon_name_cn: c.cartoon_name_cn || "",
      cartoon_name_en: c.cartoon_name_en || "",
      cartoon_name_alt: c.cartoon_name_alt || "",
      franchise_id: c.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: c.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      season_part: c.season_part || "",
      airing_type: c.airing_type || "",
      airing_status: c.airing_status || "",
      watching_status: c.watching_status || "Might Watch",
      is_main: c.is_main || "",
      ep_total: c.ep_total ?? "",
      ep_fin: c.ep_fin ?? "",
      my_rating: c.my_rating || "",
      imdb_rating: c.imdb_rating || "",
      length_ep_min: c.length_ep_min ?? "",
      source_official: c.source_official || "",
      release_date: c.release_date || "",
      prequel_id: c.prequel_id || null,
      sequel_id: c.sequel_id || null,
      watch_order: c.watch_order ?? "",
      derive_related:
        c.derive_related === true
          ? "true"
          : c.derive_related === false
            ? "false"
            : "",
      imdb_id: c.imdb_id ?? "",
      imdb_link: c.imdb_link || "",
      source_other: Array.isArray(c.source_other)
        ? c.source_other
        : Object.entries(c.source_other || {}).map(([name, url]) => ({
            name,
            url: url || "",
          })),
      watch_next: c.watch_next ?? false,
      to_rewatch: c.to_rewatch ?? false,
      cover_image_file: c.cover_image_file || "",
      remark: c.remark || "",
      notes: c.notes || {},
    };
  }

  function mangaToForm(m, allFranchises, seriesList) {
    const f = allFranchises.find((x) => x.system_id === m.franchise_id);
    const s = (seriesList || allSeries).find(
      (x) => x.system_id === m.series_id,
    );
    return {
      manga_name_cn: m.manga_name_cn || "",
      manga_name_en: m.manga_name_en || "",
      manga_name_roman: m.manga_name_roman || "",
      manga_name_jp: m.manga_name_jp || "",
      manga_name_alt: m.manga_name_alt || "",
      franchise_id: m.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: m.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      region: m.region || "",
      serialization_status: m.serialization_status || "",
      reading_status: m.reading_status || "Might Read",
      is_main: m.is_main || "",
      vol_total: m.vol_total ?? "",
      vol_fin: m.vol_fin ?? "",
      vol_fin_page: m.vol_fin_page ?? "",
      ch_total: m.ch_total ?? "",
      ch_fin: m.ch_fin ?? "",
      my_rating: m.my_rating || "",
      mal_rating: m.mal_rating ?? "",
      mal_rank: m.mal_rank ?? "",
      anilist_rating: m.anilist_rating ?? "",
      author_plot: m.author_plot || "",
      author_draw: m.author_draw || "",
      release_year: m.release_year ?? "",
      end_year: m.end_year ?? "",
      anime_studio: m.anime_studio || "",
      serialization_platform: m.serialization_platform || "",
      publisher_tw: m.publisher_tw || "",
      derive_related:
        m.derive_related === true
          ? "true"
          : m.derive_related === false
            ? "false"
            : "",
      prequel_id: m.prequel_id || null,
      sequel_id: m.sequel_id || null,
      watch_order: m.watch_order ?? "",
      mal_id: m.mal_id ?? "",
      mal_link: m.mal_link || "",
      anilist_link: m.anilist_link || "",
      source_other: Array.isArray(m.source_other)
        ? m.source_other
        : Object.entries(m.source_other || {}).map(([name, url]) => ({
            name,
            url: url || "",
          })),
      read_next: m.read_next ?? false,
      to_reread: m.to_reread ?? false,
      cover_image_file: m.cover_image_file || "",
      remark: m.remark || "",
      notes: m.notes || {},
    };
  }

  function novelToForm(n, allFranchises, seriesList) {
    const f = allFranchises.find((x) => x.system_id === n.franchise_id);
    const s = (seriesList || allSeries).find(
      (x) => x.system_id === n.series_id,
    );
    const novel_name_each_cn = n.novel_name_each_cn || [];
    const novel_name_each_en = n.novel_name_each_en || [];
    return {
      novel_name_cn: n.novel_name_cn || "",
      novel_name_en: n.novel_name_en || "",
      novel_name_roman: n.novel_name_roman || "",
      novel_name_jp: n.novel_name_jp || "",
      novel_name_alt: n.novel_name_alt || "",
      franchise_id: n.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: n.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      region: n.region || "",
      type: n.type || "",
      version: n.version || "",
      is_main: n.is_main || "",
      serialization_status: n.serialization_status || "",
      reading_status: n.reading_status || "Might Read",
      progress_display: n.progress_display || "",
      vol_total_original: n.vol_total_original ?? "",
      vol_total_tw: n.vol_total_tw ?? "",
      vol_fin: n.vol_fin ?? "",
      arc_total: n.arc_total ?? "",
      arc_fin: n.arc_fin ?? "",
      ch_total: n.ch_total ?? "",
      ch_fin: n.ch_fin ?? "",
      my_rating: n.my_rating || "",
      mal_rating: n.mal_rating ?? "",
      mal_rank: n.mal_rank ?? "",
      anilist_rating: n.anilist_rating ?? "",
      author: n.author || "",
      illustrator: n.illustrator || "",
      release_year: n.release_year ?? "",
      end_year: n.end_year ?? "",
      publisher_tw: n.publisher_tw || "",
      prequel_id: n.prequel_id || null,
      sequel_id: n.sequel_id || null,
      alternative: n.alternative || "",
      read_order: n.read_order ?? "",
      novel_name_each_cn,
      novel_name_each_en,
      mal_id: n.mal_id ?? "",
      mal_link: n.mal_link || "",
      anilist_link: n.anilist_link || "",
      source_other: Array.isArray(n.source_other)
        ? n.source_other
        : Object.entries(n.source_other || {}).map(([name, url]) => ({
            name,
            url: url || "",
          })),
      read_next: n.read_next ?? false,
      to_reread: n.to_reread ?? false,
      cover_image_file: n.cover_image_file || "",
      remark: n.remark || "",
      notes: n.notes || {},
    };
  }

  function openEditorWith(item, type, franchises, series) {
    setEditingItem(item);
    setEditingType(type);
    if (type === "anime") setAf(animeToForm(item, franchises, series));
    else if (type === "franchise") setFf(franchiseToForm(item));
    else if (type === "series") setSf(seriesToForm(item, franchises));
    else if (type === "anime-movie") setAmf(movieToForm(item, franchises));
    else if (type === "movie")
      setMmf(liveMovieToForm(item, franchises, series));
    else if (type === "tv-show")
      setTvmf(tvShowToForm(item, franchises, series));
    else if (type === "cartoon")
      setCmf(cartoonToForm(item, franchises, series));
    else if (type === "manga") setCmgf(mangaToForm(item, franchises, series));
    else if (type === "novel") setCnvf(novelToForm(item, franchises, series));
    else if (type === "options") setOptValue(item.option_value || "");
    setEditorOpen(true);
  }

  function openEditor(item, type) {
    openEditorWith(item, type, allFranchises, allSeries);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingItem(null);
    setSearchQuery("");
    setSearchOpen(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !editingItem) return;
    setSubmitting(true);
    try {
      if (editingType === "anime") await saveAnime();
      else if (editingType === "franchise") await saveFranchise();
      else if (editingType === "series") await saveSeries();
      else if (editingType === "anime-movie") await saveAnimeMovie();
      else if (editingType === "movie") await saveMovie();
      else if (editingType === "tv-show") await saveTvShow();
      else if (editingType === "cartoon") await saveCartoon();
      else if (editingType === "manga") await saveManga();
      else if (editingType === "novel") await saveNovel();
      else if (editingType === "options") await saveOption();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAnime() {
    let franchiseId = af.franchise_id;
    if (!franchiseId && af.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: af.anime_name_en || null,
          franchise_name_cn: af.anime_name_cn || null,
          franchise_name_roman: af.anime_name_roman || null,
          franchise_name_jp: af.anime_name_jp || null,
          franchise_name_alt: af.anime_name_alt || null,
          franchise_type: "ACG",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = af.series_id;
    if (!seriesId && af.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: af.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const res = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: af.anime_name_en || null,
          series_name_cn: af.anime_name_cn || null,
          series_name_alt: af.anime_name_alt || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await res.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const res = await fetch(`/api/anime/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildAnimePayload(af, {
          franchiseId,
          seriesId,
          notes: Object.keys(af.notes || {}).length > 0 ? af.notes : null,
        }),
      ),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllAnime((prev) =>
      prev.map((a) => (a.system_id === updated.system_id ? updated : a)),
    );
    setEditingItem(updated);
    setAf(animeToForm(updated, allFranchises, allSeries));
    await fetch(`/api/data-control/replace/anime/${updated.system_id}`, {
      method: "POST",
      credentials: "include",
    });
    window.scrollTo(0, 0);
    showToast("success", "Update and enrichment successful.");
  }

  async function saveFranchise() {
    const res = await fetch(`/api/franchise/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_name_en: ff.franchise_name_en || null,
        franchise_name_cn: ff.franchise_name_cn || null,
        franchise_name_roman: ff.franchise_name_roman || null,
        franchise_name_jp: ff.franchise_name_jp || null,
        franchise_name_alt: ff.franchise_name_alt || null,
        franchise_type: ff.franchise_type || null,
        my_rating: ff.my_rating || null,
        franchise_expectation: ff.franchise_expectation || null,
        favorite_3x3_slot:
          ff.favorite_3x3_slot !== "" ? parseInt(ff.favorite_3x3_slot) : null,
        cover_entry_id: ff.cover_entry_id || null,
        type_covers: ff.type_covers || null,
        type_slots: ff.type_slots || null,
        watch_next_group: ff.watch_next_group || null,
        to_rewatch: ff.to_rewatch || false,
        remark: ff.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const updated = await res.json();
      setAllFranchises((prev) =>
        prev.map((f) => (f.system_id === updated.system_id ? updated : f)),
      );
      setEditingItem(updated);
      window.scrollTo(0, 0);
      showToast("success", "Update successful.");
    } else showToast("error", "Update failed");
  }

  async function saveSeries() {
    if (!sf.franchise_id && !sf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }
    let franchiseId = sf.franchise_id;
    if (!franchiseId && sf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const fRes = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: sf.franchise_text,
          franchise_type: "ACG",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!fRes.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await fRes.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    const res = await fetch(`/api/series/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: franchiseId,
        series_name_en: sf.series_name_en || null,
        series_name_cn: sf.series_name_cn || null,
        series_name_alt: sf.series_name_alt || null,
        remark: sf.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const updated = await res.json();
      setAllSeries((prev) =>
        prev.map((s) => (s.system_id === updated.system_id ? updated : s)),
      );
      setEditingItem(updated);
      setSf(seriesToForm(updated, allFranchises));
      window.scrollTo(0, 0);
      showToast("success", "Update successful.");
    } else showToast("error", "Update failed");
  }

  async function saveOption() {
    const res = await fetch(`/api/options/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option_value: optValue }),
      credentials: "include",
    });
    if (res.ok) {
      const updated = await res.json();
      setAllOptions((prev) =>
        prev.map((o) => (o.system_id === updated.system_id ? updated : o)),
      );
      setEditingItem(updated);
      window.scrollTo(0, 0);
      showToast("success", "Update successful.");
    } else showToast("error", "Update failed");
  }

  async function saveAnimeMovie() {
    let franchiseId = amf.franchise_id;
    if (!franchiseId && amf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: amf.anime_movie_name_en || null,
          franchise_name_cn: amf.anime_movie_name_cn || null,
          franchise_name_roman: amf.anime_movie_name_roman || null,
          franchise_name_jp: amf.anime_movie_name_jp || null,
          franchise_name_alt: amf.anime_movie_name_alt || null,
          franchise_type: "ACG",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    const res = await fetch(`/api/anime-movie/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildAnimeMoviePayload(amf, {
          franchiseId,
          notes: Object.keys(amf.notes || {}).length > 0 ? amf.notes : null,
        }),
      ),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllAnimeMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setEditingItem(updated);
    setAmf(movieToForm(updated, allFranchises));
    await fetch(`/api/data-control/replace/anime-movie/${updated.system_id}`, {
      method: "POST",
      credentials: "include",
    });
    window.scrollTo(0, 0);
    showToast("success", "Update and enrichment successful.");
  }

  async function saveMovie() {
    let franchiseId = mmf.franchise_id;
    if (!franchiseId && mmf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Movie",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: mmf.movie_name_en || null,
          franchise_name_cn: mmf.movie_name_cn || null,
          franchise_name_alt: mmf.movie_name_alt || null,
          franchise_type: "Movie",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = mmf.series_id;
    if (!seriesId && (mmf.series_text || "").trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: mmf.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const sRes = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: mmf.movie_name_en || null,
          series_name_cn: mmf.movie_name_cn || null,
          series_name_alt: mmf.movie_name_alt || null,
        }),
        credentials: "include",
      });
      if (!sRes.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await sRes.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const payload = {
      movie_name_en: mmf.movie_name_en || null,
      movie_name_cn: mmf.movie_name_cn || null,
      movie_name_alt: mmf.movie_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      is_main: mmf.is_main || null,
      airing_status: mmf.airing_status || null,
      watching_status: mmf.watching_status || "Might Watch",
      my_rating: mmf.my_rating || null,
      movie_type: mmf.movie_type || null,
      length_min: mmf.length_min !== "" ? parseInt(mmf.length_min) : null,
      release_date_usa: mmf.release_date_usa || null,
      release_date_tw: mmf.release_date_tw || null,
      director: mmf.director || null,
      prequel_id: mmf.prequel_id || null,
      sequel_id: mmf.sequel_id || null,
      watch_order: mmf.watch_order !== "" ? parseFloat(mmf.watch_order) : null,
      derive_related:
        mmf.derive_related === "true"
          ? true
          : mmf.derive_related === "false"
            ? false
            : null,
      imdb_id: mmf.imdb_id !== "" ? mmf.imdb_id : null,
      imdb_link: mmf.imdb_link || null,
      source_other:
        mmf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              mmf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: mmf.watch_next ?? null,
      to_rewatch: mmf.to_rewatch ?? false,
      cover_image_file: mmf.cover_image_file || null,
      remark: mmf.remark || null,
      notes: Object.keys(mmf.notes || {}).length > 0 ? mmf.notes : null,
    };
    const res = await fetch(`/api/movies/${editingItem.system_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllMovies((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setEditingItem(updated);
    setMmf(liveMovieToForm(updated, allFranchises, allSeries));
    window.scrollTo(0, 0);
    showToast("success", "Movie updated and enriched successfully.");
  }

  async function saveTvShow() {
    let franchiseId = tvmf.franchise_id;
    if (!franchiseId && (tvmf.franchise_text || "").trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "TV",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: tvmf.tv_name_en || null,
          franchise_name_cn: tvmf.tv_name_cn || null,
          franchise_name_alt: tvmf.tv_name_alt || null,
          franchise_type: "TV",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = tvmf.series_id;
    if (!seriesId && (tvmf.series_text || "").trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: tvmf.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const sRes = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: tvmf.tv_name_en || null,
          series_name_cn: tvmf.tv_name_cn || null,
          series_name_alt: tvmf.tv_name_alt || null,
        }),
        credentials: "include",
      });
      if (!sRes.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await sRes.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const payload = {
      tv_name_cn: tvmf.tv_name_cn || null,
      tv_name_en: tvmf.tv_name_en || null,
      tv_name_alt: tvmf.tv_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      season_part: tvmf.season_part || null,
      region: tvmf.region || null,
      source_official: tvmf.source_official || null,
      is_main: tvmf.is_main || null,
      airing_status: tvmf.airing_status || null,
      watching_status: tvmf.watching_status || "Might Watch",
      ep_total: tvmf.ep_total !== "" ? parseInt(tvmf.ep_total) : null,
      ep_fin: tvmf.ep_fin !== "" ? parseInt(tvmf.ep_fin) : null,
      my_rating: tvmf.my_rating || null,
      imdb_rating: tvmf.imdb_rating || null,
      release_date: tvmf.release_date || null,
      prequel_id: tvmf.prequel_id || null,
      sequel_id: tvmf.sequel_id || null,
      watch_order:
        tvmf.watch_order !== "" ? parseFloat(tvmf.watch_order) : null,
      derive_related:
        tvmf.derive_related === "true"
          ? true
          : tvmf.derive_related === "false"
            ? false
            : null,
      imdb_id: tvmf.imdb_id !== "" ? tvmf.imdb_id : null,
      imdb_link: tvmf.imdb_link || null,
      source_other:
        tvmf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              tvmf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: tvmf.watch_next ?? null,
      to_rewatch: tvmf.to_rewatch ?? false,
      remark: tvmf.remark || null,
      notes: Object.keys(tvmf.notes || {}).length > 0 ? tvmf.notes : null,
    };
    const res = await fetch(`/api/tv-shows/${editingItem.system_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllTvShows((prev) =>
      prev.map((t) => (t.system_id === updated.system_id ? updated : t)),
    );
    setEditingItem(updated);
    setTvmf(tvShowToForm(updated, allFranchises, allSeries));
    window.scrollTo(0, 0);
    showToast("success", "TV show updated successfully.");
  }

  async function saveCartoon() {
    let franchiseId = cmf.franchise_id;
    if (!franchiseId && (cmf.franchise_text || "").trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Cartoon",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: cmf.cartoon_name_en || null,
          franchise_name_cn: cmf.cartoon_name_cn || null,
          franchise_name_alt: cmf.cartoon_name_alt || null,
          franchise_type: "Cartoon",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = cmf.series_id;
    if (!seriesId && (cmf.series_text || "").trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: cmf.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const sRes = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: cmf.cartoon_name_en || null,
          series_name_cn: cmf.cartoon_name_cn || null,
          series_name_alt: cmf.cartoon_name_alt || null,
        }),
        credentials: "include",
      });
      if (!sRes.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await sRes.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const payload = {
      cartoon_name_cn: cmf.cartoon_name_cn || null,
      cartoon_name_en: cmf.cartoon_name_en || null,
      cartoon_name_alt: cmf.cartoon_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      season_part: cmf.season_part || null,
      airing_type: cmf.airing_type || null,
      airing_status: cmf.airing_status || null,
      watching_status: cmf.watching_status || "Might Watch",
      is_main: cmf.is_main || null,
      ep_total: cmf.ep_total !== "" ? parseInt(cmf.ep_total) : null,
      ep_fin: cmf.ep_fin !== "" ? parseInt(cmf.ep_fin) : null,
      my_rating: cmf.my_rating || null,
      imdb_rating: cmf.imdb_rating || null,
      length_ep_min:
        cmf.length_ep_min !== "" ? parseInt(cmf.length_ep_min) : null,
      source_official: cmf.source_official || null,
      release_date: cmf.release_date || null,
      prequel_id: cmf.prequel_id || null,
      sequel_id: cmf.sequel_id || null,
      watch_order: cmf.watch_order !== "" ? parseFloat(cmf.watch_order) : null,
      derive_related:
        cmf.derive_related === "true"
          ? true
          : cmf.derive_related === "false"
            ? false
            : null,
      imdb_id: cmf.imdb_id !== "" ? cmf.imdb_id : null,
      imdb_link: cmf.imdb_link || null,
      source_other:
        (cmf.source_other || []).filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              (cmf.source_other || [])
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: cmf.watch_next ?? null,
      to_rewatch: cmf.to_rewatch ?? false,
      cover_image_file: cmf.cover_image_file || null,
      remark: cmf.remark || null,
      notes: Object.keys(cmf.notes || {}).length > 0 ? cmf.notes : null,
    };
    const res = await fetch(`/api/cartoon/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllCartoons((prev) =>
      prev.map((c) => (c.system_id === updated.system_id ? updated : c)),
    );
    setEditingItem(updated);
    setCmf(cartoonToForm(updated, allFranchises, allSeries));
    await fetch(`/api/data-control/replace/cartoon/${updated.system_id}`, {
      method: "POST",
      credentials: "include",
    });
    window.scrollTo(0, 0);
    showToast("success", "Update and enrichment successful.");
  }

  async function saveManga() {
    let franchiseId = cmgf.franchise_id;
    if (!franchiseId && (cmgf.franchise_text || "").trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: cmgf.manga_name_en || null,
          franchise_name_cn: cmgf.manga_name_cn || null,
          franchise_name_roman: cmgf.manga_name_roman || null,
          franchise_name_jp: cmgf.manga_name_jp || null,
          franchise_name_alt: cmgf.manga_name_alt || null,
          franchise_type: "ACG",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = cmgf.series_id;
    if (!seriesId && (cmgf.series_text || "").trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: cmgf.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const sRes = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: cmgf.manga_name_en || null,
          series_name_cn: cmgf.manga_name_cn || null,
          series_name_alt: cmgf.manga_name_alt || null,
        }),
        credentials: "include",
      });
      if (!sRes.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await sRes.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const payload = {
      manga_name_cn: cmgf.manga_name_cn || null,
      manga_name_en: cmgf.manga_name_en || null,
      manga_name_roman: cmgf.manga_name_roman || null,
      manga_name_jp: cmgf.manga_name_jp || null,
      manga_name_alt: cmgf.manga_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      region: cmgf.region || null,
      serialization_status: cmgf.serialization_status || null,
      reading_status: cmgf.reading_status || "Might Read",
      is_main: cmgf.is_main || null,
      vol_total: cmgf.vol_total !== "" ? parseInt(cmgf.vol_total) : null,
      vol_fin: cmgf.vol_fin !== "" ? parseInt(cmgf.vol_fin) : null,
      vol_fin_page:
        cmgf.vol_fin_page !== "" ? parseInt(cmgf.vol_fin_page) : null,
      ch_total: cmgf.ch_total !== "" ? parseInt(cmgf.ch_total) : null,
      ch_fin: cmgf.ch_fin !== "" ? parseInt(cmgf.ch_fin) : null,
      my_rating: cmgf.my_rating || null,
      mal_rating: cmgf.mal_rating !== "" ? parseFloat(cmgf.mal_rating) : null,
      mal_rank: cmgf.mal_rank !== "" ? parseInt(cmgf.mal_rank) : null,
      anilist_rating:
        cmgf.anilist_rating !== "" ? parseFloat(cmgf.anilist_rating) : null,
      author_plot: cmgf.author_plot || null,
      author_draw: cmgf.author_draw || null,
      release_year:
        cmgf.release_year !== "" ? parseInt(cmgf.release_year) : null,
      end_year: cmgf.end_year !== "" ? parseInt(cmgf.end_year) : null,
      anime_studio: cmgf.anime_studio || null,
      serialization_platform: cmgf.serialization_platform || null,
      publisher_tw: cmgf.publisher_tw || null,
      derive_related:
        cmgf.derive_related === "true"
          ? true
          : cmgf.derive_related === "false"
            ? false
            : null,
      prequel_id: cmgf.prequel_id || null,
      sequel_id: cmgf.sequel_id || null,
      watch_order:
        cmgf.watch_order !== "" ? parseFloat(cmgf.watch_order) : null,
      mal_id: cmgf.mal_id !== "" ? parseInt(cmgf.mal_id) : null,
      mal_link: cmgf.mal_link || null,
      anilist_link: cmgf.anilist_link || null,
      source_other:
        (cmgf.source_other || []).filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              (cmgf.source_other || [])
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      read_next: cmgf.read_next ?? false,
      to_reread: cmgf.to_reread ?? false,
      cover_image_file: cmgf.cover_image_file || null,
      remark: cmgf.remark || null,
      notes: Object.keys(cmgf.notes || {}).length > 0 ? cmgf.notes : null,
    };
    const res = await fetch(`/api/manga/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllMangas((prev) =>
      prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
    );
    setEditingItem(updated);
    setCmgf(mangaToForm(updated, allFranchises, allSeries));
    await fetch(`/api/data-control/replace/manga/${updated.system_id}`, {
      method: "POST",
      credentials: "include",
    });
    window.scrollTo(0, 0);
    showToast("success", "Update and enrichment successful.");
  }

  async function saveNovel() {
    let franchiseId = cnvf.franchise_id;
    if (!franchiseId && (cnvf.franchise_text || "").trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Novel",
          onConfirm: (exp, rem) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation: exp, remark: rem });
          },
          onCancel: () => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: false });
          },
        });
      });
      if (!result.confirmed) return;
      const res = await fetch("/api/franchise/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_name_en: cnvf.novel_name_en || null,
          franchise_name_cn: cnvf.novel_name_cn || null,
          franchise_name_roman: cnvf.novel_name_roman || null,
          franchise_name_jp: cnvf.novel_name_jp || null,
          franchise_name_alt: cnvf.novel_name_alt || null,
          franchise_type: "Novel",
          franchise_expectation: result.expectation,
          remark: result.remark || null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast("error", "Failed to create franchise");
        return;
      }
      const nf = await res.json();
      franchiseId = nf.system_id;
      setAllFranchises((prev) => [...prev, nf]);
    }
    let seriesId = cnvf.series_id;
    if (!seriesId && (cnvf.series_text || "").trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: cnvf.series_text,
          onConfirm: () => {
            setCreateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setCreateModal(null);
            resolve(false);
          },
        });
      });
      if (!confirmed) return;
      const sRes = await fetch("/api/series/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          franchise_id: franchiseId,
          series_name_en: cnvf.novel_name_en || null,
          series_name_cn: cnvf.novel_name_cn || null,
          series_name_alt: cnvf.novel_name_alt || null,
        }),
        credentials: "include",
      });
      if (!sRes.ok) {
        showToast("error", "Failed to create series");
        return;
      }
      const ns = await sRes.json();
      seriesId = ns.system_id;
      setAllSeries((prev) => [...prev, ns]);
    }
    const novelNameEachCn = (cnvf.novel_name_each_cn || []).filter((e) => e.name.trim()).length > 0
      ? (cnvf.novel_name_each_cn || []).filter((e) => e.name.trim()).map((e) => ({ key: e.key, name: e.name.trim() }))
      : null;
    const novelNameEachEn = (cnvf.novel_name_each_en || []).filter((e) => e.name.trim()).length > 0
      ? (cnvf.novel_name_each_en || []).filter((e) => e.name.trim()).map((e) => ({ key: e.key, name: e.name.trim() }))
      : null;

    // Auto-create missing system options for author, illustrator, publisher_tw
    {
      const existingValues = {};
      for (const o of allOptions) {
        if (!existingValues[o.category]) existingValues[o.category] = new Set();
        existingValues[o.category].add(o.option_value);
      }
      const toCreate = [];
      for (const v of (cnvf.author || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!existingValues["Novel Author"]?.has(v))
          toCreate.push({ category: "Novel Author", option_value: v });
      }
      for (const v of (cnvf.illustrator || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!existingValues["Novel Illustrator"]?.has(v))
          toCreate.push({ category: "Novel Illustrator", option_value: v });
      }
      const pub = (cnvf.publisher_tw || "").trim();
      if (pub && !existingValues["Novel Publisher TW"]?.has(pub))
        toCreate.push({ category: "Novel Publisher TW", option_value: pub });
      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map((item) =>
            fetch("/api/options/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
              credentials: "include",
            }),
          ),
        );
        const oRes = await fetch("/api/options/", { credentials: "include" });
        if (oRes.ok) setAllOptions(await oRes.json());
      }
    }

    const payload = {
      novel_name_cn: cnvf.novel_name_cn || null,
      novel_name_en: cnvf.novel_name_en || null,
      novel_name_roman: cnvf.novel_name_roman || null,
      novel_name_jp: cnvf.novel_name_jp || null,
      novel_name_alt: cnvf.novel_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      region: cnvf.region || null,
      type: cnvf.type || null,
      version: cnvf.version || null,
      is_main: cnvf.is_main || null,
      serialization_status: cnvf.serialization_status || null,
      reading_status: cnvf.reading_status || "Might Read",
      progress_display: cnvf.progress_display || null,
      vol_total_original: cnvf.vol_total_original !== "" ? parseFloat(cnvf.vol_total_original) : null,
      vol_total_tw: cnvf.vol_total_tw !== "" ? parseFloat(cnvf.vol_total_tw) : null,
      vol_fin: cnvf.vol_fin !== "" ? parseFloat(cnvf.vol_fin) : null,
      arc_total: cnvf.arc_total !== "" ? parseFloat(cnvf.arc_total) : null,
      arc_fin: cnvf.arc_fin !== "" ? parseFloat(cnvf.arc_fin) : null,
      ch_total: cnvf.ch_total !== "" ? parseFloat(cnvf.ch_total) : null,
      ch_fin: cnvf.ch_fin !== "" ? parseFloat(cnvf.ch_fin) : null,
      my_rating: cnvf.my_rating || null,
      mal_rating: cnvf.mal_rating !== "" ? parseFloat(cnvf.mal_rating) : null,
      mal_rank: cnvf.mal_rank !== "" ? parseInt(cnvf.mal_rank) : null,
      anilist_rating: cnvf.anilist_rating !== "" ? parseFloat(cnvf.anilist_rating) : null,
      author: cnvf.author || null,
      illustrator: cnvf.illustrator || null,
      release_year: cnvf.release_year !== "" ? parseInt(cnvf.release_year) : null,
      end_year: cnvf.end_year !== "" ? parseInt(cnvf.end_year) : null,
      publisher_tw: cnvf.publisher_tw || null,
      prequel_id: cnvf.prequel_id || null,
      sequel_id: cnvf.sequel_id || null,
      alternative: cnvf.alternative || null,
      read_order: cnvf.read_order !== "" ? parseFloat(cnvf.read_order) : null,
      novel_name_each_cn: novelNameEachCn,
      novel_name_each_en: novelNameEachEn,
      mal_id: cnvf.mal_id !== "" ? parseInt(cnvf.mal_id) : null,
      mal_link: cnvf.mal_link || null,
      anilist_link: cnvf.anilist_link || null,
      source_other:
        (cnvf.source_other || []).filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              (cnvf.source_other || [])
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      read_next: cnvf.read_next ?? false,
      to_reread: cnvf.to_reread ?? false,
      cover_image_file: cnvf.cover_image_file || null,
      remark: cnvf.remark || null,
      notes: Object.keys(cnvf.notes || {}).length > 0 ? cnvf.notes : null,
    };
    const res = await fetch(`/api/novel/${editingItem.system_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Update failed",
      );
      return;
    }
    const updated = await res.json();
    setAllNovels((prev) =>
      prev.map((n) => (n.system_id === updated.system_id ? updated : n)),
    );
    setEditingItem(updated);
    setCnvf(novelToForm(updated, allFranchises, allSeries));
    window.scrollTo(0, 0);
    showToast("success", "Update successful.");
  }

  function getItemLabel(item, type) {
    if (type === "anime")
      return item.anime_name_cn || item.anime_name_en || "Unknown";
    if (type === "franchise")
      return item.franchise_name_cn || item.franchise_name_en || "Unknown";
    if (type === "series")
      return item.series_name_cn || item.series_name_en || "Unknown";
    if (type === "anime-movie")
      return item.anime_movie_name_cn || item.anime_movie_name_en || "Unknown";
    if (type === "movie")
      return item.movie_name_cn || item.movie_name_en || "Unknown";
    if (type === "tv-show")
      return (
        item.tv_name_cn || item.tv_name_en || item.tv_name_alt || "Unknown"
      );
    if (type === "cartoon")
      return (
        item.cartoon_name_cn ||
        item.cartoon_name_en ||
        item.cartoon_name_alt ||
        "Unknown"
      );
    if (type === "manga")
      return (
        item.manga_name_cn ||
        item.manga_name_en ||
        item.manga_name_roman ||
        item.manga_name_jp ||
        item.manga_name_alt ||
        "Unknown"
      );
    if (type === "novel")
      return (
        item.novel_name_cn ||
        item.novel_name_en ||
        item.novel_name_roman ||
        item.novel_name_jp ||
        item.novel_name_alt ||
        "Unknown"
      );
    if (type === "options") return `${item.category}: ${item.option_value}`;
    return "Unknown";
  }

  const searchResults = (() => {
    if (!searchQuery.trim()) return [];
    const q = cleanString(searchQuery);
    if (activeTab === "anime")
      return allAnime
        .filter((a) =>
          [
            a.anime_name_en,
            a.anime_name_cn,
            a.anime_name_roman,
            a.anime_name_jp,
            a.anime_name_alt,
          ].some((n) => n && cleanString(n).includes(q)),
        )
        .slice(0, 10);
    if (activeTab === "franchise")
      return allFranchises
        .filter((f) =>
          [
            f.franchise_name_en,
            f.franchise_name_cn,
            f.franchise_name_roman,
            f.franchise_name_jp,
            f.franchise_name_alt,
          ].some((n) => n && cleanString(n).includes(q)),
        )
        .slice(0, 10);
    if (activeTab === "series")
      return allSeries
        .filter((s) =>
          [s.series_name_en, s.series_name_cn, s.series_name_alt].some(
            (n) => n && cleanString(n).includes(q),
          ),
        )
        .slice(0, 10);
    if (activeTab === "anime-movie")
      return allAnimeMovies
        .filter((m) =>
          [
            m.anime_movie_name_en,
            m.anime_movie_name_cn,
            m.anime_movie_name_roman,
            m.anime_movie_name_jp,
            m.anime_movie_name_alt,
          ].some((n) => n && cleanString(n).includes(q)),
        )
        .slice(0, 10);
    if (activeTab === "movie")
      return allMovies
        .filter((m) =>
          [m.movie_name_en, m.movie_name_cn, m.movie_name_alt].some(
            (n) => n && cleanString(n).includes(q),
          ),
        )
        .slice(0, 10);
    if (activeTab === "tv-show")
      return allTvShows
        .filter((t) =>
          [t.tv_name_cn, t.tv_name_en, t.tv_name_alt].some(
            (n) => n && cleanString(n).includes(q),
          ),
        )
        .slice(0, 10);
    if (activeTab === "cartoon")
      return allCartoons
        .filter((c) =>
          [c.cartoon_name_cn, c.cartoon_name_en, c.cartoon_name_alt].some(
            (n) => n && cleanString(n).includes(q),
          ),
        )
        .slice(0, 10);
    if (activeTab === "manga")
      return allMangas
        .filter((m) =>
          [
            m.manga_name_cn,
            m.manga_name_en,
            m.manga_name_roman,
            m.manga_name_jp,
            m.manga_name_alt,
          ].some((n) => n && cleanString(n).includes(q)),
        )
        .slice(0, 10);
    if (activeTab === "novel")
      return allNovels
        .filter((n) =>
          [
            n.novel_name_cn,
            n.novel_name_en,
            n.novel_name_roman,
            n.novel_name_jp,
            n.novel_name_alt,
          ].some((name) => name && cleanString(name).includes(q)),
        )
        .slice(0, 10);
    return allOptions
      .filter(
        (o) =>
          cleanString(o.option_value).includes(q) ||
          cleanString(o.category).includes(q),
      )
      .slice(0, 10);
  })();

  const recentItems = (() => {
    const sort = (a, b) =>
      new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    if (activeTab === "anime") return [...allAnime].sort(sort).slice(0, 12);
    if (activeTab === "franchise")
      return [...allFranchises].sort(sort).slice(0, 12);
    if (activeTab === "series") return [...allSeries].sort(sort).slice(0, 12);
    if (activeTab === "anime-movie")
      return [...allAnimeMovies].sort(sort).slice(0, 12);
    if (activeTab === "movie") return [...allMovies].sort(sort).slice(0, 12);
    if (activeTab === "tv-show") return [...allTvShows].sort(sort).slice(0, 12);
    if (activeTab === "cartoon")
      return [...allCartoons].sort(sort).slice(0, 12);
    if (activeTab === "manga") return [...allMangas].sort(sort).slice(0, 12);
    if (activeTab === "novel") return [...allNovels].sort(sort).slice(0, 12);
    return [];
  })();

  const optionCategories = [
    ...new Set(allOptions.map((o) => o.category)),
  ].sort();
  const filteredOptions = optCatFilter
    ? allOptions.filter((o) => o.category === optCatFilter)
    : [];

  const animeRibbonSection = (() => {
    const animeRibbon =
      editingType === "anime" && af.franchise_id
        ? allAnime.filter(
            (a) =>
              a.franchise_id === af.franchise_id &&
              a.system_id !== editingItem?.system_id,
          )
        : [];
    if (!animeRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const a of animeRibbon) {
      if (a.series_id) {
        (bySeries[a.series_id] = bySeries[a.series_id] || []).push(a);
      } else noSeries.push(a);
    }
    const sortByEn = (x, y) =>
      (
        x.anime_name_en ||
        x.anime_name_cn ||
        x.anime_name_roman ||
        ""
      ).localeCompare(
        y.anime_name_en || y.anime_name_cn || y.anime_name_roman || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByEn));
    noSeries.sort(sortByEn);
    const renderChip = (a) => (
      <button
        key={a.system_id}
        type="button"
        onClick={() => openEditor(a, "anime")}
        className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {a.airing_type && (
          <span className="text-[9px] font-black text-gray-400 shrink-0">
            {a.airing_type}
          </span>
        )}
        {a.anime_name_cn || a.anime_name_en || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const movieRibbonSection = (() => {
    const EXCLUDED_MOVIE_FRANCHISE_NAMES = [
      "獨立電影",
      "影集",
      "Disney",
      "Marvel",
    ];
    if (editingType !== "movie" || !mmf.franchise_id) return null;
    const franchise = allFranchises.find(
      (f) => f.system_id === mmf.franchise_id,
    );
    if (!franchise) return null;
    const names = [
      franchise.franchise_name_cn,
      franchise.franchise_name_en,
      franchise.franchise_name_alt,
    ].filter(Boolean);
    if (names.some((n) => EXCLUDED_MOVIE_FRANCHISE_NAMES.includes(n)))
      return null;
    const movieRibbon = allMovies.filter(
      (m) =>
        m.franchise_id === mmf.franchise_id &&
        m.system_id !== editingItem?.system_id,
    );
    if (!movieRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const m of movieRibbon) {
      if (m.series_id) {
        (bySeries[m.series_id] = bySeries[m.series_id] || []).push(m);
      } else noSeries.push(m);
    }
    const sortByEn = (x, y) =>
      (
        x.movie_name_en ||
        x.movie_name_cn ||
        x.movie_name_alt ||
        ""
      ).localeCompare(
        y.movie_name_en || y.movie_name_cn || y.movie_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByEn));
    noSeries.sort(sortByEn);
    const renderChip = (m) => (
      <button
        key={m.system_id}
        type="button"
        onClick={() => openEditor(m, "movie")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {m.movie_name_cn || m.movie_name_en || m.movie_name_alt || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const franchiseItems = allFranchises.map((f) => ({
    id: f.system_id,
    label: getDisplayName(f, "franchise"),
    searchText: [
      f.franchise_name_cn,
      f.franchise_name_en,
      f.franchise_name_jp,
      f.franchise_name_roman,
      f.franchise_name_alt,
    ]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForAnime = (
    af.franchise_id
      ? allSeries.filter((s) => s.franchise_id === af.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForMovie = (
    mmf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === mmf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForTvShow = (
    tvmf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === tvmf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForCartoon = (
    cmf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cmf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForManga = (
    cmgf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cmgf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForNovel = (
    cnvf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cnvf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const tvRibbonSection = (() => {
    const tvRibbon =
      editingType === "tv-show" && tvmf.franchise_id
        ? allTvShows.filter(
            (t) =>
              t.franchise_id === tvmf.franchise_id &&
              t.system_id !== editingItem?.system_id,
          )
        : [];
    if (!tvRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const t of tvRibbon) {
      if (t.series_id) {
        (bySeries[t.series_id] = bySeries[t.series_id] || []).push(t);
      } else noSeries.push(t);
    }
    const sortByEn = (x, y) =>
      (x.tv_name_en || x.tv_name_cn || x.tv_name_alt || "").localeCompare(
        y.tv_name_en || y.tv_name_cn || y.tv_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByEn));
    noSeries.sort(sortByEn);
    const renderChip = (t) => (
      <button
        key={t.system_id}
        type="button"
        onClick={() => openEditor(t, "tv-show")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {t.tv_name_cn || t.tv_name_en || t.tv_name_alt || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const cartoonRibbonSection = (() => {
    const cartoonRibbon = cmf.franchise_id
      ? allCartoons.filter(
          (c) =>
            c.franchise_id === cmf.franchise_id &&
            c.system_id !== editingItem?.system_id,
        )
      : [];
    if (!cartoonRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const c of cartoonRibbon) {
      if (c.series_id) {
        (bySeries[c.series_id] = bySeries[c.series_id] || []).push(c);
      } else noSeries.push(c);
    }
    const sortByEn = (x, y) =>
      (
        x.cartoon_name_en ||
        x.cartoon_name_cn ||
        x.cartoon_name_alt ||
        ""
      ).localeCompare(
        y.cartoon_name_en || y.cartoon_name_cn || y.cartoon_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByEn));
    noSeries.sort(sortByEn);
    const renderChip = (c) => (
      <button
        key={c.system_id}
        type="button"
        onClick={() => openEditor(c, "cartoon")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {c.cartoon_name_cn ||
          c.cartoon_name_en ||
          c.cartoon_name_alt ||
          "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const mangaRibbonSection = (() => {
    const mangaRibbon = cmgf.franchise_id
      ? allMangas.filter(
          (m) =>
            m.franchise_id === cmgf.franchise_id &&
            m.system_id !== editingItem?.system_id,
        )
      : [];
    if (!mangaRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const m of mangaRibbon) {
      if (m.series_id) {
        (bySeries[m.series_id] = bySeries[m.series_id] || []).push(m);
      } else noSeries.push(m);
    }
    const sortByName = (x, y) =>
      (
        x.manga_name_cn ||
        x.manga_name_en ||
        x.manga_name_alt ||
        ""
      ).localeCompare(
        y.manga_name_cn || y.manga_name_en || y.manga_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByName));
    noSeries.sort(sortByName);
    const renderChip = (m) => (
      <button
        key={m.system_id}
        type="button"
        onClick={() => openEditor(m, "manga")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {m.manga_name_cn || m.manga_name_en || m.manga_name_alt || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const novelRibbonSection = (() => {
    const novelRibbon = cnvf.franchise_id
      ? allNovels.filter(
          (n) =>
            n.franchise_id === cnvf.franchise_id &&
            n.system_id !== editingItem?.system_id,
        )
      : [];
    if (!novelRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const n of novelRibbon) {
      if (n.series_id) {
        (bySeries[n.series_id] = bySeries[n.series_id] || []).push(n);
      } else noSeries.push(n);
    }
    const sortByName = (x, y) =>
      (
        x.novel_name_cn ||
        x.novel_name_en ||
        x.novel_name_alt ||
        ""
      ).localeCompare(
        y.novel_name_cn || y.novel_name_en || y.novel_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByName));
    noSeries.sort(sortByName);
    const renderChip = (n) => (
      <button
        key={n.system_id}
        type="button"
        onClick={() => openEditor(n, "novel")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {n.novel_name_cn || n.novel_name_en || n.novel_name_alt || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })();

  const tabDefs = [
    { key: "anime", icon: "fa-tv", label: "Modify Anime Entry" },
    { key: "anime-movie", icon: "fa-film", label: "Modify Anime Movie" },
    { key: "movie", icon: "fa-ticket-alt", label: "Modify Movie" },
    { key: "tv-show", icon: "fa-video", label: "Modify TV Show" },
    { key: "cartoon", icon: "fa-paint-brush", label: "Modify Cartoon" },
    { key: "manga", icon: "fa-book", label: "Modify Manga" },
    { key: "novel", icon: "fa-book-open", label: "Modify Novel" },
    { key: "franchise", icon: "fa-sitemap", label: "Modify Franchise" },
    { key: "series", icon: "fa-layer-group", label: "Modify Series" },
    { key: "options", icon: "fa-cog", label: "Modify System Option" },
  ];

  if (dataLoading)
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
          <i className="fas fa-edit text-brand"></i> Modify Database
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Search for an entry to edit its fields.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              if (!editorOpen) setSearchQuery("");
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${activeTab === t.key ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ DISCOVERY VIEW ═══ */}
      {!editorOpen && (
        <div className="space-y-6">
          {activeTab !== "options" ? (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-3.5 text-gray-400"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Type a title to search..."
                  autoComplete="off"
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white shadow-sm"
                />
              </div>
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((item) => {
                    const sub =
                      activeTab === "anime" || activeTab === "anime-movie"
                        ? allFranchises.find(
                            (f) => f.system_id === item.franchise_id,
                          )?.franchise_name_cn || "Standalone"
                        : activeTab === "series"
                          ? allFranchises.find(
                              (f) => f.system_id === item.franchise_id,
                            )?.franchise_name_cn || ""
                          : "";
                    return (
                      <button
                        key={item.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          openEditor(item, activeTab);
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-brand/10 border-b border-gray-50 last:border-0 transition"
                      >
                        <div className="text-sm font-bold text-gray-800">
                          {getItemLabel(item, activeTab)}
                        </div>
                        {sub && (
                          <div className="text-xs text-gray-400">{sub}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Select Category
              </label>
              <select
                className={selectCls}
                value={optCatFilter}
                onChange={(e) => setOptCatFilter(e.target.value)}
              >
                <option value="">— Choose a category —</option>
                {optionCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === "options" && optCatFilter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredOptions.map((opt) => (
                <button
                  key={opt.system_id}
                  onClick={() => openEditor(opt, "options")}
                  className="text-left px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-brand hover:text-brand hover:bg-brand/5 transition shadow-sm"
                >
                  {opt.option_value}
                </button>
              ))}
            </div>
          )}

          {activeTab !== "options" && (
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                <i className="fas fa-clock mr-1"></i> Recently Modified
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentItems.map((item) => {
                  const sub =
                    activeTab === "anime" || activeTab === "anime-movie"
                      ? allFranchises.find(
                          (f) => f.system_id === item.franchise_id,
                        )?.franchise_name_cn || "Standalone"
                      : activeTab === "series"
                        ? allFranchises.find(
                            (f) => f.system_id === item.franchise_id,
                          )?.franchise_name_cn || ""
                        : "";
                  const badge =
                    activeTab === "anime"
                      ? item.airing_type
                      : activeTab === "franchise"
                        ? item.franchise_type
                        : activeTab === "anime-movie"
                          ? item.airing_status
                          : "";
                  return (
                    <button
                      key={item.system_id}
                      onClick={() => openEditor(item, activeTab)}
                      className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-brand hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm"
                    >
                      {badge && (
                        <span className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 mb-1.5">
                          {badge}
                        </span>
                      )}
                      <div className="text-sm font-bold text-gray-800 line-clamp-1">
                        {getItemLabel(item, activeTab)}
                      </div>
                      {sub && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">
                          {sub}
                        </div>
                      )}
                      <div className="text-[9px] text-gray-300 mt-2 font-mono">
                        {item.updated_at
                          ? new Date(item.updated_at).toLocaleDateString()
                          : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ EDITOR VIEW ═══ */}
      {editorOpen && editingItem && (
        <form onSubmit={handleSave}>
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={closeEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition shrink-0"
            >
              <i className="fas fa-arrow-left text-xs"></i> Back
            </button>
            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded truncate">
              {editingItem.system_id}
            </span>
          </div>

          {/* Anime ribbon — grouped by series */}
          {editingType === "anime" && animeRibbonSection}

          {/* Movie ribbon — grouped by series */}
          {editingType === "movie" && movieRibbonSection}

          {/* TV Show ribbon — grouped by series */}
          {editingType === "tv-show" && tvRibbonSection}

          {/* Cartoon ribbon — grouped by series */}
          {editingType === "cartoon" && cartoonRibbonSection}

          {/* Novel ribbon — grouped by series */}
          {editingType === "novel" && novelRibbonSection}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            <h2 className="text-lg font-black text-gray-900">
              {getItemLabel(editingItem, editingType)}
            </h2>
            <p className="text-xs text-brand font-bold">
              {editingType.toUpperCase()}
            </p>

            {/* ── ANIME EDITOR ── */}
            {editingType === "anime" && (
              <AnimeModifyTab
                af={af}
                ua={ua}
                franchiseItems={franchiseItems}
                seriesItemsForAnime={seriesItemsForAnime}
                allOptions={allOptions}
                editingItem={editingItem}
              />
            )}

            {/* ── FRANCHISE EDITOR ── */}
            {editingType === "franchise" && (
              <FranchiseModifyTab
                ff={ff}
                uf={uf}
                allAnime={allAnime}
                allAnimeMovies={allAnimeMovies}
                allMovies={allMovies}
                allTvShows={allTvShows}
                allCartoons={allCartoons}
                allMangas={allMangas}
                allNovels={allNovels}
                editingItem={editingItem}
              />
            )}

            {/* ── SERIES EDITOR ── */}
            {editingType === "series" && (
              <SeriesModifyTab
                sf={sf}
                us={us}
                franchiseItems={franchiseItems}
              />
            )}

            {/* ── ANIME MOVIE EDITOR ── */}
            {editingType === "anime-movie" && (
              <AnimeMovieModifyTab
                amf={amf}
                uam={uam}
                franchiseItems={franchiseItems}
                allOptions={allOptions}
                editingItem={editingItem}
              />
            )}

            {/* ── MOVIE EDITOR ── */}
            {editingType === "movie" && (
              <MovieModifyTab
                mmf={mmf}
                umm={umm}
                allFranchises={allFranchises}
                seriesItemsForMovie={seriesItemsForMovie}
                editingItem={editingItem}
              />
            )}

            {/* ── TV SHOW EDITOR ── */}
            {editingType === "tv-show" && (
              <TvShowModifyTab
                tvmf={tvmf}
                utv={utv}
                allFranchises={allFranchises}
                seriesItemsForTvShow={seriesItemsForTvShow}
                editingItem={editingItem}
              />
            )}

            {/* ── CARTOON EDITOR ── */}
            {editingType === "cartoon" && (
              <CartoonModifyTab
                cmf={cmf}
                uc={uc}
                allFranchises={allFranchises}
                seriesItemsForCartoon={seriesItemsForCartoon}
                editingItem={editingItem}
              />
            )}

            {/* ── MANGA EDITOR ── */}
            {editingType === "manga" && (
              <MangaModifyTab
                cmgf={cmgf}
                umg={umg}
                allFranchises={allFranchises}
                seriesItemsForManga={seriesItemsForManga}
                editingItem={editingItem}
                ribbonSection={mangaRibbonSection}
                allOptions={allOptions}
              />
            )}

            {/* ── NOVEL EDITOR ── */}
            {editingType === "novel" && (
              <NovelModifyTab
                cnvf={cnvf}
                unv={unv}
                allFranchises={allFranchises}
                seriesItemsForNovel={seriesItemsForNovel}
                editingItem={editingItem}
                ribbonSection={novelRibbonSection}
                allOptions={allOptions}
              />
            )}

            {/* ── OPTIONS EDITOR ── */}
            {editingType === "options" && (
              <OptionsModifyTab
                editingItem={editingItem}
                optValue={optValue}
                setOptValue={setOptValue}
              />
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
            >
              {submitting ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-save"></i>
              )}
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* ── FRANCHISE CREATE MODAL ── */}
      {franchiseCreateModal && (
        <FranchiseCreateModal
          onConfirm={franchiseCreateModal.onConfirm}
          onCancel={franchiseCreateModal.onCancel}
          franchiseType={franchiseCreateModal.franchiseType}
        />
      )}

      {/* ── CREATE NEW PARENT MODAL ── */}
      {createModal && (
        <CreateNewEntityModal
          entityType={createModal.entityType}
          text={createModal.text}
          onConfirm={createModal.onConfirm}
          onCancel={createModal.onCancel}
        />
      )}
    </div>
  );
}
