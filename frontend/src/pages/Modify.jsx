import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../hooks/useToast'
import { getDisplayName } from '../utils/anime'
import ComboBox from '../components/ComboBox'
import MultiSelect from '../components/MultiSelect'

function cleanStr(s) {
  if (!s) return ''
  return s.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
}

function getOptions(allOptions, category) {
  return allOptions.filter(o => o.category === category).map(o => o.option_value)
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white'
const selectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white'

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 mt-6 mb-4">
      <i className={`fas ${icon} text-brand text-sm`}></i>
      <span className="text-xs font-black text-gray-600 uppercase tracking-widest">{title}</span>
    </div>
  )
}

function parseSeasonPart(sp) {
  if (!sp) return { season_num: '', part_num: '' }
  const sMatch = sp.match(/Season (\d+)/i)
  const pMatch = sp.match(/Part (\d+)/i)
  return { season_num: sMatch ? sMatch[1] : '', part_num: pMatch ? pMatch[1] : '' }
}

function animeToForm(anime, allFranchises, allSeries) {
  const { season_num, part_num } = parseSeasonPart(anime.season_part)
  const f = allFranchises.find(x => x.system_id === anime.franchise_id)
  const s = allSeries.find(x => x.system_id === anime.series_id)
  return {
    anime_name_en: anime.anime_name_en || '',
    anime_name_cn: anime.anime_name_cn || '',
    anime_name_romanji: anime.anime_name_romanji || '',
    anime_name_jp: anime.anime_name_jp || '',
    anime_name_alt: anime.anime_name_alt || '',
    franchise_id: anime.franchise_id || null,
    franchise_text: f ? getDisplayName(f, 'franchise') : '',
    series_id: anime.series_id || null,
    series_text: s ? getDisplayName(s, 'series') : '',
    season_num, part_num,
    airing_type: anime.airing_type || '',
    airing_status: anime.airing_status || '',
    watching_status: anime.watching_status || 'Might Watch',
    is_main: anime.is_main || '',
    ep_previous: anime.ep_previous ?? '',
    ep_total: anime.ep_total ?? '',
    ep_fin: anime.ep_fin ?? '',
    ep_special: anime.ep_special ?? '',
    my_rating: anime.my_rating || '',
    mal_rating: anime.mal_rating ?? '',
    mal_rank: anime.mal_rank || '',
    anilist_rating: anime.anilist_rating || '',
    release_season: anime.release_season || '',
    release_month: anime.release_month || '',
    release_year: anime.release_year || '',
    genre_main: anime.genre_main || '',
    genre_sub: anime.genre_sub || '',
    studio: anime.studio || '',
    director: anime.director || '',
    producer: anime.producer || '',
    music: anime.music || '',
    distributor_tw: anime.distributor_tw || '',
    prequel_id: anime.prequel_id || null,
    sequel_id: anime.sequel_id || null,
    alternative: anime.alternative || '',
    watch_order: anime.watch_order ?? '',
    mal_id: anime.mal_id ?? '',
    mal_link: anime.mal_link || '',
    anilist_link: anime.anilist_link || '',
    official_link: anime.official_link || '',
    twitter_link: anime.twitter_link || '',
    source_baha: anime.source_baha === true ? 'true' : anime.source_baha === false ? 'false' : '',
    baha_link: anime.baha_link || '',
    source_netflix: anime.source_netflix ? 'true' : 'false',
    source_other: anime.source_other || '',
    source_other_link: anime.source_other_link || '',
    op: anime.op || '',
    ed: anime.ed || '',
    insert_ost: anime.insert_ost || '',
    seiyuu: anime.seiyuu || '',
    cover_image_file: anime.cover_image_file || '',
    remark: anime.remark || '',
  }
}

function franchiseToForm(f) {
  return {
    franchise_name_en: f.franchise_name_en || '',
    franchise_name_cn: f.franchise_name_cn || '',
    franchise_name_romanji: f.franchise_name_romanji || '',
    franchise_name_jp: f.franchise_name_jp || '',
    franchise_name_alt: f.franchise_name_alt || '',
    franchise_type: f.franchise_type || '',
    my_rating: f.my_rating || '',
    franchise_expectation: f.franchise_expectation || '',
    favorite_3x3_slot: f.favorite_3x3_slot ?? '',
    cover_anime_id: f.cover_anime_id ?? null,
    watch_next_group: f.watch_next_group ?? null,
    to_rewatch: f.to_rewatch ?? false,
    remark: f.remark || '',
  }
}

function seriesToForm(s, allFranchises) {
  const f = allFranchises.find(x => x.system_id === s.franchise_id)
  return {
    franchise_id: s.franchise_id || null,
    franchise_text: f ? getDisplayName(f, 'franchise') : '',
    series_name_en: s.series_name_en || '',
    series_name_cn: s.series_name_cn || '',
    series_name_alt: s.series_name_alt || '',
    remark: s.remark || '',
  }
}

