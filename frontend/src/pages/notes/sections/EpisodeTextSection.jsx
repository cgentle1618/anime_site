// Frontend: renders one `episode_text`-shaped section - a comment pinned to an
// episode or chapter, with a kind dropdown where the registry declares one
// (op_ed_changes, highlights) and none where it does not.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

const empty = () => ({ episode: "", kind: "", content: "" });

const fromNote = (n) => ({
  episode: n.episode || "",
  kind: n.kind || "",
  content: n.content || "",
});

const toFields = (val, section) => ({
  episode: val.episode.trim() || null,
  kind: section.kinds?.length ? val.kind.trim() || null : null,
  content: val.content.trim() || null,
});

function EpisodeTextForm({ val, setVal, section }) {
  const hasKinds = (section.kinds || []).length > 0;
  return (
    <div className="space-y-2">
      <div className={hasKinds ? "grid grid-cols-2 gap-2" : ""}>
        <input
          value={val.episode}
          onChange={(e) => setVal({ ...val, episode: e.target.value })}
          placeholder={section.episode_placeholder ?? "Episode"}
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
        placeholder="Description"
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

  // An episode alone is a legitimate note, and so is text alone.
  const invalid = (val) => !val.episode.trim() && !val.content.trim();

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
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
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
                  {n.episode && (
                    <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                      {n.episode}
                    </span>
                  )}
                  {n.kind && (
                    <span className="text-[11px] font-medium bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      {n.kind}
                    </span>
                  )}
                </div>
                {n.content && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
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
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
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
