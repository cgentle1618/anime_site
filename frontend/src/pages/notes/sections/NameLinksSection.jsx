// Frontend: renders one `name_links`-shaped section - a named bookmark
// (Resources, Unread). The title is optional; the links carry the value.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  SaveCancel,
  SectionCard,
  draftCls,
  inputCls,
} from "./ui";

const empty = () => ({ title: "", links: [""] });

const fromNote = (n) => ({
  title: n.title || "",
  links: n.links?.length ? n.links : [""],
});

const toFields = (val) => ({
  title: val.title.trim() || null,
  links: (val.links || []).map((l) => l.trim()).filter(Boolean),
});

function NameLinksForm({ val, setVal }) {
  return (
    <div className="space-y-1.5">
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Name (optional)"
        className={inputCls}
      />
      <LinksEditor
        links={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

export default function NameLinksSection({
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

  // A bookmark with neither a name nor a link is nothing.
  const invalid = (val) =>
    !val.title.trim() && !(val.links || []).some((l) => l.trim());

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
        <div key={n.system_id} className="flex gap-2 items-center group">
          <span className="text-xs text-text-faint shrink-0">•</span>
          <div className="flex-1 min-w-0">
            {editId === n.system_id ? (
              <div>
                <NameLinksForm val={editVal} setVal={setEditVal} />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {n.title && (
                  <span className="text-sm text-text-muted shrink-0">
                    {n.title}
                  </span>
                )}
                {(n.links || []).filter(Boolean).map((l, j) => (
                  <LinkPill key={j} url={l} />
                ))}
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
          <NameLinksForm val={draft} setVal={setDraft} />
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
