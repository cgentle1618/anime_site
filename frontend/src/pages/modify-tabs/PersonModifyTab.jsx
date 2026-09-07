// Frontend: modify tab page file for PersonModifyTab.
//
// Self-contained, like StudioModifyTab/QuoteManageTab: owns its own fetch,
// picker and save state instead of hooking into Modify.jsx's per-type
// form/search/save machinery (which is built around the media-entry and
// collection/franchise/series shapes, not a credited entity like Person).
// Reuses PersonFields from PersonAddTab so the input markup isn't duplicated
// - see the comment on that export.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import PersonSubTabBar from "../../components/forms/PersonSubTabBar";
import { PersonFields, useRoleScopes } from "../add-tabs/PersonAddTab";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { PERSON_NAME_FIELDS } from "../../lib/naming";

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function personToForm(p) {
  return {
    name_en: p.name_en || "",
    name_cn: p.name_cn || "",
    name_jp: p.name_jp || "",
    name_alt: p.name_alt || "",
    display_name_field: p.display_name_field || "",
    gender: p.gender || "",
    my_rating: p.my_rating || "",
    photo_file: p.photo_file || "",
    remark: p.remark || "",
  };
}

export default function PersonModifyTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const legalScopes = useRoleScopes();

  const [subTab, setSubTab] = useState("director");
  const [search, setSearch] = useState("");
  // Which media-type scopes of the sub-tab's role the grid is narrowed to.
  // Empty means "any scope" - the filter starts off, so the grid still lists
  // everyone holding the role up front.
  const [scopes, setScopes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [personForm, setPersonForm] = useState(null);
  const [roles, setRoles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Filtered by the sub-tab's role, which is what makes the sub-tab useful on
  // a list of several hundred people. The FORM below still edits every type
  // they hold - a person is one row.
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people-admin", subTab],
    queryFn: () => fetchJson(endpoints.person.list(`role=${subTab}`)),
    staleTime: 10_000,
  });

  const upf = (k, v) => setPersonForm((p) => ({ ...p, [k]: v }));

  // The scopes this role may be held in. A role with one legal scope (producer,
  // composer) gets no filter row at all - every person listed is in it.
  const scopeChoices = legalScopes[subTab] || [];

  function toggleScope(scope) {
    setScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope],
    );
  }

  // Everyone holding the sub-tab's role is listed up front, the way the System
  // Option tab lists a category's values - an admin should not have to already
  // know the name to reach the record. The search box filters that grid in
  // place, across all four name fields rather than just whichever one
  // display_name_field points at: looking someone up by their Japanese name
  // must work even when English is the configured display name.
  const filtered = useMemo(() => {
    const q = cleanString(search);
    // Scope filtering is OR, not AND: a person shown for {anime, anime-movie}
    // only has to be in scope for one of them, because a director scoped to
    // anime alone is still an anime director. Done here rather than through
    // the endpoint's ?scope= (which takes one value) - the list already
    // carries every (role, scope) row each person holds.
    const inScope =
      scopes.length === 0
        ? people
        : people.filter((p) =>
            (p.roles || []).some(
              (r) => r.role === subTab && scopes.includes(r.scope),
            ),
          );
    const matched = q
      ? inScope.filter((p) =>
          PERSON_NAME_FIELDS.some(
            ({ field }) => p[field] && cleanString(p[field]).includes(q),
          ),
        )
      : inScope;
    return [...matched].sort((a, b) =>
      (a.display_name || "").localeCompare(b.display_name || ""),
    );
  }, [people, search, scopes, subTab]);

  async function selectPerson(person) {
    try {
      const fresh = await fetchJson(endpoints.person.detail(person.system_id));
      setSelectedId(fresh.system_id);
      setPersonForm(personToForm(fresh));
      // Every (role, scope) they hold, from the same response - the form edits
      // the whole set, because PUT replaces it.
      setRoles(fresh.roles || []);
    } catch {
      showToast("error", "Failed to load person.");
    }
  }

  function closeEditor() {
    setSelectedId(null);
    setPersonForm(null);
    setRoles([]);
  }

  const hasAnyName = personForm
    ? PERSON_NAME_FIELDS.some(({ field }) => personForm[field]?.trim())
    : false;

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !selectedId || !hasAnyName) return;
    setSubmitting(true);
    try {
      const updated = await fetchJson(endpoints.person.update(selectedId), {
        method: "PUT",
        ...jsonBody({
          name_en: personForm.name_en.trim() || null,
          name_cn: personForm.name_cn.trim() || null,
          name_jp: personForm.name_jp.trim() || null,
          name_alt: personForm.name_alt.trim() || null,
          display_name_field: personForm.display_name_field || null,
          gender: personForm.gender || null,
          my_rating: personForm.my_rating || null,
          photo_file: personForm.photo_file || null,
          remark: personForm.remark || null,
          // PUT replaces the whole role set, so this must be every type the
          // person holds, not just the sub-tab's one.
          roles,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["people-admin"] });
      setPersonForm(personToForm(updated));
      // Back to the top: the toast renders at the top of the page and
      // the form is long enough to have scrolled it out of sight.
      window.scrollTo(0, 0);
      showToast("success", "Person updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!selectedId && (
        <>
          <PersonSubTabBar
            active={subTab}
            onSelect={(key) => {
              setSubTab(key);
              setSearch("");
              // The scopes are the previous role's - "movie" means nothing to
              // an author - so a sub-tab switch clears them.
              setScopes([]);
            }}
          />
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4 space-y-3">
            {scopeChoices.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-text-faint uppercase tracking-wider mr-1">
                  Scope
                </span>
                {scopeChoices.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
                      scopes.includes(scope)
                        ? "bg-brand text-on-brand border-brand"
                        : "bg-surface text-text-faint border-border hover:border-border-strong"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
              <input
                className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Search people to modify..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.system_id}
                  type="button"
                  onClick={() => selectPerson(p)}
                  className="text-left px-3 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-muted hover:border-brand hover:text-brand hover:bg-brand-soft transition shadow-sm truncate"
                >
                  {p.display_name}
                </button>
              ))}
            </div>
          )}

          {!isLoading && people.length === 0 && (
            <p className="text-sm text-text-faint italic">
              Nobody holds this type yet.
            </p>
          )}
          {!isLoading && people.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-text-faint italic">
              {search
                ? "Nobody with this type matches that name."
                : "Nobody holds this type in the selected scopes."}
            </p>
          )}
        </>
      )}

      {selectedId && personForm && (
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
            <PersonFields
              personForm={personForm}
              upf={upf}
              roles={roles}
              setRoles={setRoles}
              legalScopes={legalScopes}
            />
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
