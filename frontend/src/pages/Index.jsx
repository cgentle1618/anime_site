import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { getRatingWeight } from '../utils/anime'
import DashboardCard from '../components/DashboardCard'

const RATING_WEIGHT = { S: 0, 'A+': 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7, Unrated: 8 }

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
