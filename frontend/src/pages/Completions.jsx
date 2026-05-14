import { useState, useEffect } from "react";
import StatsCompletions from "./statistics/StatsCompletions";

export default function Completions() {
  const [allAnime, setAllAnime] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTVShows, setAllTVShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allManga, setAllManga] = useState([]);
  const [allNovel, setAllNovel] = useState([]);
  const [franchiseMap, setFranchiseMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [fRes, aRes, amRes, mRes, tvRes, cRes, mgRes, nvRes] =
          await Promise.all([
            fetch("/api/franchise/", { credentials: "include" }),
            fetch("/api/anime/", { credentials: "include" }),
            fetch("/api/anime-movie/", { credentials: "include" }),
            fetch("/api/movies/", { credentials: "include" }),
            fetch("/api/tv-shows/", { credentials: "include" }),
            fetch("/api/cartoon/", { credentials: "include" }),
            fetch("/api/manga/", { credentials: "include" }),
            fetch("/api/novel/", { credentials: "include" }),
          ]);
        if (
          !fRes.ok ||
          !aRes.ok ||
          !amRes.ok ||
          !mRes.ok ||
          !tvRes.ok ||
          !cRes.ok ||
          !mgRes.ok ||
          !nvRes.ok
        )
          throw new Error("Failed to load data.");
        const [fData, aData, amData, mData, tvData, cData, mgData, nvData] =
          await Promise.all([
            fRes.json(),
            aRes.json(),
            amRes.json(),
            mRes.json(),
            tvRes.json(),
            cRes.json(),
            mgRes.json(),
            nvRes.json(),
          ]);
        const fMap = {};
        fData.forEach((f) => {
          fMap[String(f.system_id)] = f;
        });
        setFranchiseMap(fMap);
        setAllAnime(aData);
        setAllAnimeMovies(amData);
        setAllMovies(mData);
        setAllTVShows(tvData);
        setAllCartoons(cData);
        setAllManga(mgData);
        setAllNovel(nvData);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading completions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading completions.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-history text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Completions
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            All completed entries by media type
          </p>
        </div>
      </div>

      <StatsCompletions
        allAnime={allAnime}
        allAnimeMovies={allAnimeMovies}
        allMovies={allMovies}
        allTVShows={allTVShows}
        allCartoons={allCartoons}
        allManga={allManga}
        allNovel={allNovel}
        franchiseMap={franchiseMap}
      />
    </div>
  );
}
