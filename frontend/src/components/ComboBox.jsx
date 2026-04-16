import { useState, useRef, useEffect } from 'react'

// ComboBox: search existing items by label, or type a new value (if allowNew).
// Props:
//   items: [{id, label}]
//   selectedId: string|null   — the currently chosen existing item's ID
//   inputText: string         — text typed when no existing item is selected
//   onSelect(id, label)       — called when user picks an existing item
//   onType(text)              — called when user types (no selection)
//   onClear()                 — called when user clears selection
//   placeholder: string
//   allowNew: bool            — if true, typed unmatched text shows "Will create new" hint
//   required: bool
export default function ComboBox({
  items = [],
  selectedId = null,
  inputText = '',
  onSelect,
  onType,
  onClear,
  placeholder = 'Search...',
  allowNew = false,
  required = false,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Close on outside click
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

  const selectedLabel = selectedId ? (items.find(i => i.id === selectedId)?.label || '') : ''

  function cleanStr(s) {
    if (!s) return ''
    return s.toLowerCase().replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, '')
  }

  const filtered = query
    ? items.filter(i => cleanStr(i.searchText || i.label).includes(cleanStr(query))).slice(0, 10)
    : items.slice(0, 10)

  const isNewValue = allowNew && inputText && !selectedId

  function handleInputChange(e) {
    const val = e.target.value
    setQuery(val)
    setOpen(true)
    onType?.(val)
    if (selectedId) onClear?.()  // typing clears any existing selection
  }

  function handleSelect(item) {
    onSelect?.(item.id, item.label)
    setQuery('')
    setOpen(false)
  }

  function handleClear(e) {
    e.stopPropagation()
    onClear?.()
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Tab') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Display: selected item OR text input */}
      {selectedId ? (
        <div className="flex items-center gap-2 w-full border border-brand/40 rounded-lg px-3 py-2 bg-brand/5">
          <i className="fas fa-check-circle text-brand text-xs shrink-0"></i>
          <span className="text-sm font-bold text-gray-800 flex-1 truncate">{selectedLabel}</span>
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-red-500 transition shrink-0">
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query || inputText}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required && !selectedId && !inputText}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            autoComplete="off"
          />
          {(query || inputText) && (
            <button type="button" onClick={handleClear} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && !selectedId && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 font-medium">
              {allowNew && query ? `"${query}" — will be created as new` : 'No matches found'}
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors first:rounded-t-xl last:rounded-b-xl truncate"
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* "Will create new" hint */}
      {isNewValue && !open && (
        <p className="text-[10px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
          <i className="fas fa-magic"></i> Will create new record on save
        </p>
      )}
    </div>
  )
}
