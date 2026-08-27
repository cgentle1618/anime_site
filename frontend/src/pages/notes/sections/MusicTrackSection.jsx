// Frontend: renders one `music_track`-shaped section - OP, ED, Insert and OST.
// One row is one song: its name, which cut it is (type), how far tracking it
// has got (status), where to hear it, and a remark.
//
// The only shape with two dropdowns, which is why `note` carries `status`
// alongside `kind`: the type is a property of the song, the status a property
// of my work on it, and one row needs both. The status values are the ones the
// anime.op / ed / insert_ost columns held before those columns became rows.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

const empty = (section) => ({
  title: "",
  kind: section.default_kind || "",
  status: "",
  link: "",
  content: "",
});

const fromNote = (n, section) => ({
  title: n.title || "",
  kind: n.kind || section.default_kind || "",
  status: n.status || "",
  // The shape stores at most one link, but the column is a list like every
  // other section's.
  link: n.links?.[0] || "",
  content: n.content || "",
});

// Blanks go out as null so a PATCH clears the column rather than storing "".
const toFields = (val) => ({
  title: val.title.trim() || null,
  kind: val.kind || null,
  status: val.status || null,
  content: val.content.trim() || null,
  links: val.link.trim() ? [val.link.trim()] : [],
});

const selectCls = inputCls + " bg-white";

function MusicTrackForm({ val, setVal, section }) {
  return (
    <div className="space-y-2">
      <input
        value={val.title}
        onChange={(e) => setVal({ ...val, title: e.target.value })}
        placeholder="Song name (optional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={val.kind}
          onChange={(e) => setVal({ ...val, kind: e.target.value })}
          className={selectCls}
        >
          <option value="">Type</option>
          {section.kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={val.status}
          onChange={(e) => setVal({ ...val, status: e.target.value })}
          className={selectCls}
        >
          <option value="">Status</option>
          {section.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <input
        value={val.link}
        onChange={(e) => setVal({ ...val, link: e.target.value })}
        placeholder="https://... (optional)"
        className={inputCls}
      />
      <textarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        rows={2}
        placeholder="Remark (optional)"
        className={inputCls}
      />
    </div>
  );
}

export default function MusicTrackSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(() => empty(section));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(() => empty(section));

  // The type is prefilled, so it cannot be what makes a row worth storing.
  // Mirrors validate_note_payload so the reader sees an inert Save rather than
  // a 422.
  const invalid = (val) =>
    !val.title.trim() && !val.status && !val.link.trim() && !val.content.trim();

  const commit = () => {
    if (invalid(draft)) return;
    onCreate({ section: section.key, ...toFields(draft) });
    setDraft(empty(section));
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
        <div
          key={n.system_id}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editId === n.system_id ? (
            <div>
              <MusicTrackForm
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
                  {n.title && (
                    <span className="text-sm font-semibold text-gray-800">
                      {n.title}
                    </span>
                  )}
                  {n.kind && (
                    <span className="text-[11px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                      {n.kind}
                    </span>
                  )}
                  {n.status && (
                    <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                      {n.status}
                    </span>
                  )}
                </div>
                {n.content && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
                {(n.links || []).filter(Boolean).map((l, j) => (
                  <LinkPill key={j} url={l} />
                ))}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditId(n.system_id);
                  setEditVal(fromNote(n, section));
                }}
                onDelete={() => onDelete(n.system_id)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <MusicTrackForm val={draft} setVal={setDraft} section={section} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(empty(section));
              setAdding(false);
            }}
          />
        </div>
      )}
      {!notes.length && !adding && <EmptyHint />}
    </SectionCard>
  );
}
