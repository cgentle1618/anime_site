// Frontend: info component file for RatingDistributionBlock.
//
// Bars are one colour: the bucket label under each bar says what it is, so
// the hue does not have to (rule 5). Brand for the rated bars.
import BarChart from "../charts/BarChart";
import { Slip } from "../ui/primitives";

const MY_RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];
const BAR = "bg-brand";

const MAL_BUCKETS = [
  { key: "9+", min: 9, max: 11 },
  { key: "8.7+", min: 8.7, max: 9 },
  { key: "8.5+", min: 8.5, max: 8.7 },
  { key: "8.2+", min: 8.2, max: 8.5 },
  { key: "7.7+", min: 7.7, max: 8.2 },
  { key: "7+", min: 7, max: 7.7 },
  { key: "4+", min: 4, max: 7 },
  { key: "<4", min: 0, max: 4 },
];

export default function RatingDistributionBlock({ animeData }) {
  const total = animeData.length;
  const malTotal = animeData.filter((a) => a.mal_rating != null).length;

  const myRatingData = MY_RATING_ORDER.map((r) => {
    const count = animeData.filter((a) => a.my_rating === r).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { key: r, count, pct, color: BAR };
  });

  const malRatingData = MAL_BUCKETS.map((b) => {
    const count = animeData.filter(
      (a) =>
        a.mal_rating != null && a.mal_rating >= b.min && a.mal_rating < b.max,
    ).length;
    const pct = malTotal > 0 ? Math.round((count / malTotal) * 100) : 0;
    return { key: b.key, count, pct, color: BAR };
  });

  if (total === 0) return null;

  return (
    <Slip title="Rating distribution">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <BarChart items={myRatingData} label="My rating" />
        <BarChart items={malRatingData} label="MAL rating" />
      </div>
    </Slip>
  );
}
