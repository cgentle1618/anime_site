import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { getDisplayName, getSortName, isBaha, getRatingWeight } from '../utils/anime'
import AnimeCard from '../components/AnimeCard'

export default function FranchiseAcg() {
  const { system_id } = useParams()
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [franchise, setFranchise] = useState(null)
  const [seriesList, setSeriesList] = useState([])
  const [animeList, setAnimeList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [sort, setSort] = useState('watch_order')
  const [filters, setFilters] = useState({
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  })

  // Admin editable fields
  const [rating, setRating] = useState('')
  const [expectation, setExpectation] = useState('')
  const [watchNextGroup, setWatchNextGroup] = useState('')
  const [toRewatch, setToRewatch] = useState(false)
  const [remark, setRemark] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [fRes, sRes, aRes] = await Promise.all([
          fetch(`/api/franchise/${system_id}`, { credentials: 'include' }),
          fetch(`/api/series/?franchise_id=${system_id}`, { credentials: 'include' }),
          fetch(`/api/anime/?franchise_id=${system_id}`, { credentials: 'include' }),
        ])
        if (!fRes.ok) throw new Error('Franchise not found')
        const [f, s, a] = await Promise.all([fRes.json(), sRes.json(), aRes.json()])
        setFranchise(f)
        setSeriesList(s)
        setAnimeList(a)
        setRating(f.my_rating || '')
        setExpectation(f.franchise_expectation || '')
        setWatchNextGroup(f.watch_next_group || '')
        setToRewatch(f.to_rewatch || false)
        setRemark(f.remark || '')
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [system_id])

  const handleAnimeUpdated = useCallback((updated) => {
    setAnimeList(prev => prev.map(a => a.system_id === updated.system_id ? updated : a))
  }, [])

  async function saveField(field, value) {
    try {
      const res = await fetch(`/api/franchise/${system_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value === '' ? null : value }),
        credentials: 'include',
      })
      if (res.ok) {
        const updated = await res.json()
        setFranchise(updated)
        showToast('success', 'Franchise updated successfully')
      } else {
        showToast('error', 'Save failed')
      }
    } catch {
      showToast('error', 'Network error. Reverting.')
    }
  }

  function toggleFilter(group, value) {
    setFilters(prev => {
      const next = { ...prev, [group]: new Set(prev[group]) }
      if (next[group].has(value)) next[group].delete(value)
      else next[group].add(value)
      return next
    })
  }

  const filteredAndSorted = useMemo(() => {
    let result = animeList.filter(a => {
      if (filters.airingType.size > 0 && !filters.airingType.has(a.airing_type)) return false
      if (filters.airingStatus.size > 0 && !filters.airingStatus.has(a.airing_status)) return false
      if (filters.bahaOnly && !isBaha(a)) return false
      if (filters.watchingStatus.size > 0) {
        const ws = a.watching_status || 'Might Watch'
        let group = 'Might Watch'
        if (['Plan to Watch', 'Watch When Airs'].includes(ws)) group = 'Planned'
        else if (['Active Watching', 'Passive Watching', 'Paused'].includes(ws)) group = 'Watching'
        else if (ws === 'Completed') group = 'Completed'
        else if (['Temp Dropped', 'Dropped', "Won't Watch"].includes(ws)) group = 'Dropped'
        if (!filters.watchingStatus.has(group)) return false
      }
      return true
    })

    result.sort((a, b) => {
      if (sort === 'watch_order') return (a.watch_order ?? 999999) - (b.watch_order ?? 999999)
      if (sort === 'release_date') {
        const MONTH_MAP = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 }
        const scoreA = (parseInt(a.release_year) || 0) * 100 + (MONTH_MAP[(a.release_month||'').toUpperCase()] || 0)
        const scoreB = (parseInt(b.release_year) || 0) * 100 + (MONTH_MAP[(b.release_month||'').toUpperCase()] || 0)
        if (scoreA !== scoreB) return scoreA - scoreB
      }
      if (sort === 'my_rating') return getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating)
      if (sort === 'mal_rating') {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1
        if (wA !== wB) return wB - wA
      }
      return getSortName(a, 'anime').localeCompare(getSortName(b, 'anime'))
    })

    return result
  }, [animeList, filters, sort])

  // Group by series
  const seriesGroups = useMemo(() => {
    const seriesMap = Object.fromEntries(seriesList.map(s => [s.system_id, s]))
    const grouped = {}
    const standalone = []

    filteredAndSorted.forEach(a => {
      if (a.series_id && seriesMap[a.series_id]) {
        if (!grouped[a.series_id]) grouped[a.series_id] = []
        grouped[a.series_id].push(a)
      } else {
        standalone.push(a)
      }
    })

    const result = []
    seriesList.forEach(s => {
      if (grouped[s.system_id]?.length > 0) {
        result.push({ type: 'series', series: s, anime: grouped[s.system_id] })
      }
    })
    if (standalone.length > 0) {
      result.push({ type: 'standalone', anime: standalone })
    }
    return result
  }, [filteredAndSorted, seriesList])

  const completedCount = animeList.filter(a => a.watching_status === 'Completed').length
  const completionPct = animeList.length > 0 ? Math.round((completedCount / animeList.length) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading ACG Franchise Hub...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Franchise</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const mainTitle = franchise.franchise_name_cn || franchise.franchise_name_en || franchise.franchise_name_alt || franchise.franchise_name_romanji || franchise.franchise_name_jp || 'Unknown Franchise'
  const subTitles = [franchise.franchise_name_en, franchise.franchise_name_romanji, franchise.franchise_name_alt, franchise.franchise_name_jp].filter(t => t && t !== mainTitle)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
        <Link to="/library/anime" className="hover:text-brand font-medium">
          <i className="fas fa-tv mr-1"></i>Anime
        </Link>
        <span>/</span>
        <span className="font-bold text-gray-800 truncate">{mainTitle}</span>
      </nav>

      {/* Admin toolbar */}
      {isAdmin && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
          <span className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <i className="fas fa-shield-alt"></i> Admin Tools
          </span>
          <button
            onClick={() => navigate(`/modify?id=${system_id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-50 transition shadow-sm"
          >
            <i className="fas fa-pencil-alt"></i> Quick Edit
          </button>
        </div>
      )}

      {/* Hero section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          {/* Left: title + info */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-2">
              <i className="fas fa-sitemap mr-1"></i>{franchise.franchise_type || 'ACG Franchise'}
            </div>
            <h1 className="text-2xl font-black text-gray-900 leading-tight mb-1">{mainTitle}</h1>
            {subTitles.map((t, i) => (
              <p key={i} className="text-sm text-gray-500 font-medium truncate">{t}</p>
            ))}

            <div className="flex flex-wrap gap-2 mt-4">
              {franchise.my_rating && (
                <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-star mr-1"></i>{franchise.my_rating}
                </span>
              )}
              {franchise.franchise_expectation && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  {franchise.franchise_expectation} Expectation
                </span>
              )}
              {franchise.watch_next_group && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-list-ol mr-1"></i>
                  Watch Next: {{"12ep": "12 EP", "24ep": "24 EP", "30ep_plus": "30+ EP"}[franchise.watch_next_group]}
                </span>
              )}
              {franchise.to_rewatch && (
                <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-redo mr-1"></i>To Rewatch
                </span>
              )}
              <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                {animeList.length} Entries
              </span>
            </div>
          </div>

          {/* Right: completion + admin controls */}
          <div className="lg:w-52 shrink-0 space-y-3">
            {/* Completion */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Completion</div>
              <div className="text-2xl font-black text-gray-900 mb-1">{completionPct}%</div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                <div className="bg-brand h-2 rounded-full transition-all" style={{ width: `${completionPct}%` }}></div>
              </div>
              <div className="text-xs text-gray-500 font-medium">{completedCount} / {animeList.length} completed</div>
            </div>

            {/* Admin-only selects */}
            {isAdmin && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Overall Rating</label>
                  <select
                    value={rating}
                    onChange={e => { setRating(e.target.value); saveField('my_rating', e.target.value) }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— Not Rated —</option>
                    {['S', 'A+', 'A', 'B', 'C', 'D', 'E', 'F'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Expectation</label>
                  <select
                    value={expectation}
                    onChange={e => { setExpectation(e.target.value); saveField('franchise_expectation', e.target.value) }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— None —</option>
                    {['High', 'Medium', 'Low'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Watch Next Group</label>
                  <select
                    value={watchNextGroup}
                    onChange={e => { setWatchNextGroup(e.target.value); saveField('watch_next_group', e.target.value) }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— Not in Watch List —</option>
                    <option value="12ep">12 EP</option>
                    <option value="24ep">24 EP</option>
                    <option value="30ep_plus">30+ EP</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">To Rewatch</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={toRewatch}
                      onChange={e => { setToRewatch(e.target.checked); saveField('to_rewatch', e.target.checked) }}
                      className="w-4 h-4 rounded accent-brand"
                    />
                    <span className="text-xs font-medium text-gray-700">Mark for rewatch</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <i className="fas fa-sticky-note text-brand/60"></i> Notes & Overview
        </div>
        <textarea
          value={remark}
          onChange={e => setRemark(e.target.value)}
          onBlur={() => saveField('remark', remark)}
          disabled={!isAdmin}
          rows={3}
          placeholder="Add private overview notes, watch order guides, or specific remarks for the entire franchise..."
          className={`w-full border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-500 cursor-default'}`}
        />
      </div>

      {/* Anime Section */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-200">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <i className="fas fa-tv text-brand"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">Anime</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">TV · ONA · Movie · OVA · Special</p>
          </div>
          <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">{filteredAndSorted.length} entries</span>
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
          >
            <option value="watch_order">Sort: Watch Order</option>
            <option value="title">Sort: Title</option>
            <option value="release_date">Sort: Release Date</option>
            <option value="my_rating">Sort: My Rating</option>
            <option value="mal_rating">Sort: MAL Rating</option>
          </select>

          <div className="w-px h-5 bg-gray-200"></div>

          {/* Airing Type filters */}
          {['TV', 'Movie', 'ONA', 'OVA', 'Special'].map(v => (
            <button
              key={v}
              onClick={() => toggleFilter('airingType', v)}
              className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.airingType.has(v) ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {v}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200"></div>

          {/* Airing Status filters */}
          {[['Airing', 'Airing'], ['Finished', 'Finished Airing'], ['Not Aired', 'Not Yet Aired']].map(([label, val]) => (
            <button
              key={val}
              onClick={() => toggleFilter('airingStatus', val)}
              className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.airingStatus.has(val) ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200"></div>

          {/* Watching Status filters */}
          {['Planned', 'Watching', 'Completed', 'Dropped', 'Might Watch'].map(v => (
            <button
              key={v}
              onClick={() => toggleFilter('watchingStatus', v)}
              className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${filters.watchingStatus.has(v) ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {v}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200"></div>

          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.bahaOnly}
              onChange={e => setFilters(p => ({ ...p, bahaOnly: e.target.checked }))}
              className="rounded"
            />
            Baha Only
          </label>
        </div>

        {/* Anime groups by series */}
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <i className="fas fa-ghost text-3xl mb-3"></i>
            <p className="font-medium">No entries match the current filters.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {seriesGroups.map((group, idx) => {
              const label = group.type === 'series'
                ? (getDisplayName(group.series, 'series') || 'Unknown Series')
                : 'Standalone'
              return (
                <section key={group.type === 'series' ? group.series.system_id : 'standalone'}>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                      <i className={`fas ${group.type === 'series' ? 'fa-layer-group' : 'fa-film'} text-brand/70`}></i>
                      {label}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{group.anime.length}</span>
                    <div className="flex-1 border-t border-gray-100"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {group.anime.map(a => (
                      <div key={a.system_id} className="flex flex-col gap-1">
                        {sort === 'watch_order' && a.watch_order != null && (
                          <div className="text-[10px] font-black text-brand/70 uppercase tracking-widest text-center">
                            #{a.watch_order}
                          </div>
                        )}
                        <AnimeCard anime={a} onUpdated={handleAnimeUpdated} />
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* Manga — Under Development */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <i className="fas fa-book text-gray-400"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-400 tracking-tight leading-none">Manga</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Manga · Manhwa · Manhua</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <i className="fas fa-tools text-2xl text-gray-300 mb-2"></i>
          <p className="text-sm font-bold text-gray-400">Under Development</p>
        </div>
      </div>

      {/* Novel — Under Development */}
      <div>
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <i className="fas fa-book-open text-gray-400"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-400 tracking-tight leading-none">Novel</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Light Novel · Web Novel</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <i className="fas fa-tools text-2xl text-gray-300 mb-2"></i>
          <p className="text-sm font-bold text-gray-400">Under Development</p>
        </div>
      </div>

    </div>
  )
}
