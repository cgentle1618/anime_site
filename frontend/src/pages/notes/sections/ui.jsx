// Frontend: the chrome shared by every notes section — card, row actions,
// save/cancel and link pills. These used to be private helpers inside the
// 1500-line NotesTemplate; the shape components each own one file now, so the
// chrome lives here instead of being duplicated four times.
import { useState } from "react";

export const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";
export const btnCls =
  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors";

export function SectionCard({ label, count, isAdmin, onAdd, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
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
              onClick={onAdd}
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
