import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Nav from './Nav'
import Toast from './Toast'

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() { setVisible(window.scrollY > 300) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-brand text-white shadow-lg flex items-center justify-center hover:bg-brand-hover transition-all"
    >
      <i className="fas fa-chevron-up text-sm"></i>
    </button>
  )
}

export default function Layout() {
  return (
    <div className="bg-gray-50 text-gray-900 min-h-screen flex flex-col font-sans">
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-gray-200 mt-auto shrink-0">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-gray-400 flex items-center justify-center gap-2">
            © 2026 CG1618 Tracker. All rights reserved.
            <i className="fas fa-bolt text-brand/50"></i>
          </p>
        </div>
      </footer>
      <Toast />
      <ScrollToTopButton />
    </div>
  )
}
