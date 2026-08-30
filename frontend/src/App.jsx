// Frontend: root React component that wires providers and routes together.
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
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


import CollectionLibrary from "./pages/library/CollectionLibrary";
import Library from "./pages/library/Library";
import FranchiseLibrary from "./pages/library/FranchiseLibrary";


// Route-level code splitting: the admin pages, the relations canvas
// (@xyflow) and the statistics pages are a large share of the bundle and
// never needed on first paint. Each becomes its own chunk, fetched on
// first navigation.
const WatchOrder = lazy(() => import("./pages/detail/WatchOrder"));
const SeasonalDetail = lazy(() => import("./pages/public/SeasonalDetail"));
const Plan = lazy(() => import("./pages/public/Plan"));
const SeasonalOverall = lazy(() => import("./pages/public/SeasonalOverall"));
const Statistics = lazy(() => import("./pages/public/Statistics"));
const FutureReleases = lazy(() => import("./pages/public/FutureReleases"));
const Completions = lazy(() => import("./pages/public/Completions"));
const Quotes = lazy(() => import("./pages/public/Quotes"));
const Memes = lazy(() => import("./pages/public/Memes"));
const Admin = lazy(() => import("./pages/admin/Admin"));
const Add = lazy(() => import("./pages/admin/Add"));
const Modify = lazy(() => import("./pages/admin/Modify"));
const Delete = lazy(() => import("./pages/admin/Delete"));
const FormDefaults = lazy(() => import("./pages/admin/FormDefaults"));
const DataHistory = lazy(() => import("./pages/admin/DataHistory"));
const ReviewQueue = lazy(() => import("./pages/admin/ReviewQueue"));
const WatchOrders = lazy(() => import("./pages/admin/WatchOrders"));
const Relations = lazy(() => import("./pages/admin/Relations"));
const SystemOptions = lazy(() => import("./pages/admin/SystemOptions"));
const Roles = lazy(() => import("./pages/admin/Roles"));
const Users = lazy(() => import("./pages/admin/Users"));
const ContentLabels = lazy(() => import("./pages/admin/ContentLabels"));

function RouteFallback() {
  return <div className="p-8 text-sm text-gray-500">Loading…</div>;
}

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
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<Layout />}>
                {/* Pages anyone can visit. */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route
                  path="/library/collection"
                  element={<CollectionLibrary />}
                />
                <Route
                  path="/library/franchise"
                  element={<FranchiseLibrary />}
                />
                <Route path="/library/:type" element={<Library />} />
                <Route path="/future-releases" element={<FutureReleases />} />
                <Route path="/anime/:system_id" element={<Anime />} />
                <Route
                  path="/anime-movie/:system_id"
                  element={<AnimeMovie />}
                />
                <Route path="/movie/:system_id" element={<Movie />} />
                <Route path="/tv-show/:system_id" element={<TV />} />
                <Route path="/cartoon/:system_id" element={<Cartoon />} />
                <Route path="/manga/:system_id" element={<Manga />} />
                <Route path="/novel/:system_id" element={<Novel />} />
                <Route path="/comic/:system_id" element={<Comic />} />
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
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

