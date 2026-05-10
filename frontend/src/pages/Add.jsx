import { useState, useEffect, useRef } from "react";
import { useToast } from "../hooks/useToast";
import {
  getDisplayName,
  cleanString,
  getOptions,
  buildAnimePayload,
  buildAnimeMoviePayload,
  parseTypes,
} from "../utils/anime";
import ComboBox from "../components/ComboBox";
import MultiSelect from "../components/MultiSelect";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../components/FormField";
import FranchiseCreateModal from "../components/FranchiseCreateModal";
import CreateNewEntityModal from "../components/CreateNewEntityModal";

const defaultAnime = () => ({
  anime_name_en: "",
  anime_name_cn: "",
  anime_name_roman: "",
  anime_name_jp: "",
  anime_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  season_num: "",
  part_num: "",
  airing_type: "",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  is_main: "本傳",
  ep_previous: "",
  ep_total: "",
  ep_fin: "",
  ep_special: "",
  my_rating: "",
  mal_rating: "",
  mal_rank: "",
  anilist_rating: "",
  release_season: "",
  release_month: "",
  release_year: "",
  genre_main: "",
  genre_sub: "",
  studio: "",
  director: "",
  producer: "",
  music: "",
  distributor_tw: "",
  prequel_id: null,
  sequel_id: null,
  alternative: "",
  is_main_entry: false,
  watch_order: "",
  derive_related: "",
  mal_id: "",
  mal_link: "",
  anilist_link: "",
  official_link: "",
  twitter_link: "",
  source_baha: "",
  baha_link: "",
  source_netflix: "",
  source_other: [],
  op: "",
  ed: "",
  insert_ost: "",
  seiyuu: "",
  cover_image_file: "",
  remark: "",
});

const defaultFranchise = () => ({
  franchise_name_en: "",
  franchise_name_cn: "",
  franchise_name_roman: "",
  franchise_name_jp: "",
  franchise_name_alt: "",
  franchise_type: "",
  my_rating: "",
  franchise_expectation: "",
  favorite_3x3_slot: "",
  remark: "",
});

const defaultSeries = () => ({
  franchise_id: null,
  franchise_text: "",
  series_name_en: "",
  series_name_cn: "",
  series_name_alt: "",
  remark: "",
});

const defaultMovie = () => ({
  movie_name_en: "",
  movie_name_cn: "",
  movie_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  my_rating: "",
  movie_type: "",
  is_main: "本傳",
  length_min: "",
  release_date_usa: "",
  release_date_tw: "",
  director: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  derive_related: "",
  imdb_id: "",
  imdb_link: "",
  source_other: [],
  watch_next: false,
  to_rewatch: false,
  cover_image_file: "",
  remark: "",
});

const defaultTvShow = () => ({
  tv_name_en: "",
  tv_name_cn: "",
  tv_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  season_part: "",
  region: "",
  source_official: "",
  is_main: "本傳",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  ep_total: "",
  ep_fin: "",
  my_rating: "",
  imdb_rating: "",
  release_date: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  derive_related: "",
  imdb_id: "",
  imdb_link: "",
  source_other: [],
  watch_next: false,
  to_rewatch: false,
  cover_image_file: "",
  remark: "",
});

const defaultAnimeMovie = () => ({
  anime_movie_name_en: "",
  anime_movie_name_cn: "",
  anime_movie_name_roman: "",
  anime_movie_name_jp: "",
  anime_movie_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  my_rating: "",
  mal_rating: "",
  mal_rank: "",
  anilist_rating: "",
  release_date_jp: "",
  release_date_tw: "",
  length_min: "",
  studio: "",
  director: "",
  mal_id: "",
  mal_link: "",
  anilist_link: "",
  official_link: "",
  twitter_link: "",
  source_baha: "",
  baha_link: "",
  source_netflix: "",
  source_other: [],
  watch_next: false,
  to_rewatch: false,
  cover_image_file: "",
  remark: "",
});

const defaultCartoon = () => ({
  cartoon_name_en: "",
  cartoon_name_cn: "",
  cartoon_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  season_part: "",
  airing_type: "TV",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  is_main: "本傳",
  ep_total: "",
  ep_fin: "",
  my_rating: "",
  imdb_rating: "",
  length_ep_min: "",
  source_official: "",
  release_date: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  derive_related: "",
  imdb_id: "",
  imdb_link: "",
  source_other: [],
  watch_next: false,
  to_rewatch: false,
  cover_image_file: "",
  remark: "",
});

const defaultManga = () => ({
  manga_name_cn: "",
  manga_name_en: "",
  manga_name_roman: "",
  manga_name_jp: "",
  manga_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  region: "",
  serialization_status: "",
  reading_status: "Might Read",
  is_main: "本傳",
  vol_total: "",
  vol_fin: "",
  vol_fin_page: "",
  ch_total: "",
  ch_fin: "",
  my_rating: "",
  mal_rating: "",
  mal_rank: "",
  anilist_rating: "",
  author_plot: "",
  author_draw: "",
  release_year: "",
  end_year: "",
  anime_studio: "",
  serialization_platform: "",
  distributor_tw: "",
  derive_related: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  mal_id: "",
  mal_link: "",
  anilist_link: "",
  source_other: [],
  read_next: false,
  to_reread: false,
  cover_image_file: "",
  remark: "",
});

