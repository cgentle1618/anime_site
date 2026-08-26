// Frontend: modify tab page file for Fav3x3ModifyTab.
import { useState, useMemo, useCallback } from "react";
import { parseTypes, FALLBACK_SVG } from "../../utils/media";
import { getDisplayName, getCoverForSlot } from "../../utils/statsUtils";
import { useToast } from "../../hooks/useToast";

const GRID_CONFIGS = [
  { title: "Favorite ACG Franchise", typeKey: "ACG", forType: null },
  { title: "Favorite Novel Franchise", typeKey: "Novel", forType: "Novel" },
  { title: "Favorite Movie Franchise", typeKey: "Movie", forType: "Movie" },
  { title: "Favorite TV Show Franchise", typeKey: "TV", forType: "TV" },
  { title: "Favorite Cartoon Franchise", typeKey: "Cartoon", forType: "Cartoon" },
  { title: "Favorite Comic Franchise", typeKey: "Comic", forType: "Comic" },
];

function buildDrafts(franchises) {
  const drafts = {};
  GRID_CONFIGS.forEach(({ typeKey }) => {
    drafts[typeKey] = {};
    franchises.forEach((f) => {
      const slot = f.type_slots?.[typeKey];
      if (slot >= 1 && slot <= 9) {
        drafts[typeKey][String(slot)] = f.system_id;
      }
    });
  });
  return drafts;
}

function computeOriginal(franchises, typeKey) {
  const original = {};
  franchises.forEach((f) => {
    const slot = f.type_slots?.[typeKey];
    if (slot >= 1 && slot <= 9) original[String(slot)] = f.system_id;
  });
  return original;
}

