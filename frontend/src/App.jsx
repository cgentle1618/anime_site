// Frontend: root React component that wires providers and routes together.
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./hooks/useToast";
import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import { useConstants } from "./config/useConstants";

import Index from "./pages/public/Index";
import UnderDevelopment from "./pages/public/UnderDevelopment";
import Login from "./pages/public/Login";
import Search from "./pages/public/Search";

import Collection from "./pages/detail/Collection";
import Franchise from "./pages/detail/Franchise";
import Series from "./pages/detail/Series";
import Anime from "./pages/detail/Anime";
import AnimeMovie from "./pages/detail/AnimeMovie";
import Movie from "./pages/detail/Movie";
import TV from "./pages/detail/TV";
import Cartoon from "./pages/detail/Cartoon";
import Manga from "./pages/detail/Manga";
import Novel from "./pages/detail/Novel";
import Comic from "./pages/detail/Comic";
import WatchOrder from "./pages/detail/WatchOrder";
import SeasonalDetail from "./pages/public/SeasonalDetail";

import Plan from "./pages/public/Plan";
import SeasonalOverall from "./pages/public/SeasonalOverall";
import Statistics from "./pages/public/Statistics";
import FutureReleases from "./pages/public/FutureReleases";
import Completions from "./pages/public/Completions";
import Quotes from "./pages/public/Quotes";
import Memes from "./pages/public/Memes";

import CollectionLibrary from "./pages/library/CollectionLibrary";
import FranchiseLibrary from "./pages/library/FranchiseLibrary";
import LibraryAnime from "./pages/library/LibraryAnime";
import LibraryAnimeMovie from "./pages/library/LibraryAnimeMovie";
import LibraryMovie from "./pages/library/LibraryMovie";
import LibraryTV from "./pages/library/LibraryTV";
import LibraryCartoon from "./pages/library/LibraryCartoon";
import LibraryManga from "./pages/library/LibraryManga";
import LibraryNovel from "./pages/library/LibraryNovel";
import LibraryComic from "./pages/library/LibraryComic";

import Admin from "./pages/admin/Admin";
import Add from "./pages/admin/Add";
import Modify from "./pages/admin/Modify";
import Delete from "./pages/admin/Delete";
import FormDefaults from "./pages/admin/FormDefaults";
import DataHistory from "./pages/admin/DataHistory";
import ReviewQueue from "./pages/admin/ReviewQueue";
import WatchOrders from "./pages/admin/WatchOrders";
import Relations from "./pages/admin/Relations";
import SystemOptions from "./pages/admin/SystemOptions";
import Roles from "./pages/admin/Roles";
import Users from "./pages/admin/Users";
import ContentLabels from "./pages/admin/ContentLabels";

export default function App() {
  // Fetches /api/constants once on mount and, when it resolves, overwrites
  // the bundled fieldOptions.js arrays in place (see applyConstants) and
  // re-renders this tree so every <select> that maps over those arrays
  // (Add/Modify tabs, none of which call this hook themselves) switches
  // from the pre-fetch fallback to the real API-sourced values.
  useConstants();

  return (
    // The QueryClientProvider lives in main.jsx (one cache for the app);
    // provider order below: auth, then UI helpers, then routing.
    <>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route element={<Layout />}>
                {/* Pages anyone can visit. */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library/anime" element={<LibraryAnime />} />
                <Route
                  path="/library/anime-movie"
                  element={<LibraryAnimeMovie />}
                />
                <Route
                  path="/library/collection"
                  element={<CollectionLibrary />}
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
                <Route path="/comic/:system_id" element={<Comic />} />
                <Route path="/library/comic" element={<LibraryComic />} />
                <Route path="/collection/:system_id" element={<Collection />} />
                <Route path="/franchise/:system_id" element={<Franchise />} />
                <Route path="/series/:system_id" element={<Series />} />
                <Route path="/watch-order/:system_id" element={<WatchOrder />} />
                <Route path="/seasonal" element={<SeasonalOverall />} />
                <Route
                  path="/seasonal/:seasonal_id"
                  element={<SeasonalDetail />}
                />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/completions" element={<Completions />} />
                <Route path="/quote" element={<Quotes />} />
                <Route path="/meme" element={<Memes />} />
                <Route path="/plan" element={<Plan />} />
                <Route
                  path="/under-development"
                  element={<UnderDevelopment />}
                />

                {/* These routes are protected by <ProtectedRoute />. */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/system" element={<Admin />} />
                  <Route path="/data-history" element={<DataHistory />} />
                  <Route path="/review-queue" element={<ReviewQueue />} />
                  <Route path="/add" element={<Add />} />
                  <Route path="/modify" element={<Modify />} />
                  <Route path="/delete" element={<Delete />} />
                  <Route path="/defaults" element={<FormDefaults />} />
                  <Route path="/watch-orders" element={<WatchOrders />} />
                  <Route path="/relations" element={<Relations />} />
                  <Route path="/options" element={<SystemOptions />} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/content-labels" element={<ContentLabels />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </>
  );
}

