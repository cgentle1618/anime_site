// Frontend: modify tab page file for CharacterModifyTab.
//
// Self-contained, like StudioModifyTab: owns its own fetch, picker and save
// state instead of hooking into Modify.jsx's per-type form/search/save
// machinery. A character holds no roles (see the comment on
// CharacterAddTab.jsx), so unlike PersonModifyTab this needs no
// PersonSubTabBar and no role x scope state - it is closer in shape to
// StudioModifyTab. Reuses CharacterFields from CharacterAddTab so the input
// markup isn't duplicated - see the comment on that export.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CharacterFields, CHARACTER_NAME_FIELDS } from "../add-tabs/CharacterAddTab";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function characterToForm(c) {
  return {
    name_en: c.name_en || "",
    name_cn: c.name_cn || "",
    name_jp: c.name_jp || "",
    name_alt: c.name_alt || "",
    display_name_field: c.display_name_field || "",
    gender: c.gender || "",
    my_rating: c.my_rating || "",
    photo_file: c.photo_file || "",
    remark: c.remark || "",
  };
}

export default function CharacterModifyTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [characterForm, setCharacterForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters-admin"],
    queryFn: () => fetchJson(endpoints.character.list()),
    staleTime: 10_000,
  });

  const ucf = (k, v) => setCharacterForm((p) => ({ ...p, [k]: v }));

  // Searches all four name fields, not just whichever one display_name_field
  // points at - an admin looking someone up by their Japanese name must find
  // them even when English is the configured display name.
  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = cleanString(search);
    return characters
      .filter((c) =>
        CHARACTER_NAME_FIELDS.some(
          ({ field }) => c[field] && cleanString(c[field]).includes(q),
        ),
      )
      .slice(0, 10);
  }, [characters, search]);

  async function selectCharacter(character) {
    setOpen(false);
    setSearch(character.display_name || "");
    try {
      const fresh = await fetchJson(
        endpoints.character.detail(character.system_id),
      );
      setSelectedId(fresh.system_id);
      setCharacterForm(characterToForm(fresh));
    } catch {
      showToast("error", "Failed to load character.");
    }
  }

  function closeEditor() {
    setSelectedId(null);
    setCharacterForm(null);
    setSearch("");
  }

  const hasAnyName = characterForm
    ? CHARACTER_NAME_FIELDS.some(({ field }) => characterForm[field]?.trim())
    : false;

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !selectedId || !hasAnyName) return;
    setSubmitting(true);
    try {
      const updated = await fetchJson(
        endpoints.character.update(selectedId),
        {
          method: "PUT",
          ...jsonBody({
            name_en: characterForm.name_en.trim() || null,
            name_cn: characterForm.name_cn.trim() || null,
            name_jp: characterForm.name_jp.trim() || null,
            name_alt: characterForm.name_alt.trim() || null,
            display_name_field: characterForm.display_name_field || null,
            gender: characterForm.gender || null,
            my_rating: characterForm.my_rating || null,
            photo_file: characterForm.photo_file || null,
            remark: characterForm.remark || null,
          }),
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["characters-admin"] });
      setCharacterForm(characterToForm(updated));
      showToast("success", "Character updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!selectedId && (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-4 relative">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
            <input
              className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Search characters to modify..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => search && setOpen(true)}
            />
          </div>
          {open && filtered.length > 0 && (
            <div className="absolute z-50 left-4 right-4 mt-1 bg-surface border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
              {filtered.map((c) => (
                <div
                  key={c.system_id}
                  className="px-4 py-2.5 hover:bg-brand/10 cursor-pointer"
                  onMouseDown={() => selectCharacter(c)}
                >
                  <div className="font-bold text-text text-sm">
                    {c.display_name}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {c.casting_count} casting
                    {c.casting_count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && characters.length === 0 && (
            <p className="text-sm text-text-faint italic mt-2">
              No characters yet.
            </p>
          )}
        </div>
      )}

      {selectedId && characterForm && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition shrink-0"
            >
              <i className="fas fa-arrow-left text-xs"></i> Back
            </button>
            <span className="font-mono text-xs text-text-faint bg-surface-2 px-2 py-1 rounded truncate">
              {selectedId}
            </span>
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
            <CharacterFields characterForm={characterForm} ucf={ucf} />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !hasAnyName}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
            >
              {submitting ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-save"></i>
              )}
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
