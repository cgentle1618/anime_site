// Frontend: page component file for Delete.
import { useState, useEffect, useRef, useCallback } from "react";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { ADMIN_TABS } from "../../config/adminTabs";
import AdminTabBar from "../../components/layout/AdminTabBar";
import OptionSubTabBar from "../../components/forms/OptionSubTabBar";
import PersonSubTabBar from "../../components/forms/PersonSubTabBar";
import { categoriesForSubTab } from "../../lib/optionCategoryGroups";
import QuoteManageTab from "../modify-tabs/QuoteManageTab";
import MemeManageTab from "../modify-tabs/MemeManageTab";


function getClean(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function getDisplayTitle(item, type) {
  if (type === "anime")
    return (
      item.anime_name_cn ||
      item.anime_name_en ||
      item.anime_name_roman ||
      item.anime_name_jp ||
      "Unknown"
    );
  if (type === "anime-movie")
    return (
      item.anime_movie_name_cn ||
      item.anime_movie_name_en ||
      item.anime_movie_name_roman ||
      item.anime_movie_name_jp ||
      "Unknown"
    );
  if (type === "movie")
    return (
      item.movie_name_cn ||
      item.movie_name_en ||
      item.movie_name_alt ||
      "Unknown"
    );
  if (type === "tv-show")
    return item.tv_name_cn || item.tv_name_en || item.tv_name_alt || "Unknown";
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
  if (type === "comic")
    return (
      item.comic_name_en ||
      item.comic_name_cn ||
      item.comic_name_alt ||
      "Unknown"
    );
  if (type === "studio" || type === "person" || type === "character")
    return item.display_name || "Unknown";
  if (type === "collection")
    return (
      item.collection_name_cn ||
      item.collection_name_en ||
      item.collection_name_roman ||
      "Unknown"
    );
  if (type === "franchise")
    return (
      item.franchise_name_cn ||
      item.franchise_name_en ||
      item.franchise_name_roman ||
      "Unknown"
    );
  if (type === "series")
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown"
    );
  return item.value || "Unknown";
}

