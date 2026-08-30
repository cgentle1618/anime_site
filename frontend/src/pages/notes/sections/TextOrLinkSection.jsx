// Frontend: renders one `text_or_link`-shaped section - a list where each item
// is either a quoted opinion or a link to where the opinion lives, never both.
//
// One input per row: `classify` decides which column the value belongs in, so
// the reader types a review or pastes a URL without picking a field first.
import { useState } from "react";

import { classify, toInput } from "./textOrLink";
import {
  EmptyHint,
  ItemActions,
  LinkPill,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

function Row({ note }) {
  const link = note.links?.filter(Boolean)[0];
  if (link) return <LinkPill url={link} />;
  return (
    <span className="text-sm text-text flex-1 whitespace-pre-wrap">
      {note.content}
    </span>
  );
}

export default function TextOrLinkSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  const commit = () => {
    const fields = classify(draft);
    if (!fields.content && !fields.links.length) return;
    onCreate({ section: section.key, ...fields });
    setDraft("");
    setAdding(false);
  };

  const saveEdit = () => {
    const fields = classify(editVal);
    if (!fields.content && !fields.links.length) return;
    // Both columns are always sent, so switching a row from text to a link
    // clears the column it no longer uses.
    onUpdate(editId, fields);
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
              <div className="flex-1 min-w-0">
                <Row note={n} />
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditId(n.system_id);
                  setEditVal(toInput(n));
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
            placeholder="Text, or paste a link (https://...)"
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
