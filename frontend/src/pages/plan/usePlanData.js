import { useState, useEffect } from "react";

export default function usePlanData() {
  const [franchises, setFranchises] = useState([]);
  const [allAnime, setAllAnime] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTVShows, setAllTVShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allManga, setAllManga] = useState([]);
  const [allNovel, setAllNovel] = useState([]);
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
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
        setFranchises(fData);
        setAllAnime(aData);
        setAllAnimeMovies(amData);
        setAllMovies(mData);
        setAllTVShows(tvData);
        setAllCartoons(cData);
        setAllManga(mgData);
        setAllNovel(nvData);
        const fMap = {};
        fData.forEach((f) => {
          fMap[String(f.system_id)] = f;
        });
        setFranchiseMap(fMap);
        const allEntries = [
          ...aData.map((e) => ({ ...e, _type: "anime" })),
          ...amData.map((e) => ({ ...e, _type: "anime_movie" })),
          ...mData.map((e) => ({ ...e, _type: "movie" })),
          ...tvData.map((e) => ({ ...e, _type: "tv_show" })),
          ...cData.map((e) => ({ ...e, _type: "cartoon" })),
          ...mgData.map((e) => ({ ...e, _type: "manga" })),
          ...nvData.map((e) => ({ ...e, _type: "novel" })),
        ];
        const byFranchise = {};
        allEntries.forEach((e) => {
          const id = String(e.franchise_id);
          if (!byFranchise[id]) byFranchise[id] = [];
          byFranchise[id].push(e);
        });
        setAllEntriesByFranchise(byFranchise);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return {
    franchises,
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
    allEntriesByFranchise,
    franchiseMap,
    loading,
    error,
  };
}
