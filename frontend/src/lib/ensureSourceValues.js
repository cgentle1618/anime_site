// Shared logic for auto-creating the person/studio/option rows a user typed
// into a "tags" field that don't exist in `sources` yet — routed by
// source.kind rather than always POSTing a system option, since a director
// is an entity with a profile and a genre is a vocabulary value. Used by
// both Add.jsx and Modify.jsx, which differ only in what they do with the
// refreshed sources bag afterward (both re-fetch via fetchAllSources()).
import { endpoints } from "../api/endpoints";
import { getSourceValues } from "./formatters";

/**
 * Pure: given [{source, values}] (one entry per tags field on the form) and
 * the current sources bag, returns the {source, value} pairs that are not
 * already present for that source — i.e. what still needs to be created.
 */
export function computeMissingSourceValues(fields, sources) {
  const toCreate = [];
  for (const { source, values } of fields || []) {
    const existing = new Set(getSourceValues(sources, source));
    for (const v of values || []) {
      if (v && !existing.has(v)) toCreate.push({ source, value: v });
    }
  }
  return toCreate;
}

/**
 * Builds the [url, init] fetch() arguments for creating one missing value,
 * dispatched on source.kind. A person is created with the role AND scope
 * the field asked for — get that wrong and the person exists but never
 * appears in the dropdown that just "created" it.
 *
 * The scope is passed through verbatim rather than defaulted to null: every
 * person_role row is scoped now, and POST /api/person rejects a role whose
 * scope is not one of that role's legal media types. A descriptor without a
 * scope is a bug in fieldMeta.js, and a 422 naming the role is a better
 * outcome than a person quietly minted outside every dropdown.
 */
export function buildCreateRequest(source, value) {
  if (source.kind === "studio") {
    return [
      endpoints.studio.create(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_en: value }),
        credentials: "include",
      },
    ];
  }
  if (source.kind === "person") {
    return [
      endpoints.person.create(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_native: value,
          roles: [{ role: source.role, scope: source.scope }],
        }),
        credentials: "include",
      },
    ];
  }
  // source.kind === "option"
  return [
    endpoints.options.create(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: source.category,
        value,
        scopes: source.scope ? [source.scope] : [],
      }),
      credentials: "include",
    },
  ];
}

/**
 * Creates every {source, value} pair from `fields` that doesn't already
 * exist in `sources`. Does not refresh `sources` itself — callers re-fetch
 * (fetchAllSources()) afterward and update their own state with the result.
 */
export async function ensureSourceValues(fields, sources, fetchImpl = fetch) {
  const toCreate = computeMissingSourceValues(fields, sources);
  if (toCreate.length === 0) return;
  await Promise.all(
    toCreate.map(({ source, value }) => {
      const [url, init] = buildCreateRequest(source, value);
      return fetchImpl(url, init);
    }),
  );
}
