// Frontend: define which ENTRIES and FIELDS each access mode can reach.
//
// A role answers "what may this account do"; an access mode answers "which
// objects can it reach in this session". This page edits the second. It is
// shaped on Roles.jsx deliberately - two pages doing the same shape of job
// should read the same way - with two differences that are not cosmetic:
//
//   1. There is NOTHING here about logged-out visitors. They always resolve
//      to `safe`, which is what that mode means rather than something an
//      administrator picks, so the page offers no control over it and the
//      server has no column to store one. `safe`'s own description says so.
//
//   2. A content label carried by NO mode is called out in red. Such a label
//      hides its entries from everyone - the owner included - and looks like
//      the entry was deleted, since a hidden entry deliberately 404s. It
//      should now be unreachable: `unrestricted` carries every label that
//      exists, derived rather than stored, and its boxes are therefore drawn
//      disabled with no Save. The warning stays as the last check on that
//      invariant, because nothing else on the page would show it breaking.
//
// Items are saved as a whole set, like a role's permissions: unticking a box
// means "not this", which an append-only save could not express.
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

const GROUP_ICONS = {
  label: "fa-tags",
  field_group: "fa-table-columns",
};

// Mirrors app/services/rbac/seed_modes.py. The widest mode's sets are derived
// server-side, so this page shows them and does not offer to edit them.
const MODE_UNRESTRICTED = "unrestricted";

/**
 * Content labels that no access mode carries.
 *
 * Such a label hides its entries from EVERYONE - the owner included - and is
 * invisible anywhere else in the app: the entries simply 404, which reads as
 * a deletion rather than as a policy. `unrestricted` now carries every label
 * by derivation, so this should never fire; it stays because the cost is a
 * set comparison and the failure it catches is silent data loss in
 * appearance if not in fact.
 *
 * The selected mode is counted from the DRAFT rather than from the saved row,
 * so the warning appears the moment you untick the last mode carrying a label
 * - while it can still be reconsidered - rather than after a save and a
 * reload, by which time it is a record instead of a warning.
 *
 * Exported for its tests: this is the one piece of logic on the page that can
 * be wrong in a way nobody would notice.
 */
export function homelessLabelKeys(catalog, modes, selectedId, draftLabels) {
  const out = new Set();
  const labelGroup = catalog.find((g) => g.group === "label");
  for (const item of labelGroup?.items ?? []) {
    const carriedElsewhere = modes.some(
      (m) => m.system_id !== selectedId && m.label_keys.includes(item.key),
    );
    if (!carriedElsewhere && !draftLabels.has(item.key)) out.add(item.key);
  }
  return out;
}


