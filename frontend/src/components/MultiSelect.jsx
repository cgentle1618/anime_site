import { useState, useRef, useEffect } from 'react'

// MultiSelect: manage a comma-separated string value using pill UI.
// Props:
//   options: string[]         — available choices (from /api/options/)
//   value: string             — current comma-separated selected values (e.g. "A-1 Pictures, Toei")
//   onChange(newValue: string)— called with updated comma-separated string
//   placeholder: string
export default function MultiSelect({ options = [], value = '', onChange, placeholder = 'Select...' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = value ? value.split(',').map(v => v.trim()).filter(Boolean) : []

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function cleanStr(s) {
    if (!s) return ''
    return s.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
  }

  const available = options.filter(o => !selected.includes(o))
  const filtered = query
    ? available.filter(o => cleanStr(o).includes(cleanStr(query))).slice(0, 10)
    : available.slice(0, 10)

  function addValue(val) {
    const next = [...selected, val]
    onChange(next.join(', '))
    setQuery('')
    inputRef.current?.focus()
  }

  function removeValue(val) {
    const next = selected.filter(v => v !== val)
    onChange(next.join(', '))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      const exact = available.find(o => o.toLowerCase() === query.trim().toLowerCase())
      if (exact) addValue(exact)
      else if (query.trim()) addValue(query.trim())  // allow custom entry
    }
    if (e.key === 'Backspace' && !query && selected.length > 0) {
      removeValue(selected[selected.length - 1])
    }
    if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Pills + input */}
      <div
        className="flex flex-wrap gap-1.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-text focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent min-h-[38px]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(v => (
          <span key={v} className="flex items-center gap-1 bg-brand/10 text-brand text-xs font-bold px-2 py-0.5 rounded-full">
            {v}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeValue(v) }}
              className="hover:text-red-500 transition ml-0.5"
            >
              <i className="fas fa-times text-[9px]"></i>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[4rem] text-sm font-medium outline-none bg-transparent py-0.5"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 font-medium">
              {query ? `Press Enter to add "${query}"` : 'No more options'}
            </div>
          ) : (
            filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addValue(opt)}
                className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors first:rounded-t-xl last:rounded-b-xl truncate"
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
