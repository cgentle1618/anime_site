// Frontend: page component file for Add.
import { useState, useEffect, useRef } from "react";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  cleanString,
  buildAnimePayload,
  buildAnimeMoviePayload,
} from "../../utils/media";
import FranchiseCreateModal from "../../components/modals/FranchiseCreateModal";
import CreateNewEntityModal from "../../components/modals/CreateNewEntityModal";
import CollectionAddTab, {
  defaultCollection,
} from "../add-tabs/CollectionAddTab";
import FranchiseAddTab, { defaultFranchise } from "../add-tabs/FranchiseAddTab";
import SeriesAddTab, { defaultSeries } from "../add-tabs/SeriesAddTab";
import OptionsAddTab from "../add-tabs/OptionsAddTab";
import QuoteAddTab from "../add-tabs/QuoteAddTab";
import MemeAddTab from "../add-tabs/MemeAddTab";
import { emptyQuote, toQuotePayload } from "../../components/forms/QuoteForm";
import { emptyMeme, toMemePayload } from "../../components/forms/MemeForm";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import MangaAddTab, { defaultManga } from "../add-tabs/MangaAddTab";
import NovelAddTab, { defaultNovel } from "../add-tabs/NovelAddTab";
import ComicAddTab, { defaultComic } from "../add-tabs/ComicAddTab";
import CartoonAddTab, { defaultCartoon } from "../add-tabs/CartoonAddTab";
import TvShowAddTab, { defaultTvShow } from "../add-tabs/TvShowAddTab";
import MovieAddTab, { defaultMovie } from "../add-tabs/MovieAddTab";
import AnimeMovieAddTab, {
  defaultAnimeMovie,
} from "../add-tabs/AnimeMovieAddTab";
import AnimeAddTab, { defaultAnime } from "../add-tabs/AnimeAddTab";
import {
  autofillFields,
  fetchFormDefaults,
  resolveDefaults,
} from "../../hooks/useFormDefaults";
import { buildAutofillPatch } from "../../lib/autofill";
import { ADMIN_TABS } from "../../config/adminTabs";
import AdminTabBar from "../../components/layout/AdminTabBar";

