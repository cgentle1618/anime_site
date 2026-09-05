// Frontend: form component for an entry's cast (character + seiyuu + role +
// position + photo + remark). Controlled, like NovelUnitsEditor: the parent
// owns `value` and receives every change through `onChange`. CastEditor
// never calls the API to save a cast list — only to search/create the
// characters and people its two comboboxes reference.
import { useEffect, useRef, useState } from "react";

import ComboBox from "./ComboBox";
import { useConstants } from "../../config/useConstants";
import { endpoints } from "../../api/endpoints";
import { buildCreateRequest } from "../../lib/ensureSourceValues";
import { getCoverUrl } from "../../lib/covers";

const FALLBACK_CHARACTER_ROLES = ["Main", "Supporting"];

// A synthetic ComboBox item id, distinguishable from every real
// character's UUID, that stands for "mint a brand new character with this
// typed name" rather than "select this existing character".
const CREATE_CHARACTER_PREFIX = "__create_character__:";

// Debounced the same way useGlobalMediaSearch debounces: one request per
// keystroke is one too many, and GET /api/character/?name= is the whole
// reason this component no longer has to download every character just to
// offer suggestions.
const CHARACTER_SEARCH_DEBOUNCE_MS = 250;

// ck_casting_voice_scope: person_id IS NULL OR media_type IN
// ('anime', 'anime-movie'). Nobody voices anyone in a manga or novel, so the
// seiyuu column must not offer what the database will reject.
const SEIYUU_MEDIA_TYPES = new Set(["anime", "anime-movie"]);

const cellCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface w-full";

function emptyRow(position) {
  return {
    system_id: undefined,
    character_id: null,
    character_name: "",
    person_id: null,
    person_name: "",
    role: "",
    position,
    photo_file: null,
    remark: "",
  };
}

