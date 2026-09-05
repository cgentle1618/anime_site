// Frontend: form component for an entry's cast (character + seiyuu + role +
// position + photo + remark). Controlled, like NovelUnitsEditor: the parent
// owns `value` and receives every change through `onChange`. CastEditor
// never calls the API to save a cast list — only to search/create the
// characters and people its two comboboxes reference.
import { useEffect, useState } from "react";

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

  const [characters, setCharacters] = useState([]);
  const [seiyuuList, setSeiyuuList] = useState([]);

  // Every character, annotated with the entries it already appears in.
  // Decision G: character names legitimately recur across unrelated works —
  // the database deliberately has no unique constraint on them — so the
  // admin needs to see WHICH "Yuki" a match is before deciding whether to
  // reuse it.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(endpoints.character.list(), {
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
                const groups = await eres.json();
                entryNames = (Array.isArray(groups) ? groups : []).flatMap((g) =>
                  (g.entries || []).map((e) => e.display_name),
                );
              }
            } catch {
              /* best effort — a missing entries list just omits the hint */
            }
            return { ...c, entryNames };
          }),
        );
        if (!cancelled) setCharacters(withEntries);
      } catch {
        /* best effort — the character combobox still works empty */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  function characterItems(row) {
    const typed = (row.character_name || "").trim();
    const items = characters.map((c) => ({
      id: c.system_id,
      label:
        c.entryNames && c.entryNames.length
          ? `${c.display_name} — in: ${c.entryNames.join(", ")}`
          : c.display_name,
      searchText: c.display_name,
    }));
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
        setCharacters((prev) => [...prev, { ...created, entryNames: [] }]);
        updateRow(i, {
          character_id: created.system_id,
          character_name: created.display_name || name,
        });
      } catch {
        /* leave the row untouched — the admin can retry */
      }
      return;
    }
    const found = characters.find((c) => c.system_id === id);
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
              items={characterItems(row)}
              selectedId={row.character_id || null}
              inputText={row.character_name || ""}
              onSelect={(id) => handleCharacterSelect(i, id)}
              onType={(text) => updateRow(i, { character_name: text })}
              onClear={() => updateRow(i, { character_id: null, character_name: "" })}
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
