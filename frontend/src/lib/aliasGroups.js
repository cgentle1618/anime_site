// Inverts the options list into the shape the /aliases page reads.
//
// GET /api/options/ answers the question the pickers ask — "what values does
// this category offer?" — with the aliases hanging off each value. The alias
// page asks the opposite one: "IGDB just said 'Role-playing (RPG)'; what does
// that become?" So the rows are turned inside out here, source first, and the
// external string becomes the key rather than the payload.
//
// The unaliased values are carried alongside deliberately. They are the whole
// point of looking at this page: a category that IGDB fills, holding a value
// IGDB can never produce, is a gap someone has to close by hand — and it is
// invisible from the options side, where a value with no aliases looks exactly
// like a value in a category no API touches.

/**
 * Group every alias row by source, then by the category it belongs to.
 *
 * Returns
 *   [{ source, total, categories: [{
 *        category,
 *        rows: [{ external, value, scopes }],   // sorted by external name
 *        unaliased: [value, ...],               // values in this category
 *      }] }]                                    // with no row for this source
 *
 * Categories are only listed under a source if at least one of their values
 * carries a row for it — otherwise every category in the database would appear
 * under "igdb" with all its values unaliased, which says nothing.
 */
export function groupAliasesBySource(options) {
  const bySource = new Map();

  for (const option of options || []) {
    for (const alias of option.aliases || []) {
      if (!bySource.has(alias.source)) bySource.set(alias.source, new Map());
      const categories = bySource.get(alias.source);
      if (!categories.has(option.category)) {
        categories.set(option.category, { rows: [], aliased: new Set() });
      }
      const bucket = categories.get(option.category);
      bucket.rows.push({
        external: alias.value,
        value: option.value,
        scopes: option.scopes || [],
      });
      bucket.aliased.add(option.value);
    }
  }

  const collator = new Intl.Collator("en", { sensitivity: "base" });

  return [...bySource.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([source, categories]) => ({
      source,
      total: [...categories.values()].reduce((n, b) => n + b.rows.length, 0),
      categories: [...categories.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([category, bucket]) => ({
          category,
          rows: bucket.rows.sort((a, b) =>
            collator.compare(a.external, b.external),
          ),
          unaliased: (options || [])
            .filter(
              (o) => o.category === category && !bucket.aliased.has(o.value),
            )
            .map((o) => o.value),
        })),
    }));
}
