// Frontend: renders one `episode_text`-shaped section - a comment pinned to a
// locator (an episode, a chapter, a scene, a timestamp - the registry supplies
// the label), with a kind dropdown where the registry declares one
// (op_ed_changes, highlights) and none where it does not.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

const empty = () => ({ locator: "", kind: "", content: "" });

const fromNote = (n) => ({
  locator: n.locator || "",
  kind: n.kind || "",
  content: n.content || "",
});

const toFields = (val, section) => ({
  locator: val.locator.trim() || null,
  kind: section.kinds?.length ? val.kind.trim() || null : null,
  content: val.content.trim() || null,
});

function EpisodeTextForm({ val, setVal, section }) {
  const hasKinds = (section.kinds || []).length > 0;
  return (
    <div className="space-y-2">
      <div className={hasKinds ? "grid grid-cols-2 gap-2" : ""}>
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder ?? "Where"}
          className={inputCls}
        />
        {hasKinds && (
          <select
            value={val.kind}
            onChange={(e) => setVal({ ...val, kind: e.target.value })}
            className={inputCls}
          >
            <option value="">— Type —</option>
            {section.kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        rows={2}
        placeholder={
          section.desc_required ? "Description (required)" : "Description"
        }
        className={inputCls}
      />
    </div>
  );
}

export default function EpisodeTextSection({
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

  // A locator alone is a legitimate note, and so is text alone - except where
  // the section is only about where it points, and then the locator is the one
  // part that cannot be missing. Mirrors validate_note_payload so the reader
  // sees a disabled Save rather than a 422.
  const invalid = (val) => {
    if (section.locator_required && !val.locator.trim()) return true;
    // The mirror of the above: `questions` takes an optional source but the
    // question itself is the point.
    if (section.desc_required && !val.content.trim()) return true;
    return !val.locator.trim() && !val.content.trim();
  };

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(draft, section) });
    setDraft(empty());
    setAdding(false);
  };

  const saveEdit = () => {
    if (invalid(editVal)) return;
    onUpdate(editId, toFields(editVal, section));
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
        <div
          key={n.system_id}
          className="border border-border rounded-lg p-2.5 bg-surface-2"
        >
          {editId === n.system_id ? (
            <div>
              <EpisodeTextForm
                val={editVal}
                setVal={setEditVal}
                section={section}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.locator && (
                    <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                      {n.locator}
                    </span>
                  )}
                  {n.kind && (
                    <span className="text-[11px] font-medium bg-surface-3 text-text-muted px-1.5 py-0.5 rounded">
                      {n.kind}
                    </span>
                  )}
                </div>
                {n.content && (
                  <p className="text-sm text-text whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditId(n.system_id);
                  setEditVal(fromNote(n));
                }}
                onDelete={() => onDelete(n.system_id)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand-soft">
          <EpisodeTextForm val={draft} setVal={setDraft} section={section} />
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
