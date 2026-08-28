// Frontend: admin editor for one watch order.
//
// Everything that writes to /api/watch-order lives here. The read-only
// renderer is WatchOrderGuide; this component deliberately does not reuse it,
// because an editable row needs inputs where the guide needs links.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { buildUrl, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import {
  buildBlocks,
  MediaScopeLine,
  specialLabel,
  supportsEpisodeRange,
} from "./WatchOrderGuide";

// The rungs a step can sit on, most important first. Mirrors ITEM_IMPORTANCE
// in app/services/domain/watch_order.py, which validates them.
export const ITEM_IMPORTANCE = [
  "Essential",
  "Recommended",
  "Normal",
  "Optional",
];

// The selected rung's colors, matching the guide's badges so a step looks the
// same in the editor as it does on the page.
const IMPORTANCE_ACTIVE_CLASS = {
  Essential: "bg-white text-emerald-600 shadow-sm",
  Recommended: "bg-white text-sky-600 shadow-sm",
  Normal: "bg-white text-gray-700 shadow-sm",
  Optional: "bg-white text-amber-600 shadow-sm",
};

// Exported so the create form on /watch-orders offers exactly the same
// choices the editor does.
export const LIST_TYPES = [
  "Custom",
  "Chronological",
  "Release",
  "Recommended",
];

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
};

