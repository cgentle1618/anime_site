// Frontend: card component file for FranchiseCard.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, getDisplayName } from "../../utils/media";

const RATING_COLORS = {
  S: "bg-yellow-400 text-yellow-900",
  "A+": "bg-emerald-500 text-white",
  A: "bg-emerald-400 text-white",
  B: "bg-blue-400 text-white",
  C: "bg-text-faint text-white",
  D: "bg-orange-400 text-white",
  E: "bg-red-400 text-white",
  F: "bg-red-600 text-white",
};

const EXPECTATION_STYLES = {
  Highest: "bg-purple-100 text-purple-700 border-purple-200",
  High: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-surface-2 text-text-faint border-border",
};

export default function FranchiseCard({ franchise, coverUrl }) {
  const name = getDisplayName(franchise, "franchise") || "Unknown Franchise";
  const ratingCls = RATING_COLORS[franchise.my_rating] || "";
  const expectCls =
    EXPECTATION_STYLES[franchise.franchise_expectation] ||
    "bg-surface-2 text-text-faint border-border";

  const franchisePath = `/franchise/${franchise.system_id}`;

  return (
    <Link
      to={franchisePath}
      className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow group"
    >
      <div
        className="relative bg-surface-2 overflow-hidden"
        style={{ aspectRatio: "2/3" }}
      >
        {franchise.my_rating && (
          <div
            className={`absolute top-0 left-0 ${ratingCls} text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 shadow-sm flex items-center gap-0.5`}
          >
            <i className="fas fa-star text-[8px]"></i>
            {franchise.my_rating}
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
          className="font-bold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        {franchise.franchise_expectation && (
          <span
            className={`self-start text-[10px] font-bold px-1.5 py-0.5 rounded border ${expectCls}`}
          >
            {franchise.franchise_expectation}
          </span>
        )}
      </div>
    </Link>
  );
}

