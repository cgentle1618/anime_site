// Frontend: admin editor for one watch order.
//
// Everything that writes to /api/watch-order lives here. The read-only
// renderer is WatchOrderGuide; this component deliberately does not reuse it,
// because an editable row needs inputs where the guide needs links.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildUrl, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { MediaScopeLine, specialLabel } from "./WatchOrderGuide";

const LIST_TYPES = ["Custom", "Chronological", "Release", "Recommended"];

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
};

function ItemRow({
  item,
  index,
  onPatch,
  onRemove,
  onMove,
  isFirst,
  isLast,
  dragHandlers,
}) {
  // Episode inputs are held locally so typing doesn't fire a request per
  // keystroke; the value is committed on blur.
  const [epStart, setEpStart] = useState(item.ep_start ?? "");
  const [epEnd, setEpEnd] = useState(item.ep_end ?? "");
  const [note, setNote] = useState(item.note ?? "");

  useEffect(() => {
    setEpStart(item.ep_start ?? "");
    setEpEnd(item.ep_end ?? "");
    setNote(item.note ?? "");
  }, [item.ep_start, item.ep_end, item.note]);

  function commit(field, raw) {
    const value = raw === "" ? null : raw;
    if ((item[field] ?? null) === value) return;
    onPatch(item.system_id, { [field]: value });
  }

  return (
    <li
      draggable
      {...dragHandlers}
      className={`flex flex-col gap-2 p-3 rounded-xl border bg-white ${
        item.missing ? "border-dashed border-red-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <i className="fas fa-grip-vertical text-gray-300 cursor-grab"></i>
        <span className="w-7 h-7 shrink-0 rounded-full bg-brand/10 text-brand text-xs font-black flex items-center justify-center">
          {index}
        </span>

        {item.missing ? (
          <span className="text-sm font-medium text-red-400 flex-1">
            Entry no longer exists — remove this step
          </span>
        ) : (
          <>
            <img
              src={getCoverUrl(item.cover_image_file)}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = FALLBACK_SVG;
              }}
              className="w-9 h-12 shrink-0 rounded object-cover bg-gray-100"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">
                {item.display_name}
              </p>
              <p className="text-[11px] font-bold text-gray-400">
                {TYPE_LABELS[item.media_type] || item.media_type}
                {item.total_episodes != null && ` · ${item.total_episodes} total`}
                {specialLabel(item) && ` · ${specialLabel(item)}`}
              </p>
            </div>
          </>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(index - 1, index - 2)}
            disabled={isFirst}
            title="Move up"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <i className="fas fa-chevron-up text-xs"></i>
          </button>
          <button
            type="button"
            onClick={() => onMove(index - 1, index)}
            disabled={isLast}
            title="Move down"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <i className="fas fa-chevron-down text-xs"></i>
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.system_id)}
            title="Remove step"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200"
          >
            <i className="fas fa-trash text-xs"></i>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-10">
        <input
          type="number"
          value={epStart}
          onChange={(e) => setEpStart(e.target.value)}
          onBlur={() => commit("ep_start", epStart === "" ? "" : Number(epStart))}
          placeholder="from"
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-xs text-gray-300">–</span>
        <input
          type="number"
          value={epEnd}
          onChange={(e) => setEpEnd(e.target.value)}
          onBlur={() => commit("ep_end", epEnd === "" ? "" : Number(epEnd))}
          placeholder="to"
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-[10px] font-bold text-gray-400">
          leave blank for the whole entry
        </span>

        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={!!item.is_optional}
            onChange={(e) =>
              onPatch(item.system_id, { is_optional: e.target.checked })
            }
            className="accent-brand"
          />
          Optional
        </label>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => commit("note", note)}
        placeholder="Note for this step…"
        className="ml-10 border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </li>
  );
}

function EntryPicker({ candidates, onAdd, disabled }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !type || c.media_type === type)
      .filter((c) => !q || (c.display_name || "").toLowerCase().includes(q))
      .slice(0, 40);
  }, [candidates, query, type]);

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
      <div className="flex flex-wrap gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries to add…"
          className="flex-1 min-w-[12rem] border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([slug, label]) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {matches.length === 0 ? (
        <p className="text-xs font-medium text-gray-400 py-2">
          No entries match.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {matches.map((c) => (
            <li key={`${c.media_type}:${c.entry_id}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(c)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white text-left disabled:opacity-50"
              >
                <i className="fas fa-plus text-[10px] text-brand"></i>
                <span className="text-sm font-bold text-gray-800 truncate">
                  {c.display_name}
                </span>
                {/*
                  Specials often share their parent's title, so the episode
                  number is the only thing telling two rows apart here.
                */}
                {specialLabel(c) && (
                  <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 whitespace-nowrap">
                    {specialLabel(c)}
                  </span>
                )}
                <span className="ml-auto text-[10px] font-black text-gray-400 whitespace-nowrap">
                  {TYPE_LABELS[c.media_type]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] font-medium text-gray-400 mt-2">
        The same entry can be added more than once — that is how a split run
        (ep 1–10, then later ep 11–12) is written.
      </p>
    </div>
  );
}

export default function WatchOrderEditor({ listId, onListChanged }) {
  const { showToast } = useToast();

  const [list, setList] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef(null);

  const loadList = useCallback(() => {
    if (!listId) return;
    setLoading(true);
    fetch(endpoints.watchOrder.list(listId), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setList)
      .catch(() => showToast("error", "Could not load that watch order."))
      .finally(() => setLoading(false));
  }, [listId, showToast]);

  useEffect(loadList, [loadList]);

  // Candidates depend on the owner, so they reload only when the owner changes.
  useEffect(() => {
    if (!list) return;
    fetch(
      buildUrl(endpoints.watchOrder.candidates(), {
        franchise_id: list.franchise_id,
        collection_id: list.collection_id,
      }),
      { credentials: "include" }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [list?.franchise_id, list?.collection_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(url, method, body) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        ...(body ? jsonBody(body) : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      return res;
    } finally {
      setBusy(false);
    }
  }

  /*
   * Every handler below folds the server's response into local state instead of
   * calling loadList(). Refetching flipped `loading` back on, which replaced
   * the whole editor with a one-line spinner - the page collapsed, the browser
   * scrolled to the top, and the entry picker lost whatever was typed in it.
   * loadList() now runs only on mount and to recover from a failed write.
   */

  async function patchList(patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchList(listId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      // The response carries no items, so keep the ones already in hand.
      setList((prev) => ({ ...prev, ...updated, items: prev.items }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function addItem(candidate) {
    try {
      const res = await send(endpoints.watchOrder.createItem(listId), "POST", {
        media_type: candidate.media_type,
        entry_id: candidate.entry_id,
      });
      const created = await res.json();
      // The create response holds no display data, but the picked candidate
      // does - and in the same shape the resolver returns - so the new row can
      // be appended fully formed rather than fetched back.
      const resolved = {
        ...created,
        missing: false,
        display_name: candidate.display_name,
        cover_image_file: candidate.cover_image_file,
        franchise_id: candidate.franchise_id,
        status: candidate.status ?? null,
        total_episodes: candidate.total_episodes ?? null,
        ep_special: candidate.ep_special ?? null,
      };
      setList((prev) => ({
        ...prev,
        items: [...prev.items, resolved],
        item_count: (prev.item_count ?? prev.items.length) + 1,
      }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function patchItem(itemId, patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchItem(itemId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      setList((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          // The response omits the resolved display fields entirely, so
          // spreading it over the old item leaves them intact.
          i.system_id === itemId ? { ...i, ...updated } : i
        ),
      }));
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function removeItem(itemId) {
    try {
      await send(endpoints.watchOrder.removeItem(itemId), "DELETE");
      setList((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.system_id !== itemId),
        item_count: Math.max((prev.item_count ?? prev.items.length) - 1, 0),
      }));
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  /**
   * Commits a new order. The backend requires every item exactly once, so the
   * full id sequence is always sent, not just the moved one.
   */
  async function commitOrder(ids) {
    try {
      const res = await send(endpoints.watchOrder.reorder(listId), "PUT", {
        item_ids: ids,
      });
      setList(await res.json());
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  function moveItem(from, to) {
    if (!list || to < 0 || to >= list.items.length || from === to) return;
    const ids = list.items.map((i) => i.system_id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    // Optimistic: reorder locally first so the row doesn't visibly snap back
    // while the request is in flight.
    const reordered = ids.map((id) =>
      list.items.find((i) => i.system_id === id)
    );
    setList({ ...list, items: reordered });
    commitOrder(ids);
  }

  if (!listId) {
    return (
      <div className="text-center py-16 text-gray-400">
        <i className="fas fa-hand-pointer text-3xl mb-3"></i>
        <p className="font-medium">Pick a watch order to edit.</p>
      </div>
    );
  }

  if (loading || !list) {
    return (
      <div className="py-16 text-center text-gray-400">
        <i className="fas fa-circle-notch fa-spin text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        The editor has no title for the scope to lead, so it leads the panel
        instead - a band above the fields rather than a line floating between
        the checkboxes and the picker.
      */}
      {list.media_types?.length > 0 && (
        <div className="-mx-4 -mt-4 px-4 py-2 border-b border-gray-100 bg-gray-50/70 rounded-t-xl">
          <MediaScopeLine mediaTypes={list.media_types} />
        </div>
      )}

      {/* Order metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            defaultValue={list.list_name || ""}
            key={`name-${list.system_id}`}
            onBlur={(e) =>
              e.target.value !== (list.list_name || "") &&
              patchList({ list_name: e.target.value })
            }
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
            Type
          </label>
          <select
            value={list.list_type || "Custom"}
            onChange={(e) => patchList({ list_type: e.target.value })}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {LIST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
            Note
          </label>
          <textarea
            defaultValue={list.remark || ""}
            key={`remark-${list.system_id}`}
            rows={2}
            onBlur={(e) =>
              e.target.value !== (list.remark || "") &&
              patchList({ remark: e.target.value })
            }
            placeholder="How this order should be read…"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!list.is_default}
            onChange={(e) => patchList({ is_default: e.target.checked })}
            className="accent-brand"
          />
          Show this order first
        </label>

        {/*
          Independent of the flag above: several orders can be recommended, and
          this marks the single one to actually follow. Setting it clears the
          flag on the owner's other orders.
        */}
        <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!list.is_most_recommended}
            onChange={(e) =>
              patchList({ is_most_recommended: e.target.checked })
            }
            className="accent-amber-500"
          />
          <i className="fas fa-star text-amber-400 text-[10px]"></i>
          Most recommended
        </label>
      </div>

      <EntryPicker candidates={candidates} onAdd={addItem} disabled={busy} />

      {list.items.length === 0 ? (
        <p className="text-center py-8 text-sm font-medium text-gray-400">
          No steps yet — add entries above.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {list.items.map((item, i) => (
            <ItemRow
              key={item.system_id}
              item={item}
              index={i + 1}
              isFirst={i === 0}
              isLast={i === list.items.length - 1}
              onPatch={patchItem}
              onRemove={removeItem}
              onMove={moveItem}
              dragHandlers={{
                onDragStart: () => {
                  dragIndex.current = i;
                },
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => {
                  if (dragIndex.current !== null && dragIndex.current !== i) {
                    moveItem(dragIndex.current, i);
                  }
                  dragIndex.current = null;
                },
              }}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
