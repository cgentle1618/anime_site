import BarChart from "./BarChart";

const MY_RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];
const MY_RATING_COLORS = {
  S: "bg-purple-500",
  "A+": "bg-amber-400",
  A: "bg-green-500",
  B: "bg-blue-400",
  C: "bg-orange-400",
  D: "bg-rose-400",
  E: "bg-red-600",
  F: "bg-gray-500",
};

const MAL_BUCKETS = [
  { key: "9+", min: 9, max: 11, color: "bg-purple-500" },
  { key: "8.7+", min: 8.7, max: 9, color: "bg-indigo-400" },
  { key: "8.5+", min: 8.5, max: 8.7, color: "bg-blue-400" },
  { key: "8.2+", min: 8.2, max: 8.5, color: "bg-cyan-400" },
  { key: "7.7+", min: 7.7, max: 8.2, color: "bg-green-400" },
  { key: "7+", min: 7, max: 7.7, color: "bg-yellow-400" },
  { key: "4+", min: 4, max: 7, color: "bg-orange-400" },
  { key: "<4", min: 0, max: 4, color: "bg-red-400" },
];

export default function RatingDistributionBlock({ animeData }) {
  const total = animeData.length;
  const malTotal = animeData.filter((a) => a.mal_rating != null).length;

  const myRatingData = MY_RATING_ORDER.map((r) => {
    const count = animeData.filter((a) => a.my_rating === r).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { key: r, count, pct, color: MY_RATING_COLORS[r] };
  });

  const malRatingData = MAL_BUCKETS.map((b) => {
    const count = animeData.filter(
      (a) =>
        a.mal_rating != null && a.mal_rating >= b.min && a.mal_rating < b.max,
    ).length;
    const pct = malTotal > 0 ? Math.round((count / malTotal) * 100) : 0;
    return { key: b.key, count, pct, color: b.color };
  });

  if (total === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-6 flex items-center gap-2">
        <i className="fas fa-chart-bar text-brand"></i>
        Rating Distribution
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <BarChart items={myRatingData} label="My Rating" />
        <BarChart items={malRatingData} label="MAL Rating" />
      </div>
    </div>
  );
}
