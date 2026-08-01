// Builds the form patch applied when an admin auto-fills from an existing entry.
//
// Replaces six near-duplicate applyXAutofill functions that used to live in
// Add.jsx, each with its own hardcoded field list. The list now comes from the
// field registry (or the admin's configuration on /defaults), and the three
// special cases those functions had are preserved here.

import { getFieldMap } from "../config/formFields";
import { getDisplayName } from "./naming";

/**
 * @param source     the existing entry the admin picked
 * @param type       media type slug
 * @param fieldKeys  which fields to copy (from autofillFields())
 * @param ctx        { allFranchises, allSeries } for resolving entity names,
 *                   plus { defaults } for fields that fall back rather than blank
 * @returns a partial form object to spread over current form state
 */
export function buildAutofillPatch(source, type, fieldKeys, ctx = {}) {
  const { allFranchises = [], allSeries = [], defaults = {} } = ctx;
  const byKey = getFieldMap(type);
  const patch = {};

  for (const key of fieldKeys) {
    const meta = byKey[key];
    if (!meta || meta.autofillable === false) continue;

    // Entity pickers carry a display-name partner field that has to be
    // resolved alongside the id, or the ComboBox shows an empty box.
    if (meta.lookup === "franchise") {
      const f = allFranchises.find((x) => x.system_id === source.franchise_id);
      patch.franchise_id = source.franchise_id || null;
      patch.franchise_text = f ? getDisplayName(f, "franchise") : "";
      continue;
    }
    if (meta.lookup === "series") {
      const s = allSeries.find((x) => x.system_id === source.series_id);
      patch.series_id = source.series_id || null;
      patch.series_text = s ? getDisplayName(s, "series") : "";
      continue;
    }

    const value = source[key];

    // The DB stores a real boolean; the form's Yes/No select stores a string.
    if (meta.coerce === "tristate") {
      patch[key] = value === true ? "true" : value === false ? "false" : "";
      continue;
    }
    if (typeof meta.builtIn === "boolean") {
      patch[key] = Boolean(value);
      continue;
    }
    if (Array.isArray(meta.builtIn)) {
      patch[key] = Array.isArray(value) ? value : [];
      continue;
    }
    // Most fields blank out when the source has no value. A few are marked to
    // fall back to the configured default instead, so auto-filling from an
    // entry with a gap doesn't wipe a deliberate default.
    if (!value && meta.autofillFallback === "default") {
      patch[key] = defaults[key] ?? "";
      continue;
    }
    patch[key] = value || "";
  }

  return patch;
}
