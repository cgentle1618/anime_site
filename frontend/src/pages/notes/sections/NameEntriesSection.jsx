// Frontend: renders one `name_entries`-shaped section — a named list whose
// items are each either a note or a link (Guides, Builds & Mods).
//
// The shape exists because a guide is often *either* a paragraph you wrote or
// a URL you saved, in one ordered list. `name_links` cannot hold that: its
// `links` column is a flat list of URL strings with nowhere to put prose. So
// each item here is {type: "text" | "link", value, label}, stored in the
// note's own `entries` column — never in `links`, which means something else.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  SaveCancel,
  SectionCard,
  draftCls,
  inputCls,
  tagCls,
} from "./ui";

const emptyItem = () => ({ type: "text", value: "", label: "" });

const empty = () => ({ title: "", kind: "", entries: [emptyItem()] });

const fromNote = (n) => ({
  title: n.title || "",
  kind: n.kind || "",
  entries: n.entries?.length
    ? n.entries.map((e) => ({
        type: e.type === "link" ? "link" : "text",
        value: e.value || "",
        label: e.label || "",
      }))
    : [emptyItem()],
});

const toFields = (val) => ({
  title: val.title.trim() || null,
  kind: val.kind || null,
  entries: (val.entries || [])
    .filter((e) => e.value.trim())
    .map((e) => ({
      type: e.type,
      value: e.value.trim(),
      // A label is only meaningful on a link — it is what the pill reads as.
      label: e.type === "link" ? e.label.trim() || null : null,
    })),
});

const selectCls = `${inputCls} w-24 shrink-0`;

function EntriesEditor({ entries, onChange }) {
  const list = entries?.length ? entries : [emptyItem()];
  const setItem = (i, patch) =>
    onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {list.map((item, i) => (
        <div key={i} className="flex gap-1 items-start">
          <div className="flex flex-col shrink-0 pt-1.5">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Move entry up"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-up text-[9px]" />
            </button>
            <button
              type="button"
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Move entry down"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-down text-[9px]" />
            </button>
          </div>

          {/* The per-item toggle. Switching to text drops the label, which
              only a link can carry, so a hidden value cannot ride along. */}
          <select
            value={item.type}
            aria-label={`Entry ${i + 1} type`}
            onChange={(e) =>
              setItem(i, {
                type: e.target.value,
                ...(e.target.value === "link" ? {} : { label: "" }),
              })
            }
            className={selectCls}
          >
            <option value="text">Note</option>
            <option value="link">Link</option>
          </select>

          <div className="flex-1 min-w-0 space-y-1">
            {item.type === "link" ? (
              <>
                <input
                  value={item.value}
                  onChange={(e) => setItem(i, { value: e.target.value })}
                  placeholder="https://..."
                  aria-label={`Entry ${i + 1} URL`}
                  className={inputCls}
                />
                <input
                  value={item.label}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  placeholder="Label (optional)"
                  aria-label={`Entry ${i + 1} label`}
                  className={inputCls}
                />
              </>
            ) : (
              <textarea
                value={item.value}
                onChange={(e) => setItem(i, { value: e.target.value })}
                placeholder="Note…"
                aria-label={`Entry ${i + 1} text`}
                rows={2}
                className={inputCls}
              />
            )}
          </div>

          {list.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              aria-label="Remove entry"
              title="Remove entry"
              className="text-text-faint hover:text-danger px-1 pt-1.5 shrink-0"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, emptyItem()])}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-brand transition"
      >
        + Add entry
      </button>
    </div>
  );
}

function NameEntriesForm({ section, val, setVal }) {
  return (
    <div className="space-y-1.5">
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Name (optional)"
        className={inputCls}
      />
      {section.kinds?.length > 0 && (
        <select
          value={val.kind}
          onChange={(e) => setVal({ ...val, kind: e.target.value })}
          className={inputCls}
        >
          <option value="">Type</option>
          {section.kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      )}
      <EntriesEditor
        entries={val.entries}
        onChange={(entries) => setVal({ ...val, entries })}
      />
    </div>
  );
}

export default function NameEntriesSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(empty());

  // Matches the server rule: a named list with neither a name nor a single
  // entry is nothing.
  const invalid = (val) =>
    !val.title.trim() && !(val.entries || []).some((e) => e.value.trim());

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(draft) });
    setDraft(empty());
    setAdding(false);
  };

  const saveEdit = () => {
    if (invalid(editVal)) return;
    onUpdate(editId, toFields(editVal));
    setEditId(null);
  };

  return (
    <SectionCard
      label={section.label}
      count={notes.length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {notes.map((n) => (
        <div key={n.system_id} className="flex gap-2 items-start group">
          <span className="text-xs text-text-faint shrink-0 pt-0.5">•</span>
          <div className="flex-1 min-w-0">
            {editId === n.system_id ? (
              <div>
                <NameEntriesForm
                  section={section}
                  val={editVal}
                  setVal={setEditVal}
                />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.kind && <span className={tagCls}>{n.kind}</span>}
                  {n.title && (
                    <span className="text-sm text-text-muted">{n.title}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {(n.entries || []).map((e, j) =>
                    e.type === "link" ? (
                      <div key={j} className="flex items-center gap-2 flex-wrap">
                        {e.label && (
                          <span className="text-xs text-text-faint">
                            {e.label}
                          </span>
                        )}
                        <LinkPill url={e.value} />
                      </div>
                    ) : (
                      <p
                        key={j}
                        className="text-sm text-text whitespace-pre-wrap break-words"
                      >
                        {e.value}
                      </p>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          {editId !== n.system_id && (
            <ItemActions
              isAdmin={isAdmin}
              onEdit={() => {
                setEditId(n.system_id);
                setEditVal(fromNote(n));
              }}
              onDelete={() => onDelete(n.system_id)}
            />
          )}
        </div>
      ))}
      {adding && (
        <div className={draftCls}>
          <NameEntriesForm section={section} val={draft} setVal={setDraft} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(empty());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
