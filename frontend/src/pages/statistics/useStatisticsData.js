import { useState, useEffect } from "react";

export default function useStatisticsData() {
  const [franchises, setFranchises] = useState([]);
  const [allAnime, setAllAnime] = useState([]);
  const [allAnimeMovies, setAllAnimeMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [allTVShows, setAllTVShows] = useState([]);
  const [allCartoons, setAllCartoons] = useState([]);
  const [allManga, setAllManga] = useState([]);
  const [allNovel, setAllNovel] = useState([]);
  const [seasonals, setSeasonals] = useState([]);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [franchiseMap, setFranchiseMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [fRes, aRes, amRes, mRes, tvRes, sRes, csRes, cRes, mgRes, nvRes] =
          await Promise.all([
            fetch("/api/franchise/", { credentials: "include" }),
            fetch("/api/anime/", { credentials: "include" }),
            fetch("/api/anime-movie/", { credentials: "include" }),
            fetch("/api/movies/", { credentials: "include" }),
            fetch("/api/tv-shows/", { credentials: "include" }),
            fetch("/api/seasonal/", { credentials: "include" }),
            fetch("/api/seasonal/current-season", { credentials: "include" }),
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
          !sRes.ok ||
          !csRes.ok ||
          !cRes.ok ||
          !mgRes.ok ||
          !nvRes.ok
        )
          throw new Error("Failed to load data.");
        const [
          fData,
          aData,
          amData,
          mData,
          tvData,
          sData,
          csData,
          cData,
          mgData,
          nvData,
        ] = await Promise.all([
          fRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          sRes.json(),
          csRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
        ]);
        setCurrentSeason(csData.current_season);
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
          ...aData,
          ...amData,
          ...mData,
          ...tvData,
          ...mgData,
          ...nvData,
        ];
        const byFranchise = {};
        allEntries.forEach((e) => {
          const id = String(e.franchise_id);
          if (!byFranchise[id]) byFranchise[id] = [];
          byFranchise[id].push(e);
        });
        setAllEntriesByFranchise(byFranchise);
        // Sort seasonals newest-first by year then season weight
        const SEASON_WEIGHT = { FAL: 4, SUM: 3, SPR: 2, WIN: 1 };
        const sorted = [...sData].sort((a, b) => {
          const [aSeason, aYear] = a.seasonal.split(" ");
          const [bSeason, bYear] = b.seasonal.split(" ");
          const yearDiff = parseInt(bYear, 10) - parseInt(aYear, 10);
          if (yearDiff !== 0) return yearDiff;
          return (SEASON_WEIGHT[bSeason] ?? 0) - (SEASON_WEIGHT[aSeason] ?? 0);
        });
        setSeasonals(sorted);
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
    seasonals,
    currentSeason,
    allEntriesByFranchise,
    franchiseMap,
    loading,
    error,
  };
}
