// Frontend: the chrome shared by every notes section — card, row actions,
// save/cancel and link pills. These used to be private helpers inside the
// 1500-line NotesTemplate; the shape components each own one file now, so the
// chrome lives here instead of being duplicated four times.
//
// Styled as archive slips (see docs/frontend/design-system.md): a flat
// bordered surface, a mono eyebrow title on a dotted rule, hairline dividers
// between rows. The cards stay `div.bg-surface` because NotesTemplate.test.jsx
// locates them by that selector.
import { useState } from "react";

import { Button } from "../../../components/ui/primitives";

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
  "w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

// A mono tag for a row's locator / kind / status. Ink only - colour never
// encodes a category.
export const tagCls =
  "inline-flex items-center border border-border-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] leading-none text-text-muted whitespace-nowrap";
export const brandTagCls =
  "inline-flex items-center border border-brand px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] leading-none text-brand whitespace-nowrap";

// A row inside a section: a hairline above, no box.
export const rowCls = "border-t border-border pt-2 first:border-t-0 first:pt-0";
// The draft row: dashed so the reader sees it is not saved yet.
export const draftCls = "border border-dashed border-border-strong p-2.5";

const chevron = (collapsed) => (
  <span
    aria-hidden="true"
    className="font-mono text-[10px] text-text-faint select-none"
  >
    {collapsed ? "+" : "−"}
  </span>
);

const countCls = "font-mono text-[10px] text-text-faint tabular-nums";

export function SectionCard({ label, count, isAdmin, onAdd, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-surface border border-border">
      <div
        className="flex items-center gap-3 px-3 py-2 border-b border-border cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted shrink-0">
          {label}
        </h4>
        {count > 0 && <span className={countCls}>{count}</span>}
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {isAdmin && onAdd && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // The draft row renders in the body, so adding to a collapsed
                // (i.e. empty) section has to open it or the form never shows.
                setCollapsed(false);
                onAdd();
              }}
            >
              Add
            </Button>
          )}
          <span onClick={() => setCollapsed(!collapsed)}>{chevron(collapsed)}</span>
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
// has never worn a count badge. `icon` is accepted (the registry still sends
// one) and ignored: section titles do not carry icons.
export function GroupCard({ label, count, showCount = true, children }) {
  const [collapsed, setCollapsed] = useCollapsed(count);
  return (
    <div className="bg-surface border border-border">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted shrink-0">
          {label}
        </h3>
        {showCount && count > 0 && <span className={countCls}>{count}</span>}
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
        {chevron(collapsed)}
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
        aria-label="Edit"
        title="Edit"
        className="text-text-faint hover:text-brand text-xs px-1"
      >
        <i className="fas fa-pencil-alt"></i>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        title="Delete"
        className="text-text-faint hover:text-danger text-xs px-1"
      >
        <i className="fas fa-trash"></i>
      </button>
    </div>
  );
}

export function SaveCancel({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 mt-2">
      <Button type="button" kind="primary" size="sm" onClick={onSave}>
        Save
      </Button>
      <Button type="button" size="sm" onClick={onCancel}>
        Cancel
      </Button>
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
      className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted hover:text-brand border border-border px-1.5 py-0.5 max-w-[200px] truncate transition"
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
              aria-label="Remove link"
              title="Remove link"
              className="text-text-faint hover:text-danger px-1"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, ""])}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
      >
        + Add link
      </button>
    </div>
  );
}

export const EmptyHint = () => (
  <p className="text-xs text-text-faint">No entries.</p>
);
