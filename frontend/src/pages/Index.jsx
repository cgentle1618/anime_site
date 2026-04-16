import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { getCoverUrl, FALLBACK_SVG, isBaha, getRatingWeight } from '../utils/anime'

const RATING_WEIGHT = { S: 0, 'A+': 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7, Unrated: 8 }

function DashboardCard({ anime, franchise, isAdmin, onEpChange }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const title = anime.anime_name_cn || anime.anime_name_en || anime.anime_name_romanji || 'Unknown Title'
  const subTitle = franchise
    ? franchise.franchise_name_cn || franchise.franchise_name_en || franchise.franchise_name_romanji || 'Independent'
    : 'Independent Series'

  const imageUrl = getCoverUrl(anime.cover_image_file)
  const bahaFlag = isBaha(anime)

  const prevEps = anime.ep_previous || 0
  const localFin = anime.ep_fin || 0
  const localTotal = anime.ep_total !== null && anime.ep_total !== undefined ? parseInt(anime.ep_total, 10) || '?' : '?'
  const cumFin = anime.cum_ep_fin ?? localFin
  const cumTotal = anime.cum_ep_total ?? localTotal

  let progressPercent = 0
  let progressStyle = 'width: 0%'
  if (cumTotal !== '?') {
    progressPercent = Math.round((cumFin / cumTotal) * 100)
    progressStyle = `width: ${progressPercent}%`
  } else if (localFin > 0) {
    progressPercent = 'Ongoing'
    progressStyle = 'width: 100%; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
  }

  let statusColor = 'bg-gray-100 text-gray-600 border-gray-200'
  if (anime.airing_status === 'Airing') statusColor = 'bg-green-100 text-green-700 border-green-200'
  else if (anime.airing_status === 'Finished Airing') statusColor = 'bg-blue-100 text-blue-700 border-blue-200'
  else if (anime.airing_status === 'Not Yet Aired') statusColor = 'bg-orange-100 text-orange-700 border-orange-200'

  async function handleEpChange(newVal) {
    if (!isAdmin) return
    const target = Math.max(0, newVal)
    if (localTotal !== '?' && target > localTotal) {
      showToast('error', 'Cannot exceed total episodes.')
      return
    }
    if (target === localFin) return
    onEpChange(anime.system_id, target, localFin)
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative hover:shadow-md transition-shadow"
      onClick={() => navigate(`/anime/${anime.system_id}`)}
    >
      <div className="flex p-3">
        <div className="w-20 h-28 shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative">
          {anime.my_rating && (
            <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
              <i className="fas fa-star text-[8px] mr-1"></i>{anime.my_rating}
            </div>
          )}
          <img src={imageUrl} alt="Cover" className="w-full h-full object-cover" onError={e => { e.target.src = FALLBACK_SVG }} />
        </div>
        <div className="ml-4 flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight mb-1" title={title}>{title}</h3>
          <p className="text-xs text-gray-500 truncate mb-2">From franchise: {subTitle}</p>
          <div className="flex items-center flex-wrap gap-1.5 mt-auto">
            <span className={`${statusColor} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm truncate max-w-[90px] text-center`}>{anime.airing_status || 'Unknown'}</span>
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200 shadow-sm">
              <i className="fas fa-tv mr-1"></i>{anime.airing_type || 'TV'}
            </span>
            {bahaFlag && anime.baha_link && (
              <a href={anime.baha_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-block hover:scale-110 transition-transform" title="Watch on Bahamut">
                <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-3.5 opacity-90" alt="Baha" />
              </a>
            )}
            {bahaFlag && !anime.baha_link && (
              <span className="inline-block" title="Available on Bahamut">
                <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-3.5 opacity-50 grayscale" alt="Baha" />
              </span>
            )}
            {anime.source_netflix && (
              <span className="bg-red-50 border border-red-200 text-[#E50914] font-black px-1.5 py-0.5 rounded text-[10px] leading-none" title="Available on Netflix">N</span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); navigate(`/modify?id=${anime.system_id}`) }}
            className="absolute top-2 right-2 bg-white/90 text-gray-500 hover:text-brand hover:bg-white rounded-md w-7 h-7 flex items-center justify-center shadow-sm backdrop-blur-sm transition-colors z-10 border border-gray-100"
            title="Quick Edit"
          >
            <i className="fas fa-pencil-alt text-xs"></i>
          </button>
        )}
      </div>

      <div className="bg-gray-50 p-3 border-t border-gray-100 mt-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Progress</span>
          <span className="text-[10px] font-bold text-brand">{progressPercent}{cumTotal !== '?' ? '%' : ''}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
          <div className="bg-brand h-1.5 rounded-full transition-all duration-500" style={{ width: cumTotal !== '?' ? `${progressPercent}%` : localFin > 0 ? '100%' : '0%' }}></div>
        </div>

        {isAdmin ? (
          <div className="flex items-center justify-between bg-white rounded-lg p-1.5 border border-gray-200 shadow-sm relative z-20">
            <button
              onClick={() => handleEpChange(localFin - 1)}
              className="w-7 h-7 shrink-0 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition flex items-center justify-center"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1 whitespace-nowrap overflow-hidden">
              <input
                type="number"
                className="text-gray-900 w-7 text-center bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0"
                value={localFin}
                onChange={e => handleEpChange(parseInt(e.target.value, 10) || 0)}
                onClick={e => e.stopPropagation()}
              />
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-6 text-center">{localTotal}</span>
              {prevEps > 0 && <span className="text-gray-400 ml-1 text-[11px] font-normal tracking-tighter" title="Cumulative Total">({cumFin}/{cumTotal})</span>}
            </div>
            <button
              onClick={() => handleEpChange(localFin + 1)}
              className="w-7 h-7 shrink-0 rounded-md bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-gray-50 rounded-lg p-1.5 border border-gray-200 shadow-inner h-[40px]">
            <div className="font-mono font-bold text-[13px] tracking-wide flex items-baseline justify-center select-none w-full px-1">
              <span className="text-gray-900 w-6 text-center">{localFin}</span>
              <span className="text-gray-400 mx-0.5 text-xs">/</span>
              <span className="text-gray-500 text-[13px] w-6 text-center">{localTotal}</span>
              {prevEps > 0 && <span className="text-gray-400 ml-1 text-[11px] font-normal tracking-tighter">({cumFin}/{cumTotal})</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, count, items, franchiseData, isAdmin, onEpChange }) {
  const typeGroups = { Anime: [], 'TV Show': [], Cartoon: [] }
  items.forEach(item => {
    const type = item._ui_type || 'Anime'
    if (typeGroups[type]) typeGroups[type].push(item)
    else typeGroups[type] = [item]
  })

  const typeIcons = { Anime: 'fa-tv', 'TV Show': 'fa-video', Cartoon: 'fa-laugh-squint' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className={`fas ${icon} text-brand/70`}></i>{title}
        </h2>
        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">{count}</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-white/50 rounded-xl border border-gray-200 border-dashed">
          <p className="text-gray-400 font-medium italic"><i className="fas fa-ghost mr-2"></i>Nothing in this category right now.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {['Anime', 'TV Show', 'Cartoon'].map(type => {
            const typeItems = typeGroups[type]
            if (!typeItems?.length) return null
            const sorted = [...typeItems].sort((a, b) => (RATING_WEIGHT[a.my_rating || 'Unrated'] ?? 8) - (RATING_WEIGHT[b.my_rating || 'Unrated'] ?? 8))
            return (
              <div key={type} className="space-y-6">
                <div className="border-b-2 border-gray-100 pb-2 flex items-center justify-between">
                  <h3 className="text-lg font-black text-gray-800 uppercase tracking-widest flex items-center">
                    <i className={`fas ${typeIcons[type]} text-brand/70 mr-2`}></i>{type}
                  </h3>
                  <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-bold border border-gray-200">{sorted.length} Entries</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {sorted.map(anime => (
                    <DashboardCard
                      key={anime.system_id}
                      anime={anime}
                      franchise={franchiseData.find(f => f.system_id === anime.franchise_id)}
                      isAdmin={isAdmin}
                      onEpChange={onEpChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Index() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [animeData, setAnimeData] = useState([])
  const [franchiseData, setFranchiseData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [aRes, fRes] = await Promise.all([
          fetch('/api/anime/', { credentials: 'include' }),
          fetch('/api/franchise/', { credentials: 'include' }),
        ])
        if (!aRes.ok || !fRes.ok) throw new Error('Failed to load tracking data')
        setAnimeData(await aRes.json())
        setFranchiseData(await fRes.json())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleEpChange(sysId, newVal, prevVal) {
    setAnimeData(prev => prev.map(a => a.system_id === sysId ? { ...a, ep_fin: newVal } : a))
    try {
      const res = await fetch(`/api/anime/${sysId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ep_fin: newVal }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to sync')
      showToast('success', 'Episodes updated!')
    } catch {
      setAnimeData(prev => prev.map(a => a.system_id === sysId ? { ...a, ep_fin: prevVal } : a))
      showToast('error', 'Network error. Progress reverted.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error loading dashboard data.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const sorted = [...animeData].sort((a, b) => {
    const fA = franchiseData.find(f => f.system_id === a.franchise_id)
    const fB = franchiseData.find(f => f.system_id === b.franchise_id)
    const tA = fA ? fA.franchise_name_cn || fA.franchise_name_en || '' : ''
    const tB = fB ? fB.franchise_name_cn || fB.franchise_name_en || '' : ''
    if (tA !== tB) return tA.localeCompare(tB)
    return (a.watch_order ?? 999) - (b.watch_order ?? 999)
  })

  sorted.forEach(a => { a._ui_type = 'Anime' })

  const active = sorted.filter(a => a.watching_status === 'Active Watching')
  const passive = sorted.filter(a => a.watching_status === 'Passive Watching')
  const paused = sorted.filter(a => a.watching_status === 'Paused')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">

      {/* Watching Division */}
      <div>
        <div className="flex items-center gap-3 mb-10 pb-3 border-b-2 border-gray-200">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <i className="fas fa-eye text-brand text-lg"></i>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Watching</h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Anime · TV Show · Cartoon</p>
          </div>
          <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">
            {active.length + passive.length + paused.length} Active
          </span>
        </div>
        <div className="space-y-12">
          <Section title="Active Watching" icon="fa-play-circle" count={active.length} items={active} franchiseData={franchiseData} isAdmin={isAdmin} onEpChange={handleEpChange} />
          <Section title="Passive Watching" icon="fa-headphones" count={passive.length} items={passive} franchiseData={franchiseData} isAdmin={isAdmin} onEpChange={handleEpChange} />
          <Section title="Paused" icon="fa-pause-circle" count={paused.length} items={paused} franchiseData={franchiseData} isAdmin={isAdmin} onEpChange={handleEpChange} />
        </div>
      </div>

      {/* Reading Division (Under Development) */}
      <div>
        <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <i className="fas fa-book-open text-gray-400 text-lg"></i>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-400 tracking-tight leading-none">Reading</h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Manga · Novel · Comics</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <i className="fas fa-tools text-3xl text-gray-300 mb-3"></i>
          <p className="text-sm font-bold text-gray-500">Under Development</p>
          <p className="text-xs text-gray-400 mt-1">Reading tracking is currently being engineered.</p>
        </div>
      </div>

    </div>
  )
}
