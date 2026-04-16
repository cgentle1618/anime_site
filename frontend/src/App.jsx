import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './hooks/useToast'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Index from './pages/Index'
import Login from './pages/Login'
import Anime from './pages/Anime'
import FranchiseAcg from './pages/FranchiseAcg'
import Search from './pages/Search'
import FutureReleases from './pages/FutureReleases'
import LibraryAnime from './pages/LibraryAnime'
import Admin from './pages/Admin'
import Add from './pages/Add'
import Modify from './pages/Modify'
import Delete from './pages/Delete'
import UnderDevelopment from './pages/UnderDevelopment'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library/anime" element={<LibraryAnime />} />
                <Route path="/future-releases" element={<FutureReleases />} />
                <Route path="/anime/:system_id" element={<Anime />} />
                <Route path="/franchise/:system_id" element={<FranchiseAcg />} />
                <Route path="/under-development" element={<UnderDevelopment />} />

                {/* Admin-only routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/system" element={<Admin />} />
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
  )
}