export default function AccessModes() {
  const { showToast } = useToast();
  const [modes, setModes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draftLabels, setDraftLabels] = useState(new Set());
  const [draftGroups, setDraftGroups] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newMode, setNewMode] = useState({ key: "", label: "" });

  const load = useCallback(async () => {
    try {
      const [modeRows, catalogRows] = await Promise.all([
        fetchJson(endpoints.accessModes.list()),
        fetchJson(endpoints.accessModes.catalog()),
      ]);
      setModes(modeRows);
      setCatalog(catalogRows);
      setSelectedId((current) => current ?? modeRows[0]?.system_id ?? null);
    } catch (err) {
      showToast(err.message || "Could not load access modes.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => modes.find((m) => m.system_id === selectedId) ?? null,
    [modes, selectedId],
  );

  // The one mode whose sets are DERIVED rather than stored: it carries every
  // label that exists and every field group the code declares, so a tick box
  // on it could only ever lie. The server answers 409 to PUT /grants for it;
  // this is the first of the two stops, not the only one.
  const locked = selected?.key === MODE_UNRESTRICTED;

  useEffect(() => {
    setDraftLabels(new Set(selected?.label_keys ?? []));
    setDraftGroups(new Set(selected?.field_group_keys ?? []));
  }, [selected]);

  const homelessLabels = useMemo(
    () => homelessLabelKeys(catalog, modes, selectedId, draftLabels),
    [catalog, modes, selectedId, draftLabels],
  );

  function toggle(group, key) {
    const setter = group === "label" ? setDraftLabels : setDraftGroups;
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetchJson(endpoints.accessModes.grants(selected.system_id), {
        method: "PUT",
        ...jsonBody({
          label_keys: [...draftLabels],
          field_group_keys: [...draftGroups],
        }),
      });
      showToast(`Saved ${selected.label}.`, "success");
      await load();
    } catch (err) {
      showToast(err.message || "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function createMode(e) {
    e.preventDefault();
    try {
      const created = await fetchJson(endpoints.accessModes.create(), {
        method: "POST",
        ...jsonBody({ ...newMode, label_keys: [], field_group_keys: [] }),
      });
      setCreating(false);
      setNewMode({ key: "", label: "" });
      await load();
      setSelectedId(created.system_id);
    } catch (err) {
      showToast(err.message || "Could not create the access mode.", "error");
    }
  }

  async function removeMode(mode) {
    try {
      await fetchJson(endpoints.accessModes.remove(mode.system_id), {
        method: "DELETE",
      });
      setSelectedId(null);
      await load();
    } catch (err) {
      showToast(err.message || "Could not delete the access mode.", "error");
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading access modes...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-eye-slash mr-2 text-brand"></i>Access Modes
        </h1>
        <p className="text-sm text-text-faint mt-1">
          A mode decides which <strong>entries</strong> and which{" "}
          <strong>fields</strong> a session can reach. It never grants a
          permission — what an account may <em>do</em> is its role.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-2">
          {modes.map((mode) => (
            <div key={mode.system_id} className="space-y-1">
              <button
                onClick={() => setSelectedId(mode.system_id)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                  mode.system_id === selectedId
                    ? "border-brand bg-brand-soft font-semibold"
                    : "border-border hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{mode.label}</span>
                  {mode.is_system && (
                    <i
                      className="fas fa-lock text-[10px] text-text-faint"
                      title="Built in — cannot be deleted"
                    ></i>
                  )}
                </div>
                <div className="text-[11px] text-text-faint">
                  {mode.label_keys.length} label(s) ·{" "}
                  {mode.field_group_keys.length} field group(s)
                  {mode.user_count > 0 && ` · ${mode.user_count} account(s)`}
                </div>
              </button>
              {/* Nothing here about logged-out visitors. They always get
                  `safe`, which is the definition of that mode rather than a
                  choice — so there is no control, and repeating the sentence
                  under every row said otherwise four times over. */}
            </div>
          ))}

          {creating ? (
            <form
              onSubmit={createMode}
              className="border border-border rounded-lg p-3 space-y-2"
            >
              <input
                required
                value={newMode.key}
                onChange={(e) => setNewMode({ ...newMode, key: e.target.value })}
                placeholder="key (e.g. curated)"
                className="w-full border border-border rounded px-2 py-1 text-xs bg-surface"
              />
              <input
                required
                value={newMode.label}
                onChange={(e) =>
                  setNewMode({ ...newMode, label: e.target.value })
                }
                placeholder="Display name"
                className="w-full border border-border rounded px-2 py-1 text-xs bg-surface"
              />
              <div className="flex gap-2">
                <button type="submit" className="text-xs text-brand">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="text-xs text-text-faint"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-border text-xs text-text-faint hover:bg-surface-2"
            >
              <i className="fas fa-plus mr-1"></i>New access mode
            </button>
          )}
        </aside>

        <section>
          {!selected ? (
            <p className="text-sm text-text-faint">
              Select an access mode to edit what it carries.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text">
                    {selected.label}
                  </h2>
                  {selected.description && (
                    <p className="text-xs text-text-faint">
                      {selected.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!locked && (
                    <button
                      onClick={save}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  )}
                  {!selected.is_system && (
                    <button
                      onClick={() => removeMode(selected)}
                      className="text-danger text-xs"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {locked && (
                <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
                  <i className="fas fa-lock mr-2 text-text-faint"></i>
                  This mode carries every label and every field group by
                  definition, including any added later, so its grants are not
                  editable. Narrow a different mode instead.
                </p>
              )}

              {catalog.map((group) => (
                <div key={group.group} className="mb-6">
                  <h3 className="text-sm font-semibold text-text mb-2">
                    <i
                      className={`fas ${GROUP_ICONS[group.group] ?? "fa-list"} mr-2 text-text-faint`}
                    ></i>
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const draft =
                        group.group === "label" ? draftLabels : draftGroups;
                      const homeless =
                        group.group === "label" && homelessLabels.has(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm ${
                            locked ? "cursor-default" : "cursor-pointer"
                          } ${
                            homeless
                              ? "border-danger bg-danger-soft"
                              : "border-border hover:bg-surface-2"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={draft.has(item.key)}
                            disabled={locked}
                            onChange={() => toggle(group.group, item.key)}
                          />
                          <span>
                            <span className="font-medium text-text">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="block text-[11px] text-text-faint">
                                {item.description}
                              </span>
                            )}
                            {homeless && (
                              <span className="block text-[11px] text-danger mt-1">
                                Carried by no mode — entries with this label are
                                hidden from everyone, including you.
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
