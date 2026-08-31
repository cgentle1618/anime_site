// Frontend: card component file for CollectionCard.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, getDisplayName } from "../../utils/media";
import { Chip, RatingStamp } from "../ui/primitives";

export default function CollectionCard({ collection, coverUrl, memberCount }) {
  const name = getDisplayName(collection, "collection") || "Unknown Collection";

  const collectionPath = `/collection/${collection.system_id}`;

  return (
    <Link
      to={collectionPath}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer group"
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            Collection
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <RatingStamp
            rating={collection.my_rating}
            size="sm"
            className="absolute top-1.5 right-1.5 z-10"
          />
          {memberCount > 0 && (
            <div className="absolute top-1 left-1 bg-black/60 text-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] leading-none z-10">
              {memberCount}
            </div>
          )}
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
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {memberCount} {memberCount === 1 ? "franchise" : "franchises"}
        </span>
        {collection.collection_expectation && (
          <Chip className="self-start">{collection.collection_expectation}</Chip>
        )}
      </div>
    </Link>
  );
}
