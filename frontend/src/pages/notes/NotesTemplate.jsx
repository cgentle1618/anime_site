// Frontend: shared template used by all notes pages.
import { useState, useEffect } from "react";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";
const btnCls =
  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors";

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionCard({ label, sectionKey, count, isAdmin, onAdd, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-gray-800">{label}</h4>
          {count > 0 && (
            <span className="text-[10px] font-black bg-brand/10 text-brand rounded-full px-1.5 py-0.5">
              {count}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {isAdmin && (
            <button
              type="button"
              onClick={onAdd}
              className={btnCls + " bg-brand text-white hover:bg-brand/90"}
            >
              <i className="fas fa-plus text-[10px]"></i> Add
            </button>
          )}
          <i
            className={`fas fa-chevron-${collapsed ? "down" : "up"} text-gray-400 text-xs`}
          ></i>
        </div>
      </div>
      {!collapsed && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

function ItemActions({ isAdmin, onEdit, onDelete }) {
  if (!isAdmin) return null;
  return (
    <div className="flex gap-1 shrink-0 mt-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="text-gray-400 hover:text-brand text-xs px-1"
      >
        <i className="fas fa-pencil-alt"></i>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-gray-400 hover:text-red-500 text-xs px-1"
      >
        <i className="fas fa-trash"></i>
      </button>
    </div>
  );
}

function SaveCancel({ onSave, onCancel }) {
  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        onClick={onSave}
        className={btnCls + " bg-brand text-white hover:bg-brand/90"}
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={btnCls + " bg-gray-100 text-gray-600 hover:bg-gray-200"}
      >
        Cancel
      </button>
    </div>
  );
}

function LinkPill({ url }) {
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
      className="inline-flex items-center gap-1 text-xs text-brand hover:underline bg-brand/5 border border-brand/20 rounded px-1.5 py-0.5 max-w-[200px] truncate"
    >
      <i className="fas fa-external-link-alt text-[9px]"></i>
      {label}
    </a>
  );
}

// ─── Remark Section ───────────────────────────────────────────────────────────

function RemarkSection({ value, isAdmin, onChange }) {
  const [draft, setDraft] = useState(value || "");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  // Close the fullscreen overlay with Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const dirty = draft !== (value || "");
  const textareaCls =
    inputCls + (isAdmin ? "" : " bg-gray-50 text-gray-600 cursor-default");

  const saveBtn = (
    <button
      type="button"
      onClick={() => onChange(draft || null)}
      disabled={!dirty}
      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      Save
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <h4 className="font-bold text-sm text-gray-800">Remark</h4>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          title="Open fullscreen"
          className={btnCls + " bg-gray-100 text-gray-600 hover:bg-gray-200"}
        >
          <i className="fas fa-expand text-[10px]"></i> Fullscreen
        </button>
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
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between shrink-0">
              <h4 className="font-bold text-sm text-gray-800">Remark</h4>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                title="Exit fullscreen"
                className={
                  btnCls + " bg-gray-100 text-gray-600 hover:bg-gray-200"
                }
              >
                <i className="fas fa-compress text-[10px]"></i> Close
              </button>
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

// ─── String List Section ──────────────────────────────────────────────────────

function StringListSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");

  const commit = () => {
    if (!draft.trim()) return;
    onUpdate([...(items || []), draft.trim()]);
    setDraft("");
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = editVal.trim();
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div key={i}>
          {editIdx === i ? (
            <div>
              <textarea
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                rows={2}
                className={inputCls}
                autoFocus
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start group">
              <span className="text-xs text-gray-500 mt-0.5 shrink-0">•</span>
              <span className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">
                {item}
              </span>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditIdx(i);
                  setEditVal(item);
                }}
                onDelete={() => remove(i)}
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
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Description + Links Section ─────────────────────────────────────────────

const emptyDescLinks = () => ({ description: "", links: [""] });

function DescLinksForm({ value, onChange, descRequired }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setLink = (i, v) => {
    const ls = [...(value.links || [""])];
    ls[i] = v;
    set("links", ls);
  };
  const addLink = () => set("links", [...(value.links || [""]), ""]);
  const removeLink = (i) =>
    set(
      "links",
      (value.links || [""]).filter((_, idx) => idx !== i),
    );
  return (
    <div className="space-y-2">
      <textarea
        value={value.description || ""}
        onChange={(e) => set("description", e.target.value)}
        rows={2}
        placeholder={
          descRequired ? "Description (required)" : "Description (optional)"
        }
        className={inputCls}
      />
      <div className="space-y-1">
        {(value.links || [""]).map((l, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={l}
              onChange={(e) => setLink(i, e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
            {(value.links || [""]).length > 1 && (
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="text-red-400 hover:text-red-600 px-1"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addLink}
          className="text-xs text-brand hover:underline"
        >
          + Add link
        </button>
      </div>
    </div>
  );
}

function DescLinksSection({
  sectionKey,
  label,
  items,
  isAdmin,
  onUpdate,
  descRequired,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDescLinks());
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState(emptyDescLinks());

  const commit = () => {
    if (descRequired && !draft.description?.trim()) return;
    onUpdate([
      ...(items || []),
      { ...draft, links: (draft.links || []).filter((l) => l.trim()) },
    ]);
    setDraft(emptyDescLinks());
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = {
      ...editVal,
      links: (editVal.links || []).filter((l) => l.trim()),
    };
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div
          key={i}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editIdx === i ? (
            <div>
              <DescLinksForm
                value={editVal}
                onChange={setEditVal}
                descRequired={descRequired}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                {item.description && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {item.description}
                  </p>
                )}
                {(item.links || [])
                  .filter((l) => l)
                  .map((l, j) => (
                    <LinkPill key={j} url={l} />
                  ))}
                {!item.description &&
                  !(item.links || []).filter((l) => l).length && (
                    <span className="text-xs text-gray-400 italic">
                      (empty)
                    </span>
                  )}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditIdx(i);
                  setEditVal({
                    description: item.description || "",
                    links: item.links?.length ? item.links : [""],
                  });
                }}
                onDelete={() => remove(i)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <DescLinksForm
            value={draft}
            onChange={setDraft}
            descRequired={descRequired}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyDescLinks());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Name + Link Section ──────────────────────────────────────────────────────

const emptyNameLink = () => ({ name: "", link: "" });

function NameLinkForm({ val, setVal }) {
  return (
    <div className="space-y-1.5">
      <input
        value={val.name}
        onChange={(e) => setVal({ ...val, name: e.target.value })}
        placeholder="Name (optional)"
        className={inputCls}
      />
      <input
        value={val.link}
        onChange={(e) => setVal({ ...val, link: e.target.value })}
        placeholder="URL (required)"
        className={inputCls}
      />
    </div>
  );
}

function NameLinkSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyNameLink());
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState(emptyNameLink());

  const commit = () => {
    if (!draft.link.trim()) return;
    onUpdate([
      ...(items || []),
      { name: draft.name.trim(), link: draft.link.trim() },
    ]);
    setDraft(emptyNameLink());
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = { name: editVal.name.trim(), link: editVal.link.trim() };
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div key={i} className="flex gap-2 items-center group">
          <span className="text-xs text-gray-500 shrink-0">•</span>
          <div className="flex-1 min-w-0">
            {editIdx === i ? (
              <div>
                <NameLinkForm val={editVal} setVal={setEditVal} />
                <SaveCancel
                  onSave={saveEdit}
                  onCancel={() => setEditIdx(null)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {item.name && (
                  <span className="text-sm text-gray-700 shrink-0">
                    {item.name}
                  </span>
                )}
                {item.link && <LinkPill url={item.link} />}
              </div>
            )}
          </div>
          {editIdx !== i && (
            <ItemActions
              isAdmin={isAdmin}
              onEdit={() => {
                setEditIdx(i);
                setEditVal({ name: item.name || "", link: item.link || "" });
              }}
              onDelete={() => remove(i)}
            />
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <NameLinkForm val={draft} setVal={setDraft} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyNameLink());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Quote / Meme Section ─────────────────────────────────────────────────────

const emptyQuoteMeme = () => ({ description: "", link: "" });

function QuoteMemeForm({ val, setVal }) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={val.description}
        onChange={(e) => setVal({ ...val, description: e.target.value })}
        rows={2}
        placeholder="Quote / meme (optional)"
        className={inputCls}
      />
      <input
        value={val.link}
        onChange={(e) => setVal({ ...val, link: e.target.value })}
        placeholder="Link (optional)"
        className={inputCls}
      />
    </div>
  );
}

function QuoteMemeSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyQuoteMeme());
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState(emptyQuoteMeme());

  const commit = () => {
    if (!draft.description?.trim() && !draft.link?.trim()) return;
    onUpdate([
      ...(items || []),
      { description: draft.description.trim(), link: draft.link.trim() },
    ]);
    setDraft(emptyQuoteMeme());
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = {
      description: editVal.description.trim(),
      link: editVal.link.trim(),
    };
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div
          key={i}
          className="border border-gray-100 rounded-lg p-2 bg-gray-50"
        >
          {editIdx === i ? (
            <div>
              <QuoteMemeForm val={editVal} setVal={setEditVal} />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                {item.description && (
                  <p className="text-sm text-gray-800 italic whitespace-pre-wrap">
                    "{item.description}"
                  </p>
                )}
                {item.link && <LinkPill url={item.link} />}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditIdx(i);
                  setEditVal({
                    description: item.description || "",
                    link: item.link || "",
                  });
                }}
                onDelete={() => remove(i)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <QuoteMemeForm val={draft} setVal={setDraft} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyQuoteMeme());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Episode Entry Section (Anime) ────────────────────────────────────────────

const emptyEpisodeEntry = () => ({ episodes: "", type: "", description: "" });

function EpisodeEntryForm({ val, setVal, typeDropdown }) {
  return (
    <div className="space-y-1.5">
      <input
        value={val.episodes}
        onChange={(e) => setVal({ ...val, episodes: e.target.value })}
        placeholder="Episode(s), e.g. ep 6"
        className={inputCls}
      />
      {typeDropdown ? (
        <select
          value={val.type}
          onChange={(e) => setVal({ ...val, type: e.target.value })}
          className={inputCls}
        >
          <option value="">Type...</option>
          {typeDropdown.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={val.type}
          onChange={(e) => setVal({ ...val, type: e.target.value })}
          placeholder="Type (optional)"
          className={inputCls}
        />
      )}
      <textarea
        value={val.description}
        onChange={(e) => setVal({ ...val, description: e.target.value })}
        rows={2}
        placeholder="Description"
        className={inputCls}
      />
    </div>
  );
}

function EpisodeEntrySection({
  sectionKey,
  label,
  items,
  isAdmin,
  onUpdate,
  typeDropdown,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyEpisodeEntry());
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState(emptyEpisodeEntry());

  const commit = () => {
    if (!draft.episodes.trim() && !draft.description.trim()) return;
    onUpdate([
      ...(items || []),
      {
        episodes: draft.episodes.trim(),
        type: draft.type.trim(),
        description: draft.description.trim(),
      },
    ]);
    setDraft(emptyEpisodeEntry());
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = {
      episodes: editVal.episodes.trim(),
      type: editVal.type.trim(),
      description: editVal.description.trim(),
    };
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div
          key={i}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editIdx === i ? (
            <div>
              <EpisodeEntryForm
                val={editVal}
                setVal={setEditVal}
                typeDropdown={typeDropdown}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.episodes && (
                    <span className="text-xs font-bold text-brand bg-brand/10 rounded px-1.5 py-0.5">
                      {item.episodes}
                    </span>
                  )}
                  {item.type && (
                    <span className="text-xs font-semibold text-gray-600 bg-gray-200 rounded px-1.5 py-0.5">
                      {item.type}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditIdx(i);
                  setEditVal({
                    episodes: item.episodes || "",
                    type: item.type || "",
                    description: item.description || "",
                  });
                }}
                onDelete={() => remove(i)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <EpisodeEntryForm
            val={draft}
            setVal={setDraft}
            typeDropdown={typeDropdown}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyEpisodeEntry());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Episode Comment Section (object map: {"ep 1": "comment"}) ───────────────

const emptyEpisodeComment = () => ({ episode: "", comment: "" });

function EpisodeCommentForm({ val, setVal }) {
  return (
    <div className="space-y-1.5">
      <input
        value={val.episode}
        onChange={(e) => setVal({ ...val, episode: e.target.value })}
        placeholder="Episode, e.g. ep 1"
        className={inputCls}
      />
      <textarea
        value={val.comment}
        onChange={(e) => setVal({ ...val, comment: e.target.value })}
        rows={2}
        placeholder="Comment"
        className={inputCls}
      />
    </div>
  );
}

function EpisodeCommentSection({ sectionKey, label, items, isAdmin, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyEpisodeComment());
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState(emptyEpisodeComment());

  // Stored as an object map; entries keep insertion order for display.
  const entries = Object.entries(items || {});

  // Rebuild the map from entries so renaming an episode keeps its position.
  const fromEntries = (pairs) =>
    pairs.reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});

  const commit = () => {
    const ep = draft.episode.trim();
    if (!ep) return;
    const next = entries.filter(([k]) => k !== ep);
    next.push([ep, draft.comment.trim()]);
    onUpdate(fromEntries(next));
    setDraft(emptyEpisodeComment());
    setAdding(false);
  };
  const saveEdit = () => {
    const ep = editVal.episode.trim();
    if (!ep) return;
    const next = entries.map(([k, v]) =>
      k === editKey ? [ep, editVal.comment.trim()] : [k, v],
    );
    onUpdate(fromEntries(next));
    setEditKey(null);
  };
  const remove = (key) => onUpdate(fromEntries(entries.filter(([k]) => k !== key)));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={entries.length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {entries.map(([ep, comment]) => (
        <div
          key={ep}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editKey === ep ? (
            <div>
              <EpisodeCommentForm val={editVal} setVal={setEditVal} />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditKey(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                  {ep}
                </span>
                {comment && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {comment}
                  </p>
                )}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditKey(ep);
                  setEditVal({ episode: ep, comment: comment || "" });
                }}
                onDelete={() => remove(ep)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <EpisodeCommentForm val={draft} setVal={setDraft} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyEpisodeComment());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!entries.length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Episode Type + Description Section (Manga/TV/Cartoon) ───────────────────

const emptyEpisodeTypeDesc = () => ({ episode: "", type: "", description: "" });

function EpisodeTypeDescForm({ val, setVal, typeOptions, episodePlaceholder }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={val.episode}
          onChange={(e) => setVal({ ...val, episode: e.target.value })}
          placeholder={episodePlaceholder ?? "Chapter(s), e.g. ch 6"}
          className={inputCls}
        />
        {typeOptions ? (
          <select
            value={val.type}
            onChange={(e) => setVal({ ...val, type: e.target.value })}
            className={inputCls}
          >
            <option value="">— Type —</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={val.type}
            onChange={(e) => setVal({ ...val, type: e.target.value })}
            placeholder="Type"
            className={inputCls}
          />
        )}
      </div>
      <textarea
        value={val.description}
        onChange={(e) => setVal({ ...val, description: e.target.value })}
        rows={2}
        placeholder="Description"
        className={inputCls}
      />
    </div>
  );
}

function EpisodeTypeDescSection({
  sectionKey,
  label,
  items,
  isAdmin,
  onUpdate,
  typeOptions,
  episodePlaceholder,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyEpisodeTypeDesc());
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState(emptyEpisodeTypeDesc());

  const commit = () => {
    if (!draft.description?.trim()) return;
    onUpdate([...(items || []), { ...draft }]);
    setDraft(emptyEpisodeTypeDesc());
    setAdding(false);
  };
  const saveEdit = () => {
    const next = [...items];
    next[editIdx] = { ...editVal };
    onUpdate(next);
    setEditIdx(null);
  };
  const remove = (i) => onUpdate((items || []).filter((_, idx) => idx !== i));

  return (
    <SectionCard
      label={label}
      sectionKey={sectionKey}
      count={(items || []).length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {(items || []).map((item, i) => (
        <div
          key={i}
          className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
        >
          {editIdx === i ? (
            <div>
              <EpisodeTypeDescForm
                val={editVal}
                setVal={setEditVal}
                typeOptions={typeOptions}
                episodePlaceholder={episodePlaceholder}
              />
              <SaveCancel onSave={saveEdit} onCancel={() => setEditIdx(null)} />
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.episode && (
                    <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                      {item.episode}
                    </span>
                  )}
                  {item.type && (
                    <span className="text-[11px] font-medium bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      {item.type}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {item.description}
                  </p>
                )}
              </div>
              <ItemActions
                isAdmin={isAdmin}
                onEdit={() => {
                  setEditIdx(i);
                  setEditVal({
                    episode: item.episode || "",
                    type: item.type || "",
                    description: item.description || "",
                  });
                }}
                onDelete={() => remove(i)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <EpisodeTypeDescForm
            val={draft}
            setVal={setDraft}
            typeOptions={typeOptions}
            episodePlaceholder={episodePlaceholder}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyEpisodeTypeDesc());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!(items || []).length && !adding && (
        <p className="text-xs text-gray-400 italic">No entries.</p>
      )}
    </SectionCard>
  );
}

// ─── Root Template ────────────────────────────────────────────────────────────

export default function NotesTemplate({ entity, isAdmin, onSave, sections }) {
  const [notes, setNotes] = useState(entity.notes ?? {});

  // Sync notes state when the parent re-fetches and provides a fresh entity.
  useEffect(() => {
    setNotes(entity.notes ?? {});
  }, [entity]);

  const updateSection = (key, val) => {
    const updated = { ...notes, [key]: val };
    setNotes(updated);
    onSave(updated);
  };

  const renderSection = (sec) => {
    const items = notes[sec.key];
    switch (sec.type) {
      case "remark":
        return (
          <RemarkSection
            key={sec.key}
            value={notes[sec.key]}
            isAdmin={isAdmin}
            onChange={(val) => updateSection(sec.key, val || null)}
          />
        );
      case "string_list":
        return (
          <StringListSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
          />
        );
      case "desc_links":
        return (
          <DescLinksSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
            descRequired={sec.descRequired}
          />
        );
      case "name_link":
        return (
          <NameLinkSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
          />
        );
      case "quote_meme":
        return (
          <QuoteMemeSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
          />
        );
      case "episode_entry":
        return (
          <EpisodeEntrySection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
            typeDropdown={sec.typeDropdown}
          />
        );
      case "episode_comment":
        return (
          <EpisodeCommentSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
          />
        );
      case "episode_type_desc":
        return (
          <EpisodeTypeDescSection
            key={sec.key}
            sectionKey={sec.key}
            label={sec.label}
            items={items}
            isAdmin={isAdmin}
            onUpdate={(val) => updateSection(sec.key, val)}
            typeOptions={sec.typeOptions}
            episodePlaceholder={sec.episodePlaceholder}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h3 className="font-bold text-gray-800">
          <i className="fas fa-book-open text-brand mr-2"></i>Notes
        </h3>
      </div>
      <div className="p-4 space-y-3">{sections.map(renderSection)}</div>
    </div>
  );
}

