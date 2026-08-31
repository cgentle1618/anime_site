// Frontend: card component file for FranchiseCard.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, getDisplayName } from "../../utils/media";
import { Chip, RatingStamp } from "../ui/primitives";

export default function FranchiseCard({ franchise, coverUrl }) {
  const name = getDisplayName(franchise, "franchise") || "Unknown Franchise";

  const franchisePath = `/franchise/${franchise.system_id}`;

  return (
    <Link
      to={franchisePath}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer group"
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            Franchise
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <RatingStamp
            rating={franchise.my_rating}
            size="sm"
            className="absolute top-1.5 right-1.5 z-10"
          />
          <img
            src={coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        {franchise.franchise_expectation && (
          <Chip className="self-start">{franchise.franchise_expectation}</Chip>
        )}
      </div>
    </Link>
  );
}
