// Frontend: renders one `episode_name_links`-shaped section - 插入曲, a song
// pinned to the episode it plays in. The only shape carrying all four content
// columns: episode, song name, what the song does there, and where to hear it.
// `text_links` has no title and `name_links` has no episode or body, so neither
// could say all four - hence a shape of its own rather than a flag on one.
//
// Only the episode is required. A song remembered by its scene before its title
// is still worth a row, so name, description and links all stay optional.
import { useState } from "react";

import {
  EmptyHint,
  ItemActions,
  LinkPill,
  LinksEditor,
  SaveCancel,
  SectionCard,
  inputCls,
} from "./ui";

const empty = () => ({ locator: "", title: "", content: "", links: [""] });

const fromNote = (n) => ({
  locator: n.locator || "",
  title: n.title || "",
  content: n.content || "",
  links: n.links?.length ? n.links : [""],
});

// Blanks go out as null so a PATCH clears the column rather than storing "".
const toFields = (val) => ({
  locator: val.locator.trim() || null,
  title: val.title.trim() || null,
  content: val.content.trim() || null,
  links: (val.links || []).map((l) => l.trim()).filter(Boolean),
});

function EpisodeNameLinksForm({ val, setVal, section }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={val.locator}
          onChange={(e) => setVal({ ...val, locator: e.target.value })}
          placeholder={section.locator_placeholder ?? "Where"}
          className={inputCls}
        />
        <input
          value={val.title}
          onChange={(e) => setVal({ ...val, title: e.target.value })}
          placeholder="Song name (optional)"
          className={inputCls}
        />
      </div>
      <textarea
        value={val.content}
        onChange={(e) => setVal({ ...val, content: e.target.value })}
        rows={2}
        placeholder="Description (optional)"
        className={inputCls}
      />
      <LinksEditor
        links={val.links}
        onChange={(links) => setVal({ ...val, links })}
      />
    </div>
  );
}

export default function EpisodeNameLinksSection({
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

  // A song with no episode is just a song: where it plays is what makes it a
  // note. Mirrors validate_note_payload so the reader sees an inert Save
  // rather than a 422.
  const invalid = (val) => !val.locator.trim();

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
        <div
          key={n.system_id}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editId === n.system_id ? (
            <div>
              <EpisodeNameLinksForm
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
                  {n.title && (
                    <span className="text-sm font-semibold text-gray-800">
                      {n.title}
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
          <EpisodeNameLinksForm
            val={draft}
            setVal={setDraft}
            section={section}
          />
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
