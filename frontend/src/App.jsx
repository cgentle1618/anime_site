import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./hooks/useToast";
import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/layout/ProtectedRoute";

import Index from "./pages/Index";
import UnderDevelopment from "./pages/UnderDevelopment";
import Login from "./pages/Login";
import Search from "./pages/Search";

import Franchise from "./pages/Franchise";
import Anime from "./pages/Anime";
import AnimeMovie from "./pages/AnimeMovie";
import Movie from "./pages/Movie";
import TV from "./pages/TV";
import Cartoon from "./pages/Cartoon";
import Manga from "./pages/Manga";
import Novel from "./pages/Novel";
import SeasonalDetail from "./pages/SeasonalDetail";

import Plan from "./pages/Plan";
import SeasonalOverall from "./pages/SeasonalOverall";
import Statistics from "./pages/Statistics";
import FutureReleases from "./pages/FutureReleases";
import Completions from "./pages/Completions";

import FranchiseLibrary from "./pages/FranchiseLibrary";
import LibraryAnime from "./pages/LibraryAnime";
import LibraryAnimeMovie from "./pages/LibraryAnimeMovie";
import LibraryMovie from "./pages/LibraryMovie";
import LibraryTV from "./pages/LibraryTV";
import LibraryCartoon from "./pages/LibraryCartoon";
import LibraryManga from "./pages/LibraryManga";
import LibraryNovel from "./pages/LibraryNovel";

import Admin from "./pages/Admin";
import Add from "./pages/Add";
import Modify from "./pages/Modify";
import Delete from "./pages/Delete";
import DataHistory from "./pages/DataHistory";
import ReviewQueue from "./pages/ReviewQueue";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route element={<Layout />}>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library/anime" element={<LibraryAnime />} />
                <Route
                  path="/library/anime-movie"
                  element={<LibraryAnimeMovie />}
                />
                <Route
                  path="/library/franchise"
                  element={<FranchiseLibrary />}
                />
                <Route path="/library/movie" element={<LibraryMovie />} />
                <Route path="/future-releases" element={<FutureReleases />} />
                <Route path="/anime/:system_id" element={<Anime />} />
                <Route
                  path="/anime-movie/:system_id"
                  element={<AnimeMovie />}
                />
                <Route path="/movie/:system_id" element={<Movie />} />
                <Route path="/tv-show/:system_id" element={<TV />} />
                <Route path="/library/tv-show" element={<LibraryTV />} />
                <Route path="/cartoon/:system_id" element={<Cartoon />} />
                <Route path="/library/cartoon" element={<LibraryCartoon />} />
                <Route path="/manga/:system_id" element={<Manga />} />
                <Route path="/library/manga" element={<LibraryManga />} />
                <Route path="/novel/:system_id" element={<Novel />} />
                <Route path="/library/novel" element={<LibraryNovel />} />
                <Route path="/franchise/:system_id" element={<Franchise />} />
                <Route path="/seasonal" element={<SeasonalOverall />} />
                <Route
                  path="/seasonal/:seasonal_id"
                  element={<SeasonalDetail />}
                />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/completions" element={<Completions />} />
                <Route path="/plan" element={<Plan />} />
                <Route
                  path="/under-development"
                  element={<UnderDevelopment />}
                />

                {/* Admin-only routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/system" element={<Admin />} />
                  <Route path="/data-history" element={<DataHistory />} />
                  <Route path="/review-queue" element={<ReviewQueue />} />
                  <Route path="/add" element={<Add />} />
                  <Route path="/modify" element={<Modify />} />
                  <Route path="/delete" element={<Delete />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
