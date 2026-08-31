// Frontend: statistics page file for StatsFranchiseSummary.
import { useState } from "react";
import { Link } from "react-router-dom";
import { parseTypes } from "../../utils/media";
import {
  Button,
  Chip,
  Eyebrow,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";

const RATING_ORDER = ["S", "A+", "A", "B", "C", "D", "E", "F"];

// One hue, stepped by opacity: the top of the scale is the full brand and it
// fades toward the tail. Colour ranks, it does not name a category.
const MY_RATING_COLORS = {
  S: "bg-brand",
  "A+": "bg-brand/85",
  A: "bg-brand/70",
  B: "bg-brand/55",
  C: "bg-brand/40",
  D: "bg-brand/30",
  E: "bg-brand/20",
  F: "bg-border-strong",
  Unrated: "bg-surface-3",
};

const MAL_BUCKETS = [
  { key: "9+", min: 9, max: 11, color: "bg-brand" },
  { key: "8.7+", min: 8.7, max: 9, color: "bg-brand/85" },
  { key: "8.5+", min: 8.5, max: 8.7, color: "bg-brand/70" },
  { key: "8.2+", min: 8.2, max: 8.5, color: "bg-brand/55" },
  { key: "7.7+", min: 7.7, max: 8.2, color: "bg-brand/40" },
  { key: "7+", min: 7, max: 7.7, color: "bg-brand/30" },
  { key: "4+", min: 4, max: 7, color: "bg-brand/20" },
  { key: "<4", min: 0, max: 4, color: "bg-border-strong" },
];

function computeRatingRows(items) {
  const counts = {};
  RATING_ORDER.forEach((r) => {
    counts[r] = 0;
  });
  counts["Unrated"] = 0;
  items.forEach((item) => {
    const r = item.my_rating;
    if (r && RATING_ORDER.includes(r)) {
      counts[r]++;
    } else {
      counts["Unrated"]++;
    }
  });
  const ratedCount = RATING_ORDER.reduce((sum, r) => sum + counts[r], 0);
  return {
    rows: [...RATING_ORDER, "Unrated"].map((rating) => ({
      label: rating,
      color: MY_RATING_COLORS[rating] || "bg-surface-3",
      count: counts[rating],
      dim: rating === "Unrated",
    })),
    ratedCount,
  };
}

function RatingDistributionCard({ title, subtitle, rows, total }) {
  const maxCount = Math.max(...rows.filter((r) => !r.dim).map((r) => r.count), 1);
  return (
    <Slip title={title} actions={<Eyebrow>{subtitle}</Eyebrow>}>
      <div className="space-y-2.5">
        {rows.map(({ label, color, count, dim }) => {
          const pct = !dim && total > 0 ? Math.round((count / total) * 100) : null;
          const barWidth = (count / maxCount) * 100;
          return (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`w-16 text-right font-mono text-[11px] shrink-0 ${
                  dim ? "text-text-faint" : "text-text-muted"
                }`}
              >
                {label}
              </span>
              <div className="flex-1 bg-surface-2 h-3 overflow-hidden">
                <div
                  className={`h-3 transition-all duration-700 ${color}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs text-text tabular-nums shrink-0">
                {count}
              </span>
              <span className="w-10 text-right font-mono text-[11px] text-text-faint tabular-nums shrink-0">
                {pct !== null ? `${pct}%` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </Slip>
  );
}

const TH = "font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint font-normal px-4 py-2.5";

function CountCell({ value }) {
  return (
    <td className="px-4 py-2.5 text-center">
      <span
        className={`font-mono text-sm tabular-nums ${value > 0 ? "text-text" : "text-text-faint"}`}
      >
        {value}
      </span>
    </td>
  );
}

export default function StatsFranchiseSummary({
  franchises,
  allAnime,
  allAnimeMovies,
  allMovies,
  allManga,
  allNovel,
  seasonals,
  currentSeason,
}) {
  const [seasonalPage, setSeasonalPage] = useState(0);

  // Anime (ACG) franchise rating distribution — counts franchises, not entries
  const animeFranchises = franchises.filter((f) => {
    const types = parseTypes(f.franchise_type);
    return types.includes("ACG") || types.includes("Anime");
  });
  const { rows: animeRows, ratedCount: animeRatedCount } =
    computeRatingRows(animeFranchises);

  // MAL rating distribution (all anime)
  const malRatingRows = MAL_BUCKETS.map((b) => ({
    ...b,
    count: allAnime.filter(
      (a) =>
        a.mal_rating != null && a.mal_rating >= b.min && a.mal_rating < b.max,
    ).length,
  }));
  const totalWithMal = allAnime.filter((a) => a.mal_rating != null).length;
  const malRows = malRatingRows.map(({ key, count, color }) => ({
    label: key,
    color,
    count,
    dim: false,
  }));

  // Seasonal rating distribution
  const { rows: seasonalRows, ratedCount: seasonalRatedCount } =
    computeRatingRows(seasonals);

  // Entry-level distributions
  const { rows: mangaRows, ratedCount: mangaRatedCount } =
    computeRatingRows(allManga);
  const { rows: novelRows, ratedCount: novelRatedCount } =
    computeRatingRows(allNovel);
  const { rows: animeMovieRows, ratedCount: animeMovieRatedCount } =
    computeRatingRows(allAnimeMovies);
  const { rows: movieRows, ratedCount: movieRatedCount } =
    computeRatingRows(allMovies);

  // TV Show, Cartoon and Comic franchise distributions
  const tvFranchises = franchises.filter((f) =>
    parseTypes(f.franchise_type).includes("TV"),
  );
  const cartoonFranchises = franchises.filter((f) =>
    parseTypes(f.franchise_type).includes("Cartoon"),
  );
  const comicFranchises = franchises.filter((f) =>
    parseTypes(f.franchise_type).includes("Comic"),
  );
  const { rows: tvRows, ratedCount: tvRatedCount } =
    computeRatingRows(tvFranchises);
  const { rows: cartoonRows, ratedCount: cartoonRatedCount } =
    computeRatingRows(cartoonFranchises);
  const { rows: comicRows, ratedCount: comicRatedCount } =
    computeRatingRows(comicFranchises);

  return (
    <>
      {/* Block 2 — Rating Distribution */}
      <section>
        <header className="mb-6">
          <Eyebrow>Statistics</Eyebrow>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none mt-1">
            Rating distribution
          </h1>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <RatingDistributionCard
            title="My rating"
            subtitle="Anime franchises"
            rows={animeRows}
            total={animeRatedCount}
          />
          <RatingDistributionCard
            title="MAL rating"
            subtitle="All anime"
            rows={malRows}
            total={totalWithMal}
          />
          <RatingDistributionCard
            title="Seasonal rating"
            subtitle="Per season"
            rows={seasonalRows}
            total={seasonalRatedCount}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <RatingDistributionCard
            title="My rating"
            subtitle="All manga"
            rows={mangaRows}
            total={mangaRatedCount}
          />
          <RatingDistributionCard
            title="My rating"
            subtitle="All novels"
            rows={novelRows}
            total={novelRatedCount}
          />
          <RatingDistributionCard
            title="My rating"
            subtitle="All anime movies"
            rows={animeMovieRows}
            total={animeMovieRatedCount}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <RatingDistributionCard
            title="My rating"
            subtitle="All movies"
            rows={movieRows}
            total={movieRatedCount}
          />
          <RatingDistributionCard
            title="My rating"
            subtitle="TV show franchises"
            rows={tvRows}
            total={tvRatedCount}
          />
          <RatingDistributionCard
            title="My rating"
            subtitle="Cartoon franchises"
            rows={cartoonRows}
            total={cartoonRatedCount}
          />
          <RatingDistributionCard
            title="My rating"
            subtitle="Comic franchises"
            rows={comicRows}
            total={comicRatedCount}
          />
        </div>
      </section>

      {/* Block 2.5 — Anime Seasonal Overview */}
      <section>
        <header className="mb-6">
          <Eyebrow>Statistics</Eyebrow>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none mt-1">
            Anime seasonal overview
          </h1>
        </header>
        {seasonals.length === 0 ? (
          <div className="border border-dashed border-border-strong px-4 py-10 text-center">
            <p className="text-sm text-text-muted">No seasonal data yet.</p>
            <p className="text-xs text-text-faint mt-1">
              Seasons appear here once the seasonal records are filled.
            </p>
          </div>
        ) : (() => {
            const PAGE_SIZE = 12;
            const totalPages = Math.ceil(seasonals.length / PAGE_SIZE);
            const pageItems = seasonals.slice(
              seasonalPage * PAGE_SIZE,
              (seasonalPage + 1) * PAGE_SIZE,
            );
            return (
              <>
                <Slip padded={false} className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-strong">
                        <th className={`${TH} text-left`}>Season</th>
                        <th className={`${TH} text-center`}>Rating</th>
                        <th className={`${TH} text-center`}>Completed</th>
                        <th className={`${TH} text-center`}>Planned</th>
                        <th className={`${TH} text-center`}>Watching</th>
                        <th className={`${TH} text-center`}>Dropped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((s) => {
                        const isCurrent = s.seasonal === currentSeason;
                        return (
                          <tr
                            key={s.seasonal}
                            className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-2 ${isCurrent ? "bg-brand-soft" : ""}`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/seasonal/${encodeURIComponent(s.seasonal)}`}
                                  className={`font-mono text-sm hover:text-brand transition-colors ${isCurrent ? "text-brand" : "text-text"}`}
                                >
                                  {s.seasonal}
                                </Link>
                                {isCurrent && <Chip tone="brand">Current</Chip>}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {s.my_rating ? (
                                <RatingStamp rating={s.my_rating} />
                              ) : (
                                <span className="text-text-faint text-xs">—</span>
                              )}
                            </td>
                            <CountCell value={s.entry_completed} />
                            <CountCell value={s.entry_planned} />
                            <CountCell value={s.entry_watching} />
                            <CountCell value={s.entry_dropped} />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Slip>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <Button
                      size="sm"
                      onClick={() => setSeasonalPage((p) => p - 1)}
                      disabled={seasonalPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="font-mono text-[11px] text-text-faint">
                      Page {seasonalPage + 1} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setSeasonalPage((p) => p + 1)}
                      disabled={seasonalPage >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
      </section>
    </>
  );
}
