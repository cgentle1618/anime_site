// Frontend: card component file for CollectionCard.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, getDisplayName } from "../../utils/media";

const RATING_COLORS = {
  S: "bg-yellow-400 text-yellow-900",
  "A+": "bg-emerald-500 text-white",
  A: "bg-emerald-400 text-white",
  B: "bg-blue-400 text-white",
  C: "bg-gray-400 text-white",
  D: "bg-orange-400 text-white",
  E: "bg-red-400 text-white",
  F: "bg-red-600 text-white",
};

const EXPECTATION_STYLES = {
  Highest: "bg-purple-100 text-purple-700 border-purple-200",
  High: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function CollectionCard({ collection, coverUrl, memberCount }) {
  const name = getDisplayName(collection, "collection") || "Unknown Collection";
  const ratingCls = RATING_COLORS[collection.my_rating] || "";
  const expectCls =
    EXPECTATION_STYLES[collection.collection_expectation] ||
    "bg-gray-100 text-gray-500 border-gray-200";

  const collectionPath = `/collection/${collection.system_id}`;

  return (
    <Link
      to={collectionPath}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow group"
    >
      <div
        className="relative bg-gray-100 overflow-hidden"
        style={{ aspectRatio: "2/3" }}
      >
        {collection.my_rating && (
          <div
            className={`absolute top-0 left-0 ${ratingCls} text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 shadow-sm flex items-center gap-0.5`}
          >
            <i className="fas fa-star text-[8px]"></i>
            {collection.my_rating}
          </div>
        )}
        {memberCount > 0 && (
          <div className="absolute top-0 right-0 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-bl-lg z-10 flex items-center gap-1">
            <i className="fas fa-sitemap text-[8px]"></i>
            {memberCount}
          </div>
        )}
        <img
          src={coverUrl}
          alt="Cover"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <h3
          className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        <span className="text-[10px] text-gray-400 font-medium">
          {memberCount} {memberCount === 1 ? "franchise" : "franchises"}
        </span>
        {collection.collection_expectation && (
          <span
            className={`self-start text-[10px] font-bold px-1.5 py-0.5 rounded border ${expectCls}`}
          >
            {collection.collection_expectation}
          </span>
        )}
      </div>
    </Link>
  );
}
