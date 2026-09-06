// Attach external-source names to an existing system option.
//
// Shared by the admin Add and Modify pages, because on both it is the same
// operation. An alias row has no endpoint of its own — system_option_alias is
// written only by the option's own PUT, which replaces the whole alias list —
// so "add an alias" and "edit an alias" are one form over one request. The
// Delete page removes a single row the same way, through optionWithoutAlias.
//
// The body sends the option's scopes, usages, sort_order and remark back
// unchanged. It has to: the PUT replaces the scope and usage rows wholesale
// too, so a body carrying only the aliases would quietly unscope the value and
// drop it out of every dropdown.
import { useMemo, useState } from "react";

import { endpoints } from "../../api/endpoints";
import AliasPicker, {
  ALIAS_CATEGORIES,
  cleanAliases,
} from "./AliasPicker";
import { Field, SectionHeader, inputCls } from "./FormField";

// A module-level constant, not a fresh [] per render: `rows` feeds two
// useMemo dependency lists, and a new array each time would rebuild both on
// every keystroke.
const NO_OPTIONS = [];

export default function AliasTab({ options, onSaved, showToast }) {
  const [category, setCategory] = useState("");
  const [optionId, setOptionId] = useState("");
  const [aliases, setAliases] = useState([]);
  const [saving, setSaving] = useState(false);

  const rows = options || NO_OPTIONS;

  // Not every category the database holds — only the ones a pipeline reads.
  // Listed in ALIAS_CATEGORIES order rather than alphabetically, and filtered
  // to those that actually have values, so a category defined in code but not
  // yet seeded does not offer an empty value list.
  const categories = useMemo(() => {
    const present = new Set(rows.map((o) => o.category));
    return ALIAS_CATEGORIES.filter((c) => present.has(c));
  }, [rows]);
  const valuesInCategory = useMemo(
    () => rows.filter((o) => o.category === category),
    [rows, category],
  );
  const selected = rows.find((o) => o.system_id === optionId) || null;

  function chooseOption(id) {
    setOptionId(id);
    // Re-seed rather than keep what was on screen: carrying the previous
    // option's rows over would let them be saved onto a different value.
    const option = rows.find((o) => o.system_id === id);
    setAliases(option?.aliases ?? []);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(endpoints.options.update(selected.system_id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selected.category,
          value: selected.value,
          sort_order: selected.sort_order ?? 0,
          remark: selected.remark ?? null,
          scopes: selected.scopes ?? [],
          usages: selected.usages ?? [],
          aliases: cleanAliases(aliases),
        }),
        credentials: "include",
      });
      if (!res.ok) {
        showToast?.("error", "Failed to save aliases.");
        return;
      }
      const updated = await res.json();
      // Show what was actually stored: the server drops blank rows and
      // duplicate pairs, and rejects an unknown source outright.
      setAliases(updated.aliases ?? []);
      showToast?.("success", `Aliases saved for "${updated.value}".`);
      onSaved?.(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <SectionHeader icon="fa-right-left" title="Alias" />
      <p className="text-xs text-text-muted mb-4">
        What an external API calls a vocabulary value. Fill resolves the API&rsquo;s
        English through these rows on the way in; a term with no row is logged
        and skipped, never stored raw.
      </p>
      <p className="text-xs text-text-faint mb-4">
        Only {ALIAS_CATEGORIES.join(", ")} carry aliases. Opening another
        category means teaching a pipeline to read it, so the list lives in
        code (<span className="font-mono">ALIAS_CATEGORIES</span>), not here.
      </p>

      <div className="space-y-4">
        <Field label="Category" required>
          <select
            className={inputCls}
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              chooseOption("");
            }}
          >
            <option value="">Select a category…</option>

            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Option Value" required>
          <select
            className={inputCls}
            aria-label="Option value"
            value={optionId}
            disabled={!category}
            onChange={(e) => chooseOption(e.target.value)}
          >
            <option value="">Select a value…</option>
            {valuesInCategory.map((o) => (
              <option key={o.system_id} value={o.system_id}>
                {o.value}
              </option>
            ))}
          </select>
        </Field>

        {selected && <AliasPicker aliases={aliases} setAliases={setAliases} />}

        <button
          type="button"
          onClick={save}
          disabled={!selected || saving}
          className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover disabled:opacity-40 disabled:hover:bg-brand transition"
        >
          {saving ? "Saving…" : "Save Aliases"}
        </button>
      </div>
    </div>
  );
}
