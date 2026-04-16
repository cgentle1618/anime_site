import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'

function cleanString(str) {
  if (!str) return ''
  return str.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
}

function DropdownMenu({ label, icon, items, labelClassName = '' }) {
  return (
    <div className="relative group py-2">
      <button className={`hover:bg-gray-50 hover:text-brand px-3 py-2 rounded-md text-sm font-bold transition flex items-center ${labelClassName || 'text-gray-600'}`}>
        {icon && <i className={`${icon} mr-1.5`}></i>}
        {label}
        <i className="fas fa-chevron-down ml-1.5 text-[10px] text-gray-400 group-hover:text-brand transition-transform group-hover:rotate-180"></i>
      </button>
      <div className="absolute left-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden transform origin-top -translate-y-2 group-hover:translate-y-0 p-1.5 space-y-0.5">
          {items}
        </div>
      </div>
    </div>
  )
}

function NavLink({ to, icon, children }) {
  return (
    <Link to={to} className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-brand/5 hover:text-brand transition">
      <i className={`${icon} w-6 text-center text-brand/70 mr-1`}></i>
      {children}
    </Link>
  )
}

function DevLink({ icon, children }) {
  return (
    <Link to="/under-development" className="flex items-center px-3 py-2 text-sm font-medium text-gray-400 rounded-md hover:bg-gray-50 transition" title="Under Development">
      <i className={`${icon} w-6 text-center text-gray-300 mr-1`}></i>
      {children}
    </Link>
  )
}

