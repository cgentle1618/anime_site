// How the admin Add / Modify / Delete pages split one flat list of Tier 2
// categories across their "Tags" and "Options" sub-tabs.
//
// The split is navigational only: both sub-tabs are the same form over the
// same system_option rows, and nothing in the data or the API marks a
// category as a tag. TAG_CATEGORIES (from GET /api/constants via
// fieldOptions.js) is the whole rule, so all three pages agree on which
// side a category falls without any of them listing category names.

import { TAG_CATEGORIES } from "../config/fieldOptions";

/** Is this category offered under the Tags sub-tab? */
export function isTagCategory(category) {
  return TAG_CATEGORIES.includes(category);
}

/**
 * The categories a sub-tab offers, in the order given.
 *
 * `subTab` is "tags" or "options"; any other value (People, Studios) has no
 * category picker at all, so it gets an empty list rather than everything.
 */
export function categoriesForSubTab(categories, subTab) {
  if (subTab === "tags") return categories.filter(isTagCategory);
  if (subTab === "options") return categories.filter((c) => !isTagCategory(c));
  return [];
}
