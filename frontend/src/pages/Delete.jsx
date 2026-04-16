import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../hooks/useToast'
import { getCoverUrl, FALLBACK_SVG } from '../utils/anime'

const TABS = ['anime', 'franchise', 'series', 'options']

function getClean(str) {
  return (str || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function getDisplayTitle(item, type) {
  if (type === 'anime') return item.anime_name_cn || item.anime_name_en || item.anime_name_romanji || item.anime_name_jp || 'Unknown'
  if (type === 'franchise') return item.franchise_name_cn || item.franchise_name_en || item.franchise_name_romanji || 'Unknown'
  if (type === 'series') return item.series_name_cn || item.series_name_en || item.series_name_alt || 'Unknown'
  return item.option_value || 'Unknown'
}

function SearchBox({ placeholder, onSelect, items, renderItem, type }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filtered = query
    ? items.filter(item => {
        const str = Object.values(item).filter(v => typeof v === 'string').join('')
        return getClean(str).includes(getClean(query))
      }).slice(0, 10)
    : []

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query && setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.map(item => (
            <div
              key={item.system_id || item.id}
              className="px-4 py-2.5 hover:bg-red-50 cursor-pointer group"
              onMouseDown={() => { onSelect(item); setOpen(false); setQuery(getDisplayTitle(item, type)) }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Delete() {
  const { showToast } = useToast()
  const [tab, setTab] = useState('anime')
  const [db, setDb] = useState({ anime: [], franchise: [], series: [], options: [] })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [selectedAnime, setSelectedAnime] = useState(null)
  const [selectedFranchise, setSelectedFranchise] = useState(null)
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [optCategoryFilter, setOptCategoryFilter] = useState('')

  const [modal, setModal] = useState(null) // { type, target, cascadeOptions }
  const [cascadeChecked, setCascadeChecked] = useState(false)
  const [orphanSeriesChecked, setOrphanSeriesChecked] = useState(false)
  const [orphanFranchiseChecked, setOrphanFranchiseChecked] = useState(false)

  const loadDb = useCallback(async () => {
    try {
      const [aRes, fRes, sRes, oRes] = await Promise.all([
        fetch('/api/anime/', { credentials: 'include' }),
        fetch('/api/franchise/', { credentials: 'include' }),
        fetch('/api/series/', { credentials: 'include' }),
        fetch('/api/options/', { credentials: 'include' }),
      ])
      const [a, f, s, o] = await Promise.all([aRes.json(), fRes.json(), sRes.json(), oRes.json()])
      setDb({ anime: a, franchise: f, series: s, options: o })
    } catch { showToast('error', 'Database load failed') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadDb() }, [loadDb])

  function getFranchiseTitle(id) {
    if (!id) return 'Standalone'
    const f = db.franchise.find(x => x.system_id === id)
    return f ? getDisplayTitle(f, 'franchise') : 'Unknown'
  }
  function getSeriesTitle(id) {
    if (!id) return 'No Series'
    const s = db.series.find(x => x.system_id === id)
    return s ? getDisplayTitle(s, 'series') : 'Unknown'
  }

  function initDelete(type, item) {
    const t = { type, item }
    setCascadeChecked(false)
    setOrphanSeriesChecked(false)
    setOrphanFranchiseChecked(false)
    setModal(t)
  }

  async function executeDelete() {
    if (!modal) return
    const { type, item } = modal
    setDeleting(true)
    try {
      if (type === 'options') {
        const res = await fetch(`/api/options/${item.id}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) throw new Error('Failed to delete option')
        setSelectedOption(null)
        showToast('success', 'Option deleted')
        await loadDb()
        setModal(null)
        return
      }

      // Cascade deletions
      if (type === 'franchise' && cascadeChecked) {
        for (const a of db.anime.filter(x => x.franchise_id === item.system_id)) {
          await fetch(`/api/anime/${a.system_id}`, { method: 'DELETE', credentials: 'include' })
        }
        for (const s of db.series.filter(x => x.franchise_id === item.system_id)) {
          await fetch(`/api/series/${s.system_id}`, { method: 'DELETE', credentials: 'include' })
        }
      } else if (type === 'series' && cascadeChecked) {
        for (const a of db.anime.filter(x => x.series_id === item.system_id)) {
          await fetch(`/api/anime/${a.system_id}`, { method: 'DELETE', credentials: 'include' })
        }
      }

      // Primary deletion
      const res = await fetch(`/api/${type}/${item.system_id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to delete ${type}`)

      // Orphan cleanup
      if (type === 'anime') {
        if (orphanSeriesChecked && item.series_id) {
          await fetch(`/api/series/${item.series_id}`, { method: 'DELETE', credentials: 'include' })
        }
        if (orphanFranchiseChecked && item.franchise_id) {
          await fetch(`/api/franchise/${item.franchise_id}`, { method: 'DELETE', credentials: 'include' })
        }
      } else if (type === 'series' && orphanFranchiseChecked && item.franchise_id) {
        await fetch(`/api/franchise/${item.franchise_id}`, { method: 'DELETE', credentials: 'include' })
      }

      setSelectedAnime(null)
      setSelectedFranchise(null)
      setSelectedSeries(null)
      showToast('success', 'Deletion successful')
      await loadDb()
      setModal(null)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setDeleting(false)
    }
  }

  const optCategories = [...new Set(db.options.map(o => o.category))].sort()
  const filteredOptions = optCategoryFilter ? db.options.filter(o => o.category === optCategoryFilter) : db.options

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <i className="fas fa-spinner fa-spin text-brand text-3xl"></i>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <i className="fas fa-trash-alt text-red-500/70"></i> Delete Entry
        </h1>
        <p className="text-sm text-gray-500 mt-1">Permanently remove records from the database</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedAnime(null); setSelectedFranchise(null); setSelectedSeries(null); setSelectedOption(null) }}
            className={`px-5 py-3 text-sm font-bold capitalize whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ANIME TAB */}
      {tab === 'anime' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search anime to delete..."
              items={db.anime}
              type="anime"
              onSelect={setSelectedAnime}
              renderItem={item => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">{getDisplayTitle(item, 'anime')}</div>
                  <div className="text-[11px] text-gray-500">{getFranchiseTitle(item.franchise_id)} / {getSeriesTitle(item.series_id)}</div>
                </div>
              )}
            />
          </div>

          {selectedAnime && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start gap-4">
                <img src={getCoverUrl(selectedAnime.cover_image_file)} className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0" onError={e => { e.target.src = FALLBACK_SVG }} alt="" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 text-base truncate">{getDisplayTitle(selectedAnime, 'anime')}</h3>
                  <p className="text-sm text-gray-500">{selectedAnime.anime_name_en || selectedAnime.anime_name_romanji || '-'}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{selectedAnime.airing_type || 'TV'}</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{selectedAnime.watching_status || 'Unset'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{getFranchiseTitle(selectedAnime.franchise_id)} / {getSeriesTitle(selectedAnime.series_id)}</p>
                  <p className="text-xs font-mono text-gray-400">{selectedAnime.system_id}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedAnime(null)} className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition">
                    <i className="fas fa-times"></i>
                  </button>
                  <button onClick={() => initDelete('anime', selectedAnime)} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1">
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FRANCHISE TAB */}
      {tab === 'franchise' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search franchise to delete..."
              items={db.franchise}
              type="franchise"
              onSelect={setSelectedFranchise}
              renderItem={item => {
                const cA = db.anime.filter(a => a.franchise_id === item.system_id).length
                const cS = db.series.filter(s => s.franchise_id === item.system_id).length
                return (
                  <div>
                    <div className="font-bold text-gray-800 text-sm">{getDisplayTitle(item, 'franchise')}</div>
                    <div className="text-[11px] text-gray-500">{cS} series · {cA} anime</div>
                  </div>
                )
              }}
            />
          </div>

          {selectedFranchise && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-gray-900 text-base">{getDisplayTitle(selectedFranchise, 'franchise')}</h3>
                  <p className="text-sm text-gray-500">{[selectedFranchise.franchise_name_en, selectedFranchise.franchise_name_alt].filter(Boolean).join(' · ') || 'No alt names'}</p>
                  <p className="text-xs font-mono text-gray-400 mt-1">{selectedFranchise.system_id}</p>
                  <p className="text-sm font-bold text-gray-600 mt-2">
                    {db.series.filter(s => s.franchise_id === selectedFranchise.system_id).length} Series ·{' '}
                    {db.anime.filter(a => a.franchise_id === selectedFranchise.system_id).length} Anime
                  </p>
                  {(db.series.filter(s => s.franchise_id === selectedFranchise.system_id).length > 0 || db.anime.filter(a => a.franchise_id === selectedFranchise.system_id).length > 0) && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      <i className="fas fa-exclamation-triangle"></i> Cascade Deletion Supported
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedFranchise(null)} className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition">
                    <i className="fas fa-times"></i>
                  </button>
                  <button onClick={() => initDelete('franchise', selectedFranchise)} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1">
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SERIES TAB */}
      {tab === 'series' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <SearchBox
              placeholder="Search series to delete..."
              items={db.series}
              type="series"
              onSelect={setSelectedSeries}
              renderItem={item => (
                <div>
                  <div className="font-bold text-gray-800 text-sm">{getDisplayTitle(item, 'series')}</div>
                  <div className="text-[11px] text-gray-500">{getFranchiseTitle(item.franchise_id)} · {db.anime.filter(a => a.series_id === item.system_id).length} anime</div>
                </div>
              )}
            />
          </div>

          {selectedSeries && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-gray-900 text-base">{getDisplayTitle(selectedSeries, 'series')}</h3>
                  <p className="text-sm text-gray-500">{[selectedSeries.series_name_en, selectedSeries.series_name_alt].filter(Boolean).join(' · ') || 'No alt names'}</p>
                  <p className="text-xs font-mono text-gray-400 mt-1">{selectedSeries.system_id}</p>
                  <p className="text-sm font-bold text-gray-600 mt-2">
                    Franchise: {getFranchiseTitle(selectedSeries.franchise_id)} ·{' '}
                    {db.anime.filter(a => a.series_id === selectedSeries.system_id).length} Anime
                  </p>
                  {db.anime.filter(a => a.series_id === selectedSeries.system_id).length > 0 && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      <i className="fas fa-exclamation-triangle"></i> Cascade Deletion Supported
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedSeries(null)} className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition">
                    <i className="fas fa-times"></i>
                  </button>
                  <button onClick={() => initDelete('series', selectedSeries)} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1">
                    <i className="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OPTIONS TAB */}
      {tab === 'options' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex gap-3">
            <select
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand flex-1"
              value={optCategoryFilter}
              onChange={e => setOptCategoryFilter(e.target.value)}
            >
              <option value="">— Select Category —</option>
              {optCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {optCategoryFilter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredOptions.length ? filteredOptions.map(opt => (
                <div key={opt.id} className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center group hover:bg-red-50 hover:border-red-200 transition shadow-sm">
                  <span className="font-bold text-gray-700 text-sm truncate pr-2">{opt.option_value}</span>
                  <button onClick={() => initDelete('options', opt)} className="text-gray-400 hover:text-red-600 transition w-7 h-7 flex items-center justify-center rounded-md bg-white shadow-sm border border-gray-200 shrink-0">
                    <i className="fas fa-trash-alt text-xs"></i>
                  </button>
                </div>
              )) : (
                <div className="col-span-full text-center text-sm text-gray-500 italic py-8 border border-dashed border-gray-300 rounded-xl">No options in this category.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 scale-100 transition-transform">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-trash-alt text-red-600 text-xl"></i>
              </div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{modal.type.toUpperCase()}{modal.item.category ? ` (${modal.item.category})` : ''}</div>
              <h3 className="font-black text-gray-900 text-lg mt-1">{getDisplayTitle(modal.item, modal.type)}</h3>
              <p className="text-xs font-mono text-gray-400 mt-1">{modal.item.system_id || modal.item.id}</p>
            </div>

            <div className="space-y-3 mb-5">
              {/* Cascade option for franchise */}
              {modal.type === 'franchise' && (db.series.filter(s => s.franchise_id === modal.item.system_id).length > 0 || db.anime.filter(a => a.franchise_id === modal.item.system_id).length > 0) && (
                <label className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={cascadeChecked} onChange={e => setCascadeChecked(e.target.checked)} className="mt-0.5 rounded border-red-400 w-4 h-4" />
                  <div>
                    <div className="text-xs font-bold text-red-800"><i className="fas fa-trash-restore mr-1"></i> Cascade Delete</div>
                    <div className="text-xs text-red-700 mt-0.5">Also delete {db.series.filter(s => s.franchise_id === modal.item.system_id).length} series and {db.anime.filter(a => a.franchise_id === modal.item.system_id).length} anime entries.</div>
                  </div>
                </label>
              )}

              {/* Cascade option for series */}
              {modal.type === 'series' && db.anime.filter(a => a.series_id === modal.item.system_id).length > 0 && (
                <label className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={cascadeChecked} onChange={e => setCascadeChecked(e.target.checked)} className="mt-0.5 rounded border-red-400 w-4 h-4" />
                  <div>
                    <div className="text-xs font-bold text-red-800"><i className="fas fa-trash-restore mr-1"></i> Cascade Delete</div>
                    <div className="text-xs text-red-700 mt-0.5">Also delete {db.anime.filter(a => a.series_id === modal.item.system_id).length} anime entries.</div>
                  </div>
                </label>
              )}

              {/* Orphan series warning */}
              {modal.type === 'anime' && modal.item.series_id && db.anime.filter(a => a.series_id === modal.item.series_id).length === 1 && (
                <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={orphanSeriesChecked} onChange={e => setOrphanSeriesChecked(e.target.checked)} className="mt-0.5 rounded border-orange-400 w-4 h-4" />
                  <div>
                    <div className="text-xs font-bold text-orange-800"><i className="fas fa-link mr-1"></i> Last Anime in Series</div>
                    <div className="text-xs text-orange-700 mt-0.5">Delete the orphaned Series Hub too.</div>
                  </div>
                </label>
              )}

              {/* Orphan franchise warning (anime) */}
              {modal.type === 'anime' && !modal.item.series_id && modal.item.franchise_id && db.anime.filter(a => a.franchise_id === modal.item.franchise_id).length === 1 && db.series.filter(s => s.franchise_id === modal.item.franchise_id).length === 0 && (
                <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={orphanFranchiseChecked} onChange={e => setOrphanFranchiseChecked(e.target.checked)} className="mt-0.5 rounded border-orange-400 w-4 h-4" />
                  <div>
                    <div className="text-xs font-bold text-orange-800"><i className="fas fa-link mr-1"></i> Last Anime in Franchise</div>
                    <div className="text-xs text-orange-700 mt-0.5">Delete the orphaned Franchise Hub too.</div>
                  </div>
                </label>
              )}

              {/* Orphan franchise warning (series) */}
              {modal.type === 'series' && modal.item.franchise_id && db.series.filter(s => s.franchise_id === modal.item.franchise_id).length === 1 && db.anime.filter(a => a.franchise_id === modal.item.franchise_id && !a.series_id).length === 0 && (
                <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={orphanFranchiseChecked} onChange={e => setOrphanFranchiseChecked(e.target.checked)} className="mt-0.5 rounded border-orange-400 w-4 h-4" />
                  <div>
                    <div className="text-xs font-bold text-orange-800"><i className="fas fa-link mr-1"></i> Last Series in Franchise</div>
                    <div className="text-xs text-orange-700 mt-0.5">Delete the orphaned Franchise Hub too.</div>
                  </div>
                </label>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <i className={`fas ${deleting ? 'fa-circle-notch fa-spin' : 'fa-trash-alt'}`}></i>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