export default function Nav() {
  const { isAdmin, refetchAuth } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const searchRef = useRef(null)
  const searchDebounceRef = useRef(null)
  const dataCacheRef = useRef({ loaded: false, franchises: [], anime: [] })

  // Universal search — client-side filtering (case/punctuation/space insensitive)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowResults(false)
      return
    }
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        if (!dataCacheRef.current.loaded) {
          const [franRes, animeRes] = await Promise.all([
            fetch('/api/franchise/', { credentials: 'include' }),
            fetch('/api/anime/', { credentials: 'include' }),
          ])
          dataCacheRef.current.franchises = franRes.ok ? await franRes.json() : []
          dataCacheRef.current.anime = animeRes.ok ? await animeRes.json() : []
          dataCacheRef.current.loaded = true
        }
        const qClean = cleanString(searchQuery)
        const matchF = dataCacheRef.current.franchises.filter(f =>
          [f.franchise_name_cn, f.franchise_name_en, f.franchise_name_romanji, f.franchise_name_jp, f.franchise_name_alt]
            .some(n => cleanString(n).includes(qClean))
        ).slice(0, 5)
        const matchA = dataCacheRef.current.anime.filter(a =>
          [a.anime_name_cn, a.anime_name_en, a.anime_name_romanji, a.anime_name_jp, a.anime_name_alt]
            .some(n => cleanString(n).includes(qClean))
        ).slice(0, 10)
        setSearchResults([
          ...matchF.map(f => ({ type: 'franchise', ...f })),
          ...matchA.map(a => ({ type: 'anime', ...a })),
        ])
        setShowResults(true)
      } catch {
        // ignore search errors
      }
    }, 250)
  }, [searchQuery])

  // Close search on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSearchKey(e) {
    if (e.key === 'Enter' && searchQuery.trim()) {
      clearTimeout(searchDebounceRef.current)
      const q = searchQuery.trim()
      setSearchQuery('')
      setSearchResults([])
      setShowResults(false)
      navigate(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  function getDisplayName(item) {
    return item.franchise_name_cn || item.franchise_name_en || item.franchise_name_romanji ||
           item.anime_name_cn || item.anime_name_en || item.anime_name_romanji || item.anime_name_jp || '—'
  }

  async function handleBackup() {
    if (backingUp) return
    setBackingUp(true)
    try {
      const res = await fetch('/api/data-control/backup', { method: 'POST', credentials: 'include' })
      if (res.ok) {
        showToast('success', 'Backup completed successfully')
      } else {
        showToast('error', 'Backup failed')
      }
    } catch {
      showToast('error', 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    await refetchAuth()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo & Primary Links */}
          <div className="flex items-center flex-1 min-w-0">
            <Link to="/" className="flex items-center group shrink-0">
              <i className="fas fa-layer-group text-brand text-2xl mr-2 group-hover:scale-110 transition-transform"></i>
              <span className="font-black text-xl tracking-tight text-gray-900 group-hover:text-brand transition-colors">CG1618</span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex ml-6 xl:ml-8 space-x-1 xl:space-x-2">
              {/* Library */}
              <DropdownMenu label="Library" items={<>
                <NavLink to="/library/anime" icon="fas fa-tv">Anime</NavLink>
                <DevLink icon="fas fa-film">Anime Movie</DevLink>
                <DevLink icon="fas fa-book">Manga</DevLink>
                <DevLink icon="fas fa-book-open">Novel</DevLink>
                <div className="border-t border-gray-50 my-1"></div>
                <DevLink icon="fas fa-video">TV Show</DevLink>
                <DevLink icon="fas fa-ticket-alt">Movie</DevLink>
                <DevLink icon="fas fa-laugh-squint">Cartoon</DevLink>
              </>} />

              {/* Production */}
              <DropdownMenu label="Production" items={<>
                <DevLink icon="fas fa-building">Studio</DevLink>
                <DevLink icon="fas fa-microphone">Seiyuu</DevLink>
              </>} />

              {/* More */}
              <DropdownMenu label="More" items={<>
                <DevLink icon="fas fa-chart-bar">Statistics</DevLink>
                <NavLink to="/future-releases" icon="fas fa-calendar-plus">Future Release</NavLink>
                <DevLink icon="fas fa-leaf">Seasonal Overall</DevLink>
                <DevLink icon="fas fa-list-alt">Seasonal Detail</DevLink>
              </>} />

              {/* Admin */}
              {isAdmin && (
                <DropdownMenu
                  label="Admin"
                  icon="fas fa-shield-alt"
                  labelClassName="text-brand hover:bg-brand/5"
                  items={<>
                    <NavLink to="/system" icon="fas fa-cog">Control Center</NavLink>
                    <div className="border-t border-gray-50 my-1"></div>
                    <Link to="/add" className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-emerald-50 hover:text-emerald-600 transition">
                      <i className="fas fa-plus-circle w-6 text-center text-emerald-400 mr-1"></i>Add Entry
                    </Link>
                    <Link to="/modify" className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-600 transition">
                      <i className="fas fa-edit w-6 text-center text-blue-400 mr-1"></i>Modify Entry
                    </Link>
                    <Link to="/delete" className="flex items-center px-3 py-2 text-sm font-bold text-gray-700 rounded-md hover:bg-red-50 hover:text-red-600 transition">
                      <i className="fas fa-trash-alt w-6 text-center text-red-400 mr-1"></i>Delete Entry
                    </Link>
                  </>}
                />
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-3 ml-4 shrink-0">
            {/* Universal Search */}
            <div ref={searchRef} className="relative hidden md:block w-56 lg:w-80 xl:w-96 transition-all">
              <i className="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm pointer-events-none"></i>
              <input
                type="text"
                placeholder="Quick search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKey}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                className="w-full bg-gray-100 border border-transparent rounded-full pl-9 pr-4 py-1.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-brand focus:border-transparent transition shadow-inner"
                autoComplete="off"
              />
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-[80vh] overflow-y-auto z-50">
                  {searchResults.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setShowResults(false)
                        setSearchQuery('')
                        if (item.type === 'franchise') navigate(`/franchise/${item.system_id}`)
                        else navigate(`/anime/${item.system_id}`)
                      }}
                      className="w-full text-left flex items-center px-4 py-2.5 hover:bg-gray-50 transition border-b border-gray-50 last:border-0"
                    >
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 shrink-0 ${item.type === 'franchise' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500'}`}>
                        {item.type === 'franchise' ? 'FRAN' : 'ANIME'}
                      </span>
                      <span className="text-sm font-medium text-gray-800 truncate">{getDisplayName(item)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Auth */}
            {isAdmin ? (
              <>
                <div className="hidden sm:flex items-center bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-100 shadow-sm" title="Logged in as Admin">
                  <i className="fas fa-user-check mr-1.5"></i> Admin
                </div>
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="hidden md:flex bg-brand hover:bg-brand-hover text-white px-3 py-1.5 rounded-lg text-sm font-bold transition shadow-sm items-center disabled:opacity-50"
                >
                  <i className={`fas fa-sync-alt mr-1.5 ${backingUp ? 'animate-spin' : ''}`}></i> Backup
                </button>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg text-sm font-bold transition" title="Logout">
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </>
            ) : (
              <Link to="/login" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center">
                <i className="fas fa-sign-in-alt mr-1.5"></i> Login
              </Link>
            )}

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="lg:hidden text-gray-500 hover:text-brand focus:outline-none p-2 rounded-md hover:bg-gray-50"
            >
              <i className="fas fa-bars text-xl"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-inner overflow-y-auto max-h-[80vh]">
          <div className="px-4 pt-2 pb-4 space-y-1">
            <Link to="/" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 hover:text-brand transition">
              <i className="fas fa-home w-6 text-center text-gray-400 mr-2"></i>Dashboard
            </Link>

            {/* Library accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span><i className="fas fa-layer-group w-6 text-center text-brand/70 mr-2"></i>Library</span>
                <span className="transition-transform group-open:rotate-180"><i className="fas fa-chevron-down text-xs text-gray-400"></i></span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link to="/library/anime" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-brand">Anime Library</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Anime Movie (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Manga (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Novel (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">TV Show (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Movie (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Cartoon (Dev)</Link>
              </div>
            </details>

            {/* Production accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span><i className="fas fa-video w-6 text-center text-gray-400 mr-2"></i>Production</span>
                <span className="transition-transform group-open:rotate-180"><i className="fas fa-chevron-down text-xs text-gray-400"></i></span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Studio (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Seiyuu (Dev)</Link>
              </div>
            </details>

            {/* More accordion */}
            <details className="group">
              <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 cursor-pointer transition">
                <span><i className="fas fa-compass w-6 text-center text-gray-400 mr-2"></i>More</span>
                <span className="transition-transform group-open:rotate-180"><i className="fas fa-chevron-down text-xs text-gray-400"></i></span>
              </summary>
              <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-gray-100 ml-6 mb-2">
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Statistics (Dev)</Link>
                <Link to="/future-releases" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-brand">Future Release</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Seasonal Overall (Dev)</Link>
                <Link to="/under-development" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-gray-400 hover:text-gray-600">Seasonal Detail (Dev)</Link>
              </div>
            </details>

            {isAdmin && (
              <>
                <div className="border-t border-gray-100 my-2"></div>
                <details className="group">
                  <summary className="flex justify-between items-center px-3 py-2.5 rounded-md text-base font-bold text-brand hover:bg-brand/5 cursor-pointer transition">
                    <span><i className="fas fa-shield-alt w-6 text-center mr-2"></i>Admin Tools</span>
                    <span className="transition-transform group-open:rotate-180"><i className="fas fa-chevron-down text-xs"></i></span>
                  </summary>
                  <div className="pl-12 pr-3 py-1 space-y-1 border-l-2 border-brand/20 ml-6 mb-2">
                    <Link to="/system" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-brand">Control Center</Link>
                    <Link to="/add" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-emerald-600">Add Entry</Link>
                    <Link to="/modify" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-blue-600">Modify Entry</Link>
                    <Link to="/delete" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-bold text-gray-700 hover:text-red-600">Delete Entry</Link>
                  </div>
                </details>
                <button onClick={() => { setMobileOpen(false); handleBackup() }} className="w-full text-left px-3 py-2.5 rounded-md text-base font-bold text-gray-700 hover:bg-gray-50 transition flex items-center">
                  <i className="fas fa-sync-alt w-6 text-center mr-2 text-gray-400"></i>Backup Data
                </button>
                <button onClick={() => { setMobileOpen(false); handleLogout() }} className="w-full text-left px-3 py-2.5 rounded-md text-base font-bold text-red-600 hover:bg-red-50 transition flex items-center">
                  <i className="fas fa-sign-out-alt w-6 text-center mr-2"></i>Logout
                </button>
              </>
            )}
            {!isAdmin && (
              <>
                <div className="border-t border-gray-100 my-2"></div>
                <Link to="/login" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-md text-base font-bold text-gray-900 hover:bg-gray-50 transition flex items-center">
                  <i className="fas fa-sign-in-alt w-6 text-center mr-2 text-gray-400"></i>Login
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
