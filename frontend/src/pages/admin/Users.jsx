// Frontend: accounts and the role each one holds.
//
// There is no self-registration: accounts are created here. The server refuses
// to let you delete yourself or demote the last account that can still
// administer the site, and those refusals surface as toasts rather than being
// pre-empted here - one rule, enforced in one place.
import { useCallback, useEffect, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

const BLANK = { username: "", password: "", role_id: "" };

export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ role_id: "", password: "" });

  const load = useCallback(async () => {
    try {
      const [userRows, roleRows] = await Promise.all([
        fetchJson(endpoints.users.list()),
        fetchJson(endpoints.roles.list()),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setDraft((d) => ({ ...d, role_id: d.role_id || roleRows[0]?.system_id || "" }));
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    try {
      await fetchJson(endpoints.users.create(), {
        method: "POST",
        ...jsonBody(draft),
      });
      showToast("success", `Created ${draft.username}.`);
      setDraft({ ...BLANK, role_id: roles[0]?.system_id ?? "" });
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function saveEdit(user) {
    const payload = {};
    if (editDraft.role_id && editDraft.role_id !== user.role_id)
      payload.role_id = editDraft.role_id;
    if (editDraft.password) payload.password = editDraft.password;
    if (Object.keys(payload).length === 0) {
      setEditingId(null);
      return;
    }
    try {
      await fetchJson(endpoints.users.update(user.id), {
        method: "PATCH",
        ...jsonBody(payload),
      });
      showToast("success", `Updated ${user.username}.`);
      setEditingId(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function remove(user) {
    try {
      await fetchJson(endpoints.users.remove(user.id), { method: "DELETE" });
      showToast("success", `Deleted ${user.username}.`);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading users...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-users mr-2 text-brand"></i>Users
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Accounts you create by hand. Anyone without one browses as Guest.
        </p>
      </header>

      <form
        onSubmit={create}
        className="border border-border rounded-lg p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <label className="text-xs font-semibold text-text-muted">
          Username
          <input
            required
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Password
          <input
            required
            type="password"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Role
          <select
            value={draft.role_id}
            onChange={(e) => setDraft({ ...draft, role_id: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          >
            {roles.map((role) => (
              <option key={role.system_id} value={role.system_id}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand text-on-brand rounded px-4 py-2 text-sm font-semibold"
        >
          Add user
        </button>
      </form>

      <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface-2 text-xs uppercase text-text-faint">
          <tr>
            <th className="text-left px-4 py-2">Username</th>
            <th className="text-left px-4 py-2">Role</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{user.username}</td>
              <td className="px-4 py-2">
                {editingId === user.id ? (
                  <div className="flex flex-col gap-2">
                    <select
                      value={editDraft.role_id}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, role_id: e.target.value })
                      }
                      className="border rounded px-2 py-1 text-xs"
                    >
                      {roles.map((role) => (
                        <option key={role.system_id} value={role.system_id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="password"
                      placeholder="New password (optional)"
                      value={editDraft.password}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, password: e.target.value })
                      }
                      className="border rounded px-2 py-1 text-xs"
                    />
                  </div>
                ) : (
                  <span className="text-text-muted">{user.role_name}</span>
                )}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {editingId === user.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(user)}
                      className="text-brand font-semibold text-xs mr-3"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-text-faint text-xs"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(user.id);
                        setEditDraft({
                          role_id: user.role_id ?? roles[0]?.system_id ?? "",
                          password: "",
                        });
                      }}
                      className="text-brand text-xs mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(user)}
                      className="text-danger text-xs"
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
