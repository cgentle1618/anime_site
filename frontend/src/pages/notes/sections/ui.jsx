// Frontend: the chrome shared by every notes section — card, row actions,
// save/cancel and link pills. These used to be private helpers inside the
// 1500-line NotesTemplate; the shape components each own one file now, so the
// chrome lives here instead of being duplicated four times.
import { useState } from "react";

// Collapse state for a card whose emptiness decides its default.
//
// An empty section opens collapsed so a page of mostly-blank headers stays
// readable; anything holding rows opens expanded. The flag is DERIVED from the
// count rather than seeded into state at mount, because a card that fetches its
// own rows (quotes, memes) counts zero on its first render and fills in a tick
// later - a mount-time seed would leave it wrongly collapsed for good. A count
// of null/undefined means "not known yet" and never auto-collapses.
//
// `override` records an explicit click and wins from then on, so a card the
// reader opened by hand does not slam shut when its last row is deleted.
function useCollapsed(count) {
  const [override, setOverride] = useState(null);
  return [override === null ? count === 0 : override, setOverride];
}

export const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";
export const btnCls =
  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors";

export function SectionCard({ label, count, isAdmin, onAdd, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-gray-800">{label}</h4>
          {count > 0 && (
            <span className="text-[10px] font-black bg-brand/10 text-brand rounded-full px-1.5 py-0.5">
              {count}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {isAdmin && onAdd && (
            <button
              type="button"
              onClick={() => {
                // The draft row renders in the body, so adding to a collapsed
                // (i.e. empty) section has to open it or the form never shows.
                setCollapsed(false);
                onAdd();
              }}
              className={btnCls + " bg-brand text-white hover:bg-brand/90"}
            >
              <i className="fas fa-plus text-[10px]"></i> Add
            </button>
          )}
          <i
            className={`fas fa-chevron-${collapsed ? "down" : "up"} text-gray-400 text-xs`}
          ></i>
        </div>
      </div>
      {!collapsed && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

// The card a group of sections renders inside - 音樂 Music holds OP, ED,
// Insert, OST, OP/ED 變動 and 插入曲. It is a sibling of the Notes card, not a
// section within it, so it wears the same chrome as that card: a group is a
// peer of Notes, and nesting one card two deep read as a subsection of it.
// Each child is still its own SectionCard, so a group collapses as a unit and
// its subsections collapse individually. `showCount` is for the Notes card,
// which borrows this chrome to gain the same collapse-when-empty behaviour but
// has never worn a count badge.
export function GroupCard({ label, icon, count, showCount = true, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800">
            {icon && <i className={`fas ${icon} text-brand mr-2`}></i>}
            {label}
          </h3>
          {showCount && count > 0 && (
            <span className="text-[10px] font-black bg-brand/10 text-brand rounded-full px-1.5 py-0.5">
              {count}
            </span>
          )}
        </div>
        <i
          className={`fas fa-chevron-${collapsed ? "down" : "up"} text-gray-400 text-xs`}
        ></i>
      </div>
      {!collapsed && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

export function ItemActions({ isAdmin, onEdit, onDelete }) {
  if (!isAdmin) return null;
  return (
    <div className="flex gap-1 shrink-0 mt-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="text-gray-400 hover:text-brand text-xs px-1"
      >
        <i className="fas fa-pencil-alt"></i>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-gray-400 hover:text-red-500 text-xs px-1"
      >
        <i className="fas fa-trash"></i>
      </button>
    </div>
  );
}

export function SaveCancel({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        onClick={onSave}
        className={btnCls + " bg-brand text-white hover:bg-brand/90"}
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={btnCls + " bg-gray-100 text-gray-600 hover:bg-gray-200"}
      >
        Cancel
      </button>
    </div>
  );
}

export function LinkPill({ url }) {
  const label = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-brand hover:underline bg-brand/5 border border-brand/20 rounded px-1.5 py-0.5 max-w-[200px] truncate"
    >
      <i className="fas fa-external-link-alt text-[9px]"></i>
      {label}
    </a>
  );
}

// A repeatable list of URL inputs, shared by the two link-carrying shapes.
export function LinksEditor({ links, onChange }) {
  const list = links?.length ? links : [""];
  const setLink = (i, v) => onChange(list.map((l, idx) => (idx === i ? v : l)));
  return (
    <div className="space-y-1">
      {list.map((l, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={l}
            onChange={(e) => setLink(i, e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
          {list.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              className="text-red-400 hover:text-red-600 px-1"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, ""])}
        className="text-xs text-brand hover:underline"
      >
        + Add link
      </button>
    </div>
  );
}

export const EmptyHint = () => (
  <p className="text-xs text-gray-400 italic">No entries.</p>
);
