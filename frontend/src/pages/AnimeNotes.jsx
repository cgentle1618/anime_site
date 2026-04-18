import { useState } from 'react'

const SPECIAL_CHANGE_TYPES = ['加長', '變化OP', '變化ED', '特殊OP', '特殊ED']

const SECTIONS = [
  { key: 'remark',          label: 'Remark',                        type: 'remark' },
  { key: 'advantages',      label: '優點 Advantages',               type: 'string_list' },
  { key: 'disadvantages',   label: '缺點 Disadvantages',            type: 'string_list' },
  { key: 'double_edged',    label: '優缺點',                        type: 'string_list' },
  { key: 'public_reviews',  label: '大眾評價 Public Reviews',       type: 'string_list' },
  { key: 'personal_reviews',label: '我的評價 Personal Reviews',     type: 'string_list' },
  { key: 'questions',       label: 'Questions',                     type: 'string_list' },
  { key: 'analysis',        label: '解析 Analysis',                 type: 'desc_links' },
  { key: 'cinematography',  label: '分鏡／演出／巧思',              type: 'desc_links' },
  { key: 'foreshadowing',   label: 'Foreshadowing',                 type: 'desc_links' },
  { key: 'symmetry',        label: '對稱 Symmetry',                 type: 'desc_links' },
  { key: 'adaptation',      label: '改編 Adaptation',               type: 'desc_links', descRequired: true },
  { key: 'resources',       label: 'Resources',                     type: 'name_link' },
  { key: 'unread',          label: 'Unread',                        type: 'name_link' },
  { key: 'quotes_memes',    label: '名言／梗／迷因 Quotes & Memes', type: 'quote_meme' },
  { key: 'special_changes', label: '特殊變動 Special Changes',      type: 'episode_entry', typeDropdown: SPECIAL_CHANGE_TYPES },
  { key: 'highlights',      label: '神回／神片段 Highlights',       type: 'episode_entry' },
]

// ─── Shared UI ────────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand'
const btnCls = 'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors'

