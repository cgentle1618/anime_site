import { useState } from "react";
import { Link } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/anime";
import { getDisplayName, getCoverForSlot } from "./statsUtils";

const REWATCH_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv", dev: false },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film", dev: false },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt", dev: false },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower", dev: false },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint", dev: false },
  { key: "manga", label: "Manga", icon: "fa-book", dev: false },
  { key: "novel", label: "Novel", icon: "fa-book-open", dev: false },
];

export default function StatsToRewatch({
  franchises,
  allAnimeMovies,
  allMovies,
  allTVShows,
  allCartoons,
  allManga,
  allNovel,
  allEntriesByFranchise,
}) {
  const [rewatchTab, setRewatchTab] = useState("anime");

  const rewatchItems = franchises
    .filter((f) => f.to_rewatch)
    .sort((a, b) =>
      (a.franchise_name_en || "").localeCompare(b.franchise_name_en || ""),
    );

  return (
    <section>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-redo text-brand/70"></i>
          To Rewatch
        </h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {REWATCH_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRewatchTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                rewatchTab === tab.key
                  ? "border-brand text-brand"
                  : tab.dev
                    ? "border-transparent text-gray-300 hover:text-gray-400"
                    : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={`fas ${tab.icon} text-xs`}></i>
              {tab.label}
              {tab.dev && (
                <span className="text-[9px] font-black text-gray-300 uppercase tracking-wide">
                  DEV
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Anime tab */}
      {rewatchTab === "anime" &&
        (rewatchItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 font-medium">
              No franchises marked for rewatch.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Toggle "To Rewatch" on a franchise page or in Modify.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {rewatchItems.map((f) => {
              const coverUrl = getCoverForSlot(f, allEntriesByFranchise);
              return (
                <Link
                  key={f.system_id}
                  to={`/franchise/${f.system_id}`}
                  className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="aspect-[3/4] bg-gray-100">
                    <img
                      src={coverUrl}
                      alt={getDisplayName(f)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = FALLBACK_SVG;
                      }}
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                    <p className="text-white text-xs font-bold leading-tight truncate">
                      {getDisplayName(f)}
                    </p>
                    {f.my_rating && (
                      <span className="text-yellow-300 text-[10px] font-black">
                        {f.my_rating}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

      {/* Anime Movie tab */}
      {rewatchTab === "anime-movie" &&
        (() => {
          const rewatchAM = allAnimeMovies
            .filter((am) => am.to_rewatch)
            .sort((a, b) =>
              (a.anime_movie_name_en || "").localeCompare(
                b.anime_movie_name_en || "",
              ),
            );
          if (rewatchAM.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No anime movies marked for rewatch.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Rewatch" on an anime movie entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rewatchAM.map((am) => {
                const name =
                  am.anime_movie_name_cn ||
                  am.anime_movie_name_en ||
                  am.anime_movie_name_roman ||
                  "—";
                return (
                  <Link
                    key={am.system_id}
                    to={`/anime-movie/${am.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(am.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {am.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {am.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      {/* Movie tab */}
      {rewatchTab === "movie" &&
        (() => {
          const rewatchMovies = allMovies
            .filter((m) => m.to_rewatch)
            .sort((a, b) =>
              (a.movie_name_en || "").localeCompare(b.movie_name_en || ""),
            );
          if (rewatchMovies.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No movies marked for rewatch.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Rewatch" on a movie entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rewatchMovies.map((movie) => {
                const name =
                  movie.movie_name_cn ||
                  movie.movie_name_en ||
                  movie.movie_name_alt ||
                  "—";
                return (
                  <Link
                    key={movie.system_id}
                    to={`/movie/${movie.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(movie.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {movie.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {movie.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      {/* TV Show tab */}
      {rewatchTab === "tv-show" &&
        (() => {
          const rewatchTV = allTVShows
            .filter((tv) => tv.to_rewatch)
            .sort((a, b) =>
              (a.tv_name_en || "").localeCompare(b.tv_name_en || ""),
            );
          if (rewatchTV.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No TV shows marked for rewatch.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Rewatch" on a TV show entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rewatchTV.map((tv) => {
                const name =
                  tv.tv_name_cn || tv.tv_name_en || tv.tv_name_alt || "—";
                return (
                  <Link
                    key={tv.system_id}
                    to={`/tv-show/${tv.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(tv.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {tv.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {tv.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      {/* Cartoon tab */}
      {rewatchTab === "cartoon" &&
        (() => {
          const rewatchCartoons = allCartoons
            .filter((c) => c.to_rewatch)
            .sort((a, b) =>
              (a.cartoon_name_en || "").localeCompare(b.cartoon_name_en || ""),
            );
          if (rewatchCartoons.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No cartoons marked for rewatch.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Rewatch" on a cartoon entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rewatchCartoons.map((c) => {
                const name =
                  c.cartoon_name_cn ||
                  c.cartoon_name_en ||
                  c.cartoon_name_alt ||
                  "—";
                return (
                  <Link
                    key={c.system_id}
                    to={`/cartoon/${c.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(c.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {c.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {c.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      {/* Manga tab */}
      {rewatchTab === "manga" &&
        (() => {
          const rereadManga = allManga
            .filter((m) => m.to_reread)
            .sort((a, b) =>
              (a.manga_name_en || "").localeCompare(b.manga_name_en || ""),
            );
          if (rereadManga.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No manga marked for re-read.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Re-read" on a manga entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rereadManga.map((m) => {
                const name =
                  m.manga_name_cn ||
                  m.manga_name_en ||
                  m.manga_name_roman ||
                  "—";
                return (
                  <Link
                    key={m.system_id}
                    to={`/manga/${m.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(m.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {m.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {m.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      {/* Novel tab */}
      {rewatchTab === "novel" &&
        (() => {
          const rereadNovels = allNovel
            .filter((n) => n.to_reread)
            .sort((a, b) =>
              (a.novel_name_en || a.novel_name_cn || "").localeCompare(
                b.novel_name_en || b.novel_name_cn || "",
              ),
            );
          if (rereadNovels.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No novels marked for re-read.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "To Re-read" on a novel entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rereadNovels.map((n) => {
                const name =
                  n.novel_name_cn ||
                  n.novel_name_en ||
                  n.novel_name_roman ||
                  "—";
                return (
                  <Link
                    key={n.system_id}
                    to={`/novel/${n.system_id}`}
                    className="group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="aspect-[3/4] bg-gray-100">
                      <img
                        src={getCoverUrl(n.cover_image_file)}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = FALLBACK_SVG;
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
                      <p className="text-white text-xs font-bold leading-tight truncate">
                        {name}
                      </p>
                      {n.my_rating && (
                        <span className="text-yellow-300 text-[10px] font-black">
                          {n.my_rating}
                        </span>
                      )}
                    </div>
                  </Link>
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
      ].includes(rewatchTab) && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mb-4">
            <i className="fas fa-redo text-brand text-xl"></i>
          </div>
          <p className="text-gray-700 font-bold">Under Development</p>
          <p className="text-gray-400 text-sm font-medium mt-1">
            This section is coming soon.
          </p>
        </div>
      )}
    </section>
  );
}
