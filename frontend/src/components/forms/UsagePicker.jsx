// Which roles a system option may be used in. Parallel to ScopePicker,
// which answers "in which media types"; this answers "in which role" -
// somewhere to watch a title (watch) vs. where it first appeared (origin).
//
// Like scopes, usages are ADMIN-MANAGED data, never derived on save (Ruling
// R27 applies here too): a value with none selected serves every usage,
// which is the common case.
import { Field } from "./FormField";

export const USAGES = ["watch", "origin"];

export default function UsagePicker({ usages, setUsages }) {
  const selected = new Set(usages || []);

  function toggle(key) {
    setUsages((prev) => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Keep the stored order stable and matching the USAGES order.
      return USAGES.filter((u) => next.has(u));
    });
  }

  return (
    <Field
      label="Usages"
      hint="Which roles this value is offered in. None selected = offered everywhere."
    >
      <div className="flex flex-wrap gap-1.5">
        {USAGES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${
              selected.has(key)
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-text-faint border-border hover:border-border-strong"
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </Field>
  );
}
