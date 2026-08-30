// Frontend: the content-label vocabulary.
//
// A label is a reason an entry might be restricted - "nsfw", "spoiler". It
// never names a role; a role holds `label.<key>` and sees through it. That is
// why adding a role touches no entries and labelling an entry touches no roles.
//
// A new label is granted to nobody, so it hides its entries from everyone
// except administrators the moment it is applied. Go to Roles to open it up.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

const BLANK = { key: "", label: "", description: "", sort_order: 0 };

export default function ContentLabels() {
  const { showToast } = useToast();
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(BLANK);

  const load = useCallback(async () => {
    try {
      setLabels(await fetchJson(endpoints.contentLabels.list()));
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
      await fetchJson(endpoints.contentLabels.create(), {
        method: "POST",
        ...jsonBody(draft),
      });
      showToast("success", `Created ${draft.label}.`);
      setDraft(BLANK);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function remove(row) {
    try {
      await fetchJson(endpoints.contentLabels.remove(row.system_id), {
        method: "DELETE",
      });
      showToast("success", `Deleted ${row.label}. Its entries are visible again.`);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading labels...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-tags mr-2 text-brand"></i>Content Labels
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Mark an entry with a label and it disappears for anyone whose role does
          not hold that label. Grant it in{" "}
          <Link to="/roles" className="text-brand underline">
            Roles
          </Link>
          . Apply it to an entry on the Add or Modify page.
        </p>
      </header>

      <form
        onSubmit={create}
        className="border border-border rounded-lg p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <label className="text-xs font-semibold text-text-muted">
          Key
          <input
            required
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            placeholder="nsfw"
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Display name
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="NSFW"
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Description
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <button
          type="submit"
          className="bg-brand text-white rounded px-4 py-2 text-sm font-semibold"
        >
          Add label
        </button>
      </form>

      {labels.length === 0 ? (
        <p className="text-sm text-text-faint italic">
          No labels yet, so nothing is hidden from anyone.
        </p>
      ) : (
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-surface-2 text-xs uppercase text-text-faint">
            <tr>
              <th className="text-left px-4 py-2">Label</th>
              <th className="text-left px-4 py-2">Permission</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((row) => (
              <tr key={row.system_id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2">
                  <code className="text-[11px] bg-surface-2 rounded px-1.5 py-0.5">
                    {row.permission}
                  </code>
                </td>
                <td className="px-4 py-2 text-text-muted">{row.description}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => remove(row)}
                    className="text-red-600 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