export default function CastEditor({ mediaType, value, onChange }) {
  const rows = value || [];
  const showSeiyuu = SEIYUU_MEDIA_TYPES.has(mediaType);

  // CHARACTER_ROLES is served under /api/constants (see useConstants), but
  // it is not one of the arrays CONSTANTS_FALLBACK pre-declares, so the very
  // first paint (before that fetch resolves) would read undefined. Rather
  // than add a key to the shared fieldOptions.js fallback table — a file
  // other in-flight sessions may also be touching — this falls back to a
  // local literal that matches app/routers/constants.py's CHARACTER_ROLES.
  const constants = useConstants();
  const roleOptions =
    constants.character_role && constants.character_role.length
      ? constants.character_role
      : FALLBACK_CHARACTER_ROLES;

  // Per-row character search results, keyed by row index: {system_id,
  // display_name, entryNames}[]. Populated only by typing (see
  // scheduleCharacterSearch) — nothing is fetched for the character
  // combobox on mount, and a row that already has a selection needs no
  // fetch at all (see characterItems).
  const [characterResults, setCharacterResults] = useState({});
  const searchTimers = useRef({});
  useEffect(
    () => () => {
      Object.values(searchTimers.current).forEach(clearTimeout);
    },
    [],
  );

  const [seiyuuList, setSeiyuuList] = useState([]);

  // Existing seiyuu, scoped to this media type exactly like every other
  // person source (PersonRoleIn.scope IS the media type). Not fetched at
  // all for manga/novel, where the column never renders.
  useEffect(() => {
    if (!showSeiyuu) return;
    let cancelled = false;
    const qs = new URLSearchParams({ role: "seiyuu", scope: mediaType }).toString();
    fetch(endpoints.person.list(qs), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (!cancelled) setSeiyuuList(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* best effort — the seiyuu combobox still works empty */
      });
    return () => {
      cancelled = true;
    };
  }, [showSeiyuu, mediaType]);

  const updateRow = (i, patch) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addRow = () => onChange([...rows, emptyRow(rows.length)]);

  // position is 0-based and must stay contiguous — a gap here (0, 2) is a
  // gap in the saved order, since Task 9/10 write `position` straight from
  // whatever this editor last reported.
  const removeRow = (i) =>
    onChange(
      rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j })),
    );

  // Swap adjacent rows and renumber, the same shape as NovelUnitsEditor's
  // move — up/down controls rather than a drag library, matching this
  // codebase's existing reorder pattern.
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((r, k) => ({ ...r, position: k })));
  };

  // Searches GET /api/character/?name= (Fix round 1: this used to fetch the
  // whole table). Debounced per row, and fetches /entries ONLY for the
  // handful of candidates the search actually returns — never for a row's
  // already-selected character, which needs no disambiguating any more.
  function scheduleCharacterSearch(i, text) {
    clearTimeout(searchTimers.current[i]);
    const trimmed = text.trim();
    if (!trimmed) {
      setCharacterResults((prev) => ({ ...prev, [i]: [] }));
      return;
    }
    searchTimers.current[i] = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ name: trimmed }).toString();
        const res = await fetch(endpoints.character.list(qs), {
          credentials: "include",
        });
        if (!res.ok) return;
        const list = await res.json();
        const withEntries = await Promise.all(
          (Array.isArray(list) ? list : []).map(async (c) => {
            let entryNames = [];
            try {
              const eres = await fetch(endpoints.character.entries(c.system_id), {
                credentials: "include",
              });
              if (eres.ok) {
                const payload = await eres.json();
                const groups = Array.isArray(payload?.groups) ? payload.groups : [];
                entryNames = groups.flatMap((g) =>
                  (g.entries || []).map((e) => e.display_name),
                );
              }
            } catch {
              /* best effort — a missing entries list just omits the hint */
            }
            return { ...c, entryNames };
          }),
        );
        setCharacterResults((prev) => ({ ...prev, [i]: withEntries }));
      } catch {
        /* best effort — the character combobox still works empty */
      }
    }, CHARACTER_SEARCH_DEBOUNCE_MS);
  }

  function characterItems(row, i) {
    const typed = (row.character_name || "").trim();
    const items = [];
    // The already-selected character, if any, shown with its PLAIN name —
    // the entries annotation is a search aid, not a persistent label (Fix
    // round 1, finding 2). This needs no fetch: the row already carries
    // both id and name locally.
    if (row.character_id) {
      items.push({
        id: row.character_id,
        label: row.character_name || "",
        searchText: row.character_name || "",
      });
    }
    // Server-searched candidates, annotated with the entries they already
    // appear in (Decision G: the admin needs to see WHICH "Yuki" a match is
    // before deciding whether to reuse it). searchText is pinned to the
    // typed query rather than the candidate's own display_name, because the
    // server may have matched through name_jp/name_cn/name_alt — a column
    // ComboBox's own client-side re-filter never sees.
    for (const c of characterResults[i] || []) {
      items.push({
        id: c.system_id,
        label:
          c.entryNames && c.entryNames.length
            ? `${c.display_name} — in: ${c.entryNames.join(", ")}`
            : c.display_name,
        searchText: typed,
      });
    }
    // Decision G, the heart of this component: a name match is OFFERED,
    // never assumed. "Create new character named X" stays a separate,
    // deliberate option alongside any matches — even an exact one — because
    // POST /api/character is a plain create, not find-or-create: silently
    // reusing a match would fuse two unrelated casts, silently minting
    // would split one.
    if (typed) {
      items.push({
        id: `${CREATE_CHARACTER_PREFIX}${typed}`,
        label: `Create new character named "${typed}"`,
        searchText: typed,
      });
    }
    return items;
  }

  async function handleCharacterSelect(i, id) {
    if (id.startsWith(CREATE_CHARACTER_PREFIX)) {
      const name = id.slice(CREATE_CHARACTER_PREFIX.length);
      try {
        const res = await fetch(endpoints.character.create(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name_en: name }),
          credentials: "include",
        });
        if (!res.ok) return;
        const created = await res.json();
        updateRow(i, {
          character_id: created.system_id,
          character_name: created.display_name || name,
        });
      } catch {
        /* leave the row untouched — the admin can retry */
      }
      return;
    }
    const found = (characterResults[i] || []).find((c) => c.system_id === id);
    updateRow(i, {
      character_id: id,
      character_name: found?.display_name || "",
    });
  }

  // Seiyuu find-or-create: leaving the field with typed, unresolved text
  // reuses a matching existing seiyuu, or mints one via the same
  // create-request shape ensureSourceValues.js uses for every other typed
  // person field. Splitting one voice actor across two rows would split
  // their whole body of work, so — unlike the character box — this never
  // asks; it just does the right thing.
  async function resolveSeiyuu(i, e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const row = rows[i];
    if (!row || row.person_id) return;
    const name = (row.person_name || "").trim();
    if (!name) return;
    const existing = seiyuuList.find(
      (p) => (p.display_name || "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      updateRow(i, { person_id: existing.system_id, person_name: existing.display_name });
      return;
    }
    try {
      const [url, init] = buildCreateRequest(
        { kind: "person", role: "seiyuu", scope: mediaType },
        name,
      );
      const res = await fetch(url, init);
      if (!res.ok) return;
      const created = await res.json();
      setSeiyuuList((prev) => [...prev, created]);
      updateRow(i, {
        person_id: created.system_id,
        person_name: created.display_name || name,
      });
    } catch {
      /* leave the row untouched — the admin can retry */
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div
          key={row.system_id || i}
          className="flex gap-1.5 items-start border border-border rounded-lg p-2 bg-surface"
        >
          <div className="flex flex-col shrink-0 pt-2">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Move up"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-up text-[9px]" />
            </button>
            <button
              type="button"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Move down"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-down text-[9px]" />
            </button>
          </div>

          <div className="flex-1 min-w-0" aria-label="Character">
            <ComboBox
              items={characterItems(row, i)}
              selectedId={row.character_id || null}
              inputText={row.character_name || ""}
              onSelect={(id) => handleCharacterSelect(i, id)}
              onType={(text) => {
                updateRow(i, { character_name: text });
                scheduleCharacterSearch(i, text);
              }}
              onClear={() => {
                updateRow(i, { character_id: null, character_name: "" });
                setCharacterResults((prev) => ({ ...prev, [i]: [] }));
              }}
              placeholder="Character name..."
            />
          </div>

          {showSeiyuu ? (
            <div
              className="flex-1 min-w-0"
              aria-label="Seiyuu"
              onBlur={(e) => resolveSeiyuu(i, e)}
            >
              <ComboBox
                items={seiyuuList.map((p) => ({
                  id: p.system_id,
                  label: p.display_name,
                  searchText: p.display_name,
                }))}
                selectedId={row.person_id || null}
                inputText={row.person_name || ""}
                onSelect={(id, label) => updateRow(i, { person_id: id, person_name: label })}
                onType={(text) => updateRow(i, { person_name: text })}
                onClear={() => updateRow(i, { person_id: null, person_name: "" })}
                placeholder="Seiyuu name..."
                allowNew
              />
            </div>
          ) : null}

          <select
            className={cellCls + " shrink-0 w-28"}
            value={row.role || ""}
            onChange={(e) => updateRow(i, { role: e.target.value })}
            aria-label="Role"
          >
            <option value="">—</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 shrink-0 w-32">
            {row.photo_file ? (
              <img
                src={getCoverUrl(row.photo_file)}
                alt=""
                className="w-8 h-8 rounded object-cover shrink-0"
              />
            ) : null}
            <input
              className={cellCls + " text-xs"}
              placeholder="Photo file"
              value={row.photo_file || ""}
              onChange={(e) => updateRow(i, { photo_file: e.target.value || null })}
              aria-label="Photo file"
            />
          </div>

          <input
            className={cellCls + " flex-1 min-w-0"}
            placeholder="Remark"
            value={row.remark || ""}
            onChange={(e) => updateRow(i, { remark: e.target.value })}
            aria-label="Remark"
          />

          <button
            type="button"
            className="text-danger/70 hover:text-danger px-1 shrink-0"
            aria-label="Remove"
            onClick={() => removeRow(i)}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-brand hover:underline mt-1"
        onClick={addRow}
      >
        + Add cast member
      </button>
    </div>
  );
}
