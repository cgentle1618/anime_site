import { Link } from "react-router-dom";
import { FALLBACK_SVG } from "../utils/anime";

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

export default function FranchiseCard({ franchise, coverUrl }) {
  const name =
    franchise.franchise_name_cn ||
    franchise.franchise_name_en ||
    franchise.franchise_name_roman ||
    "Unknown Franchise";
  const ratingCls = RATING_COLORS[franchise.my_rating] || "";
  const expectCls =
    EXPECTATION_STYLES[franchise.franchise_expectation] ||
    "bg-gray-100 text-gray-500 border-gray-200";

  const franchisePath =
    franchise.franchise_type === "Cartoon"
      ? `/franchise/cartoon/${franchise.system_id}`
      : `/franchise/${franchise.system_id}`;

  return (
    <Link
      to={franchisePath}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow group"
    >
      <div
        className="relative bg-gray-100 overflow-hidden"
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
          className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight"
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