export default function Modify() {
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()

  const [allAnime, setAllAnime] = useState([])
  const [allFranchises, setAllFranchises] = useState([])
  const [allSeries, setAllSeries] = useState([])
  const [allOptions, setAllOptions] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('anime')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingType, setEditingType] = useState('anime')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)

  const [optCatFilter, setOptCatFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createModal, setCreateModal] = useState(null)

  const [af, setAf] = useState({})
  const [ff, setFf] = useState({})
  const [sf, setSf] = useState({})
  const [optValue, setOptValue] = useState('')

  const ua = (k, v) => setAf(p => ({ ...p, [k]: v }))
  const uf = (k, v) => setFf(p => ({ ...p, [k]: v }))
  const us = (k, v) => setSf(p => ({ ...p, [k]: v }))

  useEffect(() => {
    async function load() {
      try {
        const [aRes, fRes, sRes, oRes] = await Promise.all([
          fetch('/api/anime/', { credentials: 'include' }),
          fetch('/api/franchise/', { credentials: 'include' }),
          fetch('/api/series/', { credentials: 'include' }),
          fetch('/api/options/', { credentials: 'include' }),
        ])
        const [anime, franchises, series, options] = await Promise.all([aRes.json(), fRes.json(), sRes.json(), oRes.json()])
        setAllAnime(anime)
        setAllFranchises(franchises)
        setAllSeries(series)
        setAllOptions(options)

        const urlId = searchParams.get('id')
        if (urlId) {
          const a = anime.find(x => x.system_id === urlId)
          if (a) { openEditorWith(a, 'anime', franchises, series); return }
          const f = franchises.find(x => x.system_id === urlId)
          if (f) { openEditorWith(f, 'franchise', franchises, series); setActiveTab('franchise'); return }
          const s = series.find(x => x.system_id === urlId)
          if (s) { openEditorWith(s, 'series', franchises, series); setActiveTab('series'); return }
        }
      } catch {
        showToast('error', 'Database load failed.')
      } finally {
        setDataLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function openEditorWith(item, type, franchises, series) {
    setEditingItem(item)
    setEditingType(type)
    if (type === 'anime') setAf(animeToForm(item, franchises, series))
    else if (type === 'franchise') setFf(franchiseToForm(item))
    else if (type === 'series') setSf(seriesToForm(item, franchises))
    else if (type === 'options') setOptValue(item.option_value || '')
    setEditorOpen(true)
  }

  function openEditor(item, type) {
    openEditorWith(item, type, allFranchises, allSeries)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingItem(null)
    setSearchQuery('')
    setSearchOpen(false)
  }

  function buildAnimePayload(franchiseId, seriesId) {
    let season_part = ''
    if (af.season_num) season_part = `Season ${af.season_num}`
    if (af.season_num && af.part_num) season_part += ` Part ${af.part_num}`
    else if (!af.season_num && af.part_num) season_part = `Part ${af.part_num}`
    return {
      anime_name_en: af.anime_name_en || null,
      anime_name_cn: af.anime_name_cn || null,
      anime_name_romanji: af.anime_name_romanji || null,
      anime_name_jp: af.anime_name_jp || null,
      anime_name_alt: af.anime_name_alt || null,
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      season_part: season_part || null,
      airing_type: af.airing_type || null,
      airing_status: af.airing_status || null,
      watching_status: af.watching_status || 'Might Watch',
      is_main: af.is_main || null,
      ep_previous: af.ep_previous !== '' ? parseInt(af.ep_previous) : null,
      ep_total: af.ep_total !== '' ? parseInt(af.ep_total) : null,
      ep_fin: af.ep_fin !== '' ? parseInt(af.ep_fin) : 0,
      ep_special: af.ep_special !== '' ? parseFloat(af.ep_special) : null,
      my_rating: af.my_rating || null,
      mal_rating: af.mal_rating !== '' ? parseFloat(af.mal_rating) : null,
      mal_rank: af.mal_rank || null,
      anilist_rating: af.anilist_rating || null,
      release_season: af.release_season || null,
      release_month: af.release_month || null,
      release_year: af.release_year || null,
      genre_main: af.genre_main || null,
      genre_sub: af.genre_sub || null,
      studio: af.studio || null,
      director: af.director || null,
      producer: af.producer || null,
      music: af.music || null,
      distributor_tw: af.distributor_tw || null,
      prequel_id: af.prequel_id || null,
      sequel_id: af.sequel_id || null,
      alternative: af.alternative || null,
      watch_order: af.watch_order !== '' ? parseFloat(af.watch_order) : null,
      mal_id: af.mal_id !== '' ? parseInt(af.mal_id) : null,
      mal_link: af.mal_link || null,
      anilist_link: af.anilist_link || null,
      official_link: af.official_link || null,
      twitter_link: af.twitter_link || null,
      source_baha: af.source_baha === 'true' ? true : af.source_baha === 'false' ? false : null,
      baha_link: af.baha_link || null,
      source_netflix: af.source_netflix === 'true',
      source_other: af.source_other || null,
      source_other_link: af.source_other_link || null,
      op: af.op || null, ed: af.ed || null, insert_ost: af.insert_ost || null, seiyuu: af.seiyuu || null,
      cover_image_file: af.cover_image_file || null,
      remark: af.remark || null,
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (submitting || !editingItem) return
    setSubmitting(true)
    try {
      if (editingType === 'anime') await saveAnime()
      else if (editingType === 'franchise') await saveFranchise()
      else if (editingType === 'series') await saveSeries()
      else if (editingType === 'options') await saveOption()
    } finally {
      setSubmitting(false)
    }
  }

  async function saveAnime() {
    let franchiseId = af.franchise_id
    if (!franchiseId && af.franchise_text.trim()) {
      const confirmed = await new Promise(resolve => {
        setCreateModal({ entityType: 'Franchise', text: af.franchise_text, onConfirm: () => { setCreateModal(null); resolve(true) }, onCancel: () => { setCreateModal(null); resolve(false) } })
      })
      if (!confirmed) return
      const res = await fetch('/api/franchise/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ franchise_name_en: af.franchise_text }), credentials: 'include' })
      if (!res.ok) { showToast('error', 'Failed to create franchise'); return }
      const nf = await res.json()
      franchiseId = nf.system_id
      setAllFranchises(prev => [...prev, nf])
    }
    let seriesId = af.series_id
    if (!seriesId && af.series_text.trim()) {
      const confirmed = await new Promise(resolve => {
        setCreateModal({ entityType: 'Series', text: af.series_text, onConfirm: () => { setCreateModal(null); resolve(true) }, onCancel: () => { setCreateModal(null); resolve(false) } })
      })
      if (!confirmed) return
      const res = await fetch('/api/series/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ franchise_id: franchiseId, series_name_en: af.series_text }), credentials: 'include' })
      if (!res.ok) { showToast('error', 'Failed to create series'); return }
      const ns = await res.json()
      seriesId = ns.system_id
      setAllSeries(prev => [...prev, ns])
    }
    const res = await fetch(`/api/anime/${editingItem.system_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildAnimePayload(franchiseId, seriesId)), credentials: 'include' })
    if (res.ok) {
      const updated = await res.json()
      setAllAnime(prev => prev.map(a => a.system_id === updated.system_id ? updated : a))
      setEditingItem(updated)
      setAf(animeToForm(updated, allFranchises, allSeries))
      showToast('success', 'Update successful.')
    } else {
      const err = await res.json().catch(() => ({}))
      showToast('error', err.detail ? JSON.stringify(err.detail) : 'Update failed')
    }
  }

  async function saveFranchise() {
    const res = await fetch(`/api/franchise/${editingItem.system_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ franchise_name_en: ff.franchise_name_en || null, franchise_name_cn: ff.franchise_name_cn || null, franchise_name_romanji: ff.franchise_name_romanji || null, franchise_name_jp: ff.franchise_name_jp || null, franchise_name_alt: ff.franchise_name_alt || null, franchise_type: ff.franchise_type || null, my_rating: ff.my_rating || null, franchise_expectation: ff.franchise_expectation || null, favorite_3x3_slot: ff.favorite_3x3_slot !== '' ? parseInt(ff.favorite_3x3_slot) : null, cover_anime_id: ff.cover_anime_id || null, watch_next_group: ff.watch_next_group || null, to_rewatch: ff.to_rewatch || false, remark: ff.remark || null }),
      credentials: 'include',
    })
    if (res.ok) { const updated = await res.json(); setAllFranchises(prev => prev.map(f => f.system_id === updated.system_id ? updated : f)); setEditingItem(updated); showToast('success', 'Update successful.') }
    else showToast('error', 'Update failed')
  }

  async function saveSeries() {
    if (!sf.franchise_id) { showToast('warning', 'A valid Franchise must be selected.'); return }
    const res = await fetch(`/api/series/${editingItem.system_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ franchise_id: sf.franchise_id, series_name_en: sf.series_name_en || null, series_name_cn: sf.series_name_cn || null, series_name_alt: sf.series_name_alt || null, remark: sf.remark || null }),
      credentials: 'include',
    })
    if (res.ok) { const updated = await res.json(); setAllSeries(prev => prev.map(s => s.system_id === updated.system_id ? updated : s)); setEditingItem(updated); showToast('success', 'Update successful.') }
    else showToast('error', 'Update failed')
  }

  async function saveOption() {
    const res = await fetch(`/api/options/${editingItem.system_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_value: optValue }), credentials: 'include' })
    if (res.ok) { const updated = await res.json(); setAllOptions(prev => prev.map(o => o.system_id === updated.system_id ? updated : o)); setEditingItem(updated); showToast('success', 'Update successful.') }
    else showToast('error', 'Update failed')
  }

  function getItemLabel(item, type) {
    if (type === 'anime') return item.anime_name_cn || item.anime_name_en || 'Unknown'
    if (type === 'franchise') return item.franchise_name_cn || item.franchise_name_en || 'Unknown'
    if (type === 'series') return item.series_name_cn || item.series_name_en || 'Unknown'
    if (type === 'options') return `${item.category}: ${item.option_value}`
    return 'Unknown'
  }

  const searchResults = (() => {
    if (!searchQuery.trim()) return []
    const q = cleanStr(searchQuery)
    if (activeTab === 'anime') return allAnime.filter(a => [a.anime_name_en, a.anime_name_cn, a.anime_name_romanji, a.anime_name_jp, a.anime_name_alt].some(n => n && cleanStr(n).includes(q))).slice(0, 10)
    if (activeTab === 'franchise') return allFranchises.filter(f => [f.franchise_name_en, f.franchise_name_cn, f.franchise_name_romanji, f.franchise_name_jp, f.franchise_name_alt].some(n => n && cleanStr(n).includes(q))).slice(0, 10)
    if (activeTab === 'series') return allSeries.filter(s => [s.series_name_en, s.series_name_cn, s.series_name_alt].some(n => n && cleanStr(n).includes(q))).slice(0, 10)
    return allOptions.filter(o => cleanStr(o.option_value).includes(q) || cleanStr(o.category).includes(q)).slice(0, 10)
  })()

  const recentItems = (() => {
    const sort = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
    if (activeTab === 'anime') return [...allAnime].sort(sort).slice(0, 12)
    if (activeTab === 'franchise') return [...allFranchises].sort(sort).slice(0, 12)
    if (activeTab === 'series') return [...allSeries].sort(sort).slice(0, 12)
    return []
  })()

  const optionCategories = [...new Set(allOptions.map(o => o.category))].sort()
  const filteredOptions = optCatFilter ? allOptions.filter(o => o.category === optCatFilter) : []

  const animeRibbon = (editingType === 'anime' && af.franchise_id)
    ? allAnime.filter(a => a.franchise_id === af.franchise_id && a.system_id !== editingItem?.system_id)
    : []

  const franchiseItems = allFranchises.map(f => ({ id: f.system_id, label: getDisplayName(f, 'franchise') }))
  const seriesItemsForAnime = (af.franchise_id ? allSeries.filter(s => s.franchise_id === af.franchise_id) : allSeries).map(s => ({ id: s.system_id, label: getDisplayName(s, 'series') }))

  const tabDefs = [
    { key: 'anime', icon: 'fa-tv', label: 'Modify Anime Entry' },
    { key: 'franchise', icon: 'fa-sitemap', label: 'Modify Franchise' },
    { key: 'series', icon: 'fa-layer-group', label: 'Modify Series' },
    { key: 'options', icon: 'fa-cog', label: 'Modify System Option' },
  ]

  if (dataLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center"><i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i><p className="text-gray-500 font-medium">Loading...</p></div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3"><i className="fas fa-edit text-brand"></i> Modify Database</h1>
        <p className="text-sm text-gray-500 mt-1">Search for an entry to edit its fields.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabDefs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); if (!editorOpen) setSearchQuery('') }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${activeTab === t.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <i className={`fas ${t.icon}`}></i>{t.label}
          </button>
        ))}
      </div>

      {/* ═══ DISCOVERY VIEW ═══ */}
      {!editorOpen && (
        <div className="space-y-6">
          {activeTab !== 'options' ? (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-3.5 text-gray-400"></i>
                <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)}
                  placeholder="Type a title to search..." autoComplete="off"
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white shadow-sm" />
              </div>
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map(item => {
                    const sub = activeTab === 'anime' ? (allFranchises.find(f => f.system_id === item.franchise_id)?.franchise_name_cn || 'Standalone')
                      : activeTab === 'series' ? (allFranchises.find(f => f.system_id === item.franchise_id)?.franchise_name_cn || '') : ''
                    return (
                      <button key={item.system_id} type="button" onMouseDown={e => e.preventDefault()}
                        onClick={() => { openEditor(item, activeTab); setSearchOpen(false) }}
                        className="w-full text-left px-4 py-3 hover:bg-brand/10 border-b border-gray-50 last:border-0 transition">
                        <div className="text-sm font-bold text-gray-800">{getItemLabel(item, activeTab)}</div>
                        {sub && <div className="text-xs text-gray-400">{sub}</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Select Category</label>
              <select className={selectCls} value={optCatFilter} onChange={e => setOptCatFilter(e.target.value)}>
                <option value="">— Choose a category —</option>
                {optionCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {activeTab === 'options' && optCatFilter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredOptions.map(opt => (
                <button key={opt.system_id} onClick={() => openEditor(opt, 'options')}
                  className="text-left px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-brand hover:text-brand hover:bg-brand/5 transition shadow-sm">
                  {opt.option_value}
                </button>
              ))}
            </div>
          )}

          {activeTab !== 'options' && (
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3"><i className="fas fa-clock mr-1"></i> Recently Modified</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentItems.map(item => {
                  const sub = activeTab === 'anime' ? (allFranchises.find(f => f.system_id === item.franchise_id)?.franchise_name_cn || 'Standalone')
                    : activeTab === 'series' ? (allFranchises.find(f => f.system_id === item.franchise_id)?.franchise_name_cn || '') : ''
                  const badge = activeTab === 'anime' ? item.airing_type : activeTab === 'franchise' ? item.franchise_type : ''
                  return (
                    <button key={item.system_id} onClick={() => openEditor(item, activeTab)}
                      className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-brand hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm">
                      {badge && <span className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 mb-1.5">{badge}</span>}
                      <div className="text-sm font-bold text-gray-800 line-clamp-1">{getItemLabel(item, activeTab)}</div>
                      {sub && <div className="text-xs text-gray-400 mt-0.5 truncate">{sub}</div>}
                      <div className="text-[9px] text-gray-300 mt-2 font-mono">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : ''}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ EDITOR VIEW ═══ */}
      {editorOpen && editingItem && (
        <form onSubmit={handleSave}>
          <div className="flex items-center gap-3 mb-5">
            <button type="button" onClick={closeEditor} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition shrink-0">
              <i className="fas fa-arrow-left text-xs"></i> Back
            </button>
            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded truncate">{editingItem.system_id}</span>
          </div>

          {/* Anime ribbon */}
          {editingType === 'anime' && animeRibbon.length > 0 && (
            <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Other entries in this franchise</p>
              <div className="flex gap-2 flex-wrap">
                {animeRibbon.map(a => (
                  <button key={a.system_id} type="button" onClick={() => openEditor(a, 'anime')}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition">
                    {a.airing_type && <span className="text-[9px] font-black text-gray-400 shrink-0">{a.airing_type}</span>}
                    {a.anime_name_cn || a.anime_name_en || 'Unknown'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
            <h2 className="text-lg font-black text-gray-900">{getItemLabel(editingItem, editingType)}</h2>
            <p className="text-xs text-brand font-bold">{editingType.toUpperCase()}</p>

            {/* ── ANIME EDITOR ── */}
            {editingType === 'anime' && (
              <>
                <SectionHeader icon="fa-tag" title="Titles & Naming" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Franchise">
                    <ComboBox items={franchiseItems} selectedId={af.franchise_id} inputText={af.franchise_text}
                      onSelect={(id, label) => { ua('franchise_id', id); ua('franchise_text', label) }}
                      onType={text => { ua('franchise_text', text); ua('franchise_id', null) }}
                      onClear={() => { ua('franchise_id', null); ua('franchise_text', '') }} placeholder="Search franchise..." allowNew />
                  </Field>
                  <Field label="Series">
                    <ComboBox items={seriesItemsForAnime} selectedId={af.series_id} inputText={af.series_text}
                      onSelect={(id, label) => { ua('series_id', id); ua('series_text', label) }}
                      onType={text => { ua('series_text', text); ua('series_id', null) }}
                      onClear={() => { ua('series_id', null); ua('series_text', '') }} placeholder="Search series..." allowNew />
                  </Field>
                </div>
                <Field label="Anime Name EN" required><input className={inputCls} value={af.anime_name_en} onChange={e => ua('anime_name_en', e.target.value)} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Anime Name CN"><input className={inputCls} value={af.anime_name_cn} onChange={e => ua('anime_name_cn', e.target.value)} /></Field>
                  <Field label="Anime Name Romanji"><input className={inputCls} value={af.anime_name_romanji} onChange={e => ua('anime_name_romanji', e.target.value)} /></Field>
                  <Field label="Anime Name JP"><input className={inputCls} value={af.anime_name_jp} onChange={e => ua('anime_name_jp', e.target.value)} /></Field>
                  <Field label="Anime Name Alt"><input className={inputCls} value={af.anime_name_alt} onChange={e => ua('anime_name_alt', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Season">
                    <select className={selectCls} value={af.season_num} onChange={e => ua('season_num', e.target.value)}>
                      <option value="">—</option>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>Season {n}</option>)}
                    </select>
                  </Field>
                  <Field label="Part">
                    <select className={selectCls} value={af.part_num} onChange={e => ua('part_num', e.target.value)}>
                      <option value="">—</option>{Array.from({length:7},(_,i)=>i+1).map(n=><option key={n} value={n}>Part {n}</option>)}
                    </select>
                  </Field>
                </div>

                <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Airing Status">
                    <select className={selectCls} value={af.airing_status} onChange={e => ua('airing_status', e.target.value)}>
                      <option value="">—</option>{['Not Yet Aired','Airing','Finished Airing'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Watching Status">
                    <select className={selectCls} value={af.watching_status} onChange={e => ua('watching_status', e.target.value)}>
                      {['Might Watch','Plan to Watch','Watch When Airs','Active Watching','Passive Watching','Paused','Completed','Temp Dropped','Dropped',"Won't Watch"].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="My Rating">
                    <select className={selectCls} value={af.my_rating} onChange={e => ua('my_rating', e.target.value)}>
                      <option value="">—</option>{['S','A+','A','B','C','D','E','F'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="EP Previous"><input className={inputCls} type="number" min="0" value={af.ep_previous} onChange={e => ua('ep_previous', e.target.value)} /></Field>
                  <Field label="EP Total"><input className={inputCls} type="number" min="0" value={af.ep_total} onChange={e => ua('ep_total', e.target.value)} /></Field>
                  <Field label="EP Finished"><input className={inputCls} type="number" min="0" value={af.ep_fin} onChange={e => ua('ep_fin', e.target.value)} /></Field>
                  <Field label="EP Special"><input className={inputCls} type="number" min="0" step="0.5" value={af.ep_special} onChange={e => ua('ep_special', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="MAL Rating"><input className={inputCls} type="number" step="0.01" min="0" max="10" value={af.mal_rating} onChange={e => ua('mal_rating', e.target.value)} /></Field>
                  <Field label="MAL Rank"><input className={inputCls} value={af.mal_rank} onChange={e => ua('mal_rank', e.target.value)} /></Field>
                  <Field label="AniList Rating"><input className={inputCls} value={af.anilist_rating} onChange={e => ua('anilist_rating', e.target.value)} /></Field>
                </div>

                <SectionHeader icon="fa-tags" title="Classification" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Airing Type">
                    <select className={selectCls} value={af.airing_type} onChange={e => ua('airing_type', e.target.value)}>
                      <option value="">—</option>{['TV','Movie','ONA','OVA','OAD','Special','Other'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Main / Spinoff">
                    <select className={selectCls} value={af.is_main} onChange={e => ua('is_main', e.target.value)}>
                      <option value="">—</option>{['本傳','外傳','前傳','後傳','總集篇'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Genre Main"><MultiSelect options={getOptions(allOptions,'Genre Main')} value={af.genre_main} onChange={v=>ua('genre_main',v)} placeholder="Select genres..." /></Field>
                  <Field label="Genre Sub"><MultiSelect options={getOptions(allOptions,'Genre Sub')} value={af.genre_sub} onChange={v=>ua('genre_sub',v)} placeholder="Select sub-genres..." /></Field>
                </div>

                <SectionHeader icon="fa-industry" title="Production" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Release Season">
                    <select className={selectCls} value={af.release_season} onChange={e => ua('release_season', e.target.value)}>
                      <option value="">—</option>{['WIN','SPR','SUM','FAL'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Release Month">
                    <select className={selectCls} value={af.release_month} onChange={e => ua('release_month', e.target.value)}>
                      <option value="">—</option>{['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Release Year"><input className={inputCls} value={af.release_year} onChange={e => ua('release_year', e.target.value)} placeholder="YYYY" /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Studio"><MultiSelect options={getOptions(allOptions,'Studio')} value={af.studio} onChange={v=>ua('studio',v)} placeholder="Select studio..." /></Field>
                  <Field label="Distributor TW"><MultiSelect options={getOptions(allOptions,'Distributor TW')} value={af.distributor_tw} onChange={v=>ua('distributor_tw',v)} placeholder="Select distributor..." /></Field>
                  <Field label="Director"><MultiSelect options={getOptions(allOptions,'Director')} value={af.director} onChange={v=>ua('director',v)} placeholder="Select director..." /></Field>
                  <Field label="Producer"><MultiSelect options={getOptions(allOptions,'Producer')} value={af.producer} onChange={v=>ua('producer',v)} placeholder="Select producer..." /></Field>
                  <Field label="Music / Composer"><MultiSelect options={getOptions(allOptions,'Music / Composer')} value={af.music} onChange={v=>ua('music',v)} placeholder="Select composer..." /></Field>
                </div>

                <SectionHeader icon="fa-link" title="Relational & Timeline" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Prequel ID" hint="UUID"><input className={inputCls+' font-mono text-xs'} value={af.prequel_id||''} onChange={e=>ua('prequel_id',e.target.value||null)} /></Field>
                  <Field label="Sequel ID" hint="UUID"><input className={inputCls+' font-mono text-xs'} value={af.sequel_id||''} onChange={e=>ua('sequel_id',e.target.value||null)} /></Field>
                  <Field label="Alternative IDs" hint="Comma-separated UUIDs"><input className={inputCls+' font-mono text-xs'} value={af.alternative} onChange={e=>ua('alternative',e.target.value)} /></Field>
                  <Field label="Watch Order"><input className={inputCls} type="number" step="any" value={af.watch_order} onChange={e=>ua('watch_order',e.target.value)} /></Field>
                </div>

                <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="MAL ID"><input className={inputCls} type="number" value={af.mal_id} onChange={e=>ua('mal_id',e.target.value)} /></Field>
                  <Field label="MAL Link"><input className={inputCls} type="url" value={af.mal_link} onChange={e=>ua('mal_link',e.target.value)} /></Field>
                  <Field label="AniList Link"><input className={inputCls} type="url" value={af.anilist_link} onChange={e=>ua('anilist_link',e.target.value)} /></Field>
                  <Field label="Official Website"><input className={inputCls} type="url" value={af.official_link} onChange={e=>ua('official_link',e.target.value)} /></Field>
                  <Field label="Twitter Link"><input className={inputCls} type="url" value={af.twitter_link} onChange={e=>ua('twitter_link',e.target.value)} /></Field>
                </div>

                <SectionHeader icon="fa-broadcast-tower" title="Source Availability" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Bahamut Source">
                    <select className={selectCls} value={af.source_baha} onChange={e=>ua('source_baha',e.target.value)}>
                      <option value="">—</option><option value="true">有 (Yes)</option><option value="false">無 (No)</option>
                    </select>
                  </Field>
                  <Field label="Bahamut Link"><input className={inputCls} type="url" value={af.baha_link} onChange={e=>ua('baha_link',e.target.value)} /></Field>
                  <Field label="Netflix Source">
                    <select className={selectCls} value={af.source_netflix} onChange={e=>ua('source_netflix',e.target.value)}>
                      <option value="false">無 (No)</option><option value="true">有 (Yes)</option>
                    </select>
                  </Field>
                  <Field label="Other Source Name"><input className={inputCls} value={af.source_other} onChange={e=>ua('source_other',e.target.value)} /></Field>
                  <Field label="Other Source Link"><input className={inputCls} type="url" value={af.source_other_link} onChange={e=>ua('source_other_link',e.target.value)} /></Field>
                </div>

                <SectionHeader icon="fa-music" title="Notes & Other" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="OP"><select className={selectCls} value={af.op} onChange={e=>ua('op',e.target.value)}><option value="">—</option>{['Pending','Need','Done'].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
                  <Field label="ED"><select className={selectCls} value={af.ed} onChange={e=>ua('ed',e.target.value)}><option value="">—</option>{['Pending','Need','Done'].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
                  <Field label="Insert / OST"><select className={selectCls} value={af.insert_ost} onChange={e=>ua('insert_ost',e.target.value)}><option value="">—</option>{['Pending','Need','Done'].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
                  <Field label="Seiyuu"><select className={selectCls} value={af.seiyuu} onChange={e=>ua('seiyuu',e.target.value)}><option value="">—</option>{['Need','Done'].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
                </div>
                <Field label="Cover Image File" hint="e.g. 5114.jpg"><input className={inputCls} value={af.cover_image_file} onChange={e=>ua('cover_image_file',e.target.value)} /></Field>
                <Field label="Remark"><textarea className={inputCls} rows={3} value={af.remark} onChange={e=>ua('remark',e.target.value)} /></Field>
              </>
            )}

            {/* ── FRANCHISE EDITOR ── */}
            {editingType === 'franchise' && (
              <>
                <SectionHeader icon="fa-sitemap" title="Titles & Naming" />
                <Field label="Franchise Name EN"><input className={inputCls} value={ff.franchise_name_en} onChange={e=>uf('franchise_name_en',e.target.value)} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Franchise Name CN"><input className={inputCls} value={ff.franchise_name_cn} onChange={e=>uf('franchise_name_cn',e.target.value)} /></Field>
                  <Field label="Franchise Name Romanji"><input className={inputCls} value={ff.franchise_name_romanji} onChange={e=>uf('franchise_name_romanji',e.target.value)} /></Field>
                  <Field label="Franchise Name JP"><input className={inputCls} value={ff.franchise_name_jp} onChange={e=>uf('franchise_name_jp',e.target.value)} /></Field>
                  <Field label="Franchise Name Alt"><input className={inputCls} value={ff.franchise_name_alt} onChange={e=>uf('franchise_name_alt',e.target.value)} /></Field>
                </div>
                <SectionHeader icon="fa-info-circle" title="Other Information" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Franchise Type">
                    <select className={selectCls} value={ff.franchise_type} onChange={e=>uf('franchise_type',e.target.value)}>
                      <option value="">—</option>{['ACG','Anime Movie','TV or Movie','Cartoon'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="My Rating">
                    <select className={selectCls} value={ff.my_rating} onChange={e=>uf('my_rating',e.target.value)}>
                      <option value="">—</option>{['S','A+','A','B','C','D','E','F'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Expectation">
                    <select className={selectCls} value={ff.franchise_expectation} onChange={e=>uf('franchise_expectation',e.target.value)}>
                      <option value="">—</option>{['High','Medium','Low'].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Favorite 3x3 Slot">
                    <select className={selectCls} value={ff.favorite_3x3_slot} onChange={e=>uf('favorite_3x3_slot',e.target.value)}>
                      <option value="">—</option>{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Cover Image Source" hint="3x3 grid cover — leave blank to auto-pick latest entry with cover">
                  <select className={selectCls} value={ff.cover_anime_id || ''} onChange={e=>uf('cover_anime_id', e.target.value || null)}>
                    <option value="">— Auto (latest with cover) —</option>
                    {allAnime
                      .filter(a => a.franchise_id === editingItem?.system_id)
                      .sort((a, b) => {
                        const yr = (parseInt(b.release_year,10)||0) - (parseInt(a.release_year,10)||0)
                        return yr !== 0 ? yr : (b.release_month||0) - (a.release_month||0)
                      })
                      .map(a => (
                        <option key={a.system_id} value={a.system_id}>
                          {a.anime_name_cn || a.anime_name_en || a.anime_name_romanji || a.system_id}
                          {a.release_year ? ` (${a.release_year})` : ''}
                        </option>
                      ))
                    }
                  </select>
                </Field>
                <Field label="Watch Next Group">
                  <select className={selectCls} value={ff.watch_next_group || ''} onChange={e=>uf('watch_next_group', e.target.value || null)}>
                    <option value="">— Not in Watch List —</option>
                    <option value="12ep">12 EP</option>
                    <option value="24ep">24 EP</option>
                    <option value="30ep_plus">30+ EP</option>
                  </select>
                </Field>
                <Field label="To Rewatch">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!ff.to_rewatch} onChange={e=>uf('to_rewatch', e.target.checked)} className="w-4 h-4 rounded accent-brand" />
                    <span className="text-sm font-medium text-gray-700">Mark this franchise for rewatch</span>
                  </label>
                </Field>
                <Field label="Remark"><textarea className={inputCls} rows={3} value={ff.remark} onChange={e=>uf('remark',e.target.value)} /></Field>
              </>
            )}

            {/* ── SERIES EDITOR ── */}
            {editingType === 'series' && (
              <>
                <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
                <Field label="Parent Franchise" required>
                  <ComboBox items={franchiseItems} selectedId={sf.franchise_id} inputText={sf.franchise_text}
                    onSelect={(id, label) => { us('franchise_id', id); us('franchise_text', label) }}
                    onType={text => { us('franchise_text', text); us('franchise_id', null) }}
                    onClear={() => { us('franchise_id', null); us('franchise_text', '') }} placeholder="Search franchise..." />
                </Field>
                <Field label="Series Name EN"><input className={inputCls} value={sf.series_name_en} onChange={e=>us('series_name_en',e.target.value)} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Series Name CN"><input className={inputCls} value={sf.series_name_cn} onChange={e=>us('series_name_cn',e.target.value)} /></Field>
                  <Field label="Series Name Alt"><input className={inputCls} value={sf.series_name_alt} onChange={e=>us('series_name_alt',e.target.value)} /></Field>
                </div>
                <Field label="Remark"><textarea className={inputCls} rows={3} value={sf.remark} onChange={e=>us('remark',e.target.value)} /></Field>
              </>
            )}

            {/* ── OPTIONS EDITOR ── */}
            {editingType === 'options' && (
              <>
                <SectionHeader icon="fa-cog" title="System Option" />
                <Field label="Category"><input className={inputCls+' bg-gray-50 text-gray-500'} value={editingItem.category} readOnly /></Field>
                <Field label="Option Value" required><input className={inputCls} value={optValue} onChange={e=>setOptValue(e.target.value)} /></Field>
              </>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60">
              {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* ── CREATE NEW PARENT MODAL ── */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-brand/5 border-b border-brand/10 px-6 py-4 flex items-center gap-3">
              <i className="fas fa-magic text-brand text-xl"></i>
              <h3 className="font-black text-gray-900">Create New {createModal.entityType}</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">"<span className="font-bold text-gray-900">{createModal.text}</span>" does not match any existing {createModal.entityType.toLowerCase()}.</p>
              <p className="text-sm text-gray-500 mt-2">A new record will be created with this name, then the entry will be saved.</p>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={createModal.onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={createModal.onConfirm} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition">Create & Proceed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
