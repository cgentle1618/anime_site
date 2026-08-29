// Frontend: define what each level of access may see.
//
// The permission grid is built from GET /api/roles/catalog rather than from a
// list kept here, so the checkboxes cannot drift from what the server will
// accept - a new content label or field group appears on this page without a
// frontend change.
//
// Grants are saved as a whole set. Unticking a box means "not this", which an
// append-only save could not express.
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

const FAMILY_ICONS = {
  admin: "fa-shield-halved",
  media_type: "fa-photo-film",
  field_group: "fa-table-columns",
  label: "fa-tags",
};

export default function Roles() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", label: "" });

  const load = useCallback(async () => {
    try {
      const [roleRows, catalogRows] = await Promise.all([
        fetchJson(endpoints.roles.list()),
        fetchJson(endpoints.roles.catalog()),
      ]);
      setRoles(roleRows);
      setCatalog(catalogRows);
      setSelectedId((current) => current ?? roleRows[0]?.system_id ?? null);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => roles.find((r) => r.system_id === selectedId) ?? null,
    [roles, selectedId],
  );

  // Reset the draft whenever a different role is picked.
  useEffect(() => {
    setDraft(new Set(selected?.permissions ?? []));
  }, [selected]);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const held = new Set(selected.permissions);
    if (held.size !== draft.size) return true;
    for (const p of draft) if (!held.has(p)) return true;
    return false;
  }, [selected, draft]);

  function toggle(permission) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetchJson(endpoints.roles.permissions(selected.system_id), {
        method: "PUT",
        ...jsonBody({ permissions: [...draft] }),
      });
      showToast("success", `Saved ${selected.label}.`);
      await load();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createRole(e) {
    e.preventDefault();
    try {
      await fetchJson(endpoints.roles.create(), {
        method: "POST",
        ...jsonBody({ ...newRole, permissions: [] }),
      });
      showToast("success", `Created ${newRole.label}.`);
      setNewRole({ name: "", label: "" });
      setCreating(false);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function removeRole(role) {
    try {
      await fetchJson(endpoints.roles.remove(role.system_id), {
        method: "DELETE",
      });
      showToast("success", `Deleted ${role.label}.`);
      setSelectedId(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading roles...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          <i className="fas fa-user-shield mr-2 text-brand"></i>Roles
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          A role is a named bundle of permissions. Everyone who is not logged in
          is <strong>Guest</strong>. Narrow access by removing permissions, not
          by adding them.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        {/* Role list */}
        <aside className="space-y-2">
          {roles.map((role) => (
            <button
              key={role.system_id}
              onClick={() => setSelectedId(role.system_id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                role.system_id === selectedId
                  ? "border-brand bg-brand/5 font-semibold"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{role.label}</span>
                {role.is_system && (
                  <i
                    className="fas fa-lock text-[10px] text-gray-400"
                    title="Built in - cannot be renamed or deleted"
                  ></i>
                )}
              </div>
              <div className="text-[11px] text-gray-500">
                {role.is_superuser
                  ? "all permissions"
                  : `${role.permissions.length} permission(s)`}
                {role.user_count > 0 && ` · ${role.user_count} user(s)`}
              </div>
            </button>
          ))}

          {creating ? (
            <form
              onSubmit={createRole}
              className="border border-gray-200 rounded-lg p-3 space-y-2"
            >
              <input
                required
                value={newRole.name}
                onChange={(e) =>
                  setNewRole({ ...newRole, name: e.target.value })
                }
                placeholder="key (e.g. friend)"
                className="w-full border rounded px-2 py-1 text-xs"
              />
              <input
                required
                value={newRole.label}
                onChange={(e) =>
                  setNewRole({ ...newRole, label: e.target.value })
                }
                placeholder="Display name"
                className="w-full border rounded px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-brand text-white rounded px-2 py-1 text-xs font-semibold"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-2 py-1 text-xs text-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              <i className="fas fa-plus mr-1"></i>New role
            </button>
          )}
        </aside>

        {/* Permission grid */}
        <section>
          {!selected ? (
            <p className="text-gray-500 text-sm">Pick a role.</p>
          ) : selected.is_superuser ? (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
              <strong>{selected.label}</strong> is a superuser role: it holds
              every permission implicitly, including ones that do not exist yet.
              That is why creating a new content label never hides anything from
              an administrator.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">
                    {selected.label}
                  </h2>
                  <p className="text-xs text-gray-500">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  {!selected.is_system && selected.user_count === 0 && (
                    <button
                      onClick={() => removeRole(selected)}
                      className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={save}
                    disabled={!dirty || saving}
                    className="px-4 py-1.5 text-xs font-semibold rounded bg-brand text-white disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {catalog.map((family) => (
                  <div
                    key={family.family}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <h3 className="text-sm font-bold text-gray-700 mb-3">
                      <i
                        className={`fas ${FAMILY_ICONS[family.family] ?? "fa-key"} mr-2 text-gray-400`}
                      ></i>
                      {family.label}
                    </h3>
                    {family.permissions.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        None defined yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {family.permissions.map((p) => (
                          <label
                            key={p.permission}
                            className="flex items-start gap-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={draft.has(p.permission)}
                              onChange={() => toggle(p.permission)}
                            />
                            <span>
                              <span className="font-medium">{p.label}</span>
                              {p.description && (
                                <span className="block text-[11px] text-gray-500">
                                  {p.description}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