function SearchBox({ placeholder, onSelect, items, renderItem, type }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = query
    ? items
        .filter((item) => {
          const str = Object.values(item)
            .filter((v) => typeof v === "string")
            .join("");
          return getClean(str).includes(getClean(query));
        })
        .slice(0, 10)
    : [];

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
        <input
          className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-danger"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((item) => (
            <div
              key={item.system_id || item.id}
              className="px-4 py-2.5 hover:bg-danger/10 cursor-pointer group"
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
                setQuery(getDisplayTitle(item, type));
              }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Delete() {
  const { showToast } = useToast();
  const [tab, setTab] = useState("anime");
  const [db, setDb] = useState({
    anime: [],
    "anime-movie": [],
    movie: [],
    "tv-show": [],
    cartoon: [],
    manga: [],
    novel: [],
    comic: [],
    collection: [],
    franchise: [],
    series: [],
    options: [],
    studio: [],
    person: [],
    character: [],
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Every media type that can hang off a franchise or series. Cascade and
  // orphan checks count all of them: the old anime-only counts offered to
  // delete franchises that still held movies/comics and cascaded past
  // non-anime children, leaving them with franchise_id = NULL.
  const MEDIA_KEYS = ["anime", "anime-movie", "movie", "tv-show", "cartoon", "manga", "novel", "comic"];
  const entriesIn = (field, id) =>
    MEDIA_KEYS.reduce((n, k) => n + db[k].filter((e) => e[field] === id).length, 0);
  const standaloneEntriesIn = (franchiseId) =>
    MEDIA_KEYS.reduce(
      (n, k) => n + db[k].filter((e) => e.franchise_id === franchiseId && !e.series_id).length,
      0,
    );
  async function deleteChildren(field, id) {
    for (const key of MEDIA_KEYS) {
      for (const e of db[key].filter((x) => x[field] === id)) {
        await fetch(endpoints.resource(key).detail(e.system_id), {
          method: "DELETE",
          credentials: "include",
        });
      }
    }
  }

  const [selectedAnime, setSelectedAnime] = useState(null);
  const [selectedAnimeMovie, setSelectedAnimeMovie] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedTvShow, setSelectedTvShow] = useState(null);
  const [selectedCartoon, setSelectedCartoon] = useState(null);
  const [selectedManga, setSelectedManga] = useState(null);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [selectedComic, setSelectedComic] = useState(null);
  const [selectedFranchise, setSelectedFranchise] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedStudio, setSelectedStudio] = useState(null);
  const [studioConfirm, setStudioConfirm] = useState(false);
  const [studioMergeMode, setStudioMergeMode] = useState(false);
  const [studioMergeTarget, setStudioMergeTarget] = useState(null);
  const [personSubTab, setPersonSubTab] = useState("director");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personConfirm, setPersonConfirm] = useState(false);
  const [personMergeMode, setPersonMergeMode] = useState(false);
  const [personMergeTarget, setPersonMergeTarget] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [characterConfirm, setCharacterConfirm] = useState(false);
  const [characterMergeMode, setCharacterMergeMode] = useState(false);
  const [characterMergeTarget, setCharacterMergeTarget] = useState(null);
  const [optCategoryFilter, setOptCategoryFilter] = useState("");
  // Which half of the System Option tab is showing. People and Studios are
  // not here: each is a top-level Entity tab with its own branch below.
  const [optionsSubTab, setOptionsSubTab] = useState("options");

  // The people offered for deletion are the ones holding the selected type.
  // db.person carries every role a person holds, so this needs no extra fetch.
  const peopleOfType = db.person.filter((p) =>
    (p.roles || []).some((r) => r.role === personSubTab),
  );

  const [modal, setModal] = useState(null); // { type, target, cascadeOptions }
  const [cascadeChecked, setCascadeChecked] = useState(false);
  const [orphanSeriesChecked, setOrphanSeriesChecked] = useState(false);
  const [orphanFranchiseChecked, setOrphanFranchiseChecked] = useState(false);

  const loadDb = useCallback(async () => {
    try {
      const [
        aRes,
        colRes,
        fRes,
        sRes,
        oRes,
        amRes,
        mRes,
        tvRes,
        ctRes,
        mgRes,
        nvRes,
        cmRes,
        stRes,
        peRes,
        chRes,
      ] =
        await Promise.all([
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
          fetch(endpoints.studio.list(), { credentials: "include" }),
          fetch(endpoints.person.list(), { credentials: "include" }),
          fetch(endpoints.character.list(), { credentials: "include" }),
        ]);
      const [a, col, f, s, o, am, mv, tv, ct, mg, nv, cm, st, pe, ch] = await Promise.all([
        aRes.json(),
        colRes.json(),
        fRes.json(),
        sRes.json(),
        oRes.json(),
        amRes.json(),
        mRes.json(),
        tvRes.json(),
        ctRes.json(),
        mgRes.json(),
        nvRes.json(),
        cmRes.json(),
        stRes.json(),
        peRes.json(),
        chRes.json(),
      ]);
      setDb({
        anime: a,
        "anime-movie": am,
        movie: mv,
        "tv-show": tv,
        cartoon: ct,
        manga: mg,
        novel: nv,
        comic: cm,
        collection: col,
        franchise: f,
        series: s,
        options: o,
        studio: st,
        person: pe,
        character: ch,
      });
    } catch {
      showToast("error", "Database load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDb();
  }, [loadDb]);

  function getFranchiseTitle(id) {
    if (!id) return "Standalone";
    const f = db.franchise.find((x) => x.system_id === id);
    return f ? getDisplayTitle(f, "franchise") : "Unknown";
  }
  function getSeriesTitle(id) {
    if (!id) return "No Series";
    const s = db.series.find((x) => x.system_id === id);
    return s ? getDisplayTitle(s, "series") : "Unknown";
  }

  function initDelete(type, item) {
    const t = { type, item };
    setCascadeChecked(false);
    setOrphanSeriesChecked(false);
    setOrphanFranchiseChecked(false);
    setModal(t);
  }

  async function executeDirectDelete(type, item) {
    setDeleting(true);
    try {
      if (type === "franchise") {
        await deleteChildren("franchise_id", item.system_id);
        for (const s of db.series.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/series/${s.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (type === "series") {
        await deleteChildren("series_id", item.system_id);
      }
      const res = await fetch(`/api/${type}/${item.system_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to delete ${type}`);
      setSelectedFranchise(null);
      setSelectedSeries(null);
      showToast("success", "Deletion successful");
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeStudioDelete(item) {
    setDeleting(true);
    try {
      const res = await fetch(endpoints.studio.remove(item.system_id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete studio");
      setSelectedStudio(null);
      setStudioConfirm(false);
      showToast("success", "Deletion successful");
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executePersonDelete(item) {
    setDeleting(true);
    try {
      // The count the confirmation showed rides along: the API answers 409 if
      // it moved while the dialog was open, so the deletion that happens is
      // the one the admin agreed to.
      const res = await fetch(
        endpoints.person.remove(item.system_id, item.credit_count),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to delete person");
      }
      setSelectedPerson(null);
      setPersonConfirm(false);
      showToast("success", "Deletion successful");
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executePersonMerge() {
    if (!selectedPerson || !personMergeTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        endpoints.person.merge(personMergeTarget.system_id),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: selectedPerson.system_id }),
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to merge people");
      const data = await res.json();
      setSelectedPerson(null);
      setPersonMergeMode(false);
      setPersonMergeTarget(null);
      showToast("success", `Merged - ${data.credits_moved} credit(s) moved.`);
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeCharacterDelete(item) {
    setDeleting(true);
    try {
      // The casting count the confirmation showed rides along: the API
      // answers 409 if it moved while the dialog was open (?castings=N, not
      // ?credits=N - a character's history is castings, not credits), so
      // the deletion that happens is the one the admin agreed to.
      const res = await fetch(
        endpoints.character.remove(item.system_id, item.casting_count),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Surfaced verbatim rather than a generic failure: a 409 here means
        // the casting count moved underneath the admin, and the message
        // tells them to reload and confirm again against the new count.
        throw new Error(body.detail || "Failed to delete character");
      }
      setSelectedCharacter(null);
      setCharacterConfirm(false);
      showToast("success", "Deletion successful");
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeCharacterMerge() {
    if (!selectedCharacter || !characterMergeTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        endpoints.character.merge(characterMergeTarget.system_id),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: selectedCharacter.system_id }),
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to merge characters");
      const data = await res.json();
      setSelectedCharacter(null);
      setCharacterMergeMode(false);
      setCharacterMergeTarget(null);
      showToast(
        "success",
        `Merged - ${data.castings_moved} casting(s) moved.`,
      );
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeStudioMerge() {
    if (!selectedStudio || !studioMergeTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        endpoints.studio.merge(studioMergeTarget.system_id),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: selectedStudio.system_id }),
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to merge studios");
      const data = await res.json();
      setSelectedStudio(null);
      setStudioMergeMode(false);
      setStudioMergeTarget(null);
      showToast(
        "success",
        `Merged - ${data.credits_moved} credit(s) moved.`,
      );
      await loadDb();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function executeDelete() {
    if (!modal) return;
    const { type, item } = modal;
    setDeleting(true);
    try {
      if (type === "options") {
        const res = await fetch(`/api/options/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete option");
        setSelectedOption(null);
        showToast("success", "Option deleted");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "anime-movie") {
        const res = await fetch(`/api/anime-movie/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete anime movie");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedAnimeMovie(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "movie") {
        const res = await fetch(`/api/movies/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete movie");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedMovie(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "tv-show") {
        const res = await fetch(`/api/tv-shows/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete TV show");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedTvShow(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "cartoon") {
        const res = await fetch(`/api/cartoon/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete cartoon");
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedCartoon(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "manga") {
        const res = await fetch(`/api/manga/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete manga");
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedManga(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "novel") {
        const res = await fetch(`/api/novel/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete novel");
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedNovel(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      if (type === "comic") {
        const res = await fetch(`/api/comic/${item.system_id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete comic");
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        setSelectedComic(null);
        showToast("success", "Deletion successful");
        await loadDb();
        setModal(null);
        return;
      }

      // Cascade deletions
      if (type === "franchise" && cascadeChecked) {
        await deleteChildren("franchise_id", item.system_id);
        for (const s of db.series.filter(
          (x) => x.franchise_id === item.system_id,
        )) {
          await fetch(`/api/series/${s.system_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (type === "series" && cascadeChecked) {
        await deleteChildren("series_id", item.system_id);
      }

      // Primary deletion
      const res = await fetch(`/api/${type}/${item.system_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to delete ${type}`);

      // Orphan cleanup
      if (type === "anime") {
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      } else if (
        type === "series" &&
        orphanFranchiseChecked &&
        item.franchise_id
      ) {
        await fetch(`/api/franchise/${item.franchise_id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }

      setSelectedAnime(null);
      setSelectedFranchise(null);
      setSelectedSeries(null);
      showToast("success", "Deletion successful");
      await loadDb();
      setModal(null);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setDeleting(false);
    }
  }

  const optCategories = [...new Set(db.options.map((o) => o.category))].sort();
  const filteredOptions = optCategoryFilter
    ? db.options.filter((o) => o.category === optCategoryFilter)
    : db.options;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <i className="fas fa-spinner fa-spin text-brand text-3xl"></i>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text flex items-center gap-2">
          <i className="fas fa-trash-alt text-danger/70"></i> Delete Entry
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Permanently remove records from the database
        </p>
      </div>

      {/* Tabs */}
      <AdminTabBar
        tabs={ADMIN_TABS}
        activeTab={tab}
        onSelect={(key) => {
          setTab(key);
          setSelectedAnime(null);
          setSelectedAnimeMovie(null);
          setSelectedMovie(null);
          setSelectedTvShow(null);
          setSelectedCartoon(null);
          setSelectedManga(null);
          setSelectedNovel(null);
          setSelectedComic(null);
          setSelectedFranchise(null);
          setSelectedSeries(null);
          setSelectedOption(null);
          setSelectedStudio(null);
          setStudioConfirm(false);
          setStudioMergeMode(false);
          setStudioMergeTarget(null);
        }}
      />

      {/* QUOTE TAB — bypasses the per-type search/confirm pattern */}
      {tab === "quote" && <QuoteManageTab mode="delete" />}

      {/* MEME TAB — bypasses the per-type search/confirm pattern */}
      {tab === "meme" && <MemeManageTab mode="delete" />}

      {/* ANIME TAB */}
      {tab === "anime" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search anime to delete..."
              items={db.anime}
              type="anime"
              onSelect={setSelectedAnime}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "anime")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.airing_type || "TV"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedAnime && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedAnime.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedAnime, "anime")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedAnime.anime_name_en ||
                      selectedAnime.anime_name_roman ||
                      "-"}
                  </p>
                  {selectedAnime.anime_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedAnime.anime_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnime.airing_type || "TV"}
                    </span>
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnime.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedAnime.franchise_id)} /{" "}
                    {getSeriesTitle(selectedAnime.series_id)}
                  </p>
                  {selectedAnime.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedAnime.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedAnime.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAnime(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("anime", selectedAnime)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ANIME MOVIE TAB */}
      {tab === "anime-movie" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search anime movie to delete..."
              items={db["anime-movie"]}
              type="anime-movie"
              onSelect={setSelectedAnimeMovie}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "anime-movie")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_date_jp || item.release_date_tw || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedAnimeMovie && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedAnimeMovie.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedAnimeMovie, "anime-movie")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedAnimeMovie.anime_movie_name_en ||
                      selectedAnimeMovie.anime_movie_name_roman ||
                      "-"}
                  </p>
                  {selectedAnimeMovie.anime_movie_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedAnimeMovie.anime_movie_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnimeMovie.airing_status || "Unknown"}
                    </span>
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedAnimeMovie.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedAnimeMovie.franchise_id)}
                  </p>
                  {selectedAnimeMovie.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedAnimeMovie.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedAnimeMovie.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedAnimeMovie(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      initDelete("anime-movie", selectedAnimeMovie)
                    }
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MOVIE TAB */}
      {tab === "movie" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search movie to delete..."
              items={db.movie}
              type="movie"
              onSelect={setSelectedMovie}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "movie")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_date_usa || item.release_date_tw || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedMovie && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedMovie.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedMovie, "movie")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedMovie.movie_name_en || "-"}
                  </p>
                  {selectedMovie.movie_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedMovie.movie_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedMovie.movie_type && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedMovie.movie_type}
                      </span>
                    )}
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedMovie.airing_status || "Unknown"}
                    </span>
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedMovie.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedMovie.franchise_id)}
                    {selectedMovie.series_id &&
                      ` / ${getSeriesTitle(selectedMovie.series_id)}`}
                  </p>
                  {selectedMovie.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedMovie.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedMovie.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMovie(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("movie", selectedMovie)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TV SHOW TAB */}
      {tab === "tv-show" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search TV show to delete..."
              items={db["tv-show"]}
              type="tv-show"
              onSelect={setSelectedTvShow}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "tv-show")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)}
                    {item.season_part ? ` · ${item.season_part}` : ""}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedTvShow && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedTvShow.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedTvShow, "tv-show")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedTvShow.tv_name_en || "-"}
                  </p>
                  {selectedTvShow.tv_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedTvShow.tv_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedTvShow.airing_type && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedTvShow.airing_type}
                      </span>
                    )}
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedTvShow.airing_status || "Unknown"}
                    </span>
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedTvShow.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedTvShow.franchise_id)}
                    {selectedTvShow.series_id &&
                      ` / ${getSeriesTitle(selectedTvShow.series_id)}`}
                    {selectedTvShow.season_part &&
                      ` · ${selectedTvShow.season_part}`}
                  </p>
                  {selectedTvShow.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedTvShow.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedTvShow.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTvShow(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("tv-show", selectedTvShow)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARTOON TAB */}
      {tab === "cartoon" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search cartoon to delete..."
              items={db.cartoon}
              type="cartoon"
              onSelect={setSelectedCartoon}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "cartoon")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.airing_type || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedCartoon && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedCartoon.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedCartoon, "cartoon")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedCartoon.cartoon_name_en || "-"}
                  </p>
                  {selectedCartoon.cartoon_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedCartoon.cartoon_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedCartoon.airing_status || "Unknown"}
                    </span>
                    <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedCartoon.watching_status || "Unset"}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedCartoon.franchise_id)}
                    {selectedCartoon.series_id &&
                      ` / ${getSeriesTitle(selectedCartoon.series_id)}`}
                    {selectedCartoon.season_part &&
                      ` · ${selectedCartoon.season_part}`}
                  </p>
                  {selectedCartoon.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedCartoon.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedCartoon.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCartoon(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("cartoon", selectedCartoon)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANGA TAB */}
      {tab === "manga" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search manga to delete..."
              items={db.manga}
              type="manga"
              onSelect={setSelectedManga}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "manga")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)} ·{" "}
                    {item.release_date || "—"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedManga && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedManga.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedManga, "manga")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedManga.manga_name_en || "-"}
                  </p>
                  {selectedManga.manga_name_jp && (
                    <p className="text-xs text-text-faint">
                      {selectedManga.manga_name_jp}
                    </p>
                  )}
                  {selectedManga.manga_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedManga.manga_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedManga.reading_status && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedManga.reading_status}
                      </span>
                    )}
                    {selectedManga.region && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedManga.region}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedManga.franchise_id)}
                    {selectedManga.series_id &&
                      ` / ${getSeriesTitle(selectedManga.series_id)}`}
                  </p>
                  {selectedManga.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedManga.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedManga.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedManga(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("manga", selectedManga)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NOVEL TAB */}
      {tab === "novel" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search novel to delete..."
              items={db.novel}
              type="novel"
              onSelect={setSelectedNovel}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "novel")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)}
                    {item.type ? ` · ${item.type}` : ""}
                    {item.release_date ? ` · ${item.release_date}` : ""}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedNovel && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedNovel.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedNovel, "novel")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedNovel.novel_name_en || "-"}
                  </p>
                  {selectedNovel.novel_name_jp && (
                    <p className="text-xs text-text-faint">
                      {selectedNovel.novel_name_jp}
                    </p>
                  )}
                  {selectedNovel.novel_name_alt && (
                    <p className="text-xs text-text-faint">
                      {selectedNovel.novel_name_alt}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedNovel.type && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.type}
                      </span>
                    )}
                    {selectedNovel.reading_status && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.reading_status}
                      </span>
                    )}
                    {selectedNovel.region && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedNovel.region}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedNovel.franchise_id)}
                    {selectedNovel.series_id &&
                      ` / ${getSeriesTitle(selectedNovel.series_id)}`}
                  </p>
                  {selectedNovel.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedNovel.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedNovel.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedNovel(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("novel", selectedNovel)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMIC TAB */}
      {tab === "comic" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search comic to delete..."
              items={db.comic}
              type="comic"
              onSelect={setSelectedComic}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "comic")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getFranchiseTitle(item.franchise_id)}
                    {item.comic_type ? ` · ${item.comic_type}` : ""}
                    {item.release_date ? ` · ${item.release_date}` : ""}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedComic && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img
                  src={getCoverUrl(selectedComic.cover_image_file)}
                  className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-text text-base truncate">
                    {getDisplayTitle(selectedComic, "comic")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {selectedComic.volume_label || "-"}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selectedComic.comic_type && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedComic.comic_type}
                      </span>
                    )}
                    {selectedComic.publisher && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedComic.publisher}
                      </span>
                    )}
                    {selectedComic.reading_status && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedComic.reading_status}
                      </span>
                    )}
                    {(selectedComic.issue_fin != null ||
                      selectedComic.issue_total != null) && (
                      <span className="bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                        {selectedComic.issue_fin ?? 0} /{" "}
                        {selectedComic.issue_total ?? "?"} ISSUES
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedComic.franchise_id)}
                    {selectedComic.series_id &&
                      ` / ${getSeriesTitle(selectedComic.series_id)}`}
                  </p>
                  {selectedComic.remark && (
                    <p className="text-xs italic text-text-faint mt-1">
                      {selectedComic.remark}
                    </p>
                  )}
                  <p className="text-xs font-mono text-text-faint">
                    {selectedComic.system_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedComic(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() => initDelete("comic", selectedComic)}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                  >
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FRANCHISE TAB */}
      {tab === "franchise" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search franchise to delete..."
              items={db.franchise}
              type="franchise"
              onSelect={setSelectedFranchise}
              renderItem={(item) => {
                const fid = item.system_id;
                const counts = [
                  {
                    label: "series",
                    n: db.series.filter((s) => s.franchise_id === fid).length,
                  },
                  {
                    label: "anime",
                    n: db.anime.filter((a) => a.franchise_id === fid).length,
                  },
                  {
                    label: "anime movie",
                    n: db["anime-movie"].filter((m) => m.franchise_id === fid)
                      .length,
                  },
                  {
                    label: "movie",
                    n: db.movie.filter((m) => m.franchise_id === fid).length,
                  },
                  {
                    label: "TV show",
                    n: db["tv-show"].filter((t) => t.franchise_id === fid)
                      .length,
                  },
                  {
                    label: "cartoon",
                    n: db.cartoon.filter((c) => c.franchise_id === fid).length,
                  },
                  {
                    label: "manga",
                    n: db.manga.filter((m) => m.franchise_id === fid).length,
                  },
                  {
                    label: "novel",
                    n: db.novel.filter((n) => n.franchise_id === fid).length,
                  },
                  {
                    label: "comic",
                    n: db.comic.filter((c) => c.franchise_id === fid).length,
                  },
                ].filter((x) => x.n > 0);
                return (
                  <div>
                    <div className="font-bold text-text text-sm">
                      {getDisplayTitle(item, "franchise")}
                    </div>
                    <div className="text-[11px] text-text-faint">
                      {counts.length > 0
                        ? counts.map((x) => `${x.n} ${x.label}`).join(" · ")
                        : "No entries"}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {selectedFranchise && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-text text-base">
                    {getDisplayTitle(selectedFranchise, "franchise")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {[
                      selectedFranchise.franchise_name_en,
                      selectedFranchise.franchise_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No alt names"}
                  </p>
                  {selectedFranchise.franchise_type && (
                    <span className="inline-block mt-1 bg-surface-2 text-text-muted px-2 py-0.5 rounded text-xs font-bold">
                      {selectedFranchise.franchise_type}
                    </span>
                  )}
                  <p className="text-xs font-mono text-text-faint mt-1">
                    {selectedFranchise.system_id}
                  </p>
                  <p className="text-sm font-bold text-text-muted mt-2">
                    {[
                      { label: "Series", n: db.series.filter((s) => s.franchise_id === selectedFranchise.system_id).length },
                      { label: "Anime", n: db.anime.filter((a) => a.franchise_id === selectedFranchise.system_id).length },
                      { label: "Anime Movie", n: db["anime-movie"].filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "Movie", n: db.movie.filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "TV Show", n: db["tv-show"].filter((t) => t.franchise_id === selectedFranchise.system_id).length },
                      { label: "Cartoon", n: db.cartoon.filter((c) => c.franchise_id === selectedFranchise.system_id).length },
                      { label: "Manga", n: db.manga.filter((m) => m.franchise_id === selectedFranchise.system_id).length },
                      { label: "Novel", n: db.novel.filter((n) => n.franchise_id === selectedFranchise.system_id).length },
                      { label: "Comic", n: db.comic.filter((c) => c.franchise_id === selectedFranchise.system_id).length },
                    ]
                      .filter((x) => x.n > 0)
                      .map((x) => `${x.n} ${x.label}`)
                      .join(" · ") || "No entries"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedFranchise(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      executeDirectDelete("franchise", selectedFranchise)
                    }
                    disabled={deleting}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <i
                      className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                    ></i>
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SERIES TAB */}
      {tab === "series" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search series to delete..."
              items={db.series}
              type="series"
              onSelect={setSelectedSeries}
              renderItem={(item) => {
                const sid = item.system_id;
                const counts = [
                  {
                    label: "anime",
                    n: db.anime.filter((a) => a.series_id === sid).length,
                  },
                  {
                    label: "manga",
                    n: db.manga.filter((m) => m.series_id === sid).length,
                  },
                  {
                    label: "novel",
                    n: db.novel.filter((n) => n.series_id === sid).length,
                  },
                  {
                    label: "comic",
                    n: db.comic.filter((c) => c.series_id === sid).length,
                  },
                ].filter((x) => x.n > 0);
                return (
                  <div>
                    <div className="font-bold text-text text-sm">
                      {getDisplayTitle(item, "series")}
                    </div>
                    <div className="text-[11px] text-text-faint">
                      {getFranchiseTitle(item.franchise_id)}
                      {counts.length > 0 &&
                        " · " +
                          counts.map((x) => `${x.n} ${x.label}`).join(" · ")}
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {selectedSeries && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-text text-base">
                    {getDisplayTitle(selectedSeries, "series")}
                  </h3>
                  <p className="text-sm text-text-faint">
                    {[
                      selectedSeries.series_name_en,
                      selectedSeries.series_name_alt,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No alt names"}
                  </p>
                  <p className="text-xs font-mono text-text-faint mt-1">
                    {selectedSeries.system_id}
                  </p>
                  <p className="text-xs text-text-faint mt-1">
                    {getFranchiseTitle(selectedSeries.franchise_id)}
                  </p>
                  <p className="text-sm font-bold text-text-muted mt-1">
                    {[
                      { label: "Anime", n: db.anime.filter((a) => a.series_id === selectedSeries.system_id).length },
                      { label: "Manga", n: db.manga.filter((m) => m.series_id === selectedSeries.system_id).length },
                      { label: "Novel", n: db.novel.filter((n) => n.series_id === selectedSeries.system_id).length },
                      { label: "Comic", n: db.comic.filter((c) => c.series_id === selectedSeries.system_id).length },
                    ]
                      .filter((x) => x.n > 0)
                      .map((x) => `${x.n} ${x.label}`)
                      .join(" · ") || "No entries"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSeries(null)}
                    className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <button
                    onClick={() =>
                      executeDirectDelete("series", selectedSeries)
                    }
                    disabled={deleting}
                    className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <i
                      className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                    ></i>
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STUDIO TAB */}
      {tab === "studio" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search studio to delete..."
              items={db.studio}
              type="studio"
              onSelect={(item) => {
                setSelectedStudio(item);
                setStudioConfirm(false);
                setStudioMergeMode(false);
                setStudioMergeTarget(null);
              }}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "studio")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {item.credit_count} credit
                    {item.credit_count === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedStudio && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-text text-base">
                    {getDisplayTitle(selectedStudio, "studio")}
                  </h3>
                  <p className="text-xs font-mono text-text-faint mt-1">
                    {selectedStudio.system_id}
                  </p>
                  <p className="text-sm font-bold text-text-muted mt-1">
                    {selectedStudio.credit_count} credit
                    {selectedStudio.credit_count === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedStudio(null);
                    setStudioConfirm(false);
                    setStudioMergeMode(false);
                    setStudioMergeTarget(null);
                  }}
                  className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="bg-danger/10 border border-danger/40 rounded-xl p-3">
                <div className="text-xs font-bold text-danger">
                  <i className="fas fa-exclamation-triangle mr-1"></i>{" "}
                  Deleting destroys this studio's credit history
                </div>
                <div className="text-xs text-danger mt-0.5">
                  media_credit.studio_id is ON DELETE CASCADE: deleting this
                  studio permanently deletes its{" "}
                  {selectedStudio.credit_count} credit
                  {selectedStudio.credit_count === 1 ? "" : "s"} on every
                  entry it's linked to. If this studio is a duplicate of
                  another one, the correct action is Merge below, not
                  Delete.
                </div>
              </div>

              {!studioMergeMode ? (
                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    onClick={() => setStudioMergeMode(true)}
                    className="px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-bold hover:bg-brand/20 transition flex items-center gap-1"
                  >
                    <i className="fas fa-code-merge"></i> Merge Into
                    Another Studio
                  </button>
                  {!studioConfirm ? (
                    <button
                      onClick={() => setStudioConfirm(true)}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                    >
                      <i className="fas fa-trash-alt"></i> Delete
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setStudioConfirm(false)}
                        className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold text-text-muted hover:bg-surface-2 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => executeStudioDelete(selectedStudio)}
                        disabled={deleting}
                        className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                        ></i>
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <SearchBox
                    placeholder="Search studio to merge into..."
                    items={db.studio.filter(
                      (s) => s.system_id !== selectedStudio.system_id,
                    )}
                    type="studio"
                    onSelect={setStudioMergeTarget}
                    renderItem={(item) => (
                      <div>
                        <div className="font-bold text-text text-sm">
                          {getDisplayTitle(item, "studio")}
                        </div>
                        <div className="text-[11px] text-text-faint">
                          {item.credit_count} credit
                          {item.credit_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    )}
                  />
                  {studioMergeTarget && (
                    <div className="flex items-center justify-between bg-surface-2 rounded-xl p-3 gap-3">
                      <div className="text-xs text-text-muted">
                        Merge{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(selectedStudio, "studio")}
                        </span>{" "}
                        into{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(studioMergeTarget, "studio")}
                        </span>
                        . All {selectedStudio.credit_count} credit
                        {selectedStudio.credit_count === 1 ? "" : "s"} move
                        to the surviving studio; the duplicate is deleted.
                      </div>
                      <button
                        onClick={executeStudioMerge}
                        disabled={deleting}
                        className="shrink-0 px-3 py-1.5 bg-brand text-on-brand rounded-lg text-xs font-bold hover:bg-brand-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-code-merge"}`}
                        ></i>
                        {deleting ? "Merging..." : "Confirm Merge"}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setStudioMergeMode(false);
                      setStudioMergeTarget(null);
                    }}
                    className="text-xs text-text-faint hover:text-text-muted font-bold"
                  >
                    Cancel merge
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PERSON TAB — same shape as Studio above: delete cascades credit
          history away, so Merge is offered first and the delete carries the
          count the admin was shown (the API rejects a stale one with 409). */}
      {tab === "person" && (
        <div className="space-y-4">
          <PersonSubTabBar
            active={personSubTab}
            onSelect={(key) => {
              setPersonSubTab(key);
              setSelectedPerson(null);
              setPersonConfirm(false);
              setPersonMergeMode(false);
              setPersonMergeTarget(null);
            }}
          />
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search person to delete..."
              items={peopleOfType}
              type="person"
              onSelect={(item) => {
                setSelectedPerson(item);
                setPersonConfirm(false);
                setPersonMergeMode(false);
                setPersonMergeTarget(null);
              }}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "person")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {item.credit_count} credit
                    {item.credit_count === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedPerson && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-text text-base">
                    {getDisplayTitle(selectedPerson, "person")}
                  </h3>
                  <p className="text-xs font-mono text-text-faint mt-1">
                    {selectedPerson.system_id}
                  </p>
                  <p className="text-sm font-bold text-text-muted mt-1">
                    {selectedPerson.credit_count} credit
                    {selectedPerson.credit_count === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPerson(null);
                    setPersonConfirm(false);
                    setPersonMergeMode(false);
                    setPersonMergeTarget(null);
                  }}
                  className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="bg-danger/10 border border-danger/40 rounded-xl p-3">
                <div className="text-xs font-bold text-danger">
                  <i className="fas fa-exclamation-triangle mr-1"></i> Deleting
                  destroys this person's credit history
                </div>
                <div className="text-xs text-danger mt-0.5">
                  media_credit.person_id is ON DELETE CASCADE: deleting this
                  person permanently deletes their{" "}
                  {selectedPerson.credit_count} credit
                  {selectedPerson.credit_count === 1 ? "" : "s"} on every entry
                  they're linked to. If this person is a duplicate of someone
                  else, the correct action is Merge below, not Delete.
                </div>
              </div>

              {!personMergeMode ? (
                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    onClick={() => setPersonMergeMode(true)}
                    className="px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-bold hover:bg-brand/20 transition flex items-center gap-1"
                  >
                    <i className="fas fa-code-merge"></i> Merge Into Another
                    Person
                  </button>
                  {!personConfirm ? (
                    <button
                      onClick={() => setPersonConfirm(true)}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                    >
                      <i className="fas fa-trash-alt"></i> Delete
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setPersonConfirm(false)}
                        className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold text-text-muted hover:bg-surface-2 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => executePersonDelete(selectedPerson)}
                        disabled={deleting}
                        className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                        ></i>
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <SearchBox
                    placeholder="Search person to merge into..."
                    items={db.person.filter(
                      (p) => p.system_id !== selectedPerson.system_id,
                    )}
                    type="person"
                    onSelect={setPersonMergeTarget}
                    renderItem={(item) => (
                      <div>
                        <div className="font-bold text-text text-sm">
                          {getDisplayTitle(item, "person")}
                        </div>
                        <div className="text-[11px] text-text-faint">
                          {item.credit_count} credit
                          {item.credit_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    )}
                  />
                  {personMergeTarget && (
                    <div className="flex items-center justify-between bg-surface-2 rounded-xl p-3 gap-3">
                      <div className="text-xs text-text-muted">
                        Merge{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(selectedPerson, "person")}
                        </span>{" "}
                        into{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(personMergeTarget, "person")}
                        </span>
                        . All {selectedPerson.credit_count} credit
                        {selectedPerson.credit_count === 1 ? "" : "s"} move to
                        the surviving person; the duplicate is deleted.
                      </div>
                      <button
                        onClick={executePersonMerge}
                        disabled={deleting}
                        className="shrink-0 px-3 py-1.5 bg-brand text-on-brand rounded-lg text-xs font-bold hover:bg-brand-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-code-merge"}`}
                        ></i>
                        {deleting ? "Merging..." : "Confirm Merge"}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setPersonMergeMode(false);
                      setPersonMergeTarget(null);
                    }}
                    className="text-xs text-text-faint hover:text-text-muted font-bold"
                  >
                    Cancel merge
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CHARACTER TAB — same shape as Studio above: delete cascades casting
          history away, so Merge is offered first and the delete carries the
          count the admin was shown (the API rejects a stale one with 409).
          Unlike Person, a character holds no roles, so there is no
          PersonSubTabBar here. */}
      {tab === "character" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <SearchBox
              placeholder="Search character to delete..."
              items={db.character}
              type="character"
              onSelect={(item) => {
                setSelectedCharacter(item);
                setCharacterConfirm(false);
                setCharacterMergeMode(false);
                setCharacterMergeTarget(null);
              }}
              renderItem={(item) => (
                <div>
                  <div className="font-bold text-text text-sm">
                    {getDisplayTitle(item, "character")}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {item.casting_count} casting
                    {item.casting_count === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            />
          </div>

          {selectedCharacter && (
            <div className="bg-surface rounded-2xl border border-danger/40 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-text text-base">
                    {getDisplayTitle(selectedCharacter, "character")}
                  </h3>
                  <p className="text-xs font-mono text-text-faint mt-1">
                    {selectedCharacter.system_id}
                  </p>
                  <p className="text-sm font-bold text-text-muted mt-1">
                    {selectedCharacter.casting_count} casting
                    {selectedCharacter.casting_count === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCharacter(null);
                    setCharacterConfirm(false);
                    setCharacterMergeMode(false);
                    setCharacterMergeTarget(null);
                  }}
                  className="text-text-faint hover:text-text-muted w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="bg-danger/10 border border-danger/40 rounded-xl p-3">
                <div className="text-xs font-bold text-danger">
                  <i className="fas fa-exclamation-triangle mr-1"></i> Deleting
                  destroys this character's casting history
                </div>
                <div className="text-xs text-danger mt-0.5">
                  Deleting this character permanently deletes its{" "}
                  {selectedCharacter.casting_count} casting
                  {selectedCharacter.casting_count === 1 ? "" : "s"} on every
                  entry it's linked to. If this character is a duplicate of
                  another one, the correct action is Merge below, not Delete.
                </div>
              </div>

              {!characterMergeMode ? (
                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    onClick={() => setCharacterMergeMode(true)}
                    className="px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-bold hover:bg-brand/20 transition flex items-center gap-1"
                  >
                    <i className="fas fa-code-merge"></i> Merge Into Another
                    Character
                  </button>
                  {!characterConfirm ? (
                    <button
                      onClick={() => setCharacterConfirm(true)}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1"
                    >
                      <i className="fas fa-trash-alt"></i> Delete
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setCharacterConfirm(false)}
                        className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold text-text-muted hover:bg-surface-2 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() =>
                          executeCharacterDelete(selectedCharacter)
                        }
                        disabled={deleting}
                        className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-bold hover:bg-danger-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                        ></i>
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <SearchBox
                    placeholder="Search character to merge into..."
                    items={db.character.filter(
                      (c) => c.system_id !== selectedCharacter.system_id,
                    )}
                    type="character"
                    onSelect={setCharacterMergeTarget}
                    renderItem={(item) => (
                      <div>
                        <div className="font-bold text-text text-sm">
                          {getDisplayTitle(item, "character")}
                        </div>
                        <div className="text-[11px] text-text-faint">
                          {item.casting_count} casting
                          {item.casting_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    )}
                  />
                  {characterMergeTarget && (
                    <div className="flex items-center justify-between bg-surface-2 rounded-xl p-3 gap-3">
                      <div className="text-xs text-text-muted">
                        Merge{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(selectedCharacter, "character")}
                        </span>{" "}
                        into{" "}
                        <span className="font-bold text-text">
                          {getDisplayTitle(characterMergeTarget, "character")}
                        </span>
                        . All {selectedCharacter.casting_count} casting
                        {selectedCharacter.casting_count === 1 ? "" : "s"} move
                        to the surviving character; the duplicate is deleted.
                      </div>
                      <button
                        onClick={executeCharacterMerge}
                        disabled={deleting}
                        className="shrink-0 px-3 py-1.5 bg-brand text-on-brand rounded-lg text-xs font-bold hover:bg-brand-hover transition flex items-center gap-1 disabled:opacity-50"
                      >
                        <i
                          className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-code-merge"}`}
                        ></i>
                        {deleting ? "Merging..." : "Confirm Merge"}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setCharacterMergeMode(false);
                      setCharacterMergeTarget(null);
                    }}
                    className="text-xs text-text-faint hover:text-text-muted font-bold"
                  >
                    Cancel merge
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* OPTIONS TAB */}
      {tab === "options" && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <OptionSubTabBar
              active={optionsSubTab}
              onSelect={(key) => {
                setOptionsSubTab(key);
                // The selected category belongs to the sub-tab it was picked
                // on, so it cannot survive the switch.
                setOptCategoryFilter("");
              }}
            />
            <select
              className="border border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand w-full"
              value={optCategoryFilter}
              onChange={(e) => setOptCategoryFilter(e.target.value)}
            >
              <option value="">— Select Category —</option>
              {categoriesForSubTab(optCategories, optionsSubTab).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {optCategoryFilter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredOptions.length ? (
                filteredOptions.map((opt) => (
                  <div
                    key={opt.system_id}
                    className="bg-surface border border-border rounded-xl p-3 flex justify-between items-center group hover:bg-danger/10 hover:border-danger/40 transition shadow-sm"
                  >
                    <span className="font-bold text-text-muted text-sm truncate pr-2">
                      {opt.value}
                    </span>
                    <button
                      onClick={() => initDelete("options", opt)}
                      className="text-text-faint hover:text-danger transition w-7 h-7 flex items-center justify-center rounded-md bg-surface shadow-sm border border-border shrink-0"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center text-sm text-text-faint italic py-8 border border-dashed border-border-strong rounded-xl">
                  No options in this category.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 scale-100 transition-transform">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-trash-alt text-danger text-xl"></i>
              </div>
              <div className="text-xs font-bold text-text-faint uppercase tracking-widest">
                {modal.type.toUpperCase()}
                {modal.item.category ? ` (${modal.item.category})` : ""}
              </div>
              <h3 className="font-black text-text text-lg mt-1">
                {getDisplayTitle(modal.item, modal.type)}
              </h3>
              <p className="text-xs font-mono text-text-faint mt-1">
                {modal.item.system_id || modal.item.id}
              </p>
            </div>

            <div className="space-y-3 mb-5">
              {/* Collections never cascade: members simply become uncollected. */}
              {modal.type === "collection" && (
                <div className="bg-brand-soft border border-brand/30 rounded-xl p-3">
                  <div className="text-xs font-bold text-text">
                    <i className="fas fa-info-circle mr-1"></i> Member
                    franchises are NOT deleted
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {
                      db.franchise.filter(
                        (f) => f.collection_id === modal.item.system_id,
                      ).length
                    }{" "}
                    franchise(s) will simply become uncollected. Their entries
                    are untouched.
                  </div>
                </div>
              )}

              {/* Cascade option for franchise */}
              {modal.type === "franchise" &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.system_id,
                ).length > 0 ||
                  entriesIn("franchise_id", modal.item.system_id) > 0) && (
                  <label className="flex items-start gap-3 bg-danger/10 border border-danger/40 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cascadeChecked}
                      onChange={(e) => setCascadeChecked(e.target.checked)}
                      className="mt-0.5 rounded border-danger accent-danger w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-danger">
                        <i className="fas fa-trash-restore mr-1"></i> Cascade
                        Delete
                      </div>
                      <div className="text-xs text-danger mt-0.5">
                        Also delete{" "}
                        {
                          db.series.filter(
                            (s) => s.franchise_id === modal.item.system_id,
                          ).length
                        }{" "}
                        series and{" "}
                        {entriesIn("franchise_id", modal.item.system_id)}{" "}
                        media entries of every type.
                      </div>
                    </div>
                  </label>
                )}

              {/* Cascade option for series */}
              {modal.type === "series" &&
                entriesIn("series_id", modal.item.system_id) > 0 && (
                  <label className="flex items-start gap-3 bg-danger/10 border border-danger/40 rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cascadeChecked}
                      onChange={(e) => setCascadeChecked(e.target.checked)}
                      className="mt-0.5 rounded border-danger accent-danger w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-danger">
                        <i className="fas fa-trash-restore mr-1"></i> Cascade
                        Delete
                      </div>
                      <div className="text-xs text-danger mt-0.5">
                        Also delete{" "}
                        {entriesIn("series_id", modal.item.system_id)}{" "}
                        media entries of every type.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning */}
              {modal.type === "anime" &&
                modal.item.series_id &&
                entriesIn("series_id", modal.item.series_id) === 1 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Anime in
                        Series
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (anime) */}
              {modal.type === "anime" &&
                !modal.item.series_id &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Anime in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (series) */}
              {modal.type === "series" &&
                modal.item.franchise_id &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 1 &&
                standaloneEntriesIn(modal.item.franchise_id) === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Series in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (movie) */}
              {modal.type === "movie" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (tv-show) */}
              {modal.type === "tv-show" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (cartoon) */}
              {modal.type === "cartoon" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning (manga) */}
              {modal.type === "manga" &&
                modal.item.series_id &&
                entriesIn("series_id", modal.item.series_id) === 1 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Series
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (manga) */}
              {modal.type === "manga" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 ||
                  orphanSeriesChecked) && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning (novel) */}
              {modal.type === "novel" &&
                modal.item.series_id &&
                entriesIn("series_id", modal.item.series_id) === 1 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Series
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (novel) */}
              {modal.type === "novel" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 ||
                  orphanSeriesChecked) && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan series warning (comic) */}
              {modal.type === "comic" &&
                modal.item.series_id &&
                entriesIn("series_id", modal.item.series_id) === 1 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanSeriesChecked}
                      onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Series
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Series Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (comic) */}
              {modal.type === "comic" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                (db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 ||
                  orphanSeriesChecked) && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}

              {/* Orphan franchise warning (anime-movie) */}
              {modal.type === "anime-movie" &&
                modal.item.franchise_id &&
                entriesIn("franchise_id", modal.item.franchise_id) === 1 &&
                db.series.filter(
                  (s) => s.franchise_id === modal.item.franchise_id,
                ).length === 0 && (
                  <label className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orphanFranchiseChecked}
                      onChange={(e) =>
                        setOrphanFranchiseChecked(e.target.checked)
                      }
                      className="mt-0.5 rounded border-border-strong accent-brand w-4 h-4"
                    />
                    <div>
                      <div className="text-xs font-bold text-text">
                        <i className="fas fa-link mr-1"></i> Last Entry in
                        Franchise
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Delete the orphaned Franchise Hub too.
                      </div>
                    </div>
                  </label>
                )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-bold text-text-muted hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-danger text-white rounded-xl text-sm font-bold hover:bg-danger-hover transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <i
                  className={`fas ${deleting ? "fa-circle-notch fa-spin" : "fa-trash-alt"}`}
                ></i>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

