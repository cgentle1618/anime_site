// Frontend: statistics page file for StatsFavoriteGrids.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, parseTypes } from "../../utils/media";
import { getDisplayName, getCoverForSlot } from "../../utils/statsUtils";

const GRID_CONFIGS = [
  { title: "Favorite ACG Franchise", typeKey: "ACG", forType: null },
  { title: "Favorite Novel Franchise", typeKey: "Novel", forType: "Novel" },
  { title: "Favorite Movie Franchise", typeKey: "Movie", forType: "Movie" },
  { title: "Favorite TV Show Franchise", typeKey: "TV", forType: "TV" },
  {
    title: "Favorite Cartoon Franchise",
    typeKey: "Cartoon",
    forType: "Cartoon",
  },
  {
    title: "Favorite Comic Franchise",
    typeKey: "Comic",
    forType: "Comic",
  },
];

function getSlot(f, typeKey) {
  const fromTypeSlots = f.type_slots?.[typeKey];
  if (fromTypeSlots >= 1 && fromTypeSlots <= 9) return fromTypeSlots;
  return null;
}

function FavoriteGrid({
  title,
  franchises,
  allEntriesByFranchise,
  typeKey,
  forType,
}) {
  const slotMap = {};
  franchises.forEach((f) => {
    const slot = getSlot(f, typeKey);
    if (slot !== null) slotMap[slot] = f;
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-border">
        <h2 className="text-xl font-black text-text flex items-center gap-2">
          <i className="fas fa-th text-brand/70"></i>
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-sm">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((slot) => {
          const f = slotMap[slot];
          if (f) {
            const coverUrl = getCoverForSlot(f, allEntriesByFranchise, forType);
            return (
              <Link
                key={slot}
                to={`/franchise/${f.system_id}`}
                className="group relative rounded-xl overflow-hidden shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="aspect-[3/4] bg-surface-2">
                  <img
                    src={coverUrl}
                    alt={getDisplayName(f)}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = FALLBACK_SVG;
                    }}
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                  <p className="text-white text-xs font-bold leading-tight truncate">
                    {getDisplayName(f)}
                  </p>
                  {f.my_rating && (
                    <span className="text-yellow-300 text-[10px] font-black">
                      {f.my_rating}
                    </span>
                  )}
                </div>
                <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/50 rounded-md flex items-center justify-center">
                  <span className="text-white text-[10px] font-black">
                    {slot}
                  </span>
                </div>
              </Link>
            );
          }
          return (
            <div
              key={slot}
              className="aspect-[3/4] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center bg-surface-2/50"
            >
              <span className="text-2xl font-black text-text-faint/60">{slot}</span>
              <span className="text-[10px] text-text-faint/60 font-medium mt-1">
                Empty
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function StatsFavoriteGrids({
  franchises,
  allEntriesByFranchise,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
      {GRID_CONFIGS.map(({ title, typeKey, forType }) => {
        const filtered = franchises.filter((f) =>
          parseTypes(f.franchise_type).includes(typeKey),
        );
        return (
          <FavoriteGrid
            key={typeKey}
            title={title}
            franchises={filtered}
            allEntriesByFranchise={allEntriesByFranchise}
            typeKey={typeKey}
            forType={forType}
          />
        );
      })}
    </div>
  );
}