function SectionCard({ label, sectionKey, count, isAdmin, onAdd, children }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-gray-800">{label}</h4>
          {count > 0 && (
            <span className="text-[10px] font-black bg-brand/10 text-brand rounded-full px-1.5 py-0.5">{count}</span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {isAdmin && (
            <button onClick={onAdd} className={btnCls + ' bg-brand text-white hover:bg-brand/90'}>
              <i className="fas fa-plus text-[10px]"></i> Add
            </button>
          )}
          <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-gray-400 text-xs`}></i>
        </div>
      </div>
      {!collapsed && <div className="p-3 space-y-2">{children}</div>}
    </div>
  )
}

function ItemActions({ isAdmin, onEdit, onDelete }) {
  if (!isAdmin) return null
  return (
    <div className="flex gap-1 shrink-0 mt-0.5">
      <button onClick={onEdit} className="text-gray-400 hover:text-brand text-xs px-1"><i className="fas fa-pencil-alt"></i></button>
      <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-xs px-1"><i className="fas fa-trash"></i></button>
    </div>
  )
}

function SaveCancel({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 mt-2">
      <button onClick={onSave} className={btnCls + ' bg-brand text-white hover:bg-brand/90'}>Save</button>
      <button onClick={onCancel} className={btnCls + ' bg-gray-100 text-gray-600 hover:bg-gray-200'}>Cancel</button>
    </div>
  )
}

function LinkPill({ url }) {
  const label = (() => { try { return new URL(url).hostname } catch { return url } })()
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-brand hover:underline bg-brand/5 border border-brand/20 rounded px-1.5 py-0.5 max-w-[200px] truncate">
      <i className="fas fa-external-link-alt text-[9px]"></i>{label}
    </a>
  )
}

// ─── Remark Section ───────────────────────────────────────────────────────────

function RemarkSection({ value, isAdmin, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
        <h4 className="font-bold text-sm text-gray-800">Remark</h4>
      </div>
      <div className="p-3">
        <textarea
          value={value || ''}
          disabled={!isAdmin}
          onChange={e => isAdmin && onChange(e.target.value)}
          rows={4}
          placeholder="General remarks..."
          className={inputCls + (isAdmin ? '' : ' bg-gray-50 text-gray-600 cursor-default')}
        />
      </div>
    </div>
  )
}

// ─── String List Section ──────────────────────────────────────────────────────

function StringListSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState('')

  const commit = () => {
    if (!draft.trim()) return
    onUpdate([...(items || []), draft.trim()])
    setDraft(''); setAdding(false)
  }
  const saveEdit = () => {
    const next = [...items]; next[editIdx] = editVal.trim()
    onUpdate(next); setEditIdx(null)
  }
  const remove = i => onUpdate((items || []).filter((_, idx) => idx !== i))

  return (
    <SectionCard label={label} sectionKey={sectionKey} count={(items || []).length} isAdmin={isAdmin} onAdd={() => setAdding(true)}>
      {(items || []).map((item, i) => (
        <div key={i}>
          {editIdx === i ? (
            <div>
              <textarea value={editVal} onChange={e => setEditVal(e.target.value)} rows={2} className={inputCls} autoFocus />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start group">
              <span className="text-xs text-gray-500 mt-0.5 shrink-0">•</span>
              <span className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{item}</span>
              <ItemActions isAdmin={isAdmin} onEdit={() => { setEditIdx(i); setEditVal(item) }} onDelete={() => remove(i)} />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} className={inputCls} autoFocus placeholder="Add item..." />
          <SaveCancel onSave={commit} onCancel={() => { setDraft(''); setAdding(false) }} />
        </div>
      )}
      {!(items || []).length && !adding && <p className="text-xs text-gray-400 italic">No entries.</p>}
    </SectionCard>
  )
}

// ─── Description + Links Section ─────────────────────────────────────────────

const emptyDescLinks = () => ({ description: '', links: [''] })

function DescLinksForm({ value, onChange, descRequired }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const setLink = (i, v) => { const ls = [...(value.links || [''])]; ls[i] = v; set('links', ls) }
  const addLink = () => set('links', [...(value.links || ['']), ''])
  const removeLink = i => set('links', (value.links || ['']).filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      <textarea
        value={value.description || ''}
        onChange={e => set('description', e.target.value)}
        rows={2}
        placeholder={descRequired ? 'Description (required)' : 'Description (optional)'}
        className={inputCls}
      />
      <div className="space-y-1">
        {(value.links || ['']).map((l, i) => (
          <div key={i} className="flex gap-1">
            <input value={l} onChange={e => setLink(i, e.target.value)} placeholder="https://..." className={inputCls} />
            {(value.links || ['']).length > 1 && (
              <button onClick={() => removeLink(i)} className="text-red-400 hover:text-red-600 px-1"><i className="fas fa-times text-xs"></i></button>
            )}
          </div>
        ))}
        <button onClick={addLink} className="text-xs text-brand hover:underline">+ Add link</button>
      </div>
    </div>
  )
}

function DescLinksSection({ sectionKey, label, items, isAdmin, onUpdate, descRequired }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyDescLinks())
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState(emptyDescLinks())

  const commit = () => {
    if (descRequired && !draft.description?.trim()) return
    onUpdate([...(items || []), { ...draft, links: (draft.links || []).filter(l => l.trim()) }])
    setDraft(emptyDescLinks()); setAdding(false)
  }
  const saveEdit = () => {
    const next = [...items]
    next[editIdx] = { ...editVal, links: (editVal.links || []).filter(l => l.trim()) }
    onUpdate(next); setEditIdx(null)
  }
  const remove = i => onUpdate((items || []).filter((_, idx) => idx !== i))

  return (
    <SectionCard label={label} sectionKey={sectionKey} count={(items || []).length} isAdmin={isAdmin} onAdd={() => setAdding(true)}>
      {(items || []).map((item, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
          {editIdx === i ? (
            <div>
              <DescLinksForm value={editVal} onChange={setEditVal} descRequired={descRequired} />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                {item.description && <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.description}</p>}
                {(item.links || []).filter(l => l).map((l, j) => <LinkPill key={j} url={l} />)}
                {!item.description && !(item.links || []).filter(l => l).length && <span className="text-xs text-gray-400 italic">(empty)</span>}
              </div>
              <ItemActions isAdmin={isAdmin}
                onEdit={() => { setEditIdx(i); setEditVal({ description: item.description || '', links: item.links?.length ? item.links : [''] }) }}
                onDelete={() => remove(i)} />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <DescLinksForm value={draft} onChange={setDraft} descRequired={descRequired} />
          <SaveCancel onSave={commit} onCancel={() => { setDraft(emptyDescLinks()); setAdding(false) }} />
        </div>
      )}
      {!(items || []).length && !adding && <p className="text-xs text-gray-400 italic">No entries.</p>}
    </SectionCard>
  )
}

// ─── Name + Link Section ──────────────────────────────────────────────────────

const emptyNameLink = () => ({ name: '', link: '' })

function NameLinkSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyNameLink())
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState(emptyNameLink())

  const commit = () => {
    if (!draft.link.trim()) return
    onUpdate([...(items || []), { name: draft.name.trim(), link: draft.link.trim() }])
    setDraft(emptyNameLink()); setAdding(false)
  }
  const saveEdit = () => {
    const next = [...items]; next[editIdx] = { name: editVal.name.trim(), link: editVal.link.trim() }
    onUpdate(next); setEditIdx(null)
  }
  const remove = i => onUpdate((items || []).filter((_, idx) => idx !== i))

  const Form = ({ val, setVal }) => (
    <div className="space-y-1.5">
      <input value={val.name} onChange={e => setVal({ ...val, name: e.target.value })} placeholder="Name (optional)" className={inputCls} />
      <input value={val.link} onChange={e => setVal({ ...val, link: e.target.value })} placeholder="URL (required)" className={inputCls} />
    </div>
  )

  return (
    <SectionCard label={label} sectionKey={sectionKey} count={(items || []).length} isAdmin={isAdmin} onAdd={() => setAdding(true)}>
      {(items || []).map((item, i) => (
        <div key={i} className="flex gap-2 items-center group">
          <span className="text-xs text-gray-500 shrink-0">•</span>
          <div className="flex-1 min-w-0">
            {editIdx === i ? (
              <div>
                <Form val={editVal} setVal={setEditVal} />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {item.name && <span className="text-sm text-gray-700 shrink-0">{item.name}</span>}
                {item.link && <LinkPill url={item.link} />}
              </div>
            )}
          </div>
          {editIdx !== i && <ItemActions isAdmin={isAdmin} onEdit={() => { setEditIdx(i); setEditVal({ name: item.name || '', link: item.link || '' }) }} onDelete={() => remove(i)} />}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <Form val={draft} setVal={setDraft} />
          <SaveCancel onSave={commit} onCancel={() => { setDraft(emptyNameLink()); setAdding(false) }} />
        </div>
      )}
      {!(items || []).length && !adding && <p className="text-xs text-gray-400 italic">No entries.</p>}
    </SectionCard>
  )
}

// ─── Quote / Meme Section ─────────────────────────────────────────────────────

const emptyQuoteMeme = () => ({ description: '', link: '' })

function QuoteMemeSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyQuoteMeme())
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState(emptyQuoteMeme())

  const commit = () => {
    if (!draft.description?.trim() && !draft.link?.trim()) return
    onUpdate([...(items || []), { description: draft.description.trim(), link: draft.link.trim() }])
    setDraft(emptyQuoteMeme()); setAdding(false)
  }
  const saveEdit = () => {
    const next = [...items]; next[editIdx] = { description: editVal.description.trim(), link: editVal.link.trim() }
    onUpdate(next); setEditIdx(null)
  }
  const remove = i => onUpdate((items || []).filter((_, idx) => idx !== i))

  const Form = ({ val, setVal }) => (
    <div className="space-y-1.5">
      <textarea value={val.description} onChange={e => setVal({ ...val, description: e.target.value })} rows={2} placeholder="Quote / meme (optional)" className={inputCls} />
      <input value={val.link} onChange={e => setVal({ ...val, link: e.target.value })} placeholder="Link (optional)" className={inputCls} />
    </div>
  )

  return (
    <SectionCard label={label} sectionKey={sectionKey} count={(items || []).length} isAdmin={isAdmin} onAdd={() => setAdding(true)}>
      {(items || []).map((item, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-2 bg-gray-50">
          {editIdx === i ? (
            <div>
              <Form val={editVal} setVal={setEditVal} />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                {item.description && <p className="text-sm text-gray-800 italic whitespace-pre-wrap">"{item.description}"</p>}
                {item.link && <LinkPill url={item.link} />}
              </div>
              <ItemActions isAdmin={isAdmin} onEdit={() => { setEditIdx(i); setEditVal({ description: item.description || '', link: item.link || '' }) }} onDelete={() => remove(i)} />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <Form val={draft} setVal={setDraft} />
          <SaveCancel onSave={commit} onCancel={() => { setDraft(emptyQuoteMeme()); setAdding(false) }} />
        </div>
      )}
      {!(items || []).length && !adding && <p className="text-xs text-gray-400 italic">No entries.</p>}
    </SectionCard>
  )
}

// ─── Episode Entry Section ────────────────────────────────────────────────────

const emptyEpisodeEntry = () => ({ episodes: '', type: '', description: '' })

function EpisodeEntrySection({ sectionKey, label, items, isAdmin, onUpdate, typeDropdown }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyEpisodeEntry())
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState(emptyEpisodeEntry())

  const commit = () => {
    if (!draft.episodes.trim() && !draft.description.trim()) return
    onUpdate([...(items || []), { episodes: draft.episodes.trim(), type: draft.type.trim(), description: draft.description.trim() }])
    setDraft(emptyEpisodeEntry()); setAdding(false)
  }
  const saveEdit = () => {
    const next = [...items]
    next[editIdx] = { episodes: editVal.episodes.trim(), type: editVal.type.trim(), description: editVal.description.trim() }
    onUpdate(next); setEditIdx(null)
  }
  const remove = i => onUpdate((items || []).filter((_, idx) => idx !== i))

  const Form = ({ val, setVal }) => (
    <div className="space-y-1.5">
      <input value={val.episodes} onChange={e => setVal({ ...val, episodes: e.target.value })} placeholder="Episode(s), e.g. ep 6" className={inputCls} />
      {typeDropdown ? (
        <select value={val.type} onChange={e => setVal({ ...val, type: e.target.value })} className={inputCls}>
          <option value="">Type...</option>
          {typeDropdown.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      ) : (
        <input value={val.type} onChange={e => setVal({ ...val, type: e.target.value })} placeholder="Type (optional)" className={inputCls} />
      )}
      <textarea value={val.description} onChange={e => setVal({ ...val, description: e.target.value })} rows={2} placeholder="Description" className={inputCls} />
    </div>
  )

  return (
    <SectionCard label={label} sectionKey={sectionKey} count={(items || []).length} isAdmin={isAdmin} onAdd={() => setAdding(true)}>
      {(items || []).map((item, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
          {editIdx === i ? (
            <div>
              <Form val={editVal} setVal={setEditVal} />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.episodes && <span className="text-xs font-bold text-brand bg-brand/10 rounded px-1.5 py-0.5">{item.episodes}</span>}
                  {item.type && <span className="text-xs font-semibold text-gray-600 bg-gray-200 rounded px-1.5 py-0.5">{item.type}</span>}
                </div>
                {item.description && <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{item.description}</p>}
              </div>
              <ItemActions isAdmin={isAdmin} onEdit={() => { setEditIdx(i); setEditVal({ episodes: item.episodes || '', type: item.type || '', description: item.description || '' }) }} onDelete={() => remove(i)} />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <Form val={draft} setVal={setDraft} />
          <SaveCancel onSave={commit} onCancel={() => { setDraft(emptyEpisodeEntry()); setAdding(false) }} />
        </div>
      )}
      {!(items || []).length && !adding && <p className="text-xs text-gray-400 italic">No entries.</p>}
    </SectionCard>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function AnimeNotes({ anime, isAdmin, onSave }) {
  const [notes, setNotes] = useState(anime.notes ?? {})

  const updateSection = (key, val) => {
    const updated = { ...notes, [key]: val }
    setNotes(updated)
    onSave(updated)
  }

  const renderSection = (sec) => {
    const items = notes[sec.key]
    switch (sec.type) {
      case 'remark':
        return (
          <RemarkSection
            key={sec.key}
            value={notes.remark}
            isAdmin={isAdmin}
            onChange={val => updateSection('remark', val || null)}
          />
        )
      case 'string_list':
        return <StringListSection key={sec.key} sectionKey={sec.key} label={sec.label} items={items} isAdmin={isAdmin} onUpdate={val => updateSection(sec.key, val)} />
      case 'desc_links':
        return <DescLinksSection key={sec.key} sectionKey={sec.key} label={sec.label} items={items} isAdmin={isAdmin} onUpdate={val => updateSection(sec.key, val)} descRequired={sec.descRequired} />
      case 'name_link':
        return <NameLinkSection key={sec.key} sectionKey={sec.key} label={sec.label} items={items} isAdmin={isAdmin} onUpdate={val => updateSection(sec.key, val)} />
      case 'quote_meme':
        return <QuoteMemeSection key={sec.key} sectionKey={sec.key} label={sec.label} items={items} isAdmin={isAdmin} onUpdate={val => updateSection(sec.key, val)} />
      case 'episode_entry':
        return <EpisodeEntrySection key={sec.key} sectionKey={sec.key} label={sec.label} items={items} isAdmin={isAdmin} onUpdate={val => updateSection(sec.key, val)} typeDropdown={sec.typeDropdown} />
      default:
        return null
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h3 className="font-bold text-gray-800">
          <i className="fas fa-book-open text-brand mr-2"></i>Notes
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {SECTIONS.map(renderSection)}
      </div>
    </div>
  )
}
