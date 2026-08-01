// Builds the per-media-type field registry that drives the /defaults page and
// the generic auto-fill helper.
//
// Field keys come from the form factories, never from hand-written lists, so a
// key can't be mistyped and a newly added form field shows up here on its own.
// fieldMeta.js only supplies presentation metadata.

import { FORM_FACTORIES } from "../formFactories";
import {
  BUILTIN_AUTOFILL,
  COMMON_FIELD_META,
  GROUP_ORDER,
  TYPE_FIELD_META,
} from "./fieldMeta";

export { BUILTIN_AUTOFILL, GROUP_ORDER };

/** "ep_total" -> "Ep Total", "mal_id" -> "Mal Id". */
export function humanize(key) {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Picks a control for a field with no metadata, based on its blank value. */
export function inferControl(builtIn) {
  if (typeof builtIn === "boolean") return "checkbox";
  if (Array.isArray(builtIn)) return "none";
  if (builtIn === null) return "none";
  return "text";
}

const registryCache = new Map();

/**
 * Returns the visible, configurable fields for a media type, in factory order.
 * Each entry: { key, label, control, options?, optionsCategory?, group,
 *               builtIn, defaultable, autofillable, lookup?, coerce? }
 */
export function getFieldRegistry(type) {
  if (registryCache.has(type)) return registryCache.get(type);

  const factory = FORM_FACTORIES[type];
  if (!factory) {
    if (import.meta.env?.DEV) {
      console.warn(`[formFields] No form factory for media type "${type}".`);
    }
    return [];
  }

  const shape = factory();
  const typeMeta = TYPE_FIELD_META[type] || {};

  if (import.meta.env?.DEV) {
    for (const key of Object.keys(typeMeta)) {
      if (!(key in shape)) {
        console.warn(
          `[formFields] "${type}" metadata references "${key}", which no longer exists in the form factory.`,
        );
      }
    }
  }

  const fields = Object.entries(shape)
    .map(([key, builtIn]) => {
      const meta = { ...COMMON_FIELD_META[key], ...typeMeta[key] };
      return {
        ...meta,
        key,
        builtIn,
        label: meta.label ?? humanize(key),
        control: meta.control ?? inferControl(builtIn),
        group: meta.group ?? "Other",
        defaultable: meta.defaultable ?? true,
        autofillable: meta.autofillable ?? true,
      };
    })
    .filter((f) => !f.hidden);

  registryCache.set(type, fields);
  return fields;
}

/** Same registry, indexed by field key. */
export function getFieldMap(type) {
  return Object.fromEntries(getFieldRegistry(type).map((f) => [f.key, f]));
}

/** Registry fields bucketed into GROUP_ORDER sections, empty groups dropped. */
export function getFieldGroups(type) {
  const fields = getFieldRegistry(type);
  const seen = [...new Set(fields.map((f) => f.group))];
  const ordered = [
    ...GROUP_ORDER.filter((g) => seen.includes(g)),
    ...seen.filter((g) => !GROUP_ORDER.includes(g)),
  ];
  return ordered.map((group) => ({
    group,
    fields: fields.filter((f) => f.group === group),
  }));
}
