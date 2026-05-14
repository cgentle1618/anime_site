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

function SlotCard({ slot, franchise, coverUrl, franchiseOptions, typeKey, onSelect }) {
  return (
    <div className="flex flex-col">
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
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
      <select
        className="mt-1 w-full text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand bg-white text-gray-700 font-medium truncate"
        value={franchise?.system_id || ""}
        onChange={(e) => onSelect(typeKey, slot, e.target.value || null)}
      >
        <option value="">— Empty —</option>
        {franchiseOptions.map((f) => (
          <option key={f.system_id} value={f.system_id}>
            {getDisplayName(f)}
          </option>
        ))}
      </select>
    </div>
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
                franchiseOptions={franchiseOptions}
                typeKey={typeKey}
                onSelect={onSlotChange}
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
    ];
    const byFranchise = {};
    allEntries.forEach((e) => {
      const id = String(e.franchise_id);
      if (!byFranchise[id]) byFranchise[id] = [];
      byFranchise[id].push(e);
    });
    return byFranchise;
  }, [allAnime, allAnimeMovies, allMovies, allTvShows, allCartoons, allMangas, allNovels]);

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
