import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { getCoverUrl, FALLBACK_SVG, isBaha } from '../utils/anime'

const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 }
const SEASON_LABEL = { WIN: 'Winter', SPR: 'Spring', SUM: 'Summer', FAL: 'Fall' }
const WATCHING_PRIORITY = { 'Watch When Airs': 0, 'Plan to Watch': 1, 'Might Watch': 2 }
const EXPECTATION_PRIORITY = { High: 0, Medium: 1, Low: 2 }
const WATCHING_OPTIONS = ['Might Watch', 'Plan to Watch', 'Watch When Airs']

function getGroupKey(anime) {
  const { release_year: year, release_season: season } = anime
  if (year && season && SEASON_ORDER[season] !== undefined) return `S_${year}_${SEASON_ORDER[season]}`
  if (year) return `Y_${year}`
  return 'Z_TBD'
}

function getGroupLabel(key) {
  if (key === 'Z_TBD') return 'TBD'
  if (key.startsWith('Y_')) return key.slice(2)
  const parts = key.split('_')
  const seasonCode = Object.keys(SEASON_ORDER).find(k => SEASON_ORDER[k] === Number(parts[2]))
  return `${SEASON_LABEL[seasonCode] || '?'} ${parts[1]}`
}

function seasonRawToKey(raw) {
  if (!raw || raw === 'Not Set') return null
  const parts = raw.trim().split(' ')
  if (parts.length !== 2) return null
  const [code, year] = parts
  const idx = SEASON_ORDER[code]
  if (idx === undefined) return null
  return `S_${year}_${idx}`
}

function getNextSeasonKey(currentKey) {
  if (!currentKey || !currentKey.startsWith('S_')) return null
  const parts = currentKey.split('_')
  const year = Number(parts[1])
  const idx = Number(parts[2])
  return idx < 3 ? `S_${year}_${idx + 1}` : `S_${year + 1}_0`
}

function sortGroup(entries, franchiseDict) {
  return [...entries].sort((a, b) => {
    const wa = WATCHING_PRIORITY[a.watching_status] ?? 9
    const wb = WATCHING_PRIORITY[b.watching_status] ?? 9
    if (wa !== wb) return wa - wb
    const fa = franchiseDict[a.franchise_id]
    const fb = franchiseDict[b.franchise_id]
    const ea = EXPECTATION_PRIORITY[fa?.franchise_expectation] ?? 9
    const eb = EXPECTATION_PRIORITY[fb?.franchise_expectation] ?? 9
    return ea - eb
  })
}

const SPECIFIC_TYPES = ['TV', 'ONA', 'Movie']