function cleanStr(s) {
  if (!s) return "";
  return s.toLowerCase().replace(/[\s\-:;,.'"!?()\[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}

function FranchisePickerModal({
  slot,
  title,
  currentFranchiseId,
  franchiseOptions,
  allEntriesByFranchise,
  forType,
  onSelect,
  onClear,
  onClose,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return franchiseOptions;
    const q = cleanStr(query);
    return franchiseOptions.filter((f) =>
      [
        f.franchise_name_cn,
        f.franchise_name_en,
        f.franchise_name_roman,
        f.franchise_name_jp,
        f.franchise_name_alt,
      ].some((n) => n && cleanStr(n).includes(q)),
    );
  }, [query, franchiseOptions]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-black text-gray-800">
            Assign to Slot {slot}
            <span className="text-gray-400 font-medium ml-2">— {title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-lg leading-none"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm"></i>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search franchise..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        {/* Franchise grid */}
        <div className="overflow-y-auto flex-1 p-4">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm font-medium py-8">
              No franchises found
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {filtered.map((f) => {
                const isSelected = f.system_id === currentFranchiseId;
                const coverUrl = getCoverForSlot(f, allEntriesByFranchise, forType);
                return (
                  <button
                    key={f.system_id}
                    type="button"
                    onClick={() => onSelect(f.system_id)}
                    className={`group flex flex-col focus:outline-none rounded-xl overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-brand shadow-md"
                        : "border-transparent hover:border-brand/50"
                    }`}
                  >
                    <div className="relative rounded-t-xl overflow-hidden bg-gray-100">
                      <div className="aspect-[3/4]">
                        <img
                          src={coverUrl}
                          alt={getDisplayName(f)}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = FALLBACK_SVG;
                          }}
                        />
                      </div>
                      {isSelected && (
                        <div className="absolute inset-0 bg-brand/20 flex items-center justify-center">
                          <i className="fas fa-check-circle text-brand text-xl"></i>
                        </div>
                      )}
                    </div>
                    <div className="px-1 py-1.5 bg-white">
                      <p className="text-[10px] font-bold text-gray-700 truncate leading-tight">
                        {getDisplayName(f)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {currentFranchiseId && (
          <div className="px-5 py-3 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 transition"
            >
              <i className="fas fa-times-circle text-xs"></i>
              Clear slot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotCard({ slot, franchise, coverUrl, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className="group flex flex-col w-full text-left focus:outline-none"
    >
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100 group-hover:border-brand transition-colors">
        <div className="aspect-[3/4]">
          <img
            src={coverUrl}
            alt={franchise ? getDisplayName(franchise) : ""}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
        {/* Hover edit overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <i className="fas fa-edit text-white text-base opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
        {/* Slot badge */}
        <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/60 rounded-md flex items-center justify-center">
          <span className="text-white text-[10px] font-black">{slot}</span>
        </div>
        {franchise && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pt-4 pb-1.5">
            <p className="text-white text-[10px] font-bold leading-tight truncate">
              {getDisplayName(franchise)}
            </p>
          </div>
        )}
        {!franchise && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-gray-200">{slot}</span>
            <span className="text-[10px] text-gray-300 font-medium mt-1">Empty</span>
          </div>
        )}
      </div>
    </button>
  );
}

function RankListItem({ slot, franchise, coverUrl, onDragStart, onDragOver, onDrop, isDragOver }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(slot));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(slot);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(slot);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const fromSlot = parseInt(e.dataTransfer.getData("text/plain"), 10);
        onDrop(fromSlot, slot);
      }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none ${
        isDragOver
          ? "border-brand bg-brand/10"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <span className="text-gray-300 text-sm leading-none shrink-0">⠿</span>
      <span className="text-[11px] font-black text-gray-400 w-4 shrink-0">{slot}</span>
      {franchise ? (
        <>
          <div className="w-7 h-9 rounded overflow-hidden shrink-0 border border-gray-100">
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = FALLBACK_SVG;
              }}
            />
          </div>
          <span className="text-xs font-bold text-gray-700 truncate min-w-0">
            {getDisplayName(franchise)}
          </span>
        </>
      ) : (
        <span className="text-xs text-gray-300 font-medium italic">Empty</span>
      )}
    </div>
  );
}

function GridEditor({
  typeKey,
  forType,
  title,
  draft,
  franchiseOptions,
  allFranchises,
  allEntriesByFranchise,
  isDirty,
  onSlotChange,
  onDragSwap,
  onSave,
  saving,
}) {
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [pickerSlot, setPickerSlot] = useState(null);

  const franchiseById = useMemo(() => {
    const m = {};
    allFranchises.forEach((f) => (m[f.system_id] = f));
    return m;
  }, [allFranchises]);

  function getCoverForFranchise(f) {
    if (!f) return FALLBACK_SVG;
    return getCoverForSlot(f, allEntriesByFranchise, forType);
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-th text-brand/70 text-sm"></i>
          {title}
        </h2>
        {isDirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-black hover:bg-brand/90 transition disabled:opacity-60"
          >
            {saving ? (
              <i className="fas fa-spinner fa-spin text-xs"></i>
            ) : (
              <i className="fas fa-save text-xs"></i>
            )}
            Save Grid
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left: 3×3 visual grid */}
        <div className="grid grid-cols-3 gap-2 max-w-xs shrink-0">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((slot) => {
            const fid = draft[String(slot)];
            const franchise = fid ? franchiseById[fid] : null;
            const coverUrl = franchise
              ? getCoverForFranchise(franchise)
              : FALLBACK_SVG;
            return (
              <SlotCard
                key={slot}
                slot={slot}
                franchise={franchise}
                coverUrl={coverUrl}
                onOpen={(s) => setPickerSlot(s)}
              />
            );
          })}
        </div>

        {/* Right: ranked drag list */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Drag to reorder
          </p>
          <div
            className="space-y-1"
            onDragLeave={() => setDragOverSlot(null)}
            onDrop={() => setDragOverSlot(null)}
          >
            {Array.from({ length: 9 }, (_, i) => i + 1).map((slot) => {
              const fid = draft[String(slot)];
              const franchise = fid ? franchiseById[fid] : null;
              const coverUrl = franchise
                ? getCoverForFranchise(franchise)
                : FALLBACK_SVG;
              return (
                <RankListItem
                  key={slot}
                  slot={slot}
                  franchise={franchise}
                  coverUrl={coverUrl}
                  isDragOver={dragOverSlot === slot}
                  onDragStart={() => setDragOverSlot(null)}
                  onDragOver={(s) => setDragOverSlot(s)}
                  onDrop={(fromSlot, toSlot) => {
                    setDragOverSlot(null);
                    onDragSwap(typeKey, fromSlot, toSlot);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Franchise picker modal */}
      {pickerSlot !== null && (
        <FranchisePickerModal
          slot={pickerSlot}
          title={title}
          currentFranchiseId={draft[String(pickerSlot)] || null}
          franchiseOptions={franchiseOptions}
          allEntriesByFranchise={allEntriesByFranchise}
          forType={forType}
          onSelect={(fid) => {
            onSlotChange(typeKey, pickerSlot, fid);
            setPickerSlot(null);
          }}
          onClear={() => {
            onSlotChange(typeKey, pickerSlot, null);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </section>
  );
}

export default function Fav3x3ModifyTab({
  allFranchises,
  setAllFranchises,
  allAnime,
  allAnimeMovies,
  allMovies,
  allTvShows,
  allCartoons,
  allMangas,
  allNovels,
  allComics,
}) {
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState(() => buildDrafts(allFranchises));
  const [savingByType, setSavingByType] = useState({});

  const allEntriesByFranchise = useMemo(() => {
    const allEntries = [
      ...(allAnime || []).map((e) => ({ ...e, _type: "anime" })),
      ...(allAnimeMovies || []).map((e) => ({ ...e, _type: "anime_movie" })),
      ...(allMovies || []).map((e) => ({ ...e, _type: "movie" })),
      ...(allTvShows || []).map((e) => ({ ...e, _type: "tv_show" })),
      ...(allCartoons || []).map((e) => ({ ...e, _type: "cartoon" })),
      ...(allMangas || []).map((e) => ({ ...e, _type: "manga" })),
      ...(allNovels || []).map((e) => ({ ...e, _type: "novel" })),
      ...(allComics || []).map((e) => ({ ...e, _type: "comic" })),
    ];
    const byFranchise = {};
    allEntries.forEach((e) => {
      const id = String(e.franchise_id);
      if (!byFranchise[id]) byFranchise[id] = [];
      byFranchise[id].push(e);
    });
    return byFranchise;
  }, [allAnime, allAnimeMovies, allMovies, allTvShows, allCartoons, allMangas, allNovels, allComics]);

  const franchiseOptionsByType = useMemo(() => {
    const result = {};
    GRID_CONFIGS.forEach(({ typeKey }) => {
      result[typeKey] = allFranchises
        .filter((f) => parseTypes(f.franchise_type).includes(typeKey))
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    });
    return result;
  }, [allFranchises]);

  const isDirtyByType = useMemo(() => {
    const result = {};
    GRID_CONFIGS.forEach(({ typeKey }) => {
      const original = computeOriginal(allFranchises, typeKey);
      result[typeKey] =
        JSON.stringify(drafts[typeKey] || {}) !== JSON.stringify(original);
    });
    return result;
  }, [drafts, allFranchises]);

  const handleSlotChange = useCallback((typeKey, slot, franchiseId) => {
    setDrafts((prev) => {
      const grid = { ...prev[typeKey] };
      if (franchiseId) {
        Object.keys(grid).forEach((s) => {
          if (grid[s] === franchiseId && s !== String(slot)) delete grid[s];
        });
        grid[String(slot)] = franchiseId;
      } else {
        delete grid[String(slot)];
      }
      return { ...prev, [typeKey]: grid };
    });
  }, []);

  const handleDragSwap = useCallback((typeKey, fromSlot, toSlot) => {
    if (fromSlot === toSlot) return;
    setDrafts((prev) => {
      const grid = { ...prev[typeKey] };
      const a = grid[String(fromSlot)];
      const b = grid[String(toSlot)];
      if (b) grid[String(fromSlot)] = b;
      else delete grid[String(fromSlot)];
      if (a) grid[String(toSlot)] = a;
      else delete grid[String(toSlot)];
      return { ...prev, [typeKey]: grid };
    });
  }, []);

  async function handleSave(typeKey) {
    const draft = drafts[typeKey];
    const newSlotByFranchise = {};
    Object.entries(draft).forEach(([slot, fid]) => {
      if (fid) newSlotByFranchise[fid] = parseInt(slot, 10);
    });

    const changed = allFranchises.filter((f) => {
      const oldSlot = f.type_slots?.[typeKey] ?? undefined;
      const newSlot = newSlotByFranchise[f.system_id];
      return oldSlot !== newSlot;
    });

    if (changed.length === 0) return;

    setSavingByType((p) => ({ ...p, [typeKey]: true }));
    try {
      const results = await Promise.all(
        changed.map((f) => {
          const newSlot = newSlotByFranchise[f.system_id];
          const newTypeSlots = { ...(f.type_slots || {}) };
          if (newSlot) newTypeSlots[typeKey] = newSlot;
          else delete newTypeSlots[typeKey];
          return fetch(`/api/franchise/${f.system_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type_slots: Object.keys(newTypeSlots).length ? newTypeSlots : null,
            }),
            credentials: "include",
          }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Save failed")),
          );
        }),
      );
      setAllFranchises((prev) =>
        prev.map((f) => {
          const updated = results.find((r) => r.system_id === f.system_id);
          return updated || f;
        }),
      );
      setDrafts((prev) => ({
        ...prev,
        [typeKey]: computeOriginal(
          allFranchises.map((f) => {
            const updated = results.find((r) => r.system_id === f.system_id);
            return updated || f;
          }),
          typeKey,
        ),
      }));
      showToast("success", "Saved.");
    } catch {
      showToast("error", "Save failed.");
    } finally {
      setSavingByType((p) => ({ ...p, [typeKey]: false }));
    }
  }

  return (
    <div className="space-y-6">
      {GRID_CONFIGS.map(({ typeKey, forType, title }) => (
        <GridEditor
          key={typeKey}
          typeKey={typeKey}
          forType={forType}
          title={title}
          draft={drafts[typeKey] || {}}
          franchiseOptions={franchiseOptionsByType[typeKey] || []}
          allFranchises={allFranchises}
          allEntriesByFranchise={allEntriesByFranchise}
          isDirty={isDirtyByType[typeKey]}
          onSlotChange={handleSlotChange}
          onDragSwap={handleDragSwap}
          onSave={() => handleSave(typeKey)}
          saving={!!savingByType[typeKey]}
        />
      ))}
    </div>
  );
}

