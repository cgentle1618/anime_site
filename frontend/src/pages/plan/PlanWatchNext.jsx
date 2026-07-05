// Frontend: plan page file for PlanWatchNext.
import { useState } from "react";
import { Link } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { getDisplayName, getCoverForSlot } from "../../utils/statsUtils";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };
const WATCH_NEXT_GROUPS = [
  { key: "12ep", label: "12 EP" },
  { key: "24ep", label: "24 EP" },
  { key: "30ep_plus", label: "30+ EP" },
];
const WATCH_NEXT_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv", dev: false },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film", dev: false },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt", dev: false },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower", dev: false },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint", dev: false },
  { key: "manga", label: "Manga", icon: "fa-book", dev: false },
  { key: "novel", label: "Novel", icon: "fa-book-open", dev: false },
];

export default function PlanWatchNext({
  franchises,
  allAnimeMovies,
  allMovies,
  allTVShows,
  allCartoons,
  allManga,
  allNovel,
  allEntriesByFranchise,
  franchiseMap,
}) {
  const [watchNextTab, setWatchNextTab] = useState("anime");

  const grouped = {};
  WATCH_NEXT_GROUPS.forEach(({ key }) => {
    grouped[key] = [];
  });
  franchises.forEach((f) => {
    if (f.watch_next_group && grouped[f.watch_next_group]) {
      grouped[f.watch_next_group].push(f);
    }
  });
  WATCH_NEXT_GROUPS.forEach(({ key }) => {
    grouped[key].sort(
      (a, b) =>
        (EXPECTATION_WEIGHT[a.franchise_expectation] ?? 99) -
        (EXPECTATION_WEIGHT[b.franchise_expectation] ?? 99),
    );
  });
  const hasAny = WATCH_NEXT_GROUPS.some(({ key }) => grouped[key].length > 0);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-list-ol text-brand/70"></i>
          Watch Next
        </h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {WATCH_NEXT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setWatchNextTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                watchNextTab === tab.key
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
      {watchNextTab === "anime" &&
        (!hasAny ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <i className="fas fa-list-ol text-3xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 font-medium">
              No franchises in watch list.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Assign franchises to a Watch Next Group in Modify.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {WATCH_NEXT_GROUPS.map(({ key, label }) => {
              const items = grouped[key];
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                    <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                      {label}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {items.map((f) => {
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
                            {f.franchise_expectation &&
                              f.franchise_expectation !== "Low" && (
                                <span
                                  className={`text-[10px] font-black ${f.franchise_expectation === "Highest" ? "text-purple-300" : f.franchise_expectation === "High" ? "text-yellow-300" : "text-blue-300"}`}
                                >
                                  {f.franchise_expectation}
                                </span>
                              )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* Anime Movie tab */}
      {watchNextTab === "anime-movie" &&
        (() => {
          const AM_GROUPS = [
            { key: "ghibli", label: "吉卜力" },
            { key: "shinkai", label: "新海誠" },
            { key: "original", label: "原創動畫電影" },
            { key: "adapted", label: "改編動畫電影" },
            { key: "others", label: "其他" },
          ];
          const watchNextAM = allAnimeMovies.filter((am) => am.watch_next);
          const amGrouped = {
            ghibli: [],
            shinkai: [],
            original: [],
            adapted: [],
            others: [],
          };
          watchNextAM.forEach((am) => {
            const f = franchiseMap[String(am.franchise_id)];
            const fname = f?.franchise_name_cn || f?.franchise_name_en || "";
            if (fname === "吉卜力") amGrouped.ghibli.push(am);
            else if (fname === "新海誠") amGrouped.shinkai.push(am);
            else if (fname === "原創動畫電影") amGrouped.original.push(am);
            else if (fname === "改編動畫電影") amGrouped.adapted.push(am);
            else amGrouped.others.push(am);
          });
          if (watchNextAM.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-film text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No anime movies in watch list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Watch Next" on an anime movie entry.
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {AM_GROUPS.map(({ key, label }) => {
                const items = amGrouped[key];
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                      <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {items.map((am) => {
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Movie tab */}
      {watchNextTab === "movie" &&
        (() => {
          const watchNextMovies = allMovies.filter((m) => m.watch_next);
          const movieByFranchise = {};
          watchNextMovies.forEach((m) => {
            const fid = String(m.franchise_id);
            if (!movieByFranchise[fid])
              movieByFranchise[fid] = {
                franchise: franchiseMap[fid],
                items: [],
              };
            movieByFranchise[fid].items.push(m);
          });
          const movieFranchiseGroups = Object.values(movieByFranchise).sort(
            (a, b) => {
              const aEn = a.franchise?.franchise_name_en || "";
              const bEn = b.franchise?.franchise_name_en || "";
              if (aEn.includes("Disney") && !bEn.includes("Disney")) return -1;
              if (!aEn.includes("Disney") && bEn.includes("Disney")) return 1;
              if (aEn.includes("Marvel") && !bEn.includes("Marvel")) return -1;
              if (!aEn.includes("Marvel") && bEn.includes("Marvel")) return 1;
              return aEn.localeCompare(bEn);
            },
          );
          if (watchNextMovies.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-ticket-alt text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No movies in watch list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Watch Next" on a movie entry.
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {movieFranchiseGroups.map(({ franchise, items }) => {
                const label =
                  franchise?.franchise_name_cn ||
                  franchise?.franchise_name_en ||
                  "—";
                return (
                  <div key={franchise?.system_id || "unknown"}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                      <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {items.map((movie) => {
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* TV Show tab */}
      {watchNextTab === "tv-show" &&
        (() => {
          const watchNextTV = allTVShows.filter((tv) => tv.watch_next);
          const tvByFranchise = {};
          watchNextTV.forEach((tv) => {
            const fid = String(tv.franchise_id);
            if (!tvByFranchise[fid])
              tvByFranchise[fid] = {
                franchise: franchiseMap[fid],
                items: [],
              };
            tvByFranchise[fid].items.push(tv);
          });
          const tvFranchiseGroups = Object.values(tvByFranchise).sort(
            (a, b) => {
              const aEn = a.franchise?.franchise_name_en || "";
              const bEn = b.franchise?.franchise_name_en || "";
              if (aEn.includes("Disney") && !bEn.includes("Disney")) return -1;
              if (!aEn.includes("Disney") && bEn.includes("Disney")) return 1;
              if (aEn.includes("Marvel") && !bEn.includes("Marvel")) return -1;
              if (!aEn.includes("Marvel") && bEn.includes("Marvel")) return 1;
              return aEn.localeCompare(bEn);
            },
          );
          if (watchNextTV.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-broadcast-tower text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No TV shows in watch list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Watch Next" on a TV show entry.
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {tvFranchiseGroups.map(({ franchise, items }) => {
                const label =
                  franchise?.franchise_name_cn ||
                  franchise?.franchise_name_en ||
                  "—";
                return (
                  <div key={franchise?.system_id || "unknown"}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                      <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {items.map((tv) => {
                        const name =
                          tv.tv_name_cn ||
                          tv.tv_name_en ||
                          tv.tv_name_alt ||
                          "—";
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Cartoon tab */}
      {watchNextTab === "cartoon" &&
        (() => {
          const CARTOON_SOURCE_GROUPS = [
            { key: "cartoon_network", label: "Cartoon Network" },
            { key: "disney", label: "Disney" },
            { key: "nickelodeon", label: "Nickelodeon" },
            { key: "adult_swim", label: "Adult Swim" },
            { key: "fox", label: "FOX" },
            { key: "hbo", label: "HBO" },
            { key: "comedy_central", label: "Comedy Central" },
            { key: "others", label: "其他" },
          ];
          const watchNextCartoons = allCartoons.filter((c) => c.watch_next);
          const cartoonGrouped = {
            cartoon_network: [],
            disney: [],
            nickelodeon: [],
            adult_swim: [],
            fox: [],
            hbo: [],
            comedy_central: [],
            others: [],
          };
          watchNextCartoons.forEach((c) => {
            const src = (c.source_official || "").toLowerCase();
            if (src.includes("cartoon network"))
              cartoonGrouped.cartoon_network.push(c);
            else if (src.includes("disney")) cartoonGrouped.disney.push(c);
            else if (src.includes("nickelodeon"))
              cartoonGrouped.nickelodeon.push(c);
            else if (src.includes("adult swim"))
              cartoonGrouped.adult_swim.push(c);
            else if (src.includes("fox")) cartoonGrouped.fox.push(c);
            else if (src.includes("hbo")) cartoonGrouped.hbo.push(c);
            else if (src.includes("comedy central"))
              cartoonGrouped.comedy_central.push(c);
            else cartoonGrouped.others.push(c);
          });
          if (watchNextCartoons.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-laugh-squint text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No cartoons in watch list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Watch Next" on a cartoon entry.
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {CARTOON_SOURCE_GROUPS.map(({ key, label }) => {
                const items = cartoonGrouped[key];
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                      <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {items.map((c) => {
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Manga tab */}
      {watchNextTab === "manga" &&
        (() => {
          const SERIALIZATION_GROUPS = [
            { key: "完結", label: "完結" },
            { key: "連載中", label: "連載中" },
            { key: "腰斬", label: "腰斬" },
            { key: "停更", label: "停更" },
            { key: "", label: "其他" },
          ];
          const readNextManga = allManga.filter((m) => m.read_next);
          const mangaGrouped = {
            完結: [],
            連載中: [],
            腰斬: [],
            停更: [],
            "": [],
          };
          readNextManga.forEach((m) => {
            const key = m.serialization_status || "";
            if (mangaGrouped[key] !== undefined) mangaGrouped[key].push(m);
            else mangaGrouped[""].push(m);
          });
          if (readNextManga.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-book text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No manga in read list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Read Next" on a manga entry.
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-8">
              {SERIALIZATION_GROUPS.map(({ key, label }) => {
                const items = mangaGrouped[key];
                if (!items || items.length === 0) return null;
                return (
                  <div key={key || "other"}>
                    <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
                      <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">
                        {label}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {items.map((m) => {
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {/* Novel tab */}
      {watchNextTab === "novel" &&
        (() => {
          const readNextNovels = allNovel.filter((n) => n.read_next);
          if (readNextNovels.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-book-open text-3xl text-gray-300 mb-3"></i>
                <p className="text-gray-500 font-medium">
                  No novels in read list.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Toggle "Read Next" on a novel entry.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {readNextNovels.map((n) => {
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
                      {n.serialization_status && (
                        <span className="text-teal-300 text-[10px] font-bold">
                          {n.serialization_status}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}
    </section>
  );
}