function AnimeCardThird({ anime, franchiseDict, isAdmin, onUpdated }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const title = anime.anime_name_cn || anime.anime_name_en || anime.anime_name_alt || anime.anime_name_romanji || anime.anime_name_jp || 'Unknown'
  const imageUrl = getCoverUrl(anime.cover_image_file)
  const franchise = franchiseDict[anime.franchise_id]
  const expectation = franchise?.franchise_expectation
  const bahaFlag = isBaha(anime)
  const hasBahaLink = bahaFlag && anime.baha_link && anime.baha_link !== 'N/A'

  const currentStatus = anime.watching_status || 'Might Watch'
  const needsExtra = !WATCHING_OPTIONS.includes(currentStatus)

  async function handleStatusChange(e) {
    e.stopPropagation()
    const newStatus = e.target.value
    try {
      const res = await fetch(`/api/anime/${anime.system_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watching_status: newStatus }),
        credentials: 'include',
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdated?.(updated)
      } else {
        showToast('error', 'Update failed')
      }
    } catch {
      showToast('error', 'Network error')
    }
  }

  async function handleMarkAiring(e) {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/anime/${anime.system_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airing_status: 'Airing' }),
        credentials: 'include',
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdated?.(updated)
        showToast('success', `${title} marked as Airing`)
      } else {
        showToast('error', 'Update failed')
      }
    } catch {
      showToast('error', 'Network error')
    }
  }

  const expectationColor = { High: 'bg-amber-500/80', Medium: 'bg-sky-500/80', Low: 'bg-gray-500/70' }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navigate(`/anime/${anime.system_id}`)}
    >
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {expectation && (
          <div className={`absolute top-1 left-1 ${expectationColor[expectation] || 'bg-gray-500/70'} text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20`}>
            {expectation}
          </div>
        )}
        <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
          <i className="fas fa-tv mr-1 text-brand"></i>{anime.airing_type || '?'}
        </div>
        {bahaFlag && (
          hasBahaLink ? (
            <a
              href={anime.baha_link}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center"
              title="Watch on Bahamut"
            >
              <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-3 opacity-90" alt="Baha" />
            </a>
          ) : (
            <div className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center" title="Available on Bahamut (no link)">
              <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-3 opacity-30 grayscale" alt="Baha" />
            </div>
          )
        )}
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
          onError={e => { e.target.src = FALLBACK_SVG }}
        />
      </div>

      <div className="p-3 flex flex-col flex-1 bg-white">
        <h3 className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight" title={title}>{title}</h3>
        {anime.studio && <p className="text-[10px] text-gray-400 truncate mt-0.5">{anime.studio}</p>}
        <div className="mt-auto flex items-center gap-1 border-t border-gray-100 pt-2.5">
          {isAdmin && (
            <>
              <select
                value={needsExtra ? currentStatus : currentStatus}
                onChange={handleStatusChange}
                onClick={e => e.stopPropagation()}
                className="text-[10px] font-bold rounded border border-gray-200 px-1 py-0.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-brand w-full"
                title="Watching status"
              >
                {needsExtra && <option value={currentStatus} disabled>{currentStatus}</option>}
                {WATCHING_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={handleMarkAiring}
                className="w-6 h-6 flex items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 transition text-[10px] shrink-0"
                title="Mark as Airing"
              >
                <i className="fas fa-bolt"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FutureReleases() {
  const { isAdmin } = useAuth()
  const [allAnime, setAllAnime] = useState([])
  const [franchiseDict, setFranchiseDict] = useState({})
  const [currentSeasonKey, setCurrentSeasonKey] = useState(null)
  const [activeTypeFilter, setActiveTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [animeRes, franchiseRes, seasonRes] = await Promise.all([
          fetch('/api/anime/', { credentials: 'include' }),
          fetch('/api/franchise/', { credentials: 'include' }),
          fetch('/api/system/config/current_season', { credentials: 'include' }),
        ])
        if (!animeRes.ok || !franchiseRes.ok) throw new Error('API error')
        const [animeData, franchiseData, seasonData] = await Promise.all([
          animeRes.json(),
          franchiseRes.json(),
          seasonRes.ok ? seasonRes.json() : Promise.resolve({}),
        ])

        const fDict = Object.fromEntries(franchiseData.map(f => [f.system_id, f]))
        setFranchiseDict(fDict)

        const csKey = seasonRawToKey(seasonData.current_season || '')
        setCurrentSeasonKey(csKey)

        const filtered = animeData.filter(a => {
          if (a.airing_status !== 'Not Yet Aired') return false
          if (csKey) {
            const key = getGroupKey(a)
            if (key.startsWith('S_') && key < csKey) return false
          }
          return true
        })
        setAllAnime(filtered)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleUpdated = useCallback((updated) => {
    setAllAnime(prev => {
      const idx = prev.findIndex(a => a.system_id === updated.system_id)
      if (idx < 0) return prev
      if (updated.airing_status === 'Airing') {
        return prev.filter(a => a.system_id !== updated.system_id)
      }
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  const filtered = allAnime.filter(a => {
    const t = a.airing_type || ''
    if (activeTypeFilter === 'all') return true
    if (activeTypeFilter === 'other') return !SPECIFIC_TYPES.includes(t)
    return t === activeTypeFilter
  })

  // Group and sort
  const groups = {}
  for (const anime of filtered) {
    const key = getGroupKey(anime)
    if (!groups[key]) groups[key] = []
    groups[key].push(anime)
  }
  const sortedKeys = Object.keys(groups).sort()
  const nextSeasonKey = getNextSeasonKey(currentSeasonKey)

  const typeFilters = [
    { key: 'all', label: 'All' },
    { key: 'TV', label: 'TV' },
    { key: 'ONA', label: 'ONA' },
    { key: 'Movie', label: 'Movie' },
    { key: 'other', label: 'Other' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading future releases...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Failed to load releases</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <i className="fas fa-calendar-plus text-brand"></i>
          Future Releases
        </h1>
        <p className="text-gray-500 mt-1 text-sm font-medium">Upcoming anime yet to air</p>
      </div>

      {/* Type filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {typeFilters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTypeFilter(key)}
            className={`px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${
              activeTypeFilter === key
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {sortedKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <i className="fas fa-calendar-times text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 font-medium">No upcoming releases found.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedKeys.map(key => {
            const label = getGroupLabel(key)
            const sorted = sortGroup(groups[key], franchiseDict)
            let badge = null
            if (key === currentSeasonKey) {
              badge = <span className="text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">Current</span>
            } else if (key === nextSeasonKey) {
              badge = <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Next</span>
            }

            return (
              <section key={key}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-base font-black text-gray-800">{label}</h2>
                  {badge}
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{sorted.length}</span>
                  <div className="flex-1 border-t border-gray-100"></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sorted.map(anime => (
                    <AnimeCardThird
                      key={anime.system_id}
                      anime={anime}
                      franchiseDict={franchiseDict}
                      isAdmin={isAdmin}
                      onUpdated={handleUpdated}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