export default function Add() {
  const { showToast } = useToast();

  const [allAnime, setAllAnime] = useState([]);
  const [allCollections, setAllCollections] = useState([]);
  const [allFranchises, setAllFranchises] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  const [allOptions, setAllOptions] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTvShows, setAllTvShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allMangas, setAllMangas] = useState([]);
  const [allNovels, setAllNovels] = useState([]);
  const [allComics, setAllComics] = useState([]);
  // Admin-configured form defaults, keyed by media type. {} = use the built-ins.
  const [formDefaults, setFormDefaults] = useState({});
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

  // Anime Movie auto-fill search
  const [amFillQuery, setAmFillQuery] = useState("");
  const [amFillOpen, setAmFillOpen] = useState(false);
  const amFillRef = useRef(null);

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

  // Comic auto-fill search
  const [comicFillQuery, setComicFillQuery] = useState("");
  const [comicFillOpen, setComicFillOpen] = useState(false);
  const comicFillRef = useRef(null);

  // Modals (callbacks stored in state)
  const [duplicateModal, setDuplicateModal] = useState(null); // {name, onProceed, onCancel}
  const [createModal, setCreateModal] = useState(null); // {entityType, text, onConfirm, onCancel}
  const [franchiseCreateModal, setFranchiseCreateModal] = useState(null); // {onConfirm, onCancel}

  // Forms
  const [af, setAf] = useState(defaultAnime());
  const [colf, setColf] = useState(defaultCollection());
  const [ff, setFf] = useState(defaultFranchise());
  const [sf, setSf] = useState(defaultSeries());
  const [amf, setAmf] = useState(defaultAnimeMovie());
  const [mf, setMf] = useState(defaultMovie());
  const [tvf, setTvf] = useState(defaultTvShow());
  const [cf, setCf] = useState(defaultCartoon());
  const [mgf, setMgf] = useState(defaultManga());
  const [nvf, setNvf] = useState(defaultNovel());
  const [cmf, setCmf] = useState(defaultComic());
  // Quote is not a media entry, so like System Options it keeps its own
  // form state instead of going through the media form factories.
  const [qf, setQf] = useState(emptyQuote({ media_type: "", entry_id: null }));
  const uq = (patch) => setQf((prev) => ({ ...prev, ...patch }));
  const [memf, setMemf] = useState(
    emptyMeme({ owner_type: "", owner_id: null }),
  );
  const umeme = (patch) => setMemf((prev) => ({ ...prev, ...patch }));

  const [optCategory, setOptCategory] = useState("");
  const [optValues, setOptValues] = useState([""]);

  const ua = (k, v) => setAf((p) => ({ ...p, [k]: v }));
  const ucol = (k, v) => setColf((p) => ({ ...p, [k]: v }));
  const uf = (k, v) => setFf((p) => ({ ...p, [k]: v }));
  const us = (k, v) => setSf((p) => ({ ...p, [k]: v }));
  const uam = (k, v) => setAmf((p) => ({ ...p, [k]: v }));
  const umf = (k, v) => setMf((p) => ({ ...p, [k]: v }));
  const utf = (k, v) => setTvf((p) => ({ ...p, [k]: v }));
  const uc = (k, v) => setCf((p) => ({ ...p, [k]: v }));
  const umg = (k, v) => setMgf((p) => ({ ...p, [k]: v }));
  const unv = (k, v) => setNvf((p) => ({ ...p, [k]: v }));
  const ucm = (k, v) => setCmf((p) => ({ ...p, [k]: v }));

  // A blank form for `type` with the admin's configured defaults applied.
  const freshForm = (type) => resolveDefaults(type, formDefaults);

  useEffect(() => {
    async function load() {
      try {
        const [
          aRes,
          colRes,
          fRes,
          sRes,
          oRes,
          amRes,
          mvRes,
          tvRes,
          cRes,
          mgRes,
          nvRes,
          cmRes,
        ] = await Promise.all([
          fetch("/api/anime/?limit=2000", { credentials: "include" }),
          fetch("/api/collection/?limit=2000", { credentials: "include" }),
          fetch("/api/franchise/?limit=2000", { credentials: "include" }),
          fetch("/api/series/?limit=2000", { credentials: "include" }),
          fetch("/api/options/", { credentials: "include" }),
          fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
          fetch("/api/movies/?limit=2000", { credentials: "include" }),
          fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
          fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
          fetch("/api/manga/?limit=2000", { credentials: "include" }),
          fetch("/api/novel/?limit=2000", { credentials: "include" }),
          fetch("/api/comic/?limit=2000", { credentials: "include" }),
        ]);
        // Guarded separately: a form-defaults failure must not break the page,
        // it just means every form falls back to its built-in values.
        const fd = await fetchFormDefaults();
        const [
          anime,
          collections,
          franchises,
          series,
          options,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          novels,
          comics,
        ] = await Promise.all([
          aRes.json(),
          colRes.json(),
          fRes.json(),
          sRes.json(),
          oRes.json(),
          amRes.json(),
          mvRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
          cmRes.json(),
        ]);
        setAllAnime(anime);
        setAllCollections(collections);
        setAllFranchises(franchises);
        setAllSeries(series);
        setAllOptions(options);
        setAllAnimeMovies(animeMovies);
        setAllMovies(movies);
        setAllTvShows(tvShows);
        setAllCartoons(cartoons);
        setAllMangas(mangas);
        setAllNovels(novels);
        setAllComics(comics);

        // Seed every form from the configured defaults. Safe to do here rather
        // than in the useState initializers: the page renders a spinner until
        // dataLoading flips, so the first paint of the form already has these.
        setFormDefaults(fd);
        setAf(resolveDefaults("anime", fd));
        setAmf(resolveDefaults("anime-movie", fd));
        setMf(resolveDefaults("movie", fd));
        setTvf(resolveDefaults("tv-show", fd));
        setCf(resolveDefaults("cartoon", fd));
        setMgf(resolveDefaults("manga", fd));
        setNvf(resolveDefaults("novel", fd));
        setCmf(resolveDefaults("comic", fd));
        setColf(resolveDefaults("collection", fd));
        setFf(resolveDefaults("franchise", fd));
        setSf(resolveDefaults("series", fd));
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
      if (amFillRef.current && !amFillRef.current.contains(e.target))
        setAmFillOpen(false);
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

  useEffect(() => {
    function handleClick(e) {
      if (comicFillRef.current && !comicFillRef.current.contains(e.target))
        setComicFillOpen(false);
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

  const amFillResults = amFillQuery
    ? allAnimeMovies
        .filter((m) =>
          [
            m.anime_movie_name_en,
            m.anime_movie_name_cn,
            m.anime_movie_name_roman,
            m.anime_movie_name_jp,
            m.anime_movie_name_alt,
          ].some((n) => n && cleanString(n).includes(cleanString(amFillQuery))),
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

  const comicFillResults = comicFillQuery
    ? allComics
        .filter((c) =>
          [c.comic_name_en, c.comic_name_cn, c.comic_name_alt].some(
            (name) =>
              name && cleanString(name).includes(cleanString(comicFillQuery)),
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

  // One auto-fill handler per tab. Which fields get copied comes from the
  // admin's /defaults configuration, falling back to the built-in field sets.
  const makeApply = (setter, type, setQuery, setOpen) => (item) => {
    const patch = buildAutofillPatch(
      item,
      type,
      autofillFields(type, formDefaults),
      { allFranchises, allSeries, allCollections, defaults: freshForm(type) },
    );
    setter((p) => ({ ...p, ...patch }));
    setQuery("");
    setOpen(false);
    showToast("success", "Auto-filled fields from existing entry.");
  };

  const applyAutofill = makeApply(setAf, "anime", setFillQuery, setFillOpen);
  const applyAnimeMovieAutofill = makeApply(
    setAmf,
    "anime-movie",
    setAmFillQuery,
    setAmFillOpen,
  );
  const applyCartoonAutofill = makeApply(
    setCf,
    "cartoon",
    setCartoonFillQuery,
    setCartoonFillOpen,
  );
  const applyMangaAutofill = makeApply(
    setMgf,
    "manga",
    setMangaFillQuery,
    setMangaFillOpen,
  );
  const applyNovelAutofill = makeApply(
    setNvf,
    "novel",
    setNovelFillQuery,
    setNovelFillOpen,
  );
  const applyComicAutofill = makeApply(
    setCmf,
    "comic",
    setComicFillQuery,
    setComicFillOpen,
  );
  const applyMovieAutofill = makeApply(
    setMf,
    "movie",
    setMovieFillQuery,
    setMovieFillOpen,
  );
  const applyTvShowAutofill = makeApply(
    setTvf,
    "tv-show",
    setTvFillQuery,
    setTvFillOpen,
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (activeTab === "anime") await submitAnime();
      else if (activeTab === "collection") await submitCollection();
      else if (activeTab === "franchise") await submitFranchise();
      else if (activeTab === "series") await submitSeries();
      else if (activeTab === "anime-movie") await submitAnimeMovie();
      else if (activeTab === "movie") await submitMovie();
      else if (activeTab === "tv-show") await submitTvShow();
      else if (activeTab === "cartoon") await submitCartoon();
      else if (activeTab === "manga") await submitManga();
      else if (activeTab === "novel") await submitNovel();
      else if (activeTab === "comic") await submitComic();
      else if (activeTab === "quote") await submitQuote();
      else if (activeTab === "meme") await submitMeme();
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
    setAf(freshForm("anime"));
    setAllAnime((prev) => [...prev, created]);
  }

  async function submitCollection() {
    if (
      !colf.collection_name_en &&
      !colf.collection_name_cn &&
      !colf.collection_name_roman &&
      !colf.collection_name_jp &&
      !colf.collection_name_alt
    ) {
      showToast("warning", "At least one Collection Name must be provided.");
      return;
    }
    const res = await fetch("/api/collection/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection_name_en: colf.collection_name_en || null,
        collection_name_cn: colf.collection_name_cn || null,
        collection_name_roman: colf.collection_name_roman || null,
        collection_name_jp: colf.collection_name_jp || null,
        collection_name_alt: colf.collection_name_alt || null,
        my_rating: colf.my_rating || null,
        collection_expectation: colf.collection_expectation || null,
        remark: colf.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Collection appended successfully.");
      setLastAdded(
        created.collection_name_cn ||
          created.collection_name_en ||
          "New Collection",
      );
      setColf(freshForm("collection"));
      setAllCollections((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create collection");
    }
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
        collection_id: ff.collection_id || null,
        my_rating: ff.my_rating || null,
        franchise_expectation: ff.franchise_expectation || null,
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
      setFf(freshForm("franchise"));
      setAllFranchises((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create franchise");
    }
  }

  async function submitSeries() {
    if (
      !sf.series_name_en &&
      !sf.series_name_cn &&
      !sf.series_name_alt &&
      !sf.series_name_roman &&
      !sf.series_name_jp
    ) {
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
        series_name_roman: sf.series_name_roman || null,
        series_name_jp: sf.series_name_jp || null,
        series_name_alt: sf.series_name_alt || null,
        my_rating: sf.my_rating || null,
        series_expectation: sf.series_expectation || null,
        to_rewatch: !!sf.to_rewatch,
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
      setSf(freshForm("series"));
      setAllSeries((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create series");
    }
  }

  async function submitQuote() {
    if (!qf.media_type || !qf.entry_id) {
      showToast("warning", "A media entry must be selected.");
      return;
    }
    if (!qf.text?.trim() && !qf.image_file?.trim()) {
      showToast("warning", "A quote needs text or an image.");
      return;
    }
    try {
      await fetchJson(endpoints.quotes.create(), {
        method: "POST",
        ...jsonBody(
          toQuotePayload(qf, {
            media_type: qf.media_type,
            entry_id: qf.entry_id,
          }),
        ),
      });
      showToast("success", "Quote appended.");
      setLastAdded(qf.text?.trim() || qf.image_file);
      // Keep the entry selected: quotes are usually added several at a time.
      setQf(emptyQuote({ media_type: qf.media_type, entry_id: qf.entry_id }));
    } catch (err) {
      showToast("error", err.message || "Failed to append quote.");
    }
  }

  async function submitMeme() {
    if (!memf.owner_type || !memf.owner_id) {
      showToast("warning", "An owner must be selected.");
      return;
    }
    if (!memf.text?.trim() && !memf.image_file?.trim()) {
      showToast("warning", "A meme needs text or an image.");
      return;
    }
    try {
      await fetchJson(endpoints.memes.create(), {
        method: "POST",
        ...jsonBody(
          toMemePayload(memf, {
            owner_type: memf.owner_type,
            owner_id: memf.owner_id,
          }),
        ),
      });
      showToast("success", "Meme appended.");
      setLastAdded(memf.text?.trim() || memf.image_file);
      // Keep the entry selected: memes are usually added several at a time.
      setMemf(
        emptyMeme({ owner_type: memf.owner_type, owner_id: memf.owner_id }),
      );
    } catch (err) {
      showToast("error", err.message || "Failed to append meme.");
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
    setAmf(freshForm("anime-movie"));
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
      watching_status: mf.watching_status || freshForm("movie").watching_status,
      my_rating: mf.my_rating || null,
      movie_type: mf.movie_type || null,
      length_min: mf.length_min !== "" ? parseInt(mf.length_min) : null,
      release_date_usa: mf.release_date_usa || null,
      release_date_tw: mf.release_date_tw || null,
      director: mf.director || null,
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
    setMf(freshForm("movie"));
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
      watching_status:
        tvf.watching_status || freshForm("tv-show").watching_status,
      ep_total: tvf.ep_total !== "" ? parseInt(tvf.ep_total) : null,
      ep_fin: tvf.ep_fin !== "" ? parseInt(tvf.ep_fin) : null,
      my_rating: tvf.my_rating || null,
      imdb_rating: tvf.imdb_rating || null,
      release_date: tvf.release_date || null,
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
    setTvf(freshForm("tv-show"));
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
      watching_status:
        cf.watching_status || freshForm("cartoon").watching_status,
      is_main: cf.is_main || null,
      ep_total: cf.ep_total !== "" ? parseInt(cf.ep_total) : null,
      ep_fin: cf.ep_fin !== "" ? parseInt(cf.ep_fin) : null,
      my_rating: cf.my_rating || null,
      imdb_rating: cf.imdb_rating || null,
      length_ep_min:
        cf.length_ep_min !== "" ? parseInt(cf.length_ep_min) : null,
      source_official: cf.source_official || null,
      release_date: cf.release_date || null,
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
    setCf(freshForm("cartoon"));
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
      reading_status: mgf.reading_status || freshForm("manga").reading_status,
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
      release_date: mgf.release_date || null,
      end_date: mgf.end_date || null,
      anime_studio: mgf.anime_studio || null,
      serialization_platform: mgf.serialization_platform || null,
      publisher_tw: mgf.publisher_tw || null,
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
    setMgf(freshForm("manga"));
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

    const novelNameEachCn =
      nvf.novel_name_each_cn.filter((e) => e.name.trim()).length > 0
        ? nvf.novel_name_each_cn
            .filter((e) => e.name.trim())
            .map((e) => ({ key: e.key, name: e.name.trim() }))
        : null;
    const novelNameEachEn =
      nvf.novel_name_each_en.filter((e) => e.name.trim()).length > 0
        ? nvf.novel_name_each_en
            .filter((e) => e.name.trim())
            .map((e) => ({ key: e.key, name: e.name.trim() }))
        : null;

    // Auto-create missing system options for author, illustrator, publisher_tw
    {
      const existingValues = {};
      for (const o of allOptions) {
        if (!existingValues[o.category]) existingValues[o.category] = new Set();
        existingValues[o.category].add(o.option_value);
      }
      const toCreate = [];
      for (const v of (nvf.author || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (!existingValues["Novel Author"]?.has(v))
          toCreate.push({ category: "Novel Author", option_value: v });
      }
      for (const v of (nvf.illustrator || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
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
      reading_status: nvf.reading_status || freshForm("novel").reading_status,
      progress_display: nvf.progress_display || null,
      vol_total_original:
        nvf.vol_total_original !== ""
          ? parseFloat(nvf.vol_total_original)
          : null,
      vol_total_tw:
        nvf.vol_total_tw !== "" ? parseFloat(nvf.vol_total_tw) : null,
      vol_fin: nvf.vol_fin !== "" ? parseFloat(nvf.vol_fin) : 0,
      arc_total: nvf.arc_total !== "" ? parseFloat(nvf.arc_total) : null,
      arc_fin: nvf.arc_fin !== "" ? parseFloat(nvf.arc_fin) : 0,
      ch_total: nvf.ch_total !== "" ? parseFloat(nvf.ch_total) : null,
      ch_fin: nvf.ch_fin !== "" ? parseFloat(nvf.ch_fin) : 0,
      my_rating: nvf.my_rating || null,
      mal_rating: nvf.mal_rating !== "" ? parseFloat(nvf.mal_rating) : null,
      mal_rank: nvf.mal_rank !== "" ? parseInt(nvf.mal_rank) : null,
      anilist_rating:
        nvf.anilist_rating !== "" ? parseFloat(nvf.anilist_rating) : null,
      author: nvf.author || null,
      illustrator: nvf.illustrator || null,
      release_date: nvf.release_date || null,
      end_date: nvf.end_date || null,
      publisher_tw: nvf.publisher_tw || null,
      read_order: nvf.read_order !== "" ? parseFloat(nvf.read_order) : null,
      novel_name_each_cn:
        novelNameEachCn && Object.keys(novelNameEachCn).length > 0
          ? novelNameEachCn
          : null,
      novel_name_each_en:
        novelNameEachEn && Object.keys(novelNameEachEn).length > 0
          ? novelNameEachEn
          : null,
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
    setNvf(freshForm("novel"));
    setAllNovels((prev) => [...prev, created]);
  }

  async function submitComic() {
    if (!cmf.comic_name_en && !cmf.comic_name_cn) {
      showToast("error", "Please provide at least an EN or CN title.");
      return;
    }
    if (!cmf.franchise_id && !cmf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = cmf.franchise_id;
    if (!franchiseId && cmf.franchise_text.trim()) {
      const result = await new Promise((resolve) => {
        setFranchiseCreateModal({
          franchiseType: "Comic",
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
          franchise_name_en: cmf.comic_name_en || null,
          franchise_name_cn: cmf.comic_name_cn || null,
          franchise_name_alt: cmf.comic_name_alt || null,
          franchise_type: "Comic",
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
    if (!seriesId && cmf.series_text.trim()) {
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
          series_name_en: cmf.comic_name_en || null,
          series_name_cn: cmf.comic_name_cn || null,
          series_name_alt: cmf.comic_name_alt || null,
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

    // Auto-create missing system options for every comic option-backed field.
    {
      const existingValues = {};
      for (const o of allOptions) {
        if (!existingValues[o.category]) existingValues[o.category] = new Set();
        existingValues[o.category].add(o.option_value);
      }
      const toCreate = [];
      const addMulti = (raw, category) => {
        for (const v of (raw || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)) {
          if (!existingValues[category]?.has(v))
            toCreate.push({ category, option_value: v });
        }
      };
      const addSingle = (raw, category) => {
        const v = (raw || "").trim();
        if (v && !existingValues[category]?.has(v))
          toCreate.push({ category, option_value: v });
      };
      addMulti(cmf.writer, "Comic Writer");
      addMulti(cmf.artist, "Comic Artist");
      addSingle(cmf.publisher, "Comic Publisher");
      addSingle(cmf.imprint, "Comic Imprint");
      addSingle(cmf.continuity, "Comic Continuity");
      addSingle(cmf.era, "Comic Era");
      addSingle(cmf.publisher_tw, "Distributor TW");
      for (const ev of Array.isArray(cmf.events) ? cmf.events : [])
        addSingle(ev, "Comic Event");
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
      comic_name_en: cmf.comic_name_en || null,
      comic_name_cn: cmf.comic_name_cn || null,
      comic_name_alt: cmf.comic_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      volume_label: cmf.volume_label || null,
      comic_type: cmf.comic_type || null,
      publisher: cmf.publisher || null,
      imprint: cmf.imprint || null,
      continuity: cmf.continuity || null,
      era: cmf.era || null,
      // Comma-joined multi-select, the same idiom as franchise.franchise_type.
      events: Array.isArray(cmf.events)
        ? cmf.events.filter(Boolean).join(", ") || null
        : cmf.events || null,
      is_main_entry: cmf.is_main_entry ?? false,
      writer: cmf.writer || null,
      artist: cmf.artist || null,
      release_date: cmf.release_date || null,
      end_date: cmf.end_date || null,
      publisher_tw: cmf.publisher_tw || null,
      issue_total:
        cmf.issue_total !== "" ? parseInt(cmf.issue_total, 10) : null,
      issue_fin: cmf.issue_fin !== "" ? parseInt(cmf.issue_fin, 10) : 0,
      serialization_status: cmf.serialization_status || null,
      reading_status: cmf.reading_status || freshForm("comic").reading_status,
      read_order: cmf.read_order !== "" ? parseFloat(cmf.read_order) : null,
      my_rating: cmf.my_rating || null,
      comicvine_link: cmf.comicvine_link || null,
      source_other:
        cmf.source_other.filter((e) => e.name.trim()).length > 0
          ? Object.fromEntries(
              cmf.source_other
                .filter((e) => e.name.trim())
                .map((e) => [e.name.trim(), e.url.trim()]),
            )
          : null,
      read_next: cmf.read_next ?? false,
      to_reread: cmf.to_reread ?? false,
      cover_image_file: cmf.cover_image_file || null,
      remark: cmf.remark || null,
    };

    const res = await fetch("/api/comic/", {
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
    showToast("success", "Comic appended successfully.");
    setLastAdded(created.comic_name_en || created.comic_name_cn || "New Comic");
    setCmf(freshForm("comic"));
    setAllComics((prev) => [...prev, created]);
  }

  // franchise system_id -> the name of the collection it belongs to, so every
  // tab with a franchise picker can name the wider grouping.
  const franchiseCollections = Object.fromEntries(
    allFranchises
      .filter((f) => f.collection_id)
      .map((f) => [
        f.system_id,
        allCollections.find((c) => c.system_id === f.collection_id),
      ])
      .filter(([, c]) => c)
      .map(([id, c]) => [id, getDisplayName(c, "collection")]),
  );

  const collectionItems = allCollections.map((c) => ({
    id: c.system_id,
    label: getDisplayName(c, "collection"),
    searchText: [
      c.collection_name_cn,
      c.collection_name_en,
      c.collection_name_jp,
      c.collection_name_roman,
      c.collection_name_alt,
    ]
      .filter(Boolean)
      .join(" "),
  }));

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

  const seriesItemsForComic = (
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
      <AdminTabBar
        tabs={ADMIN_TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <form onSubmit={handleSubmit}>
        {/* ═══ ANIME TAB ═══ */}
        {activeTab === "anime" && (
          <AnimeAddTab
            franchiseCollections={franchiseCollections}
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
            franchiseCollections={franchiseCollections}
            amf={amf}
            uam={uam}
            amFillQuery={amFillQuery}
            setAmFillQuery={setAmFillQuery}
            amFillOpen={amFillOpen}
            setAmFillOpen={setAmFillOpen}
            amFillRef={amFillRef}
            amFillResults={amFillResults}
            applyAnimeMovieAutofill={applyAnimeMovieAutofill}
            allFranchises={allFranchises}
            franchiseItems={franchiseItems}
            allOptions={allOptions}
          />
        )}

        {/* ═══ MOVIE TAB ═══ */}
        {activeTab === "movie" && (
          <MovieAddTab
            franchiseCollections={franchiseCollections}
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
            franchiseCollections={franchiseCollections}
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
            franchiseCollections={franchiseCollections}
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
            franchiseCollections={franchiseCollections}
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
            franchiseCollections={franchiseCollections}
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

        {/* ═══ COMIC TAB ═══ */}
        {activeTab === "comic" && (
          <ComicAddTab
            franchiseCollections={franchiseCollections}
            cmf={cmf}
            ucm={ucm}
            comicFillQuery={comicFillQuery}
            setComicFillQuery={setComicFillQuery}
            comicFillOpen={comicFillOpen}
            setComicFillOpen={setComicFillOpen}
            comicFillRef={comicFillRef}
            comicFillResults={comicFillResults}
            applyComicAutofill={applyComicAutofill}
            allFranchises={allFranchises}
            seriesItemsForComic={seriesItemsForComic}
            allOptions={allOptions}
          />
        )}

        {/* ═══ FRANCHISE TAB ═══ */}
        {activeTab === "collection" && <CollectionAddTab cf={colf} uf={ucol} />}
        {activeTab === "franchise" && (
          <FranchiseAddTab ff={ff} uf={uf} collectionItems={collectionItems} />
        )}

        {/* ═══ SERIES TAB ═══ */}
        {activeTab === "series" && (
          <SeriesAddTab
            sf={sf}
            us={us}
            franchiseItems={franchiseItems}
            franchiseCollections={franchiseCollections}
          />
        )}

        {/* ═══ QUOTE TAB ═══ */}
        {activeTab === "quote" && <QuoteAddTab qf={qf} uq={uq} />}

        {/* ═══ MEME TAB ═══ */}
        {activeTab === "meme" && <MemeAddTab mf={memf} um={umeme} />}

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
