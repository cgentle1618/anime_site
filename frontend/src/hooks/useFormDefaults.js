// Resolves admin-configured form defaults (GET /api/form-defaults/) against the
// built-in factory values.
//
// The stored config is a SPARSE per-field override map, so the factories in
// config/formFactories.js remain the baseline: if nothing is configured, or the
// fetch fails, every form behaves exactly as it did before this feature existed.
//
// This module is also the sanitization layer. The backend validates only the
// shape of what it stores — it deliberately does not mirror the ~280 field
// names, since that would guarantee drift. Instead, stored keys that no longer
// exist in a factory are dropped here, and values are coerced to match the
// factory value's type before they ever reach form state.

import { FORM_FACTORIES } from "../config/formFactories";
import { BUILTIN_AUTOFILL } from "../config/formFields";
import { endpoints } from "../api/endpoints";

/** Forces a stored value into the shape the form state expects. */
export function coerceToShape(builtIn, value) {
  if (typeof builtIn === "boolean") return Boolean(value);
  // Arrays back repeater editors ({name,url} rows, per-volume titles). These
  // aren't defaultable, so anything stored for them is ignored.
  if (Array.isArray(builtIn)) return Array.isArray(value) ? value : [];
  // null marks a foreign-key field — never given a default.
  if (builtIn === null) return null;
  return value == null ? "" : String(value);
}

/**
 * Builds a blank form for `type`, with any configured overrides applied.
 * `config` is the keyed map returned by GET /api/form-defaults/ (or {}).
 */
export function resolveDefaults(type, config) {
  const factory = FORM_FACTORIES[type];
  if (!factory) return {};

  const base = factory();
  const stored = config?.[type]?.defaults;
  if (!stored) return base;

  const resolved = { ...base };
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in base)) continue; // stale key from a removed form field
    resolved[key] = coerceToShape(base[key], value);
  }
  return resolved;
}

/**
 * The field keys auto-fill should copy for `type`.
 * A configured [] genuinely means "copy nothing"; only null/absent falls back.
 */
export function autofillFields(type, config) {
  return config?.[type]?.autofill ?? BUILTIN_AUTOFILL[type] ?? [];
}

/**
 * Loads the whole form-defaults config. Never throws — an unreachable or
 * failing endpoint resolves to {}, which means "use the built-ins".
 */
export async function fetchFormDefaults() {
  try {
    const res = await fetch(endpoints.formDefaults.list(), {
      credentials: "include",
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