function ItemRow({
  item,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
  isFirst,
  isLast,
  dragHandlers,
  readOnly = false,
}) {
  // Episode inputs are held locally so typing doesn't fire a request per
  // keystroke; the value is committed on blur.
  const [epStart, setEpStart] = useState(item.ep_start ?? "");
  const [epEnd, setEpEnd] = useState(item.ep_end ?? "");
  const [note, setNote] = useState(item.note ?? "");
  // Same reason: "12" passes through "1" on the way, and moving the step to
  // slot 1 mid-keystroke would reorder the list out from under the typist.
  const [slot, setSlot] = useState(String(index));

  useEffect(() => {
    setEpStart(item.ep_start ?? "");
    setEpEnd(item.ep_end ?? "");
    setNote(item.note ?? "");
  }, [item.ep_start, item.ep_end, item.note]);

  // A move by any means - drag, the arrows, or another row's typed slot -
  // changes this row's number, so the box follows the list rather than
  // holding whatever was last typed into it.
  useEffect(() => {
    setSlot(String(index));
  }, [index]);

  function commit(field, raw) {
    const value = raw === "" ? null : raw;
    if ((item[field] ?? null) === value) return;
    onPatch(item.system_id, { [field]: value });
  }

  /**
   * Moves this step to the typed slot, counting the way the badges read (1..N)
   * rather than in the stored float positions - the reorder endpoint renumbers
   * to 1..N regardless, so a typed 2.5 would be normalized away by the next
   * move anyway.
   *
   * Out of range clamps to the nearest end, which is what someone typing 99 to
   * mean "last" intends. Anything unparseable simply restores the current slot.
   */
  function commitSlot() {
    const parsed = Number.parseInt(slot, 10);
    if (Number.isNaN(parsed)) {
      setSlot(String(index));
      return;
    }
    const target = Math.min(Math.max(parsed, 1), total);
    if (target === index) {
      // Normalizes what is shown: typing 0 on the first row is not a move,
      // but the box should still read 1 afterwards.
      setSlot(String(index));
      return;
    }
    onMove(index - 1, target - 1);
  }

  return (
    <li
      draggable={!readOnly}
      {...dragHandlers}
      className={`flex flex-col gap-2 p-3 rounded-xl border bg-white ${
        item.missing ? "border-dashed border-red-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3">
        {!readOnly && (
          <i className="fas fa-grip-vertical text-gray-300 cursor-grab"></i>
        )}
        {/*
          A box rather than the old circle: a caret and two digits do not fit a
          28px round badge. Typing a slot is the third way to reorder, beside
          dragging and the arrows, and the only one that works when the
          destination is off-screen.
        */}
        {readOnly ? (
          <span className="w-9 h-7 shrink-0 rounded-lg bg-brand/10 text-brand text-xs font-black flex items-center justify-center">
            {index}
          </span>
        ) : (
          <input
            type="number"
            min={1}
            max={total}
            value={slot}
            title="Type a position to move this step"
            aria-label={`Position, currently ${index} of ${total}`}
            onChange={(e) => setSlot(e.target.value)}
            onBlur={commitSlot}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setSlot(String(index));
                // Blurring after the reset would commit the restored value
                // through onBlur, which is harmless but pointless; leaving
                // focus put also lets the typist correct and retry.
                e.currentTarget.select();
              }
            }}
            className="w-9 h-7 shrink-0 rounded-lg bg-brand/10 text-brand text-xs font-black text-center border border-transparent hover:border-brand/30 focus:outline-none focus:ring-2 focus:ring-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        )}

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
                {item.release_display && ` · ${item.release_display}`}
                {item.total_episodes != null && ` · ${item.total_episodes} total`}
                {specialLabel(item) && ` · ${specialLabel(item)}`}
              </p>
            </div>
          </>
        )}

        <div className={`flex items-center gap-1 ${readOnly ? "hidden" : ""}`}>
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

      <div
        className={`flex flex-wrap items-center gap-2 pl-10 ${
          readOnly ? "hidden" : ""
        }`}
      >
        {/*
          A movie, manga or novel step covers its entry whole, so the from/to
          pair is omitted rather than disabled - there is nothing to fill in.
          A comic run is not in that set: its steps are numbered by issue, so
          it keeps the pair the way the episodic types do.
          Any range already stored on such a step is left alone and still
          renders in the guide; silently clearing it would delete the admin's
          data to satisfy a display rule.
        */}
        {supportsEpisodeRange(item.media_type) && (
          <>
            <input
              type="number"
              value={epStart}
              onChange={(e) => setEpStart(e.target.value)}
              onBlur={() =>
                commit("ep_start", epStart === "" ? "" : Number(epStart))
              }
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
          </>
        )}

        {/*
          Three buttons rather than a dropdown: the whole ladder is visible at
          a glance while scanning a list of steps, and setting a rung costs one
          click instead of two. The active colors are the guide's badge colors,
          so a step reads the same in the editor as it does on the page.
        */}
        <div
          role="group"
          aria-label="Importance"
          className="inline-flex items-center gap-0.5 ml-auto p-0.5 rounded-lg bg-gray-100"
        >
          {ITEM_IMPORTANCE.map((level) => {
            const active = (item.importance || "Normal") === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onPatch(item.system_id, { importance: level })
                }
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                  active
                    ? IMPORTANCE_ACTIVE_CLASS[level]
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {!readOnly && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => commit("note", note)}
          placeholder="Note for this step…"
          className="ml-10 border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
        />
      )}
    </li>
  );
}

// What the list already holds, keyed the way a candidate identifies itself.
// Deliberately says only "this entry is in the list" and, when the steps carry
// episode ranges, which ones - never whether those ranges add up to the whole
// entry. That would mean trusting ep_total, which is blank often enough that
// the claim would be wrong exactly where it mattered.
function buildAddedIndex(items) {
  const index = new Map();
  for (const item of items) {
    if (!item.media_type || !item.entry_id) continue;
    const key = `${item.media_type}:${item.entry_id}`;
    const entry = index.get(key) || { count: 0, ranges: [], whole: false };
    // No range at all means the step covers the entry as a whole, which is
    // worth saying plainly even when other steps name episodes.
    if (item.ep_start == null && item.ep_end == null) {
      entry.whole = true;
    } else {
      entry.ranges.push(formatRange(item.ep_start, item.ep_end));
    }
    entry.count += 1;
    index.set(key, entry);
  }
  return index;
}

// "1-2", or words when only one bound is set: a step can legitimately say
// "from ep 5 on" without knowing where the entry stops. Spelled out rather
// than left as a bare dash, since "–3" reads as minus three.
function formatRange(start, end) {
  if (start != null && end != null) {
    return start === end ? `${start}` : `${start}–${end}`;
  }
  if (start != null) return `${start} onward`;
  return `up to ${end}`;
}

// The badge text for one candidate, or null when it is not in the list yet.
function addedLabel(added) {
  if (!added) return null;
  if (added.whole || !added.ranges.length) return "Added";
  return `Added · Ep ${added.ranges.join(", ")}`;
}

function EntryPicker({ candidates, items, onAdd, disabled, target, onClearTarget }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [hideAdded, setHideAdded] = useState(false);

  const added = useMemo(() => buildAddedIndex(items), [items]);

  // How many of the franchise's entries are already in the list, whatever the
  // search box currently shows - the toggle offering to hide them should say
  // the same number before and after it is ticked.
  const addedCount = useMemo(
    () =>
      candidates.filter((c) => added.has(`${c.media_type}:${c.entry_id}`))
        .length,
    [candidates, added]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      candidates
        .filter((c) => !type || c.media_type === type)
        .filter(
          (c) => !hideAdded || !added.has(`${c.media_type}:${c.entry_id}`)
        )
        // search_names carries every title the entry answers to, already
        // lowercased by the backend. display_name is one of them, but an entry
        // saved before the field existed may arrive without it, so the displayed
        // name is still checked on its own.
        .filter(
          (c) =>
            !q ||
            (c.display_name || "").toLowerCase().includes(q) ||
            (c.search_names || []).some((n) => n.includes(q))
        )
        .slice(0, 40)
    );
  }, [candidates, query, type, hideAdded, added]);

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
      {/*
        Says where the next pick lands. Without it "Add entry to this part"
        would scroll the admin to a picker that looks exactly like the one that
        files nothing, and the part would be silently forgotten.
      */}
      {target && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-brand/10 border border-brand/20">
          <i className="fas fa-layer-group text-brand text-xs"></i>
          <span className="text-xs font-black text-brand truncate">
            Adding to {target.section_name || "Untitled Section"}
          </span>
          <button
            type="button"
            onClick={onClearTarget}
            className="ml-auto text-[10px] font-bold text-brand/70 hover:text-brand"
          >
            Add outside any part
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries to add — any language…"
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

        {/*
          Only worth offering once something would actually be hidden. Sits in
          the search row because it narrows the same result set the box does.
        */}
        {addedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideAdded}
              onChange={(e) => setHideAdded(e.target.checked)}
              className="accent-brand"
            />
            Hide added ({addedCount})
          </label>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="text-xs font-medium text-gray-400 py-2">
          {/*
            With the toggle on, an empty result usually means there is nothing
            left to add rather than nothing matching what was typed.
          */}
          {hideAdded && !query.trim()
            ? "Every entry in scope is already in this order."
            : "No entries match."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {matches.map((c) => {
            const key = `${c.media_type}:${c.entry_id}`;
            const label = addedLabel(added.get(key));
            return (
            <li key={key}>
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
                {/*
                  Two entries in a franchise often share a title beyond the
                  season number, so the release date is what tells them apart
                  at a glance - and it is the thing being ordered by.
                */}
                {c.release_display && (
                  <span className="shrink-0 text-[10px] font-bold text-gray-400 whitespace-nowrap">
                    {c.release_display}
                  </span>
                )}
                {/*
                  Information, not a block: the button stays enabled, because
                  adding the same entry twice is how a split run is written.
                */}
                {label && (
                  <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200 whitespace-nowrap">
                    {label}
                  </span>
                )}
                <span className="ml-auto text-[10px] font-black text-gray-400 whitespace-nowrap">
                  {TYPE_LABELS[c.media_type]}
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] font-medium text-gray-400 mt-2">
        The same entry can be added more than once — that is how a split run
        (ep 1–10, then later ep 11–12) is written.
      </p>
    </div>
  );
}

/**
 * One part, drawn as the box its steps live inside.
 *
 * Replaces the old arrangement, where parts were edited in a panel of their
 * own and each step carried a "which part?" dropdown. A step's part is now
 * shown by which box contains it and changed by moving it there, so the two
 * can never disagree — and the box is what the admin drags a step into.
 */
function PartBox({
  section,
  count,
  busy,
  onPatch,
  onRemove,
  onMove,
  onAddHere,
  isFirst,
  isLast,
  children,
  dropHandlers,
}) {
  const [name, setName] = useState(section.section_name ?? "");
  const [remark, setRemark] = useState(section.remark ?? "");

  useEffect(() => {
    setName(section.section_name ?? "");
    setRemark(section.remark ?? "");
  }, [section.section_name, section.remark]);

  return (
    <section
      {...dropHandlers}
      className="rounded-2xl border-2 border-brand/20 bg-brand/[0.03] overflow-hidden"
    >
      <header className="px-3 py-2 bg-white border-b border-brand/20 flex flex-wrap items-center gap-2">
        <i className="fas fa-layer-group text-brand/50 text-xs"></i>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onPatch(section.system_id, { section_name: name })}
          placeholder="Part name…"
          className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-xs font-black focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => onPatch(section.system_id, { remark })}
          placeholder="Part note…"
          className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-[10px] font-black text-gray-400 whitespace-nowrap">
          {count}
          {count === 1 ? " step" : " steps"}
        </span>
        <div className="flex items-center gap-1">
          {/*
            Moves the whole part — every step in it, in one commit. A part is
            a block, so there is no such thing as moving its heading past its
            own steps.
          */}
          <button
            type="button"
            disabled={busy || isFirst}
            onClick={() => onMove(-1)}
            title="Move part up"
            aria-label="Move part up"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <i className="fas fa-chevron-up text-xs"></i>
          </button>
          <button
            type="button"
            disabled={busy || isLast}
            onClick={() => onMove(1)}
            title="Move part down"
            aria-label="Move part down"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <i className="fas fa-chevron-down text-xs"></i>
          </button>
          {/*
            Deletes the part, never its steps: the FK is SET NULL, so they stay
            in the order and simply become unfiled where they already sit.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(section.system_id)}
            title="Delete part (its steps stay, unfiled)"
            aria-label="Delete part"
            className="w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-30"
          >
            <i className="fas fa-trash text-xs"></i>
          </button>
        </div>
      </header>

      <div className="p-2 flex flex-col gap-2">
        {count === 0 ? (
          <p className="text-xs font-medium text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
            Empty part — drag a step in, or add one below.
          </p>
        ) : (
          children
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAddHere(section)}
          className="self-start text-xs font-bold text-brand hover:underline disabled:opacity-40"
        >
          <i className="fas fa-plus text-[10px] mr-1"></i>
          Add entry to this part
        </button>
      </div>
    </section>
  );
}

/**
 * The gap between two blocks, and a drop target in its own right.
 *
 * Dropping here unfiles a step. Without it a step could never be placed
 * *between* two parts: dropping onto a row adopts that row's part, so every
 * landing spot would belong to one part or another.
 */
function UnfileGap({ active, dropHandlers }) {
  return (
    <div
      {...dropHandlers}
      className={`h-2 -my-1 rounded transition-colors ${
        active ? "h-8 my-0 border-2 border-dashed border-brand/50 bg-brand/5" : ""
      }`}
    >
      {active && (
        <p className="text-[10px] font-black text-brand/70 text-center leading-7">
          Drop here to leave it out of any part
        </p>
      )}
    </div>
  );
}


export default function WatchOrderEditor({ listId, onListChanged }) {
  const { showToast } = useToast();

  const [list, setList] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // The flat index of the row being dragged, and the gap it is hovering. Both
  // are state rather than a ref: the gap that would receive the drop draws
  // itself open, so a render has to follow the pointer.
  const [dragging, setDragging] = useState(null);
  const [gapOver, setGapOver] = useState(null);
  // Which part the picker files new entries into, or null for none. Set by a
  // part's own "Add entry to this part" button.
  const [addTarget, setAddTarget] = useState(null);

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
        section_id: addTarget?.system_id ?? null,
      });
      const created = await res.json();
      // The create response holds no display data, but the picked candidate
      // does - and in the same shape the resolver returns - so the new row can
      // be appended fully formed rather than fetched back.
      const resolved = {
        ...created,
        missing: false,
        display_name: candidate.display_name,
        release_display: candidate.release_display ?? null,
        cover_image_file: candidate.cover_image_file,
        franchise_id: candidate.franchise_id,
        status: candidate.status ?? null,
        total_episodes: candidate.total_episodes ?? null,
        ep_special: candidate.ep_special ?? null,
      };
      // A step added to a part lands at the end of *that part*, not the end of
      // the list, so it is spliced in by the position the server gave it
      // rather than pushed onto the tail.
      setList((prev) => {
        const items = [...prev.items];
        const at = items.findIndex(
          (i) => (i.position ?? Infinity) > (resolved.position ?? Infinity)
        );
        items.splice(at === -1 ? items.length : at, 0, resolved);
        return {
          ...prev,
          items,
          item_count: (prev.item_count ?? prev.items.length) + 1,
        };
      });
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

  async function addSection() {
    try {
      const res = await send(endpoints.watchOrder.createSection(listId), "POST", {
        section_name: `Part ${sections.length + 1}`,
      });
      const created = await res.json();
      setList((prev) => ({ ...prev, sections: [...(prev.sections || []), created] }));
    } catch (e) {
      showToast("error", e.message);
    }
  }

  async function patchSection(sectionId, patch) {
    try {
      const res = await send(
        endpoints.watchOrder.patchSection(sectionId),
        "PATCH",
        patch
      );
      const updated = await res.json();
      setList((prev) => ({
        ...prev,
        sections: (prev.sections || []).map((s) =>
          s.system_id === sectionId ? { ...s, ...updated } : s
        ),
      }));
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  async function removeSection(sectionId) {
    try {
      await send(endpoints.watchOrder.removeSection(sectionId), "DELETE");
      // The steps survive — the FK is SET NULL — so they are unfiled here
      // rather than dropped, matching what the server just did.
      setList((prev) => ({
        ...prev,
        sections: (prev.sections || []).filter((s) => s.system_id !== sectionId),
        items: (prev.items || []).map((i) =>
          i.section_id === sectionId ? { ...i, section_id: null } : i
        ),
      }));
      onListChanged?.();
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

  const sections = list?.sections || [];

  // What the page draws: part boxes and the loose runs between them, folded
  // out of the flat step list the server returns in reading order. Empty parts
  // are included here and not in the guide — an admin has to be able to drop
  // the first step into a part they just made.
  const blocks = useMemo(
    () => buildBlocks(list?.items, list?.sections, { includeEmpty: true }),
    [list?.items, list?.sections]
  );

  /**
   * Which part a moved step ends up in when nothing says explicitly.
   *
   * It adopts the run it lands in, read off its new neighbours: the one they
   * agree on, else the step above it, else the step below. Every answer
   * extends an existing run rather than starting a second one, so a move can
   * never split a part — which is the invariant the server enforces and would
   * otherwise reject the request for.
   *
   * The practical reading: nudging a step down past the last step of its part
   * takes it out of that part, and nudging one up into the middle of a part
   * puts it in. Both are what the arrows look like they should do.
   */
  function adoptedSection(reordered, index) {
    const previous = index > 0 ? reordered[index - 1] : null;
    const next = index + 1 < reordered.length ? reordered[index + 1] : null;
    const above = previous ? previous.section_id || null : null;
    const below = next ? next.section_id || null : null;
    if (previous && next && above === below) return above;
    if (previous) return above;
    return below;
  }

  /**
   * Commits a new order. The backend requires every item exactly once, so the
   * full id sequence is always sent, not just the moved one - and the parts
   * ride along with it, because a drag changes both at once.
   */
  async function commitOrder(items, anchors = []) {
    try {
      // Anchors go first: they are expressed against the 1..N the reorder is
      // about to write, so patching them afterwards would race the response
      // this function then trusts.
      for (const anchor of anchors) {
        await send(endpoints.watchOrder.patchSection(anchor.id), "PATCH", {
          position: anchor.position,
        });
      }
      const res = await send(endpoints.watchOrder.reorder(listId), "PUT", {
        item_ids: items.map((i) => i.system_id),
        section_ids: items.map((i) => i.section_id || null),
      });
      setList(await res.json());
      onListChanged?.();
    } catch (e) {
      showToast("error", e.message);
      loadList();
    }
  }

  /**
   * Moves one step. `section` names the part it lands in when the gesture says
   * so - a drop onto a row takes that row's part, a drop in a gap takes none -
   * and is left undefined by the arrows, which infer it from the neighbours.
   */
  function moveItem(from, to, section) {
    if (!list || to < 0 || to >= list.items.length) return;
    const reordered = [...list.items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const landed =
      section === undefined ? adoptedSection(reordered, to) : section;
    // A step dropped onto its own slot has still moved if it changed parts -
    // which is exactly what dropping into an empty part next to it does.
    if (from === to && landed === (moved.section_id || null)) return;
    reordered[to] = { ...moved, section_id: landed };
    // Optimistic: reorder locally first so the row doesn't visibly snap back
    // while the request is in flight.
    setList({ ...list, items: reordered });
    commitOrder(reordered);
  }

  /**
   * Moves a whole part, steps and all, past the block on either side of it.
   *
   * A part is a block, so this is the only meaning "move this part" can have:
   * there is no heading to slide independently of the steps under it.
   */
  function movePart(blockIndex, direction) {
    const target = blockIndex + direction;
    if (target < 0 || target >= blocks.length) return;

    const order = [...blocks];
    const [moved] = order.splice(blockIndex, 1);
    order.splice(target, 0, moved);
    const reordered = order.flatMap((b) => b.rows.map((r) => r.item));
    if (reordered.length !== list.items.length) return;

    // An empty part holds no steps, so a swap past one changes no item order
    // at all - its own `position` is the only thing that says where its box is
    // drawn, and it has to be moved by hand. The reorder renumbers steps to
    // 1..N, so each anchor is counted against that: half a slot past the last
    // step above it.
    let above = 0;
    const anchors = [];
    for (const block of order) {
      if (block.kind === "part" && block.rows.length === 0) {
        anchors.push({ id: block.section.system_id, position: above + 0.5 });
      } else {
        above += block.rows.length;
      }
    }

    const anchored = new Map(anchors.map((a) => [a.id, a.position]));
    setList({
      ...list,
      items: reordered,
      sections: (list.sections || []).map((section) =>
        anchored.has(section.system_id)
          ? { ...section, position: anchored.get(section.system_id) }
          : section
      ),
    });
    commitOrder(reordered, anchors);
  }

  // Drag state. `dragging` is the flat index of the row being dragged;
  // `gapOver` is the gap it is currently hovering, which only that gap draws.
  function rowHandlers(row) {
    const index = row.number - 1;
    return {
      onDragStart: () => setDragging(index),
      onDragOver: (e) => {
        e.preventDefault();
        setGapOver(null);
      },
      onDrop: (e) => {
        e.stopPropagation();
        // A drop onto a row is explicit about the part: the step joins
        // whichever part that row is in, or leaves every part if that row is
        // in none.
        if (dragging !== null && dragging !== index) {
          moveItem(dragging, index, row.item.section_id || null);
        }
        setDragging(null);
        setGapOver(null);
      },
    };
  }

  // Dropping on a part's chrome rather than one of its rows appends to it.
  function partHandlers(block) {
    return {
      onDragOver: (e) => {
        e.preventDefault();
        setGapOver(null);
      },
      onDrop: () => {
        if (dragging !== null && block.rows.length) {
          const last = block.rows[block.rows.length - 1].number - 1;
          moveItem(dragging, last, block.section.system_id);
        } else if (dragging !== null) {
          // An empty part: the step becomes its first, landing where the part
          // is anchored in the list.
          moveItem(dragging, dragging, block.section.system_id);
        }
        setDragging(null);
        setGapOver(null);
      },
    };
  }

  /**
   * The gap before `blockIndex`, or the tail when `block` is null.
   *
   * Dropping here unfiles the step. It is the only landing spot that does:
   * every row belongs to some run, so without these gaps a step could never be
   * placed between two parts.
   */
  function gapHandlers(blockIndex, block) {
    return {
      onDragOver: (e) => {
        e.preventDefault();
        setGapOver(blockIndex);
      },
      onDragLeave: () => setGapOver((g) => (g === blockIndex ? null : g)),
      onDrop: (e) => {
        e.stopPropagation();
        if (dragging !== null) {
          const at = block?.rows.length
            ? block.rows[0].number - 1
            : list.items.length;
          // Removing the dragged row first shifts everything below it up one,
          // so a downward move lands one slot earlier than the gap's index.
          moveItem(dragging, dragging < at ? at - 1 : at, null);
        }
        setDragging(null);
        setGapOver(null);
      },
    };
  }

  if (!listId) {
    return (
      <div className="text-center py-16 text-gray-400">
        <i className="fas fa-hand-pointer text-3xl mb-3"></i>
        <p className="font-medium">Pick a watch order to edit.</p>
      </div>
    );
  }

  const isBuiltIn = Boolean(list?.auto_source);

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

      {/*
        A built-in list has no stored steps to add to or reorder, so the
        controls are replaced by an explanation rather than left to fail.
      */}
      {isBuiltIn ? (
        <p className="text-xs font-medium text-gray-500 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
          <i className="fas fa-wand-magic-sparkles text-sky-500 mr-1.5"></i>
          These steps are generated from release dates and refresh on their own
          as entries are added. The name, type, note and flags above are still
          yours to edit.
        </p>
      ) : (
        <EntryPicker
          candidates={candidates}
          items={list.items}
          onAdd={addItem}
          disabled={busy}
          target={addTarget}
          onClearTarget={() => setAddTarget(null)}
        />
      )}

      {/*
        Parts are edited where they live. A step's part is shown by which box
        contains it and changed by moving it there — there is no separate
        panel, and no per-step "which part?" dropdown that could disagree with
        what the page draws.
      */}
      {list.items.length === 0 && sections.length === 0 ? (
        <p className="text-center py-8 text-sm font-medium text-gray-400">
          No steps yet — add entries above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.map((block, blockIndex) => {
            const gapBefore = !isBuiltIn && (
              <UnfileGap
                key={`gap-${blockIndex}`}
                active={dragging !== null && gapOver === blockIndex}
                dropHandlers={gapHandlers(blockIndex, block)}
              />
            );

            const rows = block.rows.map((row) => (
              <ItemRow
                key={row.item.system_id}
                item={row.item}
                index={row.number}
                readOnly={isBuiltIn}
                isFirst={row.number === 1}
                total={list.items.length}
                isLast={row.number === list.items.length}
                onPatch={patchItem}
                onRemove={removeItem}
                onMove={moveItem}
                dragHandlers={isBuiltIn ? {} : rowHandlers(row)}
              />
            ));

            if (block.kind === "part") {
              return (
                <Fragment key={block.key}>
                  {gapBefore}
                  <PartBox
                    section={block.section}
                    count={block.rows.length}
                    busy={busy}
                    onPatch={patchSection}
                    onRemove={removeSection}
                    onMove={(direction) => movePart(blockIndex, direction)}
                    onAddHere={setAddTarget}
                    isFirst={blockIndex === 0}
                    isLast={blockIndex === blocks.length - 1}
                    dropHandlers={isBuiltIn ? {} : partHandlers(block)}
                  >
                    {rows}
                  </PartBox>
                </Fragment>
              );
            }

            return (
              <Fragment key={block.key}>
                {gapBefore}
                <div className="flex flex-col gap-2">{rows}</div>
              </Fragment>
            );
          })}

          {/* The tail gap, so a step can be dropped past the last part. */}
          {!isBuiltIn && blocks.length > 0 && (
            <UnfileGap
              active={dragging !== null && gapOver === blocks.length}
              dropHandlers={gapHandlers(blocks.length, null)}
            />
          )}
        </div>
      )}

      {!isBuiltIn && (
        <button
          type="button"
          disabled={busy}
          onClick={addSection}
          className="self-start text-xs font-bold text-brand hover:underline disabled:opacity-40"
        >
          <i className="fas fa-plus text-[10px] mr-1"></i>
          Add part
        </button>
      )}

    </div>
  );
}