export default function Add() {
  const { showToast } = useToast();

  const [allAnime, setAllAnime] = useState([]);
  const [allFranchises, setAllFranchises] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  const [allOptions, setAllOptions] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTvShows, setAllTvShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allMangas, setAllMangas] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("anime");
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  // Auto-fill search
  const [fillQuery, setFillQuery] = useState("");
  const [fillOpen, setFillOpen] = useState(false);
  const fillRef = useRef(null);

  // Cartoon auto-fill search
  const [cartoonFillQuery, setCartoonFillQuery] = useState("");
  const [cartoonFillOpen, setCartoonFillOpen] = useState(false);
  const cartoonFillRef = useRef(null);

  // Movie auto-fill search
  const [movieFillQuery, setMovieFillQuery] = useState("");
  const [movieFillOpen, setMovieFillOpen] = useState(false);
  const movieFillRef = useRef(null);

  // TV Show auto-fill search
  const [tvFillQuery, setTvFillQuery] = useState("");
  const [tvFillOpen, setTvFillOpen] = useState(false);
  const tvFillRef = useRef(null);

  // Manga auto-fill search
  const [mangaFillQuery, setMangaFillQuery] = useState("");
  const [mangaFillOpen, setMangaFillOpen] = useState(false);
  const mangaFillRef = useRef(null);

  // Modals (callbacks stored in state)
  const [duplicateModal, setDuplicateModal] = useState(null); // {name, onProceed, onCancel}
  const [createModal, setCreateModal] = useState(null); // {entityType, text, onConfirm, onCancel}
  const [franchiseCreateModal, setFranchiseCreateModal] = useState(null); // {onConfirm, onCancel}

  // Forms
  const [af, setAf] = useState(defaultAnime());
  const [ff, setFf] = useState(defaultFranchise());
  const [sf, setSf] = useState(defaultSeries());
  const [amf, setAmf] = useState(defaultAnimeMovie());
  const [mf, setMf] = useState(defaultMovie());
  const [tvf, setTvf] = useState(defaultTvShow());
  const [cf, setCf] = useState(defaultCartoon());
  const [mgf, setMgf] = useState(defaultManga());
  const [optCategory, setOptCategory] = useState("");
  const [optValues, setOptValues] = useState([""]);

  const ua = (k, v) => setAf((p) => ({ ...p, [k]: v }));
  const uf = (k, v) => setFf((p) => ({ ...p, [k]: v }));
  const us = (k, v) => setSf((p) => ({ ...p, [k]: v }));
  const uam = (k, v) => setAmf((p) => ({ ...p, [k]: v }));
  const umf = (k, v) => setMf((p) => ({ ...p, [k]: v }));
  const utf = (k, v) => setTvf((p) => ({ ...p, [k]: v }));
  const uc = (k, v) => setCf((p) => ({ ...p, [k]: v }));
  const umg = (k, v) => setMgf((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    async function load() {
      try {
        const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, cRes, mgRes] =
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
        ] = await Promise.all([
          aRes.json(),
          fRes.json(),
          sRes.json(),
          oRes.json(),
          amRes.json(),
          mvRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
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
      if (fillRef.current && !fillRef.current.contains(e.target))
        setFillOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (cartoonFillRef.current && !cartoonFillRef.current.contains(e.target))
        setCartoonFillOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (movieFillRef.current && !movieFillRef.current.contains(e.target))
        setMovieFillOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (tvFillRef.current && !tvFillRef.current.contains(e.target))
        setTvFillOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (mangaFillRef.current && !mangaFillRef.current.contains(e.target))
        setMangaFillOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-fill results
  const fillResults = fillQuery
    ? allAnime
        .filter((a) =>
          [
            a.anime_name_en,
            a.anime_name_cn,
            a.anime_name_roman,
            a.anime_name_jp,
            a.anime_name_alt,
          ].some((n) => n && cleanString(n).includes(cleanString(fillQuery))),
        )
        .slice(0, 10)
    : [];

  const cartoonFillResults = cartoonFillQuery
    ? allCartoons
        .filter((c) =>
          [c.cartoon_name_en, c.cartoon_name_cn, c.cartoon_name_alt].some(
            (n) => n && cleanString(n).includes(cleanString(cartoonFillQuery)),
          ),
        )
        .slice(0, 10)
    : [];

  const mangaFillResults = mangaFillQuery
    ? allMangas
        .filter((m) =>
          [
            m.manga_name_cn,
            m.manga_name_en,
            m.manga_name_roman,
            m.manga_name_jp,
            m.manga_name_alt,
          ].some(
            (n) => n && cleanString(n).includes(cleanString(mangaFillQuery)),
          ),
        )
        .slice(0, 10)
    : [];

  const movieFillResults = movieFillQuery
    ? allMovies
        .filter((m) =>
          [m.movie_name_en, m.movie_name_cn, m.movie_name_alt].some(
            (n) => n && cleanString(n).includes(cleanString(movieFillQuery)),
          ),
        )
        .slice(0, 10)
    : [];

  const tvFillResults = tvFillQuery
    ? allTvShows
        .filter((t) =>
          [t.tv_name_en, t.tv_name_cn, t.tv_name_alt].some(
            (n) => n && cleanString(n).includes(cleanString(tvFillQuery)),
          ),
        )
        .slice(0, 10)
    : [];

  function applyCartoonAutofill(cartoon) {
    const f = allFranchises.find((x) => x.system_id === cartoon.franchise_id);
    const s = allSeries.find((x) => x.system_id === cartoon.series_id);
    setCf((p) => ({
      ...p,
      cartoon_name_en: cartoon.cartoon_name_en || "",
      cartoon_name_cn: cartoon.cartoon_name_cn || "",
      cartoon_name_alt: cartoon.cartoon_name_alt || "",
      franchise_id: cartoon.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: cartoon.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      airing_type: cartoon.airing_type || "",
      is_main: cartoon.is_main || "",
      source_official: cartoon.source_official || "",
      season_part: cartoon.season_part || "",
      derive_related:
        cartoon.derive_related === true
          ? "true"
          : cartoon.derive_related === false
            ? "false"
            : "",
      imdb_link: cartoon.imdb_link || "",
    }));
    setCartoonFillQuery("");
    setCartoonFillOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  }

  function applyMangaAutofill(manga) {
    const f = allFranchises.find((x) => x.system_id === manga.franchise_id);
    const s = allSeries.find((x) => x.system_id === manga.series_id);
    setMgf((p) => ({
      ...p,
      manga_name_cn: manga.manga_name_cn || "",
      manga_name_en: manga.manga_name_en || "",
      manga_name_roman: manga.manga_name_roman || "",
      manga_name_jp: manga.manga_name_jp || "",
      manga_name_alt: manga.manga_name_alt || "",
      franchise_id: manga.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: manga.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      region: manga.region || "",
      is_main: manga.is_main || "",
    }));
    setMangaFillQuery("");
    setMangaFillOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  }

  function applyMovieAutofill(movie) {
    const f = allFranchises.find((x) => x.system_id === movie.franchise_id);
    const s = allSeries.find((x) => x.system_id === movie.series_id);
    setMf((p) => ({
      ...p,
      movie_name_en: movie.movie_name_en || "",
      movie_name_cn: movie.movie_name_cn || "",
      movie_name_alt: movie.movie_name_alt || "",
      franchise_id: movie.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: movie.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      is_main: movie.is_main || "",
      movie_type: movie.movie_type || "",
      director: movie.director || "",
    }));
    setMovieFillQuery("");
    setMovieFillOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  }

  function applyTvShowAutofill(tvShow) {
    const f = allFranchises.find((x) => x.system_id === tvShow.franchise_id);
    const s = allSeries.find((x) => x.system_id === tvShow.series_id);
    setTvf((p) => ({
      ...p,
      tv_name_en: tvShow.tv_name_en || "",
      tv_name_cn: tvShow.tv_name_cn || "",
      tv_name_alt: tvShow.tv_name_alt || "",
      franchise_id: tvShow.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: tvShow.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      is_main: tvShow.is_main || "",
      region: tvShow.region || "",
    }));
    setTvFillQuery("");
    setTvFillOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  }

  function applyAutofill(anime) {
    const f = allFranchises.find((x) => x.system_id === anime.franchise_id);
    const s = allSeries.find((x) => x.system_id === anime.series_id);
    setAf((p) => ({
      ...p,
      anime_name_en: anime.anime_name_en || "",
      anime_name_cn: anime.anime_name_cn || "",
      anime_name_roman: anime.anime_name_roman || "",
      anime_name_jp: anime.anime_name_jp || "",
      anime_name_alt: anime.anime_name_alt || "",
      franchise_id: anime.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: anime.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      airing_type: anime.airing_type || "",
      is_main: anime.is_main || "",
      genre_main: anime.genre_main || "",
      genre_sub: anime.genre_sub || "",
      studio: anime.studio || "",
    }));
    setFillQuery("");
    setFillOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (activeTab === "anime") await submitAnime();
      else if (activeTab === "franchise") await submitFranchise();
      else if (activeTab === "series") await submitSeries();
      else if (activeTab === "anime-movie") await submitAnimeMovie();
      else if (activeTab === "movie") await submitMovie();
      else if (activeTab === "tv-show") await submitTvShow();
      else if (activeTab === "cartoon") await submitCartoon();
      else if (activeTab === "manga") await submitManga();
      else if (activeTab === "options") await submitOptions();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnime() {
    if (!af.anime_name_en && !af.anime_name_cn && !af.anime_name_roman) {
      showToast("warning", "At least one Anime Name must be provided.");
      return;
    }
    if (!af.franchise_id && !af.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    // Validate episode count
    const epTotal = af.ep_total !== "" ? parseInt(af.ep_total) : null;
    const epFin = af.ep_fin !== "" ? parseInt(af.ep_fin) : null;
    if (epTotal !== null && epFin !== null && epFin > epTotal) {
      showToast(
        "error",
        `EP Finished (${epFin}) cannot exceed EP Total (${epTotal}).`,
      );
      return;
    }

    // Duplicate check
    const checkName = af.anime_name_en || af.anime_name_cn || "";
    const isDup = allAnime.some(
      (a) =>
        cleanString(a.anime_name_en || "") === cleanString(checkName) ||
        cleanString(a.anime_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    // Create franchise if not selected
    let franchiseId = af.franchise_id;
    if (!franchiseId) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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

    // Create series if text provided but not selected
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

    // Create anime entry
    const payload = buildAnimePayload(af, { franchiseId, seriesId });
    const res = await fetch("/api/anime/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();

    // Replace (enrich from MAL)
    await fetch(`/api/data-control/replace/anime/${created.system_id}`, {
      method: "POST",
      credentials: "include",
    });

    window.scrollTo(0, 0);
    showToast("success", "Entry appended and enriched successfully.");
    setLastAdded(created.anime_name_en || created.anime_name_cn || "New Entry");
    setAf(defaultAnime());
    setAllAnime((prev) => [...prev, created]);
  }

  async function submitFranchise() {
    if (
      !ff.franchise_name_en &&
      !ff.franchise_name_cn &&
      !ff.franchise_name_roman &&
      !ff.franchise_name_jp &&
      !ff.franchise_name_alt
    ) {
      showToast("warning", "At least one Franchise Name must be provided.");
      return;
    }
    const res = await fetch("/api/franchise/", {
      method: "POST",
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
        favorite_3x3_slot: ff.favorite_3x3_slot
          ? parseInt(ff.favorite_3x3_slot)
          : null,
        remark: ff.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Franchise appended successfully.");
      setLastAdded(
        created.franchise_name_cn ||
          created.franchise_name_en ||
          "New Franchise",
      );
      setFf(defaultFranchise());
      setAllFranchises((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create franchise");
    }
  }

  async function submitSeries() {
    if (!sf.series_name_en && !sf.series_name_cn && !sf.series_name_alt) {
      showToast("warning", "At least one Series Name must be provided.");
      return;
    }
    if (!sf.franchise_id) {
      showToast("warning", "An existing Franchise must be selected.");
      return;
    }

    const res = await fetch("/api/series/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: sf.franchise_id,
        series_name_en: sf.series_name_en || null,
        series_name_cn: sf.series_name_cn || null,
        series_name_alt: sf.series_name_alt || null,
        remark: sf.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Series appended successfully.");
      setLastAdded(
        created.series_name_cn || created.series_name_en || "New Series",
      );
      setSf(defaultSeries());
      setAllSeries((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create series");
    }
  }

  async function submitOptions() {
    if (!optCategory.trim()) {
      showToast("warning", "Category is required.");
      return;
    }
    const vals = optValues.filter((v) => v.trim());
    if (vals.length === 0) {
      showToast("warning", "At least one option value is required.");
      return;
    }

    const results = await Promise.allSettled(
      vals.map((val) =>
        fetch("/api/options/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: optCategory.trim(),
            option_value: val.trim(),
          }),
          credentials: "include",
        }),
      ),
    );
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    const failed = vals.length - succeeded;
    if (succeeded > 0) {
      showToast("success", `Successfully appended ${succeeded} option(s).`);
      setLastAdded(`${succeeded} option(s) in "${optCategory}"`);
      if (failed === 0) {
        setOptCategory("");
        setOptValues([""]);
      }
      const oRes = await fetch("/api/options/", { credentials: "include" });
      if (oRes.ok) setAllOptions(await oRes.json());
    }
    if (failed > 0) showToast("warning", `${failed} option(s) failed to save.`);
  }

  async function submitAnimeMovie() {
    if (
      !amf.anime_movie_name_en &&
      !amf.anime_movie_name_cn &&
      !amf.anime_movie_name_roman
    ) {
      showToast("warning", "At least one Anime Movie Name must be provided.");
      return;
    }
    if (!amf.franchise_id && !amf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    const checkName = amf.anime_movie_name_en || amf.anime_movie_name_cn || "";
    const isDup = allAnimeMovies.some(
      (m) =>
        cleanString(m.anime_movie_name_en || "") === cleanString(checkName) ||
        cleanString(m.anime_movie_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = amf.franchise_id;
    if (!franchiseId) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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

    const res = await fetch("/api/anime-movie/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAnimeMoviePayload(amf, { franchiseId })),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();

    await fetch(`/api/data-control/replace/anime-movie/${created.system_id}`, {
      method: "POST",
      credentials: "include",
    });

    window.scrollTo(0, 0);
    showToast("success", "Anime movie appended and enriched successfully.");
    setLastAdded(
      created.anime_movie_name_en ||
        created.anime_movie_name_cn ||
        "New Anime Movie",
    );
    setAmf(defaultAnimeMovie());
    setAllAnimeMovies((prev) => [...prev, created]);
  }

  async function submitMovie() {
    if (!mf.movie_name_en && !mf.movie_name_cn && !mf.movie_name_alt) {
      showToast("warning", "At least one Movie Name must be provided.");
      return;
    }

    const checkName = mf.movie_name_en || mf.movie_name_cn || "";
    const isDup = allMovies.some(
      (m) =>
        cleanString(m.movie_name_en || "") === cleanString(checkName) ||
        cleanString(m.movie_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = mf.franchise_id;
    if (!franchiseId && mf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "TV or Movie",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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
          franchise_name_en: mf.movie_name_en || null,
          franchise_name_cn: mf.movie_name_cn || null,
          franchise_name_alt: mf.movie_name_alt || null,
          franchise_type: "TV or Movie",
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

    let seriesId = mf.series_id;
    if (!seriesId && mf.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: mf.series_text,
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
          series_name_en: mf.movie_name_en || null,
          series_name_cn: mf.movie_name_cn || null,
          series_name_alt: mf.movie_name_alt || null,
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
      movie_name_en: mf.movie_name_en || null,
      movie_name_cn: mf.movie_name_cn || null,
      movie_name_alt: mf.movie_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      is_main: mf.is_main || null,
      airing_status: mf.airing_status || null,
      watching_status: mf.watching_status || "Might Watch",
      my_rating: mf.my_rating || null,
      movie_type: mf.movie_type || null,
      length_min: mf.length_min !== "" ? parseInt(mf.length_min) : null,
      release_date_usa: mf.release_date_usa || null,
      release_date_tw: mf.release_date_tw || null,
      director: mf.director || null,
      prequel_id: mf.prequel_id || null,
      sequel_id: mf.sequel_id || null,
      watch_order: mf.watch_order !== "" ? parseFloat(mf.watch_order) : null,
      derive_related:
        mf.derive_related === "true"
          ? true
          : mf.derive_related === "false"
            ? false
            : null,
      imdb_id: mf.imdb_id !== "" ? mf.imdb_id : null,
      imdb_link: mf.imdb_link || null,
      source_other:
        mf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              mf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: mf.watch_next ?? null,
      to_rewatch: mf.to_rewatch ?? false,
      cover_image_file: mf.cover_image_file || null,
      remark: mf.remark || null,
    };

    const res = await fetch("/api/movies/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    window.scrollTo(0, 0);
    showToast("success", "Movie appended and enriched successfully.");
    setLastAdded(created.movie_name_en || created.movie_name_cn || "New Movie");
    setMf(defaultMovie());
    setAllMovies((prev) => [...prev, created]);
  }

  async function submitTvShow() {
    if (!tvf.tv_name_en && !tvf.tv_name_cn && !tvf.tv_name_alt) {
      showToast("warning", "At least one TV Show Name must be provided.");
      return;
    }

    const checkName = tvf.tv_name_cn || tvf.tv_name_en || "";
    const isDup = allTvShows.some(
      (t) =>
        cleanString(t.tv_name_cn || "") === cleanString(checkName) ||
        cleanString(t.tv_name_en || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = tvf.franchise_id;
    if (!franchiseId && tvf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "TV or Movie",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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
          franchise_name_en: tvf.tv_name_en || null,
          franchise_name_cn: tvf.tv_name_cn || null,
          franchise_name_alt: tvf.tv_name_alt || null,
          franchise_type: "TV or Movie",
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

    let seriesId = tvf.series_id;
    if (!seriesId && tvf.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: tvf.series_text,
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
          series_name_en: tvf.tv_name_en || null,
          series_name_cn: tvf.tv_name_cn || null,
          series_name_alt: tvf.tv_name_alt || null,
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
      tv_name_en: tvf.tv_name_en || null,
      tv_name_cn: tvf.tv_name_cn || null,
      tv_name_alt: tvf.tv_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      season_part: tvf.season_part || null,
      region: tvf.region || null,
      source_official: tvf.source_official || null,
      is_main: tvf.is_main || null,
      airing_status: tvf.airing_status || null,
      watching_status: tvf.watching_status || "Might Watch",
      ep_total: tvf.ep_total !== "" ? parseInt(tvf.ep_total) : null,
      ep_fin: tvf.ep_fin !== "" ? parseInt(tvf.ep_fin) : null,
      my_rating: tvf.my_rating || null,
      imdb_rating: tvf.imdb_rating || null,
      release_date: tvf.release_date || null,
      prequel_id: tvf.prequel_id || null,
      sequel_id: tvf.sequel_id || null,
      watch_order: tvf.watch_order !== "" ? parseFloat(tvf.watch_order) : null,
      derive_related:
        tvf.derive_related === "true"
          ? true
          : tvf.derive_related === "false"
            ? false
            : null,
      imdb_id: tvf.imdb_id !== "" ? tvf.imdb_id : null,
      imdb_link: tvf.imdb_link || null,
      source_other:
        tvf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              tvf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: tvf.watch_next ?? null,
      to_rewatch: tvf.to_rewatch ?? false,
      cover_image_file: tvf.cover_image_file || null,
      remark: tvf.remark || null,
    };

    const res = await fetch("/api/tv-shows/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    window.scrollTo(0, 0);
    showToast("success", "TV Show appended and enriched successfully.");
    setLastAdded(created.tv_name_cn || created.tv_name_en || "New TV Show");
    setTvf(defaultTvShow());
    setAllTvShows((prev) => [...prev, created]);
  }

  async function submitCartoon() {
    if (!cf.cartoon_name_cn && !cf.cartoon_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!cf.franchise_id && !cf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = cf.franchise_id;
    if (!franchiseId && cf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Cartoon",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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
          franchise_name_en: cf.cartoon_name_en || null,
          franchise_name_cn: cf.cartoon_name_cn || null,
          franchise_name_alt: cf.cartoon_name_alt || null,
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

    let seriesId = cf.series_id;
    if (!seriesId && cf.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: cf.series_text,
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
          series_name_en: cf.cartoon_name_en || null,
          series_name_cn: cf.cartoon_name_cn || null,
          series_name_alt: cf.cartoon_name_alt || null,
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
      cartoon_name_en: cf.cartoon_name_en || null,
      cartoon_name_cn: cf.cartoon_name_cn || null,
      cartoon_name_alt: cf.cartoon_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      season_part: cf.season_part || null,
      airing_type: cf.airing_type || null,
      airing_status: cf.airing_status || null,
      watching_status: cf.watching_status || "Might Watch",
      is_main: cf.is_main || null,
      ep_total: cf.ep_total !== "" ? parseInt(cf.ep_total) : null,
      ep_fin: cf.ep_fin !== "" ? parseInt(cf.ep_fin) : null,
      my_rating: cf.my_rating || null,
      imdb_rating: cf.imdb_rating || null,
      length_ep_min:
        cf.length_ep_min !== "" ? parseInt(cf.length_ep_min) : null,
      source_official: cf.source_official || null,
      release_date: cf.release_date || null,
      prequel_id: cf.prequel_id || null,
      sequel_id: cf.sequel_id || null,
      watch_order: cf.watch_order !== "" ? parseFloat(cf.watch_order) : null,
      derive_related:
        cf.derive_related === "true"
          ? true
          : cf.derive_related === "false"
            ? false
            : null,
      imdb_id: cf.imdb_id !== "" ? cf.imdb_id : null,
      imdb_link: cf.imdb_link || null,
      source_other:
        cf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              cf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      watch_next: cf.watch_next ?? null,
      to_rewatch: cf.to_rewatch ?? false,
      cover_image_file: cf.cover_image_file || null,
      remark: cf.remark || null,
    };

    const res = await fetch("/api/cartoon/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    window.scrollTo(0, 0);
    showToast("success", "Cartoon appended successfully.");
    setLastAdded(
      created.cartoon_name_cn || created.cartoon_name_en || "New Cartoon",
    );
    setCf(defaultCartoon());
    setAllCartoons((prev) => [...prev, created]);
  }

  async function submitManga() {
    if (!mgf.manga_name_cn && !mgf.manga_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!mgf.franchise_id && !mgf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = mgf.franchise_id;
    if (!franchiseId && mgf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "ACG",
          onConfirm: (expectation, remark) => {
            setFranchiseCreateModal(null);
            resolve({ confirmed: true, expectation, remark });
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
          franchise_name_en: mgf.manga_name_en || null,
          franchise_name_cn: mgf.manga_name_cn || null,
          franchise_name_roman: mgf.manga_name_roman || null,
          franchise_name_jp: mgf.manga_name_jp || null,
          franchise_name_alt: mgf.manga_name_alt || null,
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

    let seriesId = mgf.series_id;
    if (!seriesId && mgf.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: mgf.series_text,
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
          series_name_en: mgf.manga_name_en || null,
          series_name_cn: mgf.manga_name_cn || null,
          series_name_alt: mgf.manga_name_alt || null,
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
      manga_name_cn: mgf.manga_name_cn || null,
      manga_name_en: mgf.manga_name_en || null,
      manga_name_roman: mgf.manga_name_roman || null,
      manga_name_jp: mgf.manga_name_jp || null,
      manga_name_alt: mgf.manga_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      region: mgf.region || null,
      serialization_status: mgf.serialization_status || null,
      reading_status: mgf.reading_status || "Might Read",
      is_main: mgf.is_main || null,
      vol_total: mgf.vol_total !== "" ? parseInt(mgf.vol_total) : null,
      vol_fin: mgf.vol_fin !== "" ? parseInt(mgf.vol_fin) : 0,
      vol_fin_page: mgf.vol_fin_page !== "" ? parseInt(mgf.vol_fin_page) : 0,
      ch_total: mgf.ch_total !== "" ? parseInt(mgf.ch_total) : null,
      ch_fin: mgf.ch_fin !== "" ? parseInt(mgf.ch_fin) : 0,
      my_rating: mgf.my_rating || null,
      mal_rating: mgf.mal_rating !== "" ? parseFloat(mgf.mal_rating) : null,
      mal_rank: mgf.mal_rank !== "" ? parseInt(mgf.mal_rank) : null,
      anilist_rating:
        mgf.anilist_rating !== "" ? parseFloat(mgf.anilist_rating) : null,
      author_plot: mgf.author_plot || null,
      author_draw: mgf.author_draw || null,
      release_year: mgf.release_year !== "" ? parseInt(mgf.release_year) : null,
      end_year: mgf.end_year !== "" ? parseInt(mgf.end_year) : null,
      anime_studio: mgf.anime_studio || null,
      serialization_platform: mgf.serialization_platform || null,
      distributor_tw: mgf.distributor_tw || null,
      derive_related:
        mgf.derive_related === "true"
          ? true
          : mgf.derive_related === "false"
            ? false
            : null,
      prequel_id: mgf.prequel_id || null,
      sequel_id: mgf.sequel_id || null,
      watch_order: mgf.watch_order !== "" ? parseFloat(mgf.watch_order) : null,
      mal_id: mgf.mal_id !== "" ? parseInt(mgf.mal_id) : null,
      mal_link: mgf.mal_link || null,
      anilist_link: mgf.anilist_link || null,
      source_other:
        mgf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              mgf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      read_next: mgf.read_next ?? false,
      to_reread: mgf.to_reread ?? false,
      cover_image_file: mgf.cover_image_file || null,
      remark: mgf.remark || null,
    };

    const res = await fetch("/api/manga/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    window.scrollTo(0, 0);
    showToast("success", "Manga appended successfully.");
    setLastAdded(created.manga_name_cn || created.manga_name_en || "New Manga");
    setMgf(defaultManga());
    setAllMangas((prev) => [...prev, created]);
  }

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
  const seriesItems = (
    activeTab === "anime" && af.franchise_id
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
    mf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === mf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForTvShow = (
    tvf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === tvf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForCartoon = (
    cf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForManga = (
    mgf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === mgf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const optionCategories = [
    ...new Set(allOptions.map((o) => o.category)),
  ].sort();

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const tabDefs = [
    { key: "anime", icon: "fa-tv", label: "Add Anime Entry" },
    { key: "anime-movie", icon: "fa-film", label: "Add Anime Movie" },
    { key: "movie", icon: "fa-ticket-alt", label: "Add Movie" },
    { key: "tv-show", icon: "fa-video", label: "Add TV Show" },
    { key: "cartoon", icon: "fa-paint-brush", label: "Add Cartoon" },
    { key: "manga", icon: "fa-book", label: "Add Manga Entry" },
    { key: "franchise", icon: "fa-sitemap", label: "Add Franchise" },
    { key: "series", icon: "fa-layer-group", label: "Add Series" },
    { key: "options", icon: "fa-cog", label: "Add System Option" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
          <i className="fas fa-plus-circle text-brand"></i> Append Database
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Add new entries to the anime database.
        </p>
      </div>

      {/* Last added notification */}
      {lastAdded && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <i className="fas fa-check-circle text-green-500"></i>
          <span className="text-sm font-bold text-green-700">
            Added: {lastAdded}
          </span>
          <button
            onClick={() => setLastAdded(null)}
            className="ml-auto text-green-400 hover:text-green-600"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${activeTab === t.key ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ═══ ANIME TAB ═══ */}
        {activeTab === "anime" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            {/* Auto-fill search */}
            <div ref={fillRef} className="relative mb-4">
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
                <i className="fas fa-magic text-brand text-sm"></i>
                <input
                  type="text"
                  value={fillQuery}
                  onChange={(e) => {
                    setFillQuery(e.target.value);
                    setFillOpen(true);
                  }}
                  onFocus={() => setFillOpen(true)}
                  placeholder="Auto-fill from existing entry — type a name to search..."
                  className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
                  autoComplete="off"
                />
                {fillQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setFillQuery("");
                      setFillOpen(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>
              {fillOpen && fillResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {fillResults.map((a) => {
                    const f = allFranchises.find(
                      (x) => x.system_id === a.franchise_id,
                    );
                    return (
                      <button
                        key={a.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyAutofill(a)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {a.airing_type && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {a.airing_type}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
                            {a.anime_name_cn || a.anime_name_en}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {f ? getDisplayName(f, "franchise") : "Standalone"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <SectionHeader icon="fa-tag" title="Titles & Naming" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Franchise">
                <ComboBox
                  items={franchiseItems}
                  selectedId={af.franchise_id}
                  inputText={af.franchise_text}
                  onSelect={(id, label) =>
                    ua("franchise_id", id) || ua("franchise_text", label)
                  }
                  onType={(text) => {
                    ua("franchise_text", text);
                    ua("franchise_id", null);
                  }}
                  onClear={() => {
                    ua("franchise_id", null);
                    ua("franchise_text", "");
                  }}
                  placeholder="Search or type new franchise..."
                  allowNew
                />
              </Field>
              <Field label="Series">
                <ComboBox
                  items={seriesItems}
                  selectedId={af.series_id}
                  inputText={af.series_text}
                  onSelect={(id, label) => {
                    ua("series_id", id);
                    ua("series_text", label);
                  }}
                  onType={(text) => {
                    ua("series_text", text);
                    ua("series_id", null);
                  }}
                  onClear={() => {
                    ua("series_id", null);
                    ua("series_text", "");
                  }}
                  placeholder="Search or type new series..."
                  allowNew
                />
              </Field>
            </div>
            <Field label="Anime Name EN" required>
              <input
                className={inputCls}
                value={af.anime_name_en}
                onChange={(e) => ua("anime_name_en", e.target.value)}
                placeholder="English title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Anime Name CN">
                <input
                  className={inputCls}
                  value={af.anime_name_cn}
                  onChange={(e) => ua("anime_name_cn", e.target.value)}
                  placeholder="Chinese title"
                />
              </Field>
              <Field label="Anime Name roman">
                <input
                  className={inputCls}
                  value={af.anime_name_roman}
                  onChange={(e) => ua("anime_name_roman", e.target.value)}
                  placeholder="Romanized title"
                />
              </Field>
              <Field label="Anime Name JP">
                <input
                  className={inputCls}
                  value={af.anime_name_jp}
                  onChange={(e) => ua("anime_name_jp", e.target.value)}
                  placeholder="Japanese title"
                />
              </Field>
              <Field label="Anime Name Alt">
                <input
                  className={inputCls}
                  value={af.anime_name_alt}
                  onChange={(e) => ua("anime_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Season">
                <select
                  className={selectCls}
                  value={af.season_num}
                  onChange={(e) => ua("season_num", e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Season {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Part">
                <select
                  className={selectCls}
                  value={af.part_num}
                  onChange={(e) => ua("part_num", e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Part {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Airing Status">
                <select
                  className={selectCls}
                  value={af.airing_status}
                  onChange={(e) => ua("airing_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Watching Status">
                <select
                  className={selectCls}
                  value={af.watching_status}
                  onChange={(e) => ua("watching_status", e.target.value)}
                >
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={af.my_rating}
                  onChange={(e) => ua("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="EP Previous">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={af.ep_previous}
                  onChange={(e) => ua("ep_previous", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="EP Total">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={af.ep_total}
                  onChange={(e) => ua("ep_total", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="EP Finished">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={af.ep_fin}
                  onChange={(e) => ua("ep_fin", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="EP Special">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={af.ep_special}
                  onChange={(e) => ua("ep_special", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="MAL Rating">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={af.mal_rating}
                  onChange={(e) => ua("mal_rating", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="MAL Rank">
                <input
                  className={inputCls}
                  value={af.mal_rank}
                  onChange={(e) => ua("mal_rank", e.target.value)}
                  placeholder="#1234"
                />
              </Field>
              <Field label="AniList Rating">
                <input
                  className={inputCls}
                  value={af.anilist_rating}
                  onChange={(e) => ua("anilist_rating", e.target.value)}
                  placeholder="e.g. 85%"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-tags" title="Classification" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Airing Type">
                <select
                  className={selectCls}
                  value={af.airing_type}
                  onChange={(e) => ua("airing_type", e.target.value)}
                >
                  <option value="">—</option>
                  {["TV", "Movie", "ONA", "OVA", "OAD", "Special", "Other"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Main / Spinoff">
                <select
                  className={selectCls}
                  value={af.is_main}
                  onChange={(e) => ua("is_main", e.target.value)}
                >
                  <option value="">—</option>
                  {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Genre Main">
                <MultiSelect
                  options={getOptions(allOptions, "Genre Main")}
                  value={af.genre_main}
                  onChange={(v) => ua("genre_main", v)}
                  placeholder="Select genres..."
                />
              </Field>
              <Field label="Genre Sub">
                <MultiSelect
                  options={getOptions(allOptions, "Genre Sub")}
                  value={af.genre_sub}
                  onChange={(v) => ua("genre_sub", v)}
                  placeholder="Select sub-genres..."
                />
              </Field>
            </div>

            <SectionHeader icon="fa-industry" title="Production" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Release Season">
                <select
                  className={selectCls}
                  value={af.release_season}
                  onChange={(e) => ua("release_season", e.target.value)}
                >
                  <option value="">—</option>
                  {["WIN", "SPR", "SUM", "FAL"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Release Month">
                <select
                  className={selectCls}
                  value={af.release_month}
                  onChange={(e) => ua("release_month", e.target.value)}
                >
                  <option value="">—</option>
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Release Year">
                <input
                  className={inputCls}
                  value={af.release_year}
                  onChange={(e) => ua("release_year", e.target.value)}
                  placeholder="YYYY"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Studio">
                <MultiSelect
                  options={getOptions(allOptions, "Studio")}
                  value={af.studio}
                  onChange={(v) => ua("studio", v)}
                  placeholder="Select studio..."
                />
              </Field>
              <Field label="Distributor TW">
                <MultiSelect
                  options={getOptions(allOptions, "Distributor TW")}
                  value={af.distributor_tw}
                  onChange={(v) => ua("distributor_tw", v)}
                  placeholder="Select distributor..."
                />
              </Field>
              <Field label="Director">
                <MultiSelect
                  options={getOptions(allOptions, "Director")}
                  value={af.director}
                  onChange={(v) => ua("director", v)}
                  placeholder="Select director..."
                />
              </Field>
              <Field label="Producer">
                <MultiSelect
                  options={getOptions(allOptions, "Producer")}
                  value={af.producer}
                  onChange={(v) => ua("producer", v)}
                  placeholder="Select producer..."
                />
              </Field>
              <Field label="Music / Composer">
                <MultiSelect
                  options={getOptions(allOptions, "Music / Composer")}
                  value={af.music}
                  onChange={(v) => ua("music", v)}
                  placeholder="Select composer..."
                />
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="Relational & Timeline" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prequel ID" hint="UUID of prequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={af.prequel_id || ""}
                  onChange={(e) => ua("prequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Sequel ID" hint="UUID of sequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={af.sequel_id || ""}
                  onChange={(e) => ua("sequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Alternative IDs" hint="Comma-separated UUIDs">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={af.alternative}
                  onChange={(e) => ua("alternative", e.target.value)}
                  placeholder="uuid1, uuid2, ..."
                />
              </Field>
              <Field label="Is Main Entry">
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={!!af.is_main_entry}
                    onChange={(e) => ua("is_main_entry", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-xs font-medium text-gray-700">
                    Mark as main entry among alternatives
                  </span>
                </label>
              </Field>
              <Field label="Watch Order">
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={af.watch_order}
                  onChange={(e) => ua("watch_order", e.target.value)}
                  placeholder="e.g. 1, 1.5, 2"
                />
              </Field>
              <Field
                label="Derive Related"
                hint="Set to No to skip prequel/sequel derivation"
              >
                <select
                  className={selectCls}
                  value={af.derive_related}
                  onChange={(e) => ua("derive_related", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="MAL ID">
                <input
                  className={inputCls}
                  type="number"
                  value={af.mal_id}
                  onChange={(e) => ua("mal_id", e.target.value)}
                  placeholder="e.g. 5114"
                />
              </Field>
              <Field label="MAL Link">
                <input
                  className={inputCls}
                  type="url"
                  value={af.mal_link}
                  onChange={(e) => ua("mal_link", e.target.value)}
                  placeholder="https://myanimelist.net/anime/..."
                />
              </Field>
              <Field label="AniList Link">
                <input
                  className={inputCls}
                  type="url"
                  value={af.anilist_link}
                  onChange={(e) => ua("anilist_link", e.target.value)}
                  placeholder="https://anilist.co/anime/..."
                />
              </Field>
              <Field label="Official Website">
                <input
                  className={inputCls}
                  type="url"
                  value={af.official_link}
                  onChange={(e) => ua("official_link", e.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Twitter Link">
                <input
                  className={inputCls}
                  type="url"
                  value={af.twitter_link}
                  onChange={(e) => ua("twitter_link", e.target.value)}
                  placeholder="https://twitter.com/..."
                />
              </Field>
            </div>

            <SectionHeader
              icon="fa-broadcast-tower"
              title="Source Availability"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Bahamut Source">
                <select
                  className={selectCls}
                  value={af.source_baha}
                  onChange={(e) => ua("source_baha", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">有 (Yes)</option>
                  <option value="false">無 (No)</option>
                </select>
              </Field>
              <Field label="Bahamut Link">
                <input
                  className={inputCls}
                  type="url"
                  value={af.baha_link}
                  onChange={(e) => ua("baha_link", e.target.value)}
                  placeholder="https://ani.gamer.com.tw/..."
                />
              </Field>
              <Field label="Netflix Source">
                <select
                  className={selectCls}
                  value={af.source_netflix}
                  onChange={(e) => ua("source_netflix", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">有 (Yes)</option>
                  <option value="false">無 (No)</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Other Sources
                </label>
                <div className="space-y-2">
                  {af.source_other.map((entry, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        className={inputCls}
                        placeholder="Source name (e.g. Crunchyroll)"
                        value={entry.name}
                        onChange={(e) =>
                          ua(
                            "source_other",
                            af.source_other.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className={inputCls}
                        type="url"
                        placeholder="https://... (optional)"
                        value={entry.url}
                        onChange={(e) =>
                          ua(
                            "source_other",
                            af.source_other.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-600 px-1 shrink-0"
                        onClick={() =>
                          ua(
                            "source_other",
                            af.source_other.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-brand hover:underline mt-1"
                    onClick={() =>
                      ua("source_other", [
                        ...af.source_other,
                        { name: "", url: "" },
                      ])
                    }
                  >
                    + Add Source
                  </button>
                </div>
              </div>
            </div>

            <SectionHeader icon="fa-music" title="Notes & Other" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="OP (Opening)">
                <select
                  className={selectCls}
                  value={af.op}
                  onChange={(e) => ua("op", e.target.value)}
                >
                  <option value="">—</option>
                  {["Pending", "Need", "Done"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ED (Ending)">
                <select
                  className={selectCls}
                  value={af.ed}
                  onChange={(e) => ua("ed", e.target.value)}
                >
                  <option value="">—</option>
                  {["Pending", "Need", "Done"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Insert / OST">
                <select
                  className={selectCls}
                  value={af.insert_ost}
                  onChange={(e) => ua("insert_ost", e.target.value)}
                >
                  <option value="">—</option>
                  {["Pending", "Need", "Done"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seiyuu">
                <select
                  className={selectCls}
                  value={af.seiyuu}
                  onChange={(e) => ua("seiyuu", e.target.value)}
                >
                  <option value="">—</option>
                  {["Need", "Done"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
              <input
                className={inputCls}
                value={af.cover_image_file}
                onChange={(e) => ua("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={af.remark}
                onChange={(e) => ua("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ ANIME MOVIE TAB ═══ */}
        {activeTab === "anime-movie" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            <SectionHeader icon="fa-film" title="Titles & Naming" />
            <Field label="Franchise">
              <ComboBox
                items={franchiseItems}
                selectedId={amf.franchise_id}
                inputText={amf.franchise_text}
                onSelect={(id, label) => {
                  uam("franchise_id", id);
                  uam("franchise_text", label);
                }}
                onType={(text) => {
                  uam("franchise_text", text);
                  uam("franchise_id", null);
                }}
                onClear={() => {
                  uam("franchise_id", null);
                  uam("franchise_text", "");
                }}
                placeholder="Search or type new franchise..."
                allowNew
              />
            </Field>
            <Field label="Anime Movie Name EN" required>
              <input
                className={inputCls}
                value={amf.anime_movie_name_en}
                onChange={(e) => uam("anime_movie_name_en", e.target.value)}
                placeholder="English title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Anime Movie Name CN">
                <input
                  className={inputCls}
                  value={amf.anime_movie_name_cn}
                  onChange={(e) => uam("anime_movie_name_cn", e.target.value)}
                  placeholder="Chinese title"
                />
              </Field>
              <Field label="Anime Movie Name roman">
                <input
                  className={inputCls}
                  value={amf.anime_movie_name_roman}
                  onChange={(e) =>
                    uam("anime_movie_name_roman", e.target.value)
                  }
                  placeholder="Romanized title"
                />
              </Field>
              <Field label="Anime Movie Name JP">
                <input
                  className={inputCls}
                  value={amf.anime_movie_name_jp}
                  onChange={(e) => uam("anime_movie_name_jp", e.target.value)}
                  placeholder="Japanese title"
                />
              </Field>
              <Field label="Anime Movie Name Alt">
                <input
                  className={inputCls}
                  value={amf.anime_movie_name_alt}
                  onChange={(e) => uam("anime_movie_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Airing Status">
                <select
                  className={selectCls}
                  value={amf.airing_status}
                  onChange={(e) => uam("airing_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Watching Status">
                <select
                  className={selectCls}
                  value={amf.watching_status}
                  onChange={(e) => uam("watching_status", e.target.value)}
                >
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={amf.my_rating}
                  onChange={(e) => uam("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="MAL Rating">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={amf.mal_rating}
                  onChange={(e) => uam("mal_rating", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="MAL Rank">
                <input
                  className={inputCls}
                  value={amf.mal_rank}
                  onChange={(e) => uam("mal_rank", e.target.value)}
                  placeholder="#1234"
                />
              </Field>
              <Field label="AniList Rating">
                <input
                  className={inputCls}
                  value={amf.anilist_rating}
                  onChange={(e) => uam("anilist_rating", e.target.value)}
                  placeholder="e.g. 85%"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-6 mt-2">
              <Field label="Watch Next">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!amf.watch_next}
                    onChange={(e) => uam("watch_next", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Add to Watch Next list
                  </span>
                </label>
              </Field>
              <Field label="To Rewatch">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!amf.to_rewatch}
                    onChange={(e) => uam("to_rewatch", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Mark for rewatch
                  </span>
                </label>
              </Field>
            </div>

            <SectionHeader icon="fa-info-circle" title="Release & Details" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Release Date JP" hint="YYYY-MM-DD">
                <input
                  className={inputCls}
                  type="date"
                  value={amf.release_date_jp}
                  onChange={(e) => uam("release_date_jp", e.target.value)}
                />
              </Field>
              <Field label="Release Date TW" hint="YYYY-MM-DD">
                <input
                  className={inputCls}
                  type="date"
                  value={amf.release_date_tw}
                  onChange={(e) => uam("release_date_tw", e.target.value)}
                />
              </Field>
              <Field label="Length (min)">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={amf.length_min}
                  onChange={(e) => uam("length_min", e.target.value)}
                  placeholder="e.g. 120"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-video" title="Production" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Studio">
                <MultiSelect
                  options={getOptions(allOptions, "Studio")}
                  value={amf.studio}
                  onChange={(v) => uam("studio", v)}
                  placeholder="Select studio..."
                />
              </Field>
              <Field label="Director">
                <MultiSelect
                  options={getOptions(allOptions, "Director")}
                  value={amf.director}
                  onChange={(v) => uam("director", v)}
                  placeholder="Select director..."
                />
              </Field>
            </div>

            <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="MAL ID">
                <input
                  className={inputCls}
                  type="number"
                  value={amf.mal_id}
                  onChange={(e) => uam("mal_id", e.target.value)}
                  placeholder="e.g. 5114"
                />
              </Field>
              <Field label="MAL Link">
                <input
                  className={inputCls}
                  type="url"
                  value={amf.mal_link}
                  onChange={(e) => uam("mal_link", e.target.value)}
                  placeholder="https://myanimelist.net/anime/..."
                />
              </Field>
              <Field label="AniList Link">
                <input
                  className={inputCls}
                  type="url"
                  value={amf.anilist_link}
                  onChange={(e) => uam("anilist_link", e.target.value)}
                  placeholder="https://anilist.co/anime/..."
                />
              </Field>
              <Field label="Official Website">
                <input
                  className={inputCls}
                  type="url"
                  value={amf.official_link}
                  onChange={(e) => uam("official_link", e.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Twitter Link">
                <input
                  className={inputCls}
                  type="url"
                  value={amf.twitter_link}
                  onChange={(e) => uam("twitter_link", e.target.value)}
                  placeholder="https://twitter.com/..."
                />
              </Field>
            </div>

            <SectionHeader
              icon="fa-broadcast-tower"
              title="Source Availability"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Bahamut Source">
                <select
                  className={selectCls}
                  value={amf.source_baha}
                  onChange={(e) => uam("source_baha", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">有 (Yes)</option>
                  <option value="false">無 (No)</option>
                </select>
              </Field>
              <Field label="Bahamut Link">
                <input
                  className={inputCls}
                  type="url"
                  value={amf.baha_link}
                  onChange={(e) => uam("baha_link", e.target.value)}
                  placeholder="https://ani.gamer.com.tw/..."
                />
              </Field>
              <Field label="Netflix Source">
                <select
                  className={selectCls}
                  value={amf.source_netflix}
                  onChange={(e) => uam("source_netflix", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">有 (Yes)</option>
                  <option value="false">無 (No)</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Other Sources
                </label>
                <div className="space-y-2">
                  {amf.source_other.map((entry, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        className={inputCls}
                        placeholder="Source name"
                        value={entry.name}
                        onChange={(e) =>
                          uam(
                            "source_other",
                            amf.source_other.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className={inputCls}
                        type="url"
                        placeholder="https://... (optional)"
                        value={entry.url}
                        onChange={(e) =>
                          uam(
                            "source_other",
                            amf.source_other.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-600 px-1 shrink-0"
                        onClick={() =>
                          uam(
                            "source_other",
                            amf.source_other.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-brand hover:underline mt-1"
                    onClick={() =>
                      uam("source_other", [
                        ...amf.source_other,
                        { name: "", url: "" },
                      ])
                    }
                  >
                    + Add Source
                  </button>
                </div>
              </div>
            </div>

            <SectionHeader icon="fa-image" title="Cover & Notes" />
            <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
              <input
                className={inputCls}
                value={amf.cover_image_file}
                onChange={(e) => uam("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={amf.remark}
                onChange={(e) => uam("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ MOVIE TAB ═══ */}
        {activeTab === "movie" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            {/* Auto-fill search */}
            <div ref={movieFillRef} className="relative mb-4">
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
                <i className="fas fa-magic text-brand text-sm"></i>
                <input
                  type="text"
                  value={movieFillQuery}
                  onChange={(e) => {
                    setMovieFillQuery(e.target.value);
                    setMovieFillOpen(true);
                  }}
                  onFocus={() => setMovieFillOpen(true)}
                  placeholder="Auto-fill from existing entry — type a name to search..."
                  className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
                  autoComplete="off"
                />
                {movieFillQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setMovieFillQuery("");
                      setMovieFillOpen(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>
              {movieFillOpen && movieFillResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {movieFillResults.map((m) => {
                    const f = allFranchises.find(
                      (x) => x.system_id === m.franchise_id,
                    );
                    return (
                      <button
                        key={m.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyMovieAutofill(m)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {m.movie_type && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {m.movie_type}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
                            {m.movie_name_cn || m.movie_name_en}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {f ? getDisplayName(f, "franchise") : "Standalone"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <SectionHeader icon="fa-ticket-alt" title="Titles & Naming" />
            <Field label="Franchise">
              <ComboBox
                items={allFranchises
                  .filter(
                    (f) =>
                      parseTypes(f.franchise_type).includes("TV or Movie") ||
                      !f.franchise_type,
                  )
                  .map((f) => ({
                    id: f.system_id,
                    label: getDisplayName(f, "franchise"),
                    searchText: [
                      f.franchise_name_cn,
                      f.franchise_name_en,
                      f.franchise_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }))}
                selectedId={mf.franchise_id}
                inputText={mf.franchise_text}
                onSelect={(id, label) => {
                  umf("franchise_id", id);
                  umf("franchise_text", label);
                  umf("series_id", null);
                  umf("series_text", "");
                }}
                onType={(text) => {
                  umf("franchise_text", text);
                  umf("franchise_id", null);
                  umf("series_id", null);
                  umf("series_text", "");
                }}
                onClear={() => {
                  umf("franchise_id", null);
                  umf("franchise_text", "");
                  umf("series_id", null);
                  umf("series_text", "");
                }}
                placeholder="Search or type new franchise..."
                allowNew
              />
            </Field>
            <Field label="Series">
              <ComboBox
                items={seriesItemsForMovie}
                selectedId={mf.series_id}
                inputText={mf.series_text}
                onSelect={(id, label) => {
                  umf("series_id", id);
                  umf("series_text", label);
                }}
                onType={(text) => {
                  umf("series_text", text);
                  umf("series_id", null);
                }}
                onClear={() => {
                  umf("series_id", null);
                  umf("series_text", "");
                }}
                placeholder="Search or type new series..."
                allowNew
              />
            </Field>
            <Field label="Movie Name EN">
              <input
                className={inputCls}
                value={mf.movie_name_en}
                onChange={(e) => umf("movie_name_en", e.target.value)}
                placeholder="English title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Movie Name CN">
                <input
                  className={inputCls}
                  value={mf.movie_name_cn}
                  onChange={(e) => umf("movie_name_cn", e.target.value)}
                  placeholder="Chinese title"
                />
              </Field>
              <Field label="Movie Name Alt">
                <input
                  className={inputCls}
                  value={mf.movie_name_alt}
                  onChange={(e) => umf("movie_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>

            <SectionHeader
              icon="fa-chart-bar"
              title="Status & Classification"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Airing Status">
                <select
                  className={selectCls}
                  value={mf.airing_status}
                  onChange={(e) => umf("airing_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Watching Status">
                <select
                  className={selectCls}
                  value={mf.watching_status}
                  onChange={(e) => umf("watching_status", e.target.value)}
                >
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Movie Type">
                <select
                  className={selectCls}
                  value={mf.movie_type}
                  onChange={(e) => umf("movie_type", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="Reality">Reality</option>
                  <option value="Animation">Animation</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Main / Spinoff">
                <select
                  className={selectCls}
                  value={mf.is_main}
                  onChange={(e) => umf("is_main", e.target.value)}
                >
                  <option value="">—</option>
                  {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={mf.my_rating}
                  onChange={(e) => umf("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-6 mt-2">
              <Field label="Watch Next">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!mf.watch_next}
                    onChange={(e) => umf("watch_next", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Add to Watch Next list
                  </span>
                </label>
              </Field>
              <Field label="To Rewatch">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!mf.to_rewatch}
                    onChange={(e) => umf("to_rewatch", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Mark for rewatch
                  </span>
                </label>
              </Field>
            </div>

            <SectionHeader icon="fa-info-circle" title="Release & Production" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Release Date USA">
                <input
                  className={inputCls}
                  value={mf.release_date_usa}
                  onChange={(e) => umf("release_date_usa", e.target.value)}
                  placeholder="e.g. JUL 2024"
                />
              </Field>
              <Field label="Release Date TW">
                <input
                  className={inputCls}
                  value={mf.release_date_tw}
                  onChange={(e) => umf("release_date_tw", e.target.value)}
                  placeholder="e.g. AUG 2024"
                />
              </Field>
              <Field label="Length (min)">
                <input
                  className={inputCls}
                  type="number"
                  value={mf.length_min}
                  onChange={(e) => umf("length_min", e.target.value)}
                  placeholder="120"
                />
              </Field>
              <Field label="Director">
                <input
                  className={inputCls}
                  value={mf.director}
                  onChange={(e) => umf("director", e.target.value)}
                  placeholder="Director name"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="Relational & Timeline" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prequel ID" hint="UUID of prequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={mf.prequel_id || ""}
                  onChange={(e) => umf("prequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Sequel ID" hint="UUID of sequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={mf.sequel_id || ""}
                  onChange={(e) => umf("sequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={mf.watch_order}
                  onChange={(e) => umf("watch_order", e.target.value)}
                  placeholder="e.g. 1, 1.5, 2"
                />
              </Field>
              <Field
                label="Derive Related"
                hint="Set to No to skip prequel/sequel derivation"
              >
                <select
                  className={selectCls}
                  value={mf.derive_related}
                  onChange={(e) => umf("derive_related", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="IMDb & Sources" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
                <input
                  className={inputCls}
                  type="text"
                  value={mf.imdb_id}
                  onChange={(e) => umf("imdb_id", e.target.value)}
                  placeholder="tt1234567"
                />
              </Field>
              <Field label="IMDb Link">
                <input
                  className={inputCls}
                  type="url"
                  value={mf.imdb_link}
                  onChange={(e) => umf("imdb_link", e.target.value)}
                  placeholder="https://www.imdb.com/title/tt..."
                />
              </Field>
            </div>
            <Field label="Other Sources">
              <div className="space-y-2">
                {mf.source_other.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputCls}
                      placeholder="Platform name"
                      value={entry.name}
                      onChange={(e) =>
                        umf(
                          "source_other",
                          mf.source_other.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      className={inputCls}
                      type="url"
                      placeholder="https://... (optional)"
                      value={entry.url}
                      onChange={(e) =>
                        umf(
                          "source_other",
                          mf.source_other.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-600 px-1 shrink-0"
                      onClick={() =>
                        umf(
                          "source_other",
                          mf.source_other.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-brand hover:underline mt-1"
                  onClick={() =>
                    umf("source_other", [
                      ...mf.source_other,
                      { name: "", url: "" },
                    ])
                  }
                >
                  + Add Source
                </button>
              </div>
            </Field>

            <SectionHeader icon="fa-image" title="Cover & Notes" />
            <Field label="Cover Image File" hint="e.g. 5114.jpg">
              <input
                className={inputCls}
                value={mf.cover_image_file}
                onChange={(e) => umf("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={mf.remark}
                onChange={(e) => umf("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ TV SHOW TAB ═══ */}
        {activeTab === "tv-show" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            {/* Auto-fill search */}
            <div ref={tvFillRef} className="relative mb-4">
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
                <i className="fas fa-magic text-brand text-sm"></i>
                <input
                  type="text"
                  value={tvFillQuery}
                  onChange={(e) => {
                    setTvFillQuery(e.target.value);
                    setTvFillOpen(true);
                  }}
                  onFocus={() => setTvFillOpen(true)}
                  placeholder="Auto-fill from existing entry — type a name to search..."
                  className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
                  autoComplete="off"
                />
                {tvFillQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setTvFillQuery("");
                      setTvFillOpen(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>
              {tvFillOpen && tvFillResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {tvFillResults.map((t) => {
                    const f = allFranchises.find(
                      (x) => x.system_id === t.franchise_id,
                    );
                    return (
                      <button
                        key={t.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyTvShowAutofill(t)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {t.region && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {t.region}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
                            {t.tv_name_cn || t.tv_name_en}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {f ? getDisplayName(f, "franchise") : "Standalone"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <SectionHeader icon="fa-video" title="Titles & Naming" />
            <Field label="Franchise">
              <ComboBox
                items={allFranchises
                  .filter(
                    (f) =>
                      parseTypes(f.franchise_type).includes("TV or Movie") ||
                      !f.franchise_type,
                  )
                  .map((f) => ({
                    id: f.system_id,
                    label: getDisplayName(f, "franchise"),
                    searchText: [
                      f.franchise_name_cn,
                      f.franchise_name_en,
                      f.franchise_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }))}
                selectedId={tvf.franchise_id}
                inputText={tvf.franchise_text}
                onSelect={(id, label) => {
                  utf("franchise_id", id);
                  utf("franchise_text", label);
                  utf("series_id", null);
                  utf("series_text", "");
                }}
                onType={(text) => {
                  utf("franchise_text", text);
                  utf("franchise_id", null);
                  utf("series_id", null);
                  utf("series_text", "");
                }}
                onClear={() => {
                  utf("franchise_id", null);
                  utf("franchise_text", "");
                  utf("series_id", null);
                  utf("series_text", "");
                }}
                placeholder="Search or type new franchise..."
                allowNew
              />
            </Field>
            <Field label="Series">
              <ComboBox
                items={seriesItemsForTvShow}
                selectedId={tvf.series_id}
                inputText={tvf.series_text}
                onSelect={(id, label) => {
                  utf("series_id", id);
                  utf("series_text", label);
                }}
                onType={(text) => {
                  utf("series_text", text);
                  utf("series_id", null);
                }}
                onClear={() => {
                  utf("series_id", null);
                  utf("series_text", "");
                }}
                placeholder="Search or type new series..."
                allowNew
              />
            </Field>
            <Field label="TV Name CN">
              <input
                className={inputCls}
                value={tvf.tv_name_cn}
                onChange={(e) => utf("tv_name_cn", e.target.value)}
                placeholder="Chinese title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="TV Name EN">
                <input
                  className={inputCls}
                  value={tvf.tv_name_en}
                  onChange={(e) => utf("tv_name_en", e.target.value)}
                  placeholder="English title"
                />
              </Field>
              <Field label="TV Name Alt">
                <input
                  className={inputCls}
                  value={tvf.tv_name_alt}
                  onChange={(e) => utf("tv_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>

            <SectionHeader
              icon="fa-chart-bar"
              title="Status & Classification"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Airing Status">
                <select
                  className={selectCls}
                  value={tvf.airing_status}
                  onChange={(e) => utf("airing_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Watching Status">
                <select
                  className={selectCls}
                  value={tvf.watching_status}
                  onChange={(e) => utf("watching_status", e.target.value)}
                >
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is Main">
                <select
                  className={selectCls}
                  value={tvf.is_main}
                  onChange={(e) => utf("is_main", e.target.value)}
                >
                  <option value="">—</option>
                  {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Total Episodes">
                <input
                  className={inputCls}
                  type="number"
                  value={tvf.ep_total}
                  onChange={(e) => utf("ep_total", e.target.value)}
                  placeholder="10"
                />
              </Field>
              <Field label="Episodes Finished">
                <input
                  className={inputCls}
                  type="number"
                  value={tvf.ep_fin}
                  onChange={(e) => utf("ep_fin", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={tvf.my_rating}
                  onChange={(e) => utf("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="IMDB Rating" hint="e.g. 9.2">
              <input
                className={inputCls}
                value={tvf.imdb_rating}
                onChange={(e) => utf("imdb_rating", e.target.value)}
                placeholder="9.2"
              />
            </Field>
            <div className="flex flex-wrap gap-6 mt-2">
              <Field label="Watch Next">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tvf.watch_next}
                    onChange={(e) => utf("watch_next", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Add to Watch Next list
                  </span>
                </label>
              </Field>
              <Field label="To Rewatch">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tvf.to_rewatch}
                    onChange={(e) => utf("to_rewatch", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Mark for rewatch
                  </span>
                </label>
              </Field>
            </div>

            <SectionHeader icon="fa-film" title="Classification & Production" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Region">
                <select
                  className={selectCls}
                  value={tvf.region || ""}
                  onChange={(e) => utf("region", e.target.value)}
                >
                  <option value="">—</option>
                  {["歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Source Official">
                <input
                  className={inputCls}
                  value={tvf.source_official}
                  onChange={(e) => utf("source_official", e.target.value)}
                  placeholder="e.g. Netflix, HBO"
                />
              </Field>
              <Field label="Season Part">
                <input
                  className={inputCls}
                  value={tvf.season_part}
                  onChange={(e) => utf("season_part", e.target.value)}
                  placeholder="e.g. Season 1"
                />
              </Field>
            </div>
            <Field label="Release Date" hint="e.g. FEB 2026">
              <input
                className={inputCls}
                value={tvf.release_date}
                onChange={(e) => utf("release_date", e.target.value)}
                placeholder="FEB 2026"
              />
            </Field>

            <SectionHeader icon="fa-link" title="Relational & Timeline" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prequel ID" hint="UUID of prequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={tvf.prequel_id || ""}
                  onChange={(e) => utf("prequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Sequel ID" hint="UUID of sequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={tvf.sequel_id || ""}
                  onChange={(e) => utf("sequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={tvf.watch_order}
                  onChange={(e) => utf("watch_order", e.target.value)}
                  placeholder="e.g. 1, 1.5, 2"
                />
              </Field>
              <Field
                label="Derive Related"
                hint="Set to No to skip prequel/sequel derivation"
              >
                <select
                  className={selectCls}
                  value={tvf.derive_related}
                  onChange={(e) => utf("derive_related", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="Source & Links" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
                <input
                  className={inputCls}
                  type="text"
                  value={tvf.imdb_id}
                  onChange={(e) => utf("imdb_id", e.target.value)}
                  placeholder="tt1234567"
                />
              </Field>
              <Field label="IMDb Link">
                <input
                  className={inputCls}
                  type="url"
                  value={tvf.imdb_link}
                  onChange={(e) => utf("imdb_link", e.target.value)}
                  placeholder="https://www.imdb.com/title/tt..."
                />
              </Field>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Other Sources
                </label>
                <div className="space-y-2">
                  {tvf.source_other.map((entry, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        className={inputCls}
                        placeholder="Source name (e.g. Disney+)"
                        value={entry.name}
                        onChange={(e) =>
                          utf(
                            "source_other",
                            tvf.source_other.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className={inputCls}
                        type="url"
                        placeholder="https://... (optional)"
                        value={entry.url}
                        onChange={(e) =>
                          utf(
                            "source_other",
                            tvf.source_other.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-600 px-1 shrink-0"
                        onClick={() =>
                          utf(
                            "source_other",
                            tvf.source_other.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-brand hover:underline mt-1"
                    onClick={() =>
                      utf("source_other", [
                        ...tvf.source_other,
                        { name: "", url: "" },
                      ])
                    }
                  >
                    + Add Source
                  </button>
                </div>
              </div>
            </div>

            <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
            <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
              <input
                className={inputCls}
                value={tvf.cover_image_file}
                onChange={(e) => utf("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={tvf.remark}
                onChange={(e) => utf("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ CARTOON TAB ═══ */}
        {activeTab === "cartoon" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            {/* Auto-fill search */}
            <div ref={cartoonFillRef} className="relative mb-4">
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
                <i className="fas fa-magic text-brand text-sm"></i>
                <input
                  type="text"
                  value={cartoonFillQuery}
                  onChange={(e) => {
                    setCartoonFillQuery(e.target.value);
                    setCartoonFillOpen(true);
                  }}
                  onFocus={() => setCartoonFillOpen(true)}
                  placeholder="Auto-fill from existing entry — type a name to search..."
                  className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
                  autoComplete="off"
                />
                {cartoonFillQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCartoonFillQuery("");
                      setCartoonFillOpen(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>
              {cartoonFillOpen && cartoonFillResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {cartoonFillResults.map((c) => {
                    const f = allFranchises.find(
                      (x) => x.system_id === c.franchise_id,
                    );
                    return (
                      <button
                        key={c.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyCartoonAutofill(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {c.airing_type && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {c.airing_type}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
                            {c.cartoon_name_cn || c.cartoon_name_en}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {f ? getDisplayName(f, "franchise") : "Standalone"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <SectionHeader icon="fa-paint-brush" title="Titles & Naming" />
            <Field label="Franchise">
              <ComboBox
                items={allFranchises
                  .filter(
                    (f) =>
                      parseTypes(f.franchise_type).includes("Cartoon") ||
                      !f.franchise_type,
                  )
                  .map((f) => ({
                    id: f.system_id,
                    label: getDisplayName(f, "franchise"),
                    searchText: [
                      f.franchise_name_cn,
                      f.franchise_name_en,
                      f.franchise_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }))}
                selectedId={cf.franchise_id}
                inputText={cf.franchise_text}
                onSelect={(id, label) => {
                  uc("franchise_id", id);
                  uc("franchise_text", label);
                  uc("series_id", null);
                  uc("series_text", "");
                }}
                onType={(text) => {
                  uc("franchise_text", text);
                  uc("franchise_id", null);
                  uc("series_id", null);
                  uc("series_text", "");
                }}
                onClear={() => {
                  uc("franchise_id", null);
                  uc("franchise_text", "");
                  uc("series_id", null);
                  uc("series_text", "");
                }}
                placeholder="Search or type new franchise..."
                allowNew
              />
            </Field>
            <Field label="Series">
              <ComboBox
                items={seriesItemsForCartoon}
                selectedId={cf.series_id}
                inputText={cf.series_text}
                onSelect={(id, label) => {
                  uc("series_id", id);
                  uc("series_text", label);
                }}
                onType={(text) => {
                  uc("series_text", text);
                  uc("series_id", null);
                }}
                onClear={() => {
                  uc("series_id", null);
                  uc("series_text", "");
                }}
                placeholder="Search or type new series..."
                allowNew
              />
            </Field>
            <Field label="Cartoon Name CN">
              <input
                className={inputCls}
                value={cf.cartoon_name_cn}
                onChange={(e) => uc("cartoon_name_cn", e.target.value)}
                placeholder="Chinese title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Cartoon Name EN">
                <input
                  className={inputCls}
                  value={cf.cartoon_name_en}
                  onChange={(e) => uc("cartoon_name_en", e.target.value)}
                  placeholder="English title"
                />
              </Field>
              <Field label="Cartoon Name Alt">
                <input
                  className={inputCls}
                  value={cf.cartoon_name_alt}
                  onChange={(e) => uc("cartoon_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>

            <SectionHeader
              icon="fa-chart-bar"
              title="Status & Classification"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Airing Type">
                <select
                  className={selectCls}
                  value={cf.airing_type}
                  onChange={(e) => uc("airing_type", e.target.value)}
                >
                  <option value="">—</option>
                  {["TV", "Movie", "OVA", "Special"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Airing Status">
                <select
                  className={selectCls}
                  value={cf.airing_status}
                  onChange={(e) => uc("airing_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Watching Status">
                <select
                  className={selectCls}
                  value={cf.watching_status}
                  onChange={(e) => uc("watching_status", e.target.value)}
                >
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Is Main">
                <select
                  className={selectCls}
                  value={cf.is_main}
                  onChange={(e) => uc("is_main", e.target.value)}
                >
                  <option value="">—</option>
                  {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Total Episodes">
                <input
                  className={inputCls}
                  type="number"
                  value={cf.ep_total}
                  onChange={(e) => uc("ep_total", e.target.value)}
                  placeholder="10"
                />
              </Field>
              <Field label="Episodes Finished">
                <input
                  className={inputCls}
                  type="number"
                  value={cf.ep_fin}
                  onChange={(e) => uc("ep_fin", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={cf.my_rating}
                  onChange={(e) => uc("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="IMDb Rating" hint="e.g. 9.2">
                <input
                  className={inputCls}
                  value={cf.imdb_rating}
                  onChange={(e) => uc("imdb_rating", e.target.value)}
                  placeholder="9.2"
                />
              </Field>
              <Field label="Ep Length (min)" hint="Minutes per episode">
                <input
                  className={inputCls}
                  type="number"
                  value={cf.length_ep_min}
                  onChange={(e) => uc("length_ep_min", e.target.value)}
                  placeholder="22"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6 mt-2">
              <Field label="Watch Next">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!cf.watch_next}
                    onChange={(e) => uc("watch_next", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Add to Watch Next list
                  </span>
                </label>
              </Field>
              <Field label="To Rewatch">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!cf.to_rewatch}
                    onChange={(e) => uc("to_rewatch", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Mark for rewatch
                  </span>
                </label>
              </Field>
            </div>

            <SectionHeader icon="fa-film" title="Classification & Production" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Source Official">
                <input
                  className={inputCls}
                  value={cf.source_official}
                  onChange={(e) => uc("source_official", e.target.value)}
                  placeholder="e.g. Disney+, Cartoon Network"
                />
              </Field>
              <Field label="Season Part">
                <input
                  className={inputCls}
                  value={cf.season_part}
                  onChange={(e) => uc("season_part", e.target.value)}
                  placeholder="e.g. Season 1"
                />
              </Field>
            </div>
            <Field label="Release Date" hint="e.g. FEB 2026">
              <input
                className={inputCls}
                value={cf.release_date}
                onChange={(e) => uc("release_date", e.target.value)}
                placeholder="FEB 2026"
              />
            </Field>

            <SectionHeader icon="fa-link" title="Relational & Timeline" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prequel ID" hint="UUID of prequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={cf.prequel_id || ""}
                  onChange={(e) => uc("prequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Sequel ID" hint="UUID of sequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={cf.sequel_id || ""}
                  onChange={(e) => uc("sequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={cf.watch_order}
                  onChange={(e) => uc("watch_order", e.target.value)}
                  placeholder="e.g. 1, 1.5, 2"
                />
              </Field>
              <Field
                label="Derive Related"
                hint="Set to No to skip prequel/sequel derivation"
              >
                <select
                  className={selectCls}
                  value={cf.derive_related}
                  onChange={(e) => uc("derive_related", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="Source & Links" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
                <input
                  className={inputCls}
                  type="text"
                  value={cf.imdb_id}
                  onChange={(e) => uc("imdb_id", e.target.value)}
                  placeholder="tt1234567"
                />
              </Field>
              <Field label="IMDb Link">
                <input
                  className={inputCls}
                  type="url"
                  value={cf.imdb_link}
                  onChange={(e) => uc("imdb_link", e.target.value)}
                  placeholder="https://www.imdb.com/title/tt..."
                />
              </Field>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Other Sources
                </label>
                <div className="space-y-2">
                  {cf.source_other.map((entry, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        className={inputCls}
                        placeholder="Source name (e.g. Disney+)"
                        value={entry.name}
                        onChange={(e) =>
                          uc(
                            "source_other",
                            cf.source_other.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className={inputCls}
                        type="url"
                        placeholder="https://... (optional)"
                        value={entry.url}
                        onChange={(e) =>
                          uc(
                            "source_other",
                            cf.source_other.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-600 px-1 shrink-0"
                        onClick={() =>
                          uc(
                            "source_other",
                            cf.source_other.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-brand hover:underline mt-1"
                    onClick={() =>
                      uc("source_other", [
                        ...cf.source_other,
                        { name: "", url: "" },
                      ])
                    }
                  >
                    + Add Source
                  </button>
                </div>
              </div>
            </div>

            <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
            <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
              <input
                className={inputCls}
                value={cf.cover_image_file}
                onChange={(e) => uc("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={cf.remark}
                onChange={(e) => uc("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ MANGA TAB ═══ */}
        {activeTab === "manga" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            {/* Auto-fill search */}
            <div ref={mangaFillRef} className="relative mb-4">
              <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
                <i className="fas fa-magic text-brand text-sm"></i>
                <input
                  type="text"
                  value={mangaFillQuery}
                  onChange={(e) => {
                    setMangaFillQuery(e.target.value);
                    setMangaFillOpen(true);
                  }}
                  onFocus={() => setMangaFillOpen(true)}
                  placeholder="Auto-fill from existing entry — type a name to search..."
                  className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
                  autoComplete="off"
                />
                {mangaFillQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setMangaFillQuery("");
                      setMangaFillOpen(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>
              {mangaFillOpen && mangaFillResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {mangaFillResults.map((m) => {
                    const f = allFranchises.find(
                      (x) => x.system_id === m.franchise_id,
                    );
                    return (
                      <button
                        key={m.system_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyMangaAutofill(m)}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {m.region && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {m.region}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
                            {m.manga_name_cn || m.manga_name_en}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {f ? getDisplayName(f, "franchise") : "Standalone"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <SectionHeader icon="fa-book" title="Titles & Naming" />
            <Field label="Franchise">
              <ComboBox
                items={allFranchises
                  .filter(
                    (f) =>
                      parseTypes(f.franchise_type).includes("ACG") ||
                      parseTypes(f.franchise_type).includes("Manga") ||
                      !f.franchise_type,
                  )
                  .map((f) => ({
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
                  }))}
                selectedId={mgf.franchise_id}
                inputText={mgf.franchise_text}
                onSelect={(id, label) => {
                  umg("franchise_id", id);
                  umg("franchise_text", label);
                  umg("series_id", null);
                  umg("series_text", "");
                }}
                onType={(text) => {
                  umg("franchise_text", text);
                  umg("franchise_id", null);
                  umg("series_id", null);
                  umg("series_text", "");
                }}
                onClear={() => {
                  umg("franchise_id", null);
                  umg("franchise_text", "");
                  umg("series_id", null);
                  umg("series_text", "");
                }}
                placeholder="Search or type new franchise..."
                allowNew
              />
            </Field>
            <Field label="Series">
              <ComboBox
                items={seriesItemsForManga}
                selectedId={mgf.series_id}
                inputText={mgf.series_text}
                onSelect={(id, label) => {
                  umg("series_id", id);
                  umg("series_text", label);
                }}
                onType={(text) => {
                  umg("series_text", text);
                  umg("series_id", null);
                }}
                onClear={() => {
                  umg("series_id", null);
                  umg("series_text", "");
                }}
                placeholder="Search or type new series..."
                allowNew
              />
            </Field>
            <Field label="Manga Name CN">
              <input
                className={inputCls}
                value={mgf.manga_name_cn}
                onChange={(e) => umg("manga_name_cn", e.target.value)}
                placeholder="Chinese title"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Manga Name EN">
                <input
                  className={inputCls}
                  value={mgf.manga_name_en}
                  onChange={(e) => umg("manga_name_en", e.target.value)}
                  placeholder="English title"
                />
              </Field>
              <Field label="Manga Name Alt">
                <input
                  className={inputCls}
                  value={mgf.manga_name_alt}
                  onChange={(e) => umg("manga_name_alt", e.target.value)}
                  placeholder="Alternative title"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Manga Name Roman">
                <input
                  className={inputCls}
                  value={mgf.manga_name_roman}
                  onChange={(e) => umg("manga_name_roman", e.target.value)}
                  placeholder="Romanized title"
                />
              </Field>
              <Field label="Manga Name JP">
                <input
                  className={inputCls}
                  value={mgf.manga_name_jp}
                  onChange={(e) => umg("manga_name_jp", e.target.value)}
                  placeholder="Japanese title"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Region">
                <select
                  className={selectCls}
                  value={mgf.region}
                  onChange={(e) => umg("region", e.target.value)}
                >
                  <option value="">—</option>
                  {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is Main">
                <select
                  className={selectCls}
                  value={mgf.is_main}
                  onChange={(e) => umg("is_main", e.target.value)}
                >
                  <option value="">—</option>
                  {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-chart-bar" title="Status" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Serialization Status">
                <select
                  className={selectCls}
                  value={mgf.serialization_status}
                  onChange={(e) => umg("serialization_status", e.target.value)}
                >
                  <option value="">—</option>
                  {["連載中", "停更", "腰斬", "完結"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reading Status">
                <select
                  className={selectCls}
                  value={mgf.reading_status}
                  onChange={(e) => umg("reading_status", e.target.value)}
                >
                  {[
                    "Might Read",
                    "Plan to Read",
                    "Active Reading",
                    "Passive Reading",
                    "Paused",
                    "Completed",
                    "Temp Dropped",
                    "Dropped",
                    "Won't Read",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={mgf.my_rating}
                  onChange={(e) => umg("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-list-ol" title="Progress" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Ch Total">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.ch_total}
                  onChange={(e) => umg("ch_total", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Ch Finished">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.ch_fin}
                  onChange={(e) => umg("ch_fin", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Vol Total">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.vol_total}
                  onChange={(e) => umg("vol_total", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Vol Finished">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.vol_fin}
                  onChange={(e) => umg("vol_fin", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Vol Fin Page">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.vol_fin_page}
                  onChange={(e) => umg("vol_fin_page", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-star" title="Scores" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="MAL Rating" hint="e.g. 8.5">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={mgf.mal_rating}
                  onChange={(e) => umg("mal_rating", e.target.value)}
                  placeholder="8.5"
                />
              </Field>
              <Field label="MAL Rank">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.mal_rank}
                  onChange={(e) => umg("mal_rank", e.target.value)}
                  placeholder="100"
                />
              </Field>
              <Field label="AniList Rating" hint="e.g. 85">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={mgf.anilist_rating}
                  onChange={(e) => umg("anilist_rating", e.target.value)}
                  placeholder="85"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Author (Plot)">
                <MultiSelect
                  options={getOptions(allOptions, "Manga Author")}
                  value={mgf.author_plot}
                  onChange={(v) => umg("author_plot", v)}
                  placeholder="Select plot author..."
                />
              </Field>
              <Field label="Author (Art)">
                <MultiSelect
                  options={getOptions(allOptions, "Manga Author")}
                  value={mgf.author_draw}
                  onChange={(v) => umg("author_draw", v)}
                  placeholder="Select art author..."
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Release Year">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.release_year}
                  onChange={(e) => umg("release_year", e.target.value)}
                  placeholder="2020"
                />
              </Field>
              <Field label="End Year">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.end_year}
                  onChange={(e) => umg("end_year", e.target.value)}
                  placeholder="2024"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Anime Studio">
                <MultiSelect
                  options={getOptions(allOptions, "Studio")}
                  value={mgf.anime_studio}
                  onChange={(v) => umg("anime_studio", v)}
                  placeholder="Select studio..."
                />
              </Field>
              <Field label="Serialization Platform">
                <input
                  className={inputCls}
                  value={mgf.serialization_platform}
                  onChange={(e) =>
                    umg("serialization_platform", e.target.value)
                  }
                  placeholder="e.g. 週刊少年ジャンプ"
                />
              </Field>
              <Field label="Distributor TW">
                <input
                  className={inputCls}
                  value={mgf.distributor_tw}
                  onChange={(e) => umg("distributor_tw", e.target.value)}
                  placeholder="TW distributor"
                />
              </Field>
            </div>

            <SectionHeader icon="fa-link" title="Relational & Timeline" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prequel ID" hint="UUID of prequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={mgf.prequel_id || ""}
                  onChange={(e) => umg("prequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Sequel ID" hint="UUID of sequel entry">
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={mgf.sequel_id || ""}
                  onChange={(e) => umg("sequel_id", e.target.value || null)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
              <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={mgf.watch_order}
                  onChange={(e) => umg("watch_order", e.target.value)}
                  placeholder="e.g. 1, 1.5, 2"
                />
              </Field>
              <Field
                label="Derive Related"
                hint="Set to No to skip prequel/sequel derivation"
              >
                <select
                  className={selectCls}
                  value={mgf.derive_related}
                  onChange={(e) => umg("derive_related", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="MAL ID">
                <input
                  className={inputCls}
                  type="number"
                  value={mgf.mal_id}
                  onChange={(e) => umg("mal_id", e.target.value)}
                  placeholder="12345"
                />
              </Field>
              <Field label="MAL Link">
                <input
                  className={inputCls}
                  type="url"
                  value={mgf.mal_link}
                  onChange={(e) => umg("mal_link", e.target.value)}
                  placeholder="https://myanimelist.net/manga/..."
                />
              </Field>
              <Field label="AniList Link">
                <input
                  className={inputCls}
                  type="url"
                  value={mgf.anilist_link}
                  onChange={(e) => umg("anilist_link", e.target.value)}
                  placeholder="https://anilist.co/manga/..."
                />
              </Field>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Other Sources
              </label>
              <div className="space-y-2">
                {mgf.source_other.map((entry, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      className={inputCls}
                      placeholder="Source name"
                      value={entry.name}
                      onChange={(e) =>
                        umg(
                          "source_other",
                          mgf.source_other.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      className={inputCls}
                      type="url"
                      placeholder="https://... (optional)"
                      value={entry.url}
                      onChange={(e) =>
                        umg(
                          "source_other",
                          mgf.source_other.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-600 px-1 shrink-0"
                      onClick={() =>
                        umg(
                          "source_other",
                          mgf.source_other.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-brand hover:underline mt-1"
                  onClick={() =>
                    umg("source_other", [
                      ...mgf.source_other,
                      { name: "", url: "" },
                    ])
                  }
                >
                  + Add Source
                </button>
              </div>
            </div>

            <SectionHeader icon="fa-flag" title="Flags" />
            <div className="flex flex-wrap gap-6 mt-2">
              <Field label="Read Next">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!mgf.read_next}
                    onChange={(e) => umg("read_next", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Add to Read Next list
                  </span>
                </label>
              </Field>
              <Field label="To Reread">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!mgf.to_reread}
                    onChange={(e) => umg("to_reread", e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Mark for reread
                  </span>
                </label>
              </Field>
            </div>

            <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
            <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
              <input
                className={inputCls}
                value={mgf.cover_image_file}
                onChange={(e) => umg("cover_image_file", e.target.value)}
                placeholder="5114.jpg"
              />
            </Field>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={mgf.remark}
                onChange={(e) => umg("remark", e.target.value)}
                placeholder="Private notes..."
              />
            </Field>
          </div>
        )}

        {/* ═══ FRANCHISE TAB ═══ */}
        {activeTab === "franchise" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <SectionHeader icon="fa-sitemap" title="Titles & Naming" />
            <Field label="Franchise Name EN">
              <input
                className={inputCls}
                value={ff.franchise_name_en}
                onChange={(e) => uf("franchise_name_en", e.target.value)}
                placeholder="English franchise name"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Franchise Name CN">
                <input
                  className={inputCls}
                  value={ff.franchise_name_cn}
                  onChange={(e) => uf("franchise_name_cn", e.target.value)}
                />
              </Field>
              <Field label="Franchise Name roman">
                <input
                  className={inputCls}
                  value={ff.franchise_name_roman}
                  onChange={(e) => uf("franchise_name_roman", e.target.value)}
                />
              </Field>
              <Field label="Franchise Name JP">
                <input
                  className={inputCls}
                  value={ff.franchise_name_jp}
                  onChange={(e) => uf("franchise_name_jp", e.target.value)}
                />
              </Field>
              <Field label="Franchise Name Alt">
                <input
                  className={inputCls}
                  value={ff.franchise_name_alt}
                  onChange={(e) => uf("franchise_name_alt", e.target.value)}
                />
              </Field>
            </div>

            <SectionHeader icon="fa-info-circle" title="Other Information" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Franchise Type">
                <div className="flex flex-wrap gap-3">
                  {[
                    "ACG",
                    "Anime Movie",
                    "TV or Movie",
                    "Cartoon",
                    "Manga",
                  ].map((v) => {
                    const types = parseTypes(ff.franchise_type);
                    const checked = types.includes(v);
                    return (
                      <label
                        key={v}
                        className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? types.filter((t) => t !== v)
                              : [...types, v];
                            uf("franchise_type", next.join(", "));
                          }}
                          className="rounded accent-brand"
                        />
                        {v}
                      </label>
                    );
                  })}
                </div>
              </Field>
              <Field label="My Rating">
                <select
                  className={selectCls}
                  value={ff.my_rating}
                  onChange={(e) => uf("my_rating", e.target.value)}
                >
                  <option value="">—</option>
                  {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Expectation">
                <select
                  className={selectCls}
                  value={ff.franchise_expectation}
                  onChange={(e) => uf("franchise_expectation", e.target.value)}
                >
                  <option value="">—</option>
                  {["Highest", "High", "Medium", "Low"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Favorite 3x3 Slot" hint="1–9">
                <select
                  className={selectCls}
                  value={ff.favorite_3x3_slot}
                  onChange={(e) => uf("favorite_3x3_slot", e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={ff.remark}
                onChange={(e) => uf("remark", e.target.value)}
              />
            </Field>
          </div>
        )}

        {/* ═══ SERIES TAB ═══ */}
        {activeTab === "series" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
            <Field label="Parent Franchise" required>
              <ComboBox
                items={franchiseItems}
                selectedId={sf.franchise_id}
                inputText={sf.franchise_text}
                onSelect={(id, label) => {
                  us("franchise_id", id);
                  us("franchise_text", label);
                }}
                onType={(text) => {
                  us("franchise_text", text);
                  us("franchise_id", null);
                }}
                onClear={() => {
                  us("franchise_id", null);
                  us("franchise_text", "");
                }}
                placeholder="Search existing franchises..."
              />
            </Field>
            <Field label="Series Name EN">
              <input
                className={inputCls}
                value={sf.series_name_en}
                onChange={(e) => us("series_name_en", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Series Name CN">
                <input
                  className={inputCls}
                  value={sf.series_name_cn}
                  onChange={(e) => us("series_name_cn", e.target.value)}
                />
              </Field>
              <Field label="Series Name Alt">
                <input
                  className={inputCls}
                  value={sf.series_name_alt}
                  onChange={(e) => us("series_name_alt", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Remark">
              <textarea
                className={inputCls}
                rows={3}
                value={sf.remark}
                onChange={(e) => us("remark", e.target.value)}
              />
            </Field>
          </div>
        )}

        {/* ═══ OPTIONS TAB ═══ */}
        {activeTab === "options" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <SectionHeader icon="fa-cog" title="System Option" />
            <Field label="Category" required>
              <input
                className={inputCls}
                value={optCategory}
                onChange={(e) => setOptCategory(e.target.value)}
                placeholder="e.g. Studio, Genre Main, Director..."
                list="opt-categories"
              />
              <datalist id="opt-categories">
                {[
                  ...new Set([
                    "Studio",
                    "Distributor TW",
                    "Director",
                    "Producer",
                    "Music / Composer",
                    "Genre Main",
                    "Genre Sub",
                    ...optionCategories,
                  ]),
                ].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Option Values
              </label>
              {optValues.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputCls}
                    value={v}
                    onChange={(e) =>
                      setOptValues((prev) =>
                        prev.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    placeholder={`Value ${i + 1}`}
                  />
                  {optValues.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setOptValues((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="px-3 py-2 text-red-400 hover:text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition shrink-0"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptValues((prev) => [...prev, ""])}
                className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1.5 py-1"
              >
                <i className="fas fa-plus-circle"></i> Add Another Entry
              </button>
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
          >
            {submitting ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-plus-circle"></i>
            )}
            {submitting ? "Saving..." : "Append Entry"}
          </button>
        </div>
      </form>

      {/* ── DUPLICATE MODAL ── */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center gap-3">
              <i className="fas fa-exclamation-triangle text-amber-500 text-xl"></i>
              <h3 className="font-black text-gray-900">Potential Duplicate</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">
                An entry with the name{" "}
                <span className="font-bold text-gray-900">
                  "{duplicateModal.name}"
                </span>{" "}
                may already exist in the database.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to proceed and create a duplicate?
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button
                onClick={duplicateModal.onCancel}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={duplicateModal.onProceed}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
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
