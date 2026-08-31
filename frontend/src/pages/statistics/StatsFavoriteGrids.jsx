// Frontend: statistics page file for StatsFavoriteGrids.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, parseTypes } from "../../utils/media";
import { getDisplayName, getCoverForSlot } from "../../utils/statsUtils";
import { RatingStamp, Slip } from "../../components/ui/primitives";

const GRID_CONFIGS = [
  { title: "Favourite ACG franchises", typeKey: "ACG", forType: null },
  { title: "Favourite novel franchises", typeKey: "Novel", forType: "Novel" },
  { title: "Favourite movie franchises", typeKey: "Movie", forType: "Movie" },
  { title: "Favourite TV show franchises", typeKey: "TV", forType: "TV" },
  {
    title: "Favourite cartoon franchises",
    typeKey: "Cartoon",
    forType: "Cartoon",
  },
  {
    title: "Favourite comic franchises",
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
    <Slip title={title}>
      <div className="grid grid-cols-3 gap-3 max-w-sm">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((slot) => {
          const f = slotMap[slot];
          if (f) {
            const coverUrl = getCoverForSlot(f, allEntriesByFranchise, forType);
            return (
              <Link
                key={slot}
                to={`/franchise/${f.system_id}`}
                className="group relative overflow-hidden border border-border hover:border-text transition-colors"
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
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1.5">
                  <p className="text-white text-xs font-display leading-tight truncate">
                    {getDisplayName(f)}
                  </p>
                </div>
                <span className="absolute top-1.5 left-1.5 bg-ink text-ink-text font-mono text-[10px] px-1.5 py-0.5 leading-none">
                  {slot}
                </span>
                <RatingStamp
                  rating={f.my_rating}
                  className="absolute top-1.5 right-1.5"
                />
              </Link>
            );
          }
          return (
            <div
              key={slot}
              className="aspect-[3/4] border border-dashed border-border-strong flex flex-col items-center justify-center"
            >
              <span className="font-display text-2xl text-text-faint">{slot}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mt-1">
                Empty
              </span>
            </div>
          );
        })}
      </div>
    </Slip>
  );
}

export default function StatsFavoriteGrids({
  franchises,
  allEntriesByFranchise,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
