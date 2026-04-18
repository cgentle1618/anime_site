import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AnimeCard from '../components/AnimeCard'

function cleanString(str) {
  if (!str) return ''
  return str.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
}

function getFranchiseTitles(f) {
  const raw = [f.franchise_name_cn, f.franchise_name_en, f.franchise_name_alt, f.franchise_name_romanji, f.franchise_name_jp]
  const valid = [...new Set(raw.filter(t => t && t.trim() !== ''))]
  return { main: valid[0] || 'Unknown Franchise', sub: valid[1] || '' }
}

export default function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [matchedFranchises, setMatchedFranchises] = useState([])
  const [matchedAnime, setMatchedAnime] = useState([])
  const [matchedSeasonal, setMatchedSeasonal] = useState([])
  const [allAnime, setAllAnime] = useState([])
  const [selectedFranchise, setSelectedFranchise] = useState('all')

  useEffect(() => {
    if (!query.trim()) { setLoading(false); return }
    setLoading(true)
    setError(null)
    setSelectedFranchise('all')

    async function doSearch() {
      try {
        const [fRes, aRes, seaRes] = await Promise.all([
          fetch('/api/franchise/', { credentials: 'include' }),
          fetch('/api/anime/', { credentials: 'include' }),
          fetch('/api/seasonal/', { credentials: 'include' }),
        ])
        if (!fRes.ok || !aRes.ok || !seaRes.ok) throw new Error('Failed to fetch database')
        const allFranchises = await fRes.json()
        const all = await aRes.json()
        const allSeasonal = await seaRes.json()
        setAllAnime(all)

        const qClean = cleanString(query)
        const directF = allFranchises.filter(f =>
          [f.franchise_name_cn, f.franchise_name_en, f.franchise_name_romanji, f.franchise_name_jp, f.franchise_name_alt]
            .some(n => cleanString(n).includes(qClean))
        )
        const directA = all.filter(a =>
          [a.anime_name_cn, a.anime_name_en, a.anime_name_romanji, a.anime_name_jp, a.anime_name_alt]
            .some(n => cleanString(n).includes(qClean))
        )

        const fIdSet = new Set(directF.map(f => f.system_id))
        directA.forEach(a => { if (a.franchise_id) fIdSet.add(a.franchise_id) })
        const mf = allFranchises.filter(f => fIdSet.has(f.system_id))
          .sort((a, b) => (a.franchise_name_cn || '').localeCompare(b.franchise_name_cn || ''))

        const directFIdSet = new Set(directF.map(f => f.system_id))
        const aIdSet = new Set(directA.map(a => a.system_id))
        all.forEach(a => { if (a.franchise_id && directFIdSet.has(a.franchise_id)) aIdSet.add(a.system_id) })
        const ma = all.filter(a => aIdSet.has(a.system_id))
          .sort((a, b) => (a.anime_name_cn || '').localeCompare(b.anime_name_cn || ''))

        const msea = allSeasonal
          .filter(s => cleanString(s.seasonal).includes(qClean))
          .sort((a, b) => b.seasonal.localeCompare(a.seasonal))

        setMatchedFranchises(mf)
        setMatchedAnime(ma)
        setMatchedSeasonal(msea)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    doSearch()
  }, [query])

  const handleAnimeUpdated = useCallback((updated) => {
    setMatchedAnime(prev => prev.map(a => a.system_id === updated.system_id ? updated : a))
    setAllAnime(prev => prev.map(a => a.system_id === updated.system_id ? updated : a))
  }, [])

  const displayFranchises = selectedFranchise === 'all' ? matchedFranchises : matchedFranchises.filter(f => f.system_id === selectedFranchise)
  const displayAnime = selectedFranchise === 'all' ? matchedAnime : matchedAnime.filter(a => a.franchise_id === selectedFranchise)
  const tvOna = displayAnime.filter(a => a.airing_type === 'TV' || a.airing_type === 'ONA')
  const movies = displayAnime.filter(a => a.airing_type === 'Movie')
  const others = displayAnime.filter(a => a.airing_type !== 'TV' && a.airing_type !== 'ONA' && a.airing_type !== 'Movie')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Searching...</p>
        </div>
      </div>
    )
  }

  if (!query.trim()) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
        <p className="text-gray-500 font-bold">No Search Query</p>
        <p className="text-sm text-gray-400 mt-1">Please enter a term in the top search bar.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Search Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900">
          Search Results for "<span className="text-brand">{query}</span>"
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {matchedSeasonal.length > 0 && <><span className="font-bold">{matchedSeasonal.length}</span> seasonal · </>}
          <span className="font-bold">{matchedFranchises.length}</span> franchises ·{' '}
          <span className="font-bold">{matchedAnime.length}</span> anime entries
        </p>
      </div>

      {/* Seasonal entries */}
      {matchedSeasonal.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <i className="fas fa-calendar-alt text-brand/70"></i> Seasonal
          </h2>
          <div className="flex flex-wrap gap-2">
            {matchedSeasonal.map(s => (
              <button
                key={s.seasonal}
                onClick={() => navigate(`/seasonal/${encodeURIComponent(s.seasonal)}`)}
                className="px-4 py-1.5 rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-brand hover:text-white hover:border-brand transition-colors shadow-sm"
              >
                {s.seasonal}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Franchise pills */}
      {matchedFranchises.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedFranchise('all')}
            className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === 'all' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            All Results
          </button>
          {matchedFranchises.map(f => {
            const titles = getFranchiseTitles(f)
            return (
              <button
                key={f.system_id}
                onClick={() => setSelectedFranchise(f.system_id)}
                title={titles.main}
                className={`shrink-0 px-4 py-1.5 rounded-full border text-sm font-bold transition-colors ${selectedFranchise === f.system_id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {titles.main}
              </button>
            )
          })}
        </div>
      )}

      {/* Franchise hub cards */}
      {displayFranchises.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <i className="fas fa-sitemap text-brand/70"></i> Franchises
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayFranchises.map(f => {
              const t = getFranchiseTitles(f)
              return (
                <div
                  key={f.system_id}
                  onClick={() => navigate(`/franchise/${f.system_id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="text-[9px] font-bold text-brand uppercase tracking-widest mb-1.5">
                      <i className="fas fa-sitemap mr-1"></i>{f.franchise_type || 'ACG Franchise'}
                    </div>
                    <h3 className="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2" title={t.main}>{t.main}</h3>
                    {t.sub && <h4 className="text-xs font-medium text-gray-500 truncate" title={t.sub}>{t.sub}</h4>}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-400">
                    <span>View Hub</span>
                    <i className="fas fa-arrow-right"></i>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Anime Division */}
      <div>
        <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-gray-200">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <i className="fas fa-tv text-brand"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">Anime</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">TV · ONA · Movie · OVA · Special</p>
          </div>
          <span className="ml-auto bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">{displayAnime.length} results</span>
        </div>

        {displayAnime.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <i className="fas fa-ghost text-3xl mb-3"></i>
            <p className="font-medium">No anime match the current filter.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {[
              { label: 'TV / ONA', icon: 'fa-tv', items: tvOna },
              { label: 'Movies', icon: 'fa-film', items: movies },
              { label: 'Other', icon: 'fa-shapes', items: others },
            ].map(({ label, icon, items }) =>
              items.length > 0 ? (
                <div key={label}>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <i className={`fas ${icon} text-brand/70`}></i>{label}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
                    <div className="flex-1 border-t border-gray-100"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {items.map(a => (
                      <AnimeCard key={a.system_id} anime={a} onUpdated={handleAnimeUpdated} />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Other Divisions (Under Development) */}
      {[
        { label: 'Manga', icon: 'fa-book', desc: 'Manga · Manhwa · Manhua' },
        { label: 'Novel', icon: 'fa-book-open', desc: 'Light Novel · Web Novel' },
        { label: 'TV Show', icon: 'fa-video', desc: 'Live Action Series' },
        { label: 'Movie', icon: 'fa-film', desc: 'Live Action Films' },
        { label: 'Cartoon', icon: 'fa-laugh-squint', desc: 'Western Animation' },
      ].map(({ label, icon, desc }) => (
        <div key={label}>
          <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-gray-100">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <i className={`fas ${icon} text-gray-400`}></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-400 tracking-tight leading-none">{label}</h2>
              <p className="text-xs text-gray-400 font-medium mt-0.5">{desc}</p>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-8 px-4 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
            <i className="fas fa-tools text-2xl text-gray-300 mb-2"></i>
            <p className="text-sm font-bold text-gray-400">Under Development</p>
          </div>
        </div>
      ))}
    </div>
  )
}
