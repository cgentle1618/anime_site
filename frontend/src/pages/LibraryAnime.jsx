import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AnimeCard from '../components/AnimeCard'
import { getDisplayName, getSortName, isBaha, getCoverUrl, FALLBACK_SVG, getStatusStyle, getNextStatus, getRatingWeight } from '../utils/anime'
import { useToast } from '../hooks/useToast'

function cleanString(str) {
  if (!str) return ''
  return str.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
}

const MONTH_MAP = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 }

function getReleaseSortScore(item) {
  const y = item.release_year ? parseInt(item.release_year, 10) : 0
  const mStr = item.release_month ? item.release_month.toUpperCase() : ''
  const m = MONTH_MAP[mStr] || 0
  return y * 100 + m
}

export default function LibraryAnime() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [allAnime, setAllAnime] = useState([])
  const [franchiseDict, setFranchiseDict] = useState({})
  const [seriesDict, setSeriesDict] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [currentSort, setCurrentSort] = useState('title')
  const [currentView, setCurrentView] = useState('grid')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    airingType: new Set(),
    airingStatus: new Set(),
    watchingStatus: new Set(),
    bahaOnly: false,
  })

  useEffect(() => {
    async function fetch_() {
      try {
        const [aRes, fRes, sRes] = await Promise.all([
          fetch('/api/anime/', { credentials: 'include' }),
          fetch('/api/franchise/', { credentials: 'include' }),
          fetch('/api/series/', { credentials: 'include' }),
        ])
        if (!aRes.ok || !fRes.ok || !sRes.ok) throw new Error('Failed to fetch database')
        const [anime, franchises, series] = await Promise.all([aRes.json(), fRes.json(), sRes.json()])
        setAllAnime(anime)
        setFranchiseDict(Object.fromEntries(franchises.map(f => [f.system_id, f])))
        setSeriesDict(Object.fromEntries(series.map(s => [s.system_id, s])))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetch_()
  }, [])

  const handleUpdated = useCallback((updated) => {
    setAllAnime(prev => prev.map(a => a.system_id === updated.system_id ? updated : a))
  }, [])

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery)
    const seasonMap = { WIN: 'Winter', SPR: 'Spring', SUM: 'Summer', FAL: 'Fall' }

    let result = allAnime.filter(a => {
      if (qClean) {
        const f = franchiseDict[a.franchise_id]
        const s = seriesDict[a.series_id]
        const fullSeason = a.release_season ? seasonMap[a.release_season.toUpperCase()] : ''
        // Concatenated seasonal strings (e.g. "WIN2026", "Winter2026") so "win 2026" matches
        const seasonYear = a.release_season && a.release_year ? `${a.release_season}${a.release_year}` : ''
        const fullSeasonYear = fullSeason && a.release_year ? `${fullSeason}${a.release_year}` : ''
        const fields = [
          a.anime_name_cn, a.anime_name_en, a.anime_name_romanji, a.anime_name_jp, a.anime_name_alt,
          f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_romanji,
          s?.series_name_cn, s?.series_name_en,
          a.release_season, fullSeason,
          a.release_year, seasonYear, fullSeasonYear,
          a.genre_main, a.genre_sub,
        ]
        if (!fields.some(field => field && cleanString(String(field)).includes(qClean))) return false
      }
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
      if (currentSort === 'release_date') {
        const diff = getReleaseSortScore(b) - getReleaseSortScore(a)
        if (diff !== 0) return diff
      } else if (currentSort === 'my_rating') {
        const diff = getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating)
        if (diff !== 0) return diff
      } else if (currentSort === 'mal_rating') {
        const wA = a.mal_rating != null ? parseFloat(a.mal_rating) : -1
        const wB = b.mal_rating != null ? parseFloat(b.mal_rating) : -1
        if (wA !== wB) return wB - wA
      }
      // Title fallback
      const anameA = getSortName(a, 'anime')
      const anameB = getSortName(b, 'anime')
      const fA = franchiseDict[a.franchise_id]
      const fB = franchiseDict[b.franchise_id]
      const sA = seriesDict[a.series_id]
      const sB = seriesDict[b.series_id]
      const fnA = fA ? getSortName(fA, 'franchise') : anameA
      const fnB = fB ? getSortName(fB, 'franchise') : anameB
      const cmpF = fnA.localeCompare(fnB)
      if (cmpF !== 0) return cmpF
      const snA = sA ? getSortName(sA, 'series') : ''
      const snB = sB ? getSortName(sB, 'series') : ''
      const cmpS = snA.localeCompare(snB)
      if (cmpS !== 0) return cmpS
      return anameA.localeCompare(anameB)
    })

    return result
  }, [allAnime, franchiseDict, seriesDict, searchQuery, currentSort, filters])

  function toggleFilter(group, value) {
    setFilters(prev => {
      const next = { ...prev, [group]: new Set(prev[group]) }
      if (next[group].has(value)) next[group].delete(value)
      else next[group].add(value)
      return next
    })
  }

  function clearFilters() {
    setFilters({ airingType: new Set(), airingStatus: new Set(), watchingStatus: new Set(), bahaOnly: false })
  }

  const activeFilterCount = filters.airingType.size + filters.airingStatus.size + filters.watchingStatus.size + (filters.bahaOnly ? 1 : 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading library...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Database Error</p><p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const FilterTag = ({ group, value, label }) => {
    const active = filters[group].has(value)
    return (
      <button
        onClick={() => toggleFilter(group, value)}
        className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <i className="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm pointer-events-none"></i>
          <input
            type="text"
            placeholder="Search anime, franchise, season..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <i className="fas fa-times text-sm"></i>
            </button>
          )}
        </div>
        <select
          value={currentSort}
          onChange={e => setCurrentSort(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
        >
          <option value="title">Sort: Title</option>
          <option value="release_date">Sort: Release Date</option>
          <option value="my_rating">Sort: My Rating</option>
          <option value="mal_rating">Sort: MAL Rating</option>
        </select>
        <button
          onClick={() => setShowFilters(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${showFilters ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
        >
          <i className="fas fa-filter"></i> Filters
          {activeFilterCount > 0 && <span className="bg-brand text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
        </button>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setCurrentView('grid')} className={`px-3 py-2 text-sm transition-colors ${currentView === 'grid' ? 'bg-brand text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}>
            <i className="fas fa-th-large"></i>
          </button>
          <button onClick={() => setCurrentView('table')} className={`px-3 py-2 text-sm transition-colors ${currentView === 'table' ? 'bg-brand text-white' : 'bg-white text-gray-400 hover:text-gray-600'}`}>
            <i className="fas fa-list"></i>
          </button>
        </div>
        <span className="text-sm font-bold text-gray-500">{filteredAndSorted.length} results</span>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Filters</span>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="text-xs font-bold text-red-500 hover:text-red-700">Clear All</button>}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">Airing Type</div>
            <div className="flex flex-wrap gap-1.5">
              {['TV', 'Movie', 'ONA', 'OVA', 'Special'].map(v => <FilterTag key={v} group="airingType" value={v} label={v} />)}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">Airing Status</div>
            <div className="flex flex-wrap gap-1.5">
              {['Airing', 'Finished Airing', 'Not Yet Aired'].map(v => <FilterTag key={v} group="airingStatus" value={v} label={v} />)}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 mb-1.5">Watch Status</div>
            <div className="flex flex-wrap gap-1.5">
              {['Watching', 'Planned', 'Completed', 'Dropped', 'Might Watch'].map(v => <FilterTag key={v} group="watchingStatus" value={v} label={v} />)}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filters.bahaOnly} onChange={e => setFilters(p => ({ ...p, bahaOnly: e.target.checked }))} className="rounded" />
            <span className="text-xs font-bold text-gray-600">Bahamut source only</span>
          </label>
        </div>
      )}

      {/* Content */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-20">
          <i className="fas fa-ghost text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 font-medium">No anime match the current filters.</p>
        </div>
      ) : currentView === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredAndSorted.map(a => (
            <AnimeCard key={a.system_id} anime={a} onUpdated={handleUpdated} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100">Franchise</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100">Title</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">Season</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100">Status</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden sm:table-cell">EP</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden lg:table-cell">My</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden xl:table-cell">MAL</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100 hidden xl:table-cell">Studio</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center border-r border-gray-100">Baha</th>
                <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center">Watch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAndSorted.map(a => {
                const f = franchiseDict[a.franchise_id]
                const fName = f ? getDisplayName(f, 'franchise') : <span className="text-gray-300 italic">None</span>
                const mainTitle = getDisplayName(a, 'anime')
                const subTitle = a.anime_name_en || a.anime_name_romanji || ''
                const cumFin = a.cum_ep_fin ?? (a.ep_fin || 0)
                const cumTotal = a.cum_ep_total ?? (a.ep_total !== null && a.ep_total !== undefined ? a.ep_total : '?')
                const bahaFlag = isBaha(a)
                const statusStyle = getStatusStyle(a.watching_status)
                const nextStatus = getNextStatus(a.watching_status || 'Might Watch')

                let airStatusColor = 'text-gray-500 bg-gray-100'
                if (a.airing_status === 'Airing') airStatusColor = 'text-green-700 bg-green-100'
                else if (a.airing_status === 'Finished Airing') airStatusColor = 'text-blue-700 bg-blue-100'
                else if (a.airing_status === 'Not Yet Aired') airStatusColor = 'text-orange-700 bg-orange-100'

                async function handleStatusToggle(e) {
                  e.stopPropagation()
                  const res = await fetch(`/api/anime/${a.system_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ watching_status: nextStatus }),
                    credentials: 'include',
                  })
                  if (res.ok) {
                    const updated = await res.json()
                    handleUpdated(updated)
                    showToast('success', `Status → ${nextStatus}`)
                  }
                }

                return (
                  <tr
                    key={a.system_id}
                    onClick={() => navigate(`/anime/${a.system_id}`)}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2 text-xs text-gray-600 font-medium truncate max-w-[12rem] border-r border-gray-100">{fName}</td>
                    <td className="px-4 py-2 border-r border-gray-100">
                      <div className="text-xs font-bold text-gray-900 leading-tight line-clamp-1">{mainTitle}</div>
                      {subTitle && subTitle !== mainTitle && <div className="text-[9px] text-gray-400 line-clamp-1">{subTitle}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs text-center font-bold text-gray-600 border-r border-gray-100 hidden md:table-cell">{a.airing_type || '-'}</td>
                    <td className="px-4 py-2 text-xs text-center text-gray-500 border-r border-gray-100 hidden lg:table-cell">{a.season_part || '-'}</td>
                    <td className="px-4 py-2 text-center border-r border-gray-100">
                      <span className={`px-2 inline-flex text-[9px] leading-4 font-bold rounded-full ${airStatusColor}`}>{a.airing_status || '-'}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-center font-mono text-gray-700 border-r border-gray-100 hidden sm:table-cell">{cumFin} / {cumTotal}</td>
                    <td className="px-4 py-2 text-center border-r border-gray-100 hidden lg:table-cell">
                      {a.my_rating ? <span className="bg-yellow-100 text-yellow-800 font-black px-2 py-0.5 rounded text-[10px]">{a.my_rating}</span> : '-'}
                    </td>
                    <td className="px-4 py-2 text-xs text-center border-r border-gray-100 hidden xl:table-cell">
                      {a.mal_rating ? <span className="font-bold text-blue-600">{a.mal_rating}</span> : '-'}
                    </td>
                    <td className="px-4 py-2 text-xs text-center text-gray-500 border-r border-gray-100 hidden xl:table-cell truncate max-w-[8rem]">{a.studio || '-'}</td>
                    <td className="px-4 py-2 text-center border-r border-gray-100" onClick={e => e.stopPropagation()}>
                      {bahaFlag ? (
                        a.baha_link
                          ? <a href={a.baha_link} target="_blank" rel="noreferrer" className="inline-block hover:scale-110 transition-transform"><img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-4 opacity-90" alt="Baha" /></a>
                          : <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-4 inline-block opacity-50 grayscale" alt="Baha" />
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                      {isAdmin ? (
                        <button onClick={handleStatusToggle} className={`w-6 h-6 flex items-center justify-center rounded-md border transition-colors mx-auto ${statusStyle.cls}`} title={`${a.watching_status || 'Might Watch'} → ${nextStatus}`}>
                          <i className={`fas ${statusStyle.icon} text-[10px]`}></i>
                        </button>
                      ) : a.watching_status ? (
                        <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 mx-auto max-w-full truncate">{a.watching_status}</div>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
