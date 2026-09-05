// Frontend: add tab page file for PersonAddTab.
//
// People used to be a sub-tab of System Options, sharing that nav entry with
// Options and Tags (see OptionSubTabBar.jsx's history). A person is a credited
// entity with its own public pages, not a closed vocabulary, so it moved into
// the Entity tab group beside Studio - see config/adminTabs.js.
//
// PersonFields is exported separately from the page wrapper so the Modify
// page's person editor renders the exact same inputs against an existing
// person's form state instead of duplicating them - the same arrangement
// StudioAddTab uses for StudioFields.
import { useQuery } from "@tanstack/react-query";

import { Field, SectionHeader, inputCls, selectCls } from "../../components/forms/FormField";
import PersonSubTabBar, {
  PERSON_SUB_TABS,
} from "../../components/forms/PersonSubTabBar";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import { PERSON_NAME_FIELDS } from "../../lib/naming";

export { defaultPerson } from "../../config/formFactories";

/**
 * Which media types each person role may be scoped to, from
 * GET /api/person/role-scopes.
 *
 * Fetched rather than hard-coded: the legal pairs are derived on the backend
 * from the same CreditRole.media_types that PersonRoleIn validates writes
 * against, so a form built from this cannot offer a scope the API will reject.
 * A hand-written copy here is exactly the drift OptionsAddTab.jsx documents in
 * its own header comment about the person-role list.
 */
export function useRoleScopes() {
  const { data } = useQuery({
    queryKey: ["person-role-scopes"],
    queryFn: () => fetchJson(endpoints.person.roleScopes()),
    staleTime: 5 * 60 * 1000,
  });
  return data || {};
}

/**
 * The role × scope matrix.
 *
 * Every person_role row carries a media-type scope and there is no "offered
 * everywhere" state, so a type with no scope ticked is a type the person does
 * not hold - see the design spec's Decision B. Ticking the type itself selects
 * its first legal scope, because a scopeless role is a 422 from the API.
 */
export function PersonRoleMatrix({ roles, setRoles, legalScopes }) {
  const held = new Set((roles || []).map((r) => r.role));

  function scopesFor(role) {
    return (roles || []).filter((r) => r.role === role).map((r) => r.scope);
  }

  function setRoleScopes(role, scopes) {
    setRoles([
      ...(roles || []).filter((r) => r.role !== role),
      ...scopes.map((scope) => ({ role, scope })),
    ]);
  }

  function toggleScope(role, scope) {
    const current = scopesFor(role);
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : [...(legalScopes[role] || []).filter(
          (s) => current.includes(s) || s === scope,
        )];
    setRoleScopes(role, next);
  }

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider">
        Types and Scopes
      </label>
      <p className="text-[11px] text-text-faint">
        Which dropdowns this person is offered in. Every type needs at least one
        media type — there is no "offered everywhere".
      </p>
      {PERSON_SUB_TABS.map((t) => {
        const legal = legalScopes[t.key] || [];
        const selected = scopesFor(t.key);
        return (
          <div key={t.key} className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-bold text-text">
              <input
                type="checkbox"
                checked={held.has(t.key)}
                onChange={(e) =>
                  setRoleScopes(t.key, e.target.checked ? legal.slice(0, 1) : [])
                }
              />
              <i className={`fas ${t.icon} text-text-faint`}></i>
              {t.label}
            </label>
            {held.has(t.key) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {legal.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(t.key, scope)}
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
                      selected.includes(scope)
                        ? "bg-brand text-on-brand border-brand"
                        : "bg-surface text-text-faint border-border hover:border-border-strong"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PersonFields({ personForm, upf, roles, setRoles, legalScopes }) {
  const hasAnyName = PERSON_NAME_FIELDS.some(
    ({ field }) => personForm[field]?.trim(),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PERSON_NAME_FIELDS.map(({ key, label, field }) => (
          <Field key={key} label={`Name (${label})`}>
            <input
              className={inputCls}
              value={personForm[field] ?? ""}
              onChange={(e) => upf(field, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {!hasAnyName && (
        <p className="text-[10px] font-bold text-danger -mt-2">
          A person needs at least one name.
        </p>
      )}
      <Field
        label="Display Name"
        hint="Which name to show by default. Falls back through English, Chinese, Japanese, Alternative when unset."
      >
        <select
          className={selectCls}
          value={personForm.display_name_field ?? ""}
          onChange={(e) => upf("display_name_field", e.target.value)}
        >
          <option value="">Default (English)</option>
          {PERSON_NAME_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <PersonRoleMatrix
        roles={roles}
        setRoles={setRoles}
        legalScopes={legalScopes}
      />

      <SectionHeader icon="fa-id-card" title="Profile" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Gender">
          <input
            className={inputCls}
            value={personForm.gender ?? ""}
            onChange={(e) => upf("gender", e.target.value)}
          />
        </Field>
        <Field label="My Rating">
          <input
            className={inputCls}
            value={personForm.my_rating ?? ""}
            onChange={(e) => upf("my_rating", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Photo File">
        <input
          className={inputCls}
          value={personForm.photo_file ?? ""}
          onChange={(e) => upf("photo_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={personForm.remark ?? ""}
          onChange={(e) => upf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}

export default function PersonAddTab({
  personForm,
  upf,
  roles,
  setRoles,
  subTab,
  setSubTab,
}) {
  const legalScopes = useRoleScopes();

  return (
    <div>
      {/* The sub-tab preselects the type a new person is being added as; the
          form below still shows every type, because one person may hold
          several. */}
      <PersonSubTabBar
        active={subTab}
        onSelect={(key) => {
          setSubTab(key);
          const legal = legalScopes[key] || [];
          if (!(roles || []).some((r) => r.role === key) && legal.length) {
            setRoles([...(roles || []), { role: key, scope: legal[0] }]);
          }
        }}
      />
      <PersonFields
        personForm={personForm}
        upf={upf}
        roles={roles}
        setRoles={setRoles}
        legalScopes={legalScopes}
      />
    </div>
  );
}
