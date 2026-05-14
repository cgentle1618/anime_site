import { useState, useEffect, useRef } from "react";
import { useToast } from "../hooks/useToast";
import {
  getDisplayName,
  cleanString,
  buildAnimePayload,
  buildAnimeMoviePayload,
} from "../utils/media";
import FranchiseCreateModal from "../components/FranchiseCreateModal";
import CreateNewEntityModal from "../components/CreateNewEntityModal";
import FranchiseAddTab, { defaultFranchise } from "./add-tabs/FranchiseAddTab";
import SeriesAddTab, { defaultSeries } from "./add-tabs/SeriesAddTab";
import OptionsAddTab from "./add-tabs/OptionsAddTab";
import MangaAddTab, { defaultManga } from "./add-tabs/MangaAddTab";
import NovelAddTab, { defaultNovel } from "./add-tabs/NovelAddTab";
import CartoonAddTab, { defaultCartoon } from "./add-tabs/CartoonAddTab";
import TvShowAddTab, { defaultTvShow } from "./add-tabs/TvShowAddTab";
import MovieAddTab, { defaultMovie } from "./add-tabs/MovieAddTab";
import AnimeMovieAddTab, { defaultAnimeMovie } from "./add-tabs/AnimeMovieAddTab";
import AnimeAddTab, { defaultAnime } from "./add-tabs/AnimeAddTab";

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
  const [allNovels, setAllNovels] = useState([]);
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

  // Novel auto-fill search
  const [novelFillQuery, setNovelFillQuery] = useState("");
  const [novelFillOpen, setNovelFillOpen] = useState(false);
  const novelFillRef = useRef(null);

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
  const [nvf, setNvf] = useState(defaultNovel());
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
  const unv = (k, v) => setNvf((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    async function load() {
      try {
        const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, cRes, mgRes, nvRes] =
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
          cRes.json(),
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

  useEffect(() => {
    function handleClick(e) {
      if (novelFillRef.current && !novelFillRef.current.contains(e.target))
        setNovelFillOpen(false);
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

  const novelFillResults = novelFillQuery
    ? allNovels
        .filter((n) =>
          [
            n.novel_name_cn,
            n.novel_name_en,
            n.novel_name_roman,
            n.novel_name_jp,
            n.novel_name_alt,
          ].some(
            (name) =>
              name && cleanString(name).includes(cleanString(novelFillQuery)),
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

  function applyNovelAutofill(novel) {
    const f = allFranchises.find((x) => x.system_id === novel.franchise_id);
    const s = allSeries.find((x) => x.system_id === novel.series_id);
    setNvf((p) => ({
      ...p,
      novel_name_cn: novel.novel_name_cn || "",
      novel_name_en: novel.novel_name_en || "",
      novel_name_roman: novel.novel_name_roman || "",
      novel_name_jp: novel.novel_name_jp || "",
      novel_name_alt: novel.novel_name_alt || "",
      franchise_id: novel.franchise_id || null,
      franchise_text: f ? getDisplayName(f, "franchise") : "",
      series_id: novel.series_id || null,
      series_text: s ? getDisplayName(s, "series") : "",
      region: novel.region || "",
      type: novel.type || "",
      is_main: novel.is_main || "",
    }));
    setNovelFillQuery("");
    setNovelFillOpen(false);
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
      else if (activeTab === "novel") await submitNovel();
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
          franchiseType: "Movie",
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
          franchiseType: "TV",
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
      publisher_tw: mgf.publisher_tw || null,
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

  async function submitNovel() {
    if (!nvf.novel_name_cn && !nvf.novel_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!nvf.franchise_id && !nvf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = nvf.franchise_id;
    if (!franchiseId && nvf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Novel",
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
          franchise_name_en: nvf.novel_name_en || null,
          franchise_name_cn: nvf.novel_name_cn || null,
          franchise_name_roman: nvf.novel_name_roman || null,
          franchise_name_jp: nvf.novel_name_jp || null,
          franchise_name_alt: nvf.novel_name_alt || null,
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

    let seriesId = nvf.series_id;
    if (!seriesId && nvf.series_text.trim()) {
      const confirmed = await new Promise((resolve) => {
        setCreateModal({
          entityType: "Series",
          text: nvf.series_text,
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
          series_name_en: nvf.novel_name_en || null,
          series_name_cn: nvf.novel_name_cn || null,
          series_name_alt: nvf.novel_name_alt || null,
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

    const novelNameEachCn = nvf.novel_name_each_cn.filter((e) => e.name.trim()).length > 0
      ? nvf.novel_name_each_cn.filter((e) => e.name.trim()).map((e) => ({ key: e.key, name: e.name.trim() }))
      : null;
    const novelNameEachEn = nvf.novel_name_each_en.filter((e) => e.name.trim()).length > 0
      ? nvf.novel_name_each_en.filter((e) => e.name.trim()).map((e) => ({ key: e.key, name: e.name.trim() }))
      : null;

    // Auto-create missing system options for author, illustrator, publisher_tw
    {
      const existingValues = {};
      for (const o of allOptions) {
        if (!existingValues[o.category]) existingValues[o.category] = new Set();
        existingValues[o.category].add(o.option_value);
      }
      const toCreate = [];
      for (const v of (nvf.author || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!existingValues["Novel Author"]?.has(v))
          toCreate.push({ category: "Novel Author", option_value: v });
      }
      for (const v of (nvf.illustrator || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!existingValues["Novel Illustrator"]?.has(v))
          toCreate.push({ category: "Novel Illustrator", option_value: v });
      }
      const pub = (nvf.publisher_tw || "").trim();
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
      novel_name_cn: nvf.novel_name_cn || null,
      novel_name_en: nvf.novel_name_en || null,
      novel_name_roman: nvf.novel_name_roman || null,
      novel_name_jp: nvf.novel_name_jp || null,
      novel_name_alt: nvf.novel_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      region: nvf.region || null,
      type: nvf.type || null,
      version: nvf.version || null,
      is_main: nvf.is_main || null,
      serialization_status: nvf.serialization_status || null,
      reading_status: nvf.reading_status || "Might Read",
      progress_display: nvf.progress_display || null,
      vol_total_original: nvf.vol_total_original !== "" ? parseFloat(nvf.vol_total_original) : null,
      vol_total_tw: nvf.vol_total_tw !== "" ? parseFloat(nvf.vol_total_tw) : null,
      vol_fin: nvf.vol_fin !== "" ? parseFloat(nvf.vol_fin) : 0,
      arc_total: nvf.arc_total !== "" ? parseFloat(nvf.arc_total) : null,
      arc_fin: nvf.arc_fin !== "" ? parseFloat(nvf.arc_fin) : 0,
      ch_total: nvf.ch_total !== "" ? parseFloat(nvf.ch_total) : null,
      ch_fin: nvf.ch_fin !== "" ? parseFloat(nvf.ch_fin) : 0,
      my_rating: nvf.my_rating || null,
      mal_rating: nvf.mal_rating !== "" ? parseFloat(nvf.mal_rating) : null,
      mal_rank: nvf.mal_rank !== "" ? parseInt(nvf.mal_rank) : null,
      anilist_rating: nvf.anilist_rating !== "" ? parseFloat(nvf.anilist_rating) : null,
      author: nvf.author || null,
      illustrator: nvf.illustrator || null,
      release_year: nvf.release_year !== "" ? parseInt(nvf.release_year) : null,
      end_year: nvf.end_year !== "" ? parseInt(nvf.end_year) : null,
      publisher_tw: nvf.publisher_tw || null,
      prequel_id: nvf.prequel_id || null,
      sequel_id: nvf.sequel_id || null,
      alternative: nvf.alternative || null,
      read_order: nvf.read_order !== "" ? parseFloat(nvf.read_order) : null,
      novel_name_each_cn: novelNameEachCn && Object.keys(novelNameEachCn).length > 0 ? novelNameEachCn : null,
      novel_name_each_en: novelNameEachEn && Object.keys(novelNameEachEn).length > 0 ? novelNameEachEn : null,
      mal_id: nvf.mal_id !== "" ? parseInt(nvf.mal_id) : null,
      mal_link: nvf.mal_link || null,
      anilist_link: nvf.anilist_link || null,
      source_other:
        nvf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              nvf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      read_next: nvf.read_next ?? false,
      to_reread: nvf.to_reread ?? false,
      cover_image_file: nvf.cover_image_file || null,
      remark: nvf.remark || null,
    };

    const res = await fetch("/api/novel/", {
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
    showToast("success", "Novel appended successfully.");
    setLastAdded(created.novel_name_cn || created.novel_name_en || "New Novel");
    setNvf(defaultNovel());
    setAllNovels((prev) => [...prev, created]);
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

  const seriesItemsForNovel = (
    nvf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === nvf.franchise_id)
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
    { key: "novel", icon: "fa-book-open", label: "Add Novel Entry" },
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
          <AnimeAddTab
            af={af}
            ua={ua}
            fillQuery={fillQuery}
            setFillQuery={setFillQuery}
            fillOpen={fillOpen}
            setFillOpen={setFillOpen}
            fillRef={fillRef}
            fillResults={fillResults}
            applyAutofill={applyAutofill}
            allFranchises={allFranchises}
            franchiseItems={franchiseItems}
            seriesItemsForAnime={seriesItems}
            allOptions={allOptions}
          />
        )}

        {/* ═══ ANIME MOVIE TAB ═══ */}
        {activeTab === "anime-movie" && (
          <AnimeMovieAddTab
            amf={amf}
            uam={uam}
            franchiseItems={franchiseItems}
            allOptions={allOptions}
          />
        )}

        {/* ═══ MOVIE TAB ═══ */}
        {activeTab === "movie" && (
          <MovieAddTab
            mf={mf}
            umf={umf}
            movieFillQuery={movieFillQuery}
            setMovieFillQuery={setMovieFillQuery}
            movieFillOpen={movieFillOpen}
            setMovieFillOpen={setMovieFillOpen}
            movieFillRef={movieFillRef}
            movieFillResults={movieFillResults}
            applyMovieAutofill={applyMovieAutofill}
            allFranchises={allFranchises}
            seriesItemsForMovie={seriesItemsForMovie}
          />
        )}

        {/* ═══ TV SHOW TAB ═══ */}
        {activeTab === "tv-show" && (
          <TvShowAddTab
            tvf={tvf}
            utf={utf}
            tvFillQuery={tvFillQuery}
            setTvFillQuery={setTvFillQuery}
            tvFillOpen={tvFillOpen}
            setTvFillOpen={setTvFillOpen}
            tvFillRef={tvFillRef}
            tvFillResults={tvFillResults}
            applyTvShowAutofill={applyTvShowAutofill}
            allFranchises={allFranchises}
            seriesItemsForTvShow={seriesItemsForTvShow}
          />
        )}

        {/* ═══ CARTOON TAB ═══ */}
        {activeTab === "cartoon" && (
          <CartoonAddTab
            cf={cf}
            uc={uc}
            cartoonFillQuery={cartoonFillQuery}
            setCartoonFillQuery={setCartoonFillQuery}
            cartoonFillOpen={cartoonFillOpen}
            setCartoonFillOpen={setCartoonFillOpen}
            cartoonFillRef={cartoonFillRef}
            cartoonFillResults={cartoonFillResults}
            applyCartoonAutofill={applyCartoonAutofill}
            allFranchises={allFranchises}
            seriesItemsForCartoon={seriesItemsForCartoon}
          />
        )}

        {/* ═══ MANGA TAB ═══ */}
        {activeTab === "manga" && (
          <MangaAddTab
            mgf={mgf}
            umg={umg}
            mangaFillQuery={mangaFillQuery}
            setMangaFillQuery={setMangaFillQuery}
            mangaFillOpen={mangaFillOpen}
            setMangaFillOpen={setMangaFillOpen}
            mangaFillRef={mangaFillRef}
            mangaFillResults={mangaFillResults}
            applyMangaAutofill={applyMangaAutofill}
            allFranchises={allFranchises}
            seriesItemsForManga={seriesItemsForManga}
            allOptions={allOptions}
          />
        )}

        {/* ═══ NOVEL TAB ═══ */}
        {activeTab === "novel" && (
          <NovelAddTab
            nvf={nvf}
            unv={unv}
            novelFillQuery={novelFillQuery}
            setNovelFillQuery={setNovelFillQuery}
            novelFillOpen={novelFillOpen}
            setNovelFillOpen={setNovelFillOpen}
            novelFillRef={novelFillRef}
            novelFillResults={novelFillResults}
            applyNovelAutofill={applyNovelAutofill}
            allFranchises={allFranchises}
            seriesItemsForNovel={seriesItemsForNovel}
            allOptions={allOptions}
          />
        )}

        {/* ═══ FRANCHISE TAB ═══ */}
        {activeTab === "franchise" && <FranchiseAddTab ff={ff} uf={uf} />}

        {/* ═══ SERIES TAB ═══ */}
        {activeTab === "series" && (
          <SeriesAddTab sf={sf} us={us} franchiseItems={franchiseItems} />
        )}

        {/* ═══ OPTIONS TAB ═══ */}
        {activeTab === "options" && (
          <OptionsAddTab
            optCategory={optCategory}
            setOptCategory={setOptCategory}
            optValues={optValues}
            setOptValues={setOptValues}
            optionCategories={optionCategories}
          />
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
