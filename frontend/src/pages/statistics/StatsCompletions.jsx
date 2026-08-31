// Frontend: statistics page file for StatsCompletions.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getCoverUrl,
  FALLBACK_SVG,
  COMPLETED_STATUSES,
} from "../../utils/media";
import { Button, Eyebrow, RatingStamp } from "../../components/ui/primitives";

export default function StatsCompletions({
  allAnime,
  allAnimeMovies,
  allMovies,
  allTVShows,
  allCartoons,
  allManga,
  allNovel,
  allComic,
  franchiseMap,
}) {
  const [completionsTab, setCompletionsTab] = useState("anime");
  const [groupPages, setGroupPages] = useState({
    TV: 0,
    Movie: 0,
    ONA: 0,
    Others: 0,
  });
  const [amCompletionPages, setAmCompletionPages] = useState({
    ghibli: 0,
    shinkai: 0,
    original: 0,
    adapted: 0,
    others: 0,
  });
  const [movieCompletionPages, setMovieCompletionPages] = useState({});
  const [tvCompletionPages, setTvCompletionPages] = useState({});
  const [cartoonCompletionPages, setCartoonCompletionPages] = useState({});
  const [mangaCompletionPages, setMangaCompletionPages] = useState({});
  const [novelCompletionPages, setNovelCompletionPages] = useState({});
  const [comicCompletionPages, setComicCompletionPages] = useState({});

  return (
    <section>
      <header className="mb-6">
        <Eyebrow>Statistics</Eyebrow>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none mt-1">
          Recent completions
        </h1>
      </header>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {[
          { key: "anime", label: "Anime" },
          { key: "anime-movie", label: "Anime movie" },
          { key: "movie", label: "Movie" },
          { key: "tv-show", label: "TV show" },
          { key: "cartoon", label: "Cartoon" },
          { key: "manga", label: "Manga" },
          { key: "novel", label: "Novel" },
          { key: "comic", label: "Comic" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCompletionsTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium border transition whitespace-nowrap ${
              completionsTab === tab.key
                ? "bg-brand border-brand text-on-brand"
                : "border-border-strong text-text-muted hover:border-text hover:text-text bg-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Anime tab */}
      {completionsTab === "anime" &&
        (() => {
          const AIRING_TYPE_ORDER = ["TV", "Movie", "ONA", "Others"];
          const completed = allAnime
            .filter(
              (a) =>
                COMPLETED_STATUSES.includes(a.watching_status) &&
                a.completed_at,
            )
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );

          const grouped = { TV: [], Movie: [], ONA: [], Others: [] };
          completed.forEach((a) => {
            const t = ["TV", "Movie", "ONA"].includes(a.airing_type)
              ? a.airing_type
              : "Others";
            grouped[t].push(a);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No completions recorded yet.
                </p>
                <p className="text-xs text-text-faint mt-1">
                  Completions are tracked when watching status is set to
                  Completed.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {AIRING_TYPE_ORDER.map((type) => {
                const items = grouped[type];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = groupPages[type];
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setGroupPages((prev) => ({ ...prev, [type]: p }));

                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {type}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((anime, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const franchise =
                          franchiseMap[String(anime.franchise_id)];
                        const coverUrl = getCoverUrl(anime.cover_image_file);
                        const name =
                          anime.anime_name_cn ||
                          anime.anime_name_en ||
                          anime.anime_name_roman ||
                          "—";
                        const franchiseName = franchise
                          ? franchise.franchise_name_cn ||
                            franchise.franchise_name_en ||
                            franchise.franchise_name_roman
                          : null;
                        const dateStr = new Date(
                          anime.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });

                        return (
                          <Link
                            key={anime.system_id}
                            to={`/anime/${anime.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={coverUrl}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {franchiseName && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {franchiseName}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={anime.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Anime Movie tab */}
      {completionsTab === "anime-movie" &&
        (() => {
          const AM_GROUPS = [
            { key: "ghibli", label: "吉卜力" },
            { key: "shinkai", label: "新海誠" },
            { key: "original", label: "原創動畫電影" },
            { key: "adapted", label: "改編動畫電影" },
            { key: "others", label: "其他" },
          ];
          const completed = allAnimeMovies
            .filter(
              (am) =>
                COMPLETED_STATUSES.includes(am.watching_status) &&
                am.completed_at,
            )
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const amGrouped = {
            ghibli: [],
            shinkai: [],
            original: [],
            adapted: [],
            others: [],
          };
          completed.forEach((am) => {
            const f = franchiseMap[String(am.franchise_id)];
            const fname = f?.franchise_name_cn || f?.franchise_name_en || "";
            if (fname === "吉卜力") amGrouped.ghibli.push(am);
            else if (fname === "新海誠") amGrouped.shinkai.push(am);
            else if (fname === "原創動畫電影") amGrouped.original.push(am);
            else if (fname === "改編動畫電影") amGrouped.adapted.push(am);
            else amGrouped.others.push(am);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No anime movie completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {AM_GROUPS.map(({ key, label }) => {
                const items = amGrouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = amCompletionPages[key];
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setAmCompletionPages((prev) => ({ ...prev, [key]: p }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((am, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const name =
                          am.anime_movie_name_cn ||
                          am.anime_movie_name_en ||
                          am.anime_movie_name_roman ||
                          "—";
                        const dateStr = new Date(
                          am.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={am.system_id}
                            to={`/anime-movie/${am.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(am.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {am.anime_movie_name_cn &&
                                am.anime_movie_name_en && (
                                  <p className="font-mono text-[11px] text-text-faint truncate">
                                    {am.anime_movie_name_en}
                                  </p>
                                )}
                            </div>
                            <RatingStamp rating={am.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Movie tab */}
      {completionsTab === "movie" &&
        (() => {
          const MOVIE_GROUPS = [
            { key: "disney", label: "Disney" },
            { key: "marvel", label: "Marvel" },
            { key: "others", label: "其他" },
          ];
          const completed = allMovies
            .filter(
              (m) =>
                COMPLETED_STATUSES.includes(m.watching_status) &&
                m.completed_at,
            )
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const grouped = { disney: [], marvel: [], others: [] };
          completed.forEach((m) => {
            const fEn =
              franchiseMap[String(m.franchise_id)]?.franchise_name_en || "";
            if (fEn.includes("Disney")) grouped.disney.push(m);
            else if (fEn.includes("Marvel")) grouped.marvel.push(m);
            else grouped.others.push(m);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No movie completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {MOVIE_GROUPS.map(({ key, label }) => {
                const items = grouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = movieCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setMovieCompletionPages((prev) => ({
                    ...prev,
                    [key]: p,
                  }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((movie, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const name =
                          movie.movie_name_cn ||
                          movie.movie_name_en ||
                          movie.movie_name_alt ||
                          "—";
                        const dateStr = new Date(
                          movie.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={movie.system_id}
                            to={`/movie/${movie.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(movie.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {movie.movie_name_cn && movie.movie_name_en && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {movie.movie_name_en}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={movie.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* TV Show tab */}
      {completionsTab === "tv-show" &&
        (() => {
          const TV_GROUPS = [
            { key: "disney", label: "Disney" },
            { key: "marvel", label: "Marvel" },
            { key: "others", label: "其他" },
          ];
          const completed = allTVShows
            .filter(
              (tv) =>
                COMPLETED_STATUSES.includes(tv.watching_status) &&
                tv.completed_at,
            )
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const grouped = { disney: [], marvel: [], others: [] };
          completed.forEach((tv) => {
            const fEn =
              franchiseMap[String(tv.franchise_id)]?.franchise_name_en || "";
            if (fEn.includes("Disney")) grouped.disney.push(tv);
            else if (fEn.includes("Marvel")) grouped.marvel.push(tv);
            else grouped.others.push(tv);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No TV show completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {TV_GROUPS.map(({ key, label }) => {
                const items = grouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = tvCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setTvCompletionPages((prev) => ({
                    ...prev,
                    [key]: p,
                  }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((tv, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const name =
                          tv.tv_name_cn ||
                          tv.tv_name_en ||
                          tv.tv_name_alt ||
                          "—";
                        const dateStr = new Date(
                          tv.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={tv.system_id}
                            to={`/tv-show/${tv.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(tv.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {tv.tv_name_cn && tv.tv_name_en && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {tv.tv_name_en}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={tv.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Cartoon tab */}
      {completionsTab === "cartoon" &&
        (() => {
          const CARTOON_GROUPS = [
            { key: "cartoon_network", label: "Cartoon Network" },
            { key: "disney", label: "Disney" },
            { key: "nickelodeon", label: "Nickelodeon" },
            { key: "adult_swim", label: "Adult Swim" },
            { key: "fox", label: "FOX" },
            { key: "hbo", label: "HBO" },
            { key: "others", label: "其他" },
          ];
          const completed = allCartoons
            .filter(
              (c) =>
                COMPLETED_STATUSES.includes(c.watching_status) &&
                c.completed_at,
            )
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const grouped = {
            cartoon_network: [],
            disney: [],
            nickelodeon: [],
            adult_swim: [],
            fox: [],
            hbo: [],
            others: [],
          };
          completed.forEach((c) => {
            const src = (c.source_official || "").toLowerCase();
            if (src.includes("cartoon network"))
              grouped.cartoon_network.push(c);
            else if (src.includes("disney")) grouped.disney.push(c);
            else if (src.includes("nickelodeon")) grouped.nickelodeon.push(c);
            else if (src.includes("adult swim")) grouped.adult_swim.push(c);
            else if (src.includes("fox")) grouped.fox.push(c);
            else if (src.includes("hbo")) grouped.hbo.push(c);
            else grouped.others.push(c);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No cartoon completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {CARTOON_GROUPS.map(({ key, label }) => {
                const items = grouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = cartoonCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setCartoonCompletionPages((prev) => ({
                    ...prev,
                    [key]: p,
                  }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((cartoon, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const name =
                          cartoon.cartoon_name_cn ||
                          cartoon.cartoon_name_en ||
                          cartoon.cartoon_name_alt ||
                          "—";
                        const dateStr = new Date(
                          cartoon.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={cartoon.system_id}
                            to={`/cartoon/${cartoon.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(cartoon.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {cartoon.cartoon_name_cn &&
                                cartoon.cartoon_name_en && (
                                  <p className="font-mono text-[11px] text-text-faint truncate">
                                    {cartoon.cartoon_name_en}
                                  </p>
                                )}
                            </div>
                            {cartoon.airing_type && (
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint shrink-0">
                                {cartoon.airing_type}
                              </span>
                            )}
                            <RatingStamp rating={cartoon.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Manga tab */}
      {completionsTab === "manga" &&
        (() => {
          const MANGA_GROUPS = [
            { key: "日漫", label: "日漫" },
            { key: "韓漫", label: "韓漫" },
            { key: "國漫", label: "國漫" },
            { key: "台漫", label: "台漫" },
            { key: "others", label: "Others" },
          ];
          const completed = allManga
            .filter((m) =>
                COMPLETED_STATUSES.includes(m.reading_status) &&
                m.completed_at)
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const mangaGrouped = {
            日漫: [],
            韓漫: [],
            國漫: [],
            台漫: [],
            others: [],
          };
          completed.forEach((m) => {
            const key = ["日漫", "韓漫", "國漫", "台漫"].includes(m.region)
              ? m.region
              : "others";
            mangaGrouped[key].push(m);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No manga completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {MANGA_GROUPS.map(({ key, label }) => {
                const items = mangaGrouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = mangaCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setMangaCompletionPages((prev) => ({ ...prev, [key]: p }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((m, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const franchise =
                          franchiseMap[String(m.franchise_id)];
                        const name =
                          m.manga_name_cn ||
                          m.manga_name_en ||
                          m.manga_name_roman ||
                          "—";
                        const franchiseName = franchise
                          ? franchise.franchise_name_cn ||
                            franchise.franchise_name_en ||
                            franchise.franchise_name_roman
                          : null;
                        const dateStr = new Date(
                          m.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={m.system_id}
                            to={`/manga/${m.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(m.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {franchiseName && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {franchiseName}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={m.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Novel tab */}
      {completionsTab === "novel" &&
        (() => {
          const NOVEL_GROUPS = [
            { key: "JP", label: "JP" },
            { key: "CN", label: "CN" },
            { key: "TW", label: "TW" },
            { key: "KR", label: "KR" },
            { key: "Western", label: "Western" },
            { key: "others", label: "Others" },
          ];
          const completed = allNovel
            .filter((n) =>
                COMPLETED_STATUSES.includes(n.reading_status) &&
                n.completed_at)
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );
          const novelGrouped = {
            JP: [],
            CN: [],
            TW: [],
            KR: [],
            Western: [],
            others: [],
          };
          completed.forEach((n) => {
            const key = ["JP", "CN", "TW", "KR", "Western"].includes(n.region)
              ? n.region
              : "others";
            novelGrouped[key].push(n);
          });

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No novel completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {NOVEL_GROUPS.map(({ key, label }) => {
                const items = novelGrouped[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = novelCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setNovelCompletionPages((prev) => ({ ...prev, [key]: p }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((n, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const franchise =
                          franchiseMap[String(n.franchise_id)];
                        const name =
                          n.novel_name_cn ||
                          n.novel_name_en ||
                          n.novel_name_roman ||
                          "—";
                        const franchiseName = franchise
                          ? franchise.franchise_name_cn ||
                            franchise.franchise_name_en ||
                            franchise.franchise_name_roman
                          : null;
                        const dateStr = new Date(
                          n.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={n.system_id}
                            to={`/novel/${n.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(n.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {franchiseName && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {franchiseName}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={n.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Comic tab */}
      {completionsTab === "comic" &&
        (() => {
          const completed = (allComic || [])
            .filter((c) =>
                COMPLETED_STATUSES.includes(c.reading_status) &&
                c.completed_at)
            .sort(
              (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
            );

          // Grouped by publisher, and the groups are derived rather than
          // declared. Every other tab groups on a closed set (airing type,
          // region), but `publisher` is filled from Comic Vine and is open -
          // a fixed list would silently drop the first run from a publisher
          // the collection had not seen before. Largest group first, with the
          // unattributed runs last so an empty field never leads.
          const byPublisher = {};
          completed.forEach((c) => {
            const key = (c.publisher || "").trim() || "Others";
            if (!byPublisher[key]) byPublisher[key] = [];
            byPublisher[key].push(c);
          });
          const COMIC_GROUPS = Object.keys(byPublisher)
            .sort((a, b) => {
              if (a === "Others") return 1;
              if (b === "Others") return -1;
              const sizeDiff = byPublisher[b].length - byPublisher[a].length;
              return sizeDiff !== 0 ? sizeDiff : a.localeCompare(b);
            })
            .map((key) => ({ key, label: key }));

          if (completed.length === 0) {
            return (
              <div className="border border-dashed border-border-strong px-4 py-10 text-center">
                <p className="text-sm text-text-muted">
                  No comic completions recorded yet.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-8">
              {COMIC_GROUPS.map(({ key, label }) => {
                const items = byPublisher[key];
                if (items.length === 0) return null;
                const PAGE_SIZE = 10;
                const page = comicCompletionPages[key] ?? 0;
                const totalPages = Math.ceil(items.length / PAGE_SIZE);
                const pageItems = items.slice(
                  page * PAGE_SIZE,
                  (page + 1) * PAGE_SIZE,
                );
                const setPage = (p) =>
                  setComicCompletionPages((prev) => ({ ...prev, [key]: p }));

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        {label}
                      </h3>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {items.length}
                      </span>
                    </div>
                    <div className="bg-surface border border-border">
                      {pageItems.map((c, idx) => {
                        const globalIdx = page * PAGE_SIZE + idx;
                        const franchise = franchiseMap[String(c.franchise_id)];
                        // EN first: comic's display name falls back
                        // EN -> CN -> Alt, unlike every other type here.
                        const baseName =
                          c.comic_name_en || c.comic_name_cn || "—";
                        const name = c.volume_label
                          ? `${baseName} ${c.volume_label}`
                          : baseName;
                        const franchiseName = franchise
                          ? franchise.franchise_name_cn ||
                            franchise.franchise_name_en ||
                            franchise.franchise_name_roman
                          : null;
                        const dateStr = new Date(
                          c.completed_at,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <Link
                            key={c.system_id}
                            to={`/comic/${c.system_id}`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
                              idx < pageItems.length - 1
                                ? "border-b border-border"
                                : ""
                            }`}
                          >
                            <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                              {globalIdx + 1}
                            </span>
                            <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
                              <img
                                src={getCoverUrl(c.cover_image_file)}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = FALLBACK_SVG;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base leading-tight text-text truncate">
                                {name}
                              </p>
                              {franchiseName && (
                                <p className="font-mono text-[11px] text-text-faint truncate">
                                  {franchiseName}
                                </p>
                              )}
                            </div>
                            <RatingStamp rating={c.my_rating} />
                            <span className="font-mono text-[11px] text-text-faint shrink-0 hidden sm:block">
                              {dateStr}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <Button
                          size="sm"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 0}
                          >
                            Previous
                          </Button>
                        <span className="font-mono text-[11px] text-text-faint">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= totalPages - 1}
                          >
                            Next
                          </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Under-development tabs */}
      {![
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
      ].includes(completionsTab) && (
        <div className="border border-dashed border-border-strong px-4 py-10 text-center">
          <Eyebrow className="mb-1">Under development</Eyebrow>
          <p className="text-sm text-text-faint">This section is not built yet.</p>
        </div>
      )}
    </section>
  );
}

