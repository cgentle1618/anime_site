// Frontend: renders one `text`-shaped notes section - a list of one-line items.
// Each item is one `note` row, so editing one is a PATCH of that row rather
// than a rewrite of the whole section.
//
// A singleton section (`remark`) is the same shape with one row at most, so it
// renders as a single textarea with no "Add" affordance.
import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/primitives";
import {
  EmptyHint,
  ItemActions,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

// ─── Singleton (Remark) ──────────────────────────────────────────────────────

function SingletonText({ section, note, isAdmin, onCreate, onUpdate, onDelete }) {
  const value = note?.content || "";
  const [draft, setDraft] = useState(value);
  const [fullscreen, setFullscreen] = useState(false);

  // Sync when the row is re-fetched after a save.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Close the fullscreen overlay with Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const dirty = draft !== value;

  // Clearing the textarea deletes the row: an empty singleton is no note.
  const save = () => {
    const content = draft.trim();
    if (!note) {
      if (content) onCreate({ section: section.key, content });
      return;
    }
    if (content) onUpdate(note.system_id, { content });
    else onDelete(note.system_id);
  };

  const textareaCls =
    inputCls + (isAdmin ? "" : " bg-surface-2 text-text-muted cursor-default");

  const saveBtn = (
    <Button type="button" kind="primary" size="sm" onClick={save} disabled={!dirty}>
      Save
    </Button>
  );

  return (
    <div className="bg-surface border border-border">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
        <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted shrink-0">
          {section.label}
        </h4>
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
        <Button
          type="button"
          size="sm"
          onClick={() => setFullscreen(true)}
          title="Open fullscreen"
        >
          Fullscreen
        </Button>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <textarea
          value={draft}
          disabled={!isAdmin}
          onChange={(e) => isAdmin && setDraft(e.target.value)}
          rows={10}
          placeholder="General remarks..."
          className={textareaCls + " resize-y"}
        />
        {isAdmin && <div className="flex justify-end">{saveBtn}</div>}
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bg-surface border border-border shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
              <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted shrink-0">
                {section.label}
              </h4>
              <span className="flex-1 border-t border-dotted border-border-strong/60" />
              <Button
                type="button"
                size="sm"
                onClick={() => setFullscreen(false)}
                title="Exit fullscreen"
              >
                Close
              </Button>
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1 min-h-0">
              <textarea
                value={draft}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && setDraft(e.target.value)}
                placeholder="General remarks..."
                autoFocus
                className={textareaCls + " flex-1 resize-none"}
              />
              {isAdmin && <div className="flex justify-end">{saveBtn}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

function TextList({ section, notes, isAdmin, onCreate, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  const commit = () => {
    const content = draft.trim();
    if (!content) return;
    onCreate({ section: section.key, content });
    setDraft("");
    setAdding(false);
  };

  const saveEdit = () => {
    const content = editVal.trim();
    if (!content) return;
    onUpdate(editId, { content });
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
        <div key={n.system_id}>
          {editId === n.system_id ? (
            <div>
              <textarea
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                rows={2}
                className={inputCls}
                autoFocus
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start group">
              <span className="text-xs text-text-faint mt-0.5 shrink-0">•</span>
              <span className="text-sm text-text flex-1 whitespace-pre-wrap">
                {n.content}
              </span>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditId(n.system_id);
                  setEditVal(n.content || "");
                }}
                onDelete={() => onDelete(n.system_id)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className={inputCls}
            autoFocus
            placeholder="Add item..."
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft("");
              setAdding(false);
            }}
          />
        </div>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}

// The two cases keep their own state, so neither carries the other's.
export default function TextSection({ section, notes, ...rest }) {
  return section.singleton ? (
    <SingletonText section={section} note={notes[0]} {...rest} />
  ) : (
    <TextList section={section} notes={notes} {...rest} />
  );
}
