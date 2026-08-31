// Frontend: renders one `text_links`-shaped section - a body of text plus any
// number of links, optionally tagged with an episode. One item is one `note`
// row, so adding or editing one touches only that row.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  SaveCancel,
  SectionCard,
  brandTagCls,
  draftCls,
  inputCls,
  rowCls,
} from "./ui";

const empty = () => ({ locator: "", content: "", links: [""] });

const fromNote = (n) => ({
  locator: n.locator || "",
  content: n.content || "",
  links: n.links?.length ? n.links : [""],
});

// The row as the API wants it: blank links dropped, blanks sent as null so the
// backend stores a null column rather than an empty string.
const toFields = (val, section) => ({
  locator: section.locator_placeholder ? val.locator.trim() || null : null,
  content: val.content.trim() || null,
  links: (val.links || []).map((l) => l.trim()).filter(Boolean),
});

function TextLinksForm({ val, setVal, section }) {
  return (
    <div className="space-y-2">
      {section.locator_placeholder && (
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder}
          className={inputCls}
        />
      )}
      <textarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        rows={2}
        placeholder={
          section.desc_required
            ? "Description (required)"
            : "Description (optional)"
        }
        className={inputCls}
      />
      <LinksEditor
        links={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

export default function TextLinksSection({
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

  // An empty row is never worth storing, and some sections demand a body.
  const invalid = (val) => {
    const content = val.content.trim();
    if (section.desc_required && !content) return true;
    // An episode comment with no episode names nothing. Mirrors
    // validate_note_payload so Save is disabled rather than returning a 422.
    if (section.locator_required && !val.locator.trim()) return true;
    return !content && !(val.links || []).some((l) => l.trim());
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
          className={rowCls}
        >
          {editId === n.system_id ? (
            <div>
              <TextLinksForm
                val={editVal}
                setVal={setEditVal}
                section={section}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                {n.locator && (
                  <span className={brandTagCls}>
                    {n.locator}
                  </span>
                )}
                {n.content && (
                  <p className="text-sm text-text whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
                {(n.links || []).filter(Boolean).map((l, j) => (
                  <LinkPill key={j} url={l} />
                ))}
                {!n.content && !(n.links || []).filter(Boolean).length && (
                  <span className="text-xs text-text-faint">(empty)</span>
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
        <div className={draftCls}>
          <TextLinksForm val={draft} setVal={setDraft} section={section} />
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
