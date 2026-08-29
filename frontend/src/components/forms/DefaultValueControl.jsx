// Renders the editor for one field's default value on the /defaults page.
//
// The control shape comes from the field registry, so it matches what the Add
// form itself uses: a select for enum fields, the tag picker for fields backed
// by a /api/options category, a checkbox for flags, and a plain input otherwise.
//
// `value === undefined` means "not overridden" — the control shows the built-in
// value as placeholder/ghost text rather than as a real value, so an admin can
// see at a glance which fields they've actually configured.

import MultiSelect from "./MultiSelect";
import { inputCls, selectCls } from "./FormField";
import { getSourceValues } from "../../lib/formatters";

const INPUT_TYPES = {
  number: "number",
  date: "date",
  time: "time",
  url: "url",
  text: "text",
};

/** Normalizes a registry `options` entry to {value, label} pairs. */
function toPairs(options = []) {
  return options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

/** Human-readable rendering of a built-in value, for ghost text. */
export function describeBuiltIn(field) {
  const { builtIn, control } = field;
  if (control === "checkbox") return builtIn ? "Checked" : "Unchecked";
  if (builtIn === "" || builtIn == null) return "empty";
  if (Array.isArray(builtIn)) return builtIn.length ? String(builtIn) : "empty";
  return String(builtIn);
}

export default function DefaultValueControl({
  field,
  value,
  onChange,
  sources = {},
}) {
  const isOverridden = value !== undefined;
  const ghost = describeBuiltIn(field);

  if (!field.defaultable || field.control === "none") {
    return (
      <span className="text-xs text-gray-400 italic">
        No default for this field
      </span>
    );
  }

  if (field.control === "checkbox") {
    const checked = isOverridden ? Boolean(value) : Boolean(field.builtIn);
    return (
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded accent-brand"
        />
        <span className={isOverridden ? "text-gray-700" : "text-gray-400"}>
          {checked ? "Checked" : "Unchecked"}
          {!isOverridden && " (built-in)"}
        </span>
      </label>
    );
  }

  if (field.control === "select") {
    return (
      <select
        className={selectCls}
        value={isOverridden ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— built-in: {ghost} —</option>
        {toPairs(field.options).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.control === "tags") {
    // Tag fields store a comma-separated string, same as the Add form.
    const options = field.source
      ? getSourceValues(sources, field.source)
      : (field.options ?? []);
    return (
      <MultiSelect
        options={options}
        value={isOverridden ? value : ""}
        onChange={onChange}
        placeholder={`built-in: ${ghost}`}
      />
    );
  }

  if (field.control === "textarea") {
    return (
      <textarea
        className={inputCls}
        rows={2}
        value={isOverridden ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`built-in: ${ghost}`}
      />
    );
  }

  return (
    <input
      className={inputCls}
      type={INPUT_TYPES[field.control] || "text"}
      value={isOverridden ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`built-in: ${ghost}`}
    />
  );
}
