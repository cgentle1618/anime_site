// How the /options page arranges its choice lists — the Tier 1 closed enums
// and the Tier 2 open vocabularies both.
//
// Each tier arrives as one flat list whose natural order scatters the entries
// an admin reads together: alphabetically anime_airing_type sits three screens
// above cartoon_airing_type, and the five Comic vocabularies are split by
// Franchise for Filter. The groups below are presentation only - nothing in
// the data says two lists are related, and no business logic reads this file.
//
// A group is a heading plus the entries it claims, in the order they should be
// read (not alphabetically: anime before cartoon, the media types in the
// registry's own order). Entries the page was not handed are skipped, so a
// removed enum or an emptied category shrinks its group instead of printing a
// blank card.

/** Tier 1 group definitions, in the order they appear on the page. */
export const TIER1_GROUPS = [
  // One group, not an "Airing Type" one beside it: anime_airing_type and
  // cartoon_airing_type answer the same question the other five do - what kind
  // of work is this entry - and reading them apart made the answer look like
  // two different things.
  {
    title: "Entry Type",
    keys: [
      "anime_airing_type",
      "cartoon_airing_type",
      "movie_type",
      "novel_type",
      "comic_type",
      "game_type",
    ],
  },
  {
    title: "Region",
    keys: ["tv_region", "manga_region", "novel_region"],
  },
  {
    title: "Publication Status",
    keys: [
      "airing_status",
      "manga_serialization_status",
      "novel_serialization_status",
      "game_release_status",
    ],
  },
  {
    title: "My Progress",
    keys: ["watching_status", "reading_status", "playing_status"],
  },
  // What is left of the game lists once the ones that answer a question the
  // other media types also answer have gone to their own groups: game_type to
  // Entry Type, game_release_status to Publication Status, playing_status to
  // My Progress. These four describe a game_copy - a specific copy an admin
  // owns - plus how deep a finish went, and nothing else in the app has them.
  {
    title: "Game",
    keys: [
      "completion_level",
      "game_storefront",
      "game_ownership",
      "game_copy_format",
      "game_acquisition",
    ],
  },
  {
    title: "Production Status",
    keys: ["music_status", "seiyuu_status"],
  },
  {
    title: "Franchise",
    keys: ["franchise_type", "franchise_expectation"],
  },
  {
    title: "Internal Keys",
    keys: ["media_type", "person_role", "option_categories", "tag_categories"],
  },
];

// Tier 2 group definitions, in the order they appear on the page. Category
// names are the strings in system_option.category, spelled exactly as
// OPTION_CATEGORIES builds them in app/utils/credit_roles.py - a rename there
// drops the category into Other rather than hiding it.
//
// Listed rather than derived. "Tags" holds the same four categories as
// TAG_CATEGORIES today, but that list answers a different question (which
// sub-tab of Add/Modify edits a category, see optionCategoryGroups.js) and the
// two are free to diverge.
//
// Two categories left this list on 2026-09-07: "Publisher / Distributor TW"
// (which sat under Source & Platform) and "Comic Publisher" (which sat with
// the other Comic vocabularies). Neither is a vocabulary any more - a
// publisher is an entity edited on the Publisher tab, not a system_option
// value edited here.
export const TIER2_GROUPS = [
  {
    title: "Tags",
    categories: ["Genre Main", "Genre Sub", "Label", "Quality"],
  },
  {
    title: "Game",
    categories: [
      "Game Genre",
      "Game Theme",
      "Game Mode",
      "Combat Mode",
      "Game Platform",
    ],
  },
  {
    title: "Comic",
    categories: [
      "Comic Imprint",
      "Comic Continuity",
      "Comic Era",
      "Comic Event",
    ],
  },
  {
    title: "Source & Platform",
    categories: [
      "Platform",
      "Serialization Platform",
      "Reference Source",
    ],
  },
];

/** The heading the leftovers live under. */
export const UNGROUPED_TITLE = "Other";

/**
 * Arrange `names` into sections, following `groups`.
 *
 * Every group that claims at least two of the given names becomes a section
 * holding them in the group's own order, then one `Other` section holds the
 * rest alphabetically. Two is the threshold because a group of one is not a
 * group - it is a heading that says the same thing as the card under it, and
 * it reads better among the leftovers.
 *
 * Every name comes back exactly once, so a section index and the content it
 * indexes can never disagree about what exists.
 */
function arrange(names, groups) {
  const remaining = new Set(names);
  const sections = [];

  for (const group of groups) {
    const present = group.members.filter((name) => remaining.has(name));
    if (present.length < 2) continue;
    present.forEach((name) => remaining.delete(name));
    sections.push({ title: group.title, members: present });
  }

  const leftovers = [...remaining].sort();
  if (leftovers.length > 0) {
    sections.push({ title: UNGROUPED_TITLE, members: leftovers });
  }
  return sections;
}

/**
 * Arrange the served enum keys into the sections Tier 1 renders.
 *
 * Returns `[{ title, keys }]` in display order. See `arrange`.
 */
export function groupTier1Keys(keys) {
  const groups = TIER1_GROUPS.map((g) => ({
    title: g.title,
    members: g.keys,
  }));
  return arrange(keys, groups).map((s) => ({
    title: s.title,
    keys: s.members,
  }));
}

/**
 * Arrange the categories the database holds rows for into the sections Tier 2
 * renders.
 *
 * Returns `[{ title, categories }]` in display order. See `arrange`.
 */
export function groupTier2Categories(categories) {
  const groups = TIER2_GROUPS.map((g) => ({
    title: g.title,
    members: g.categories,
  }));
  return arrange(categories, groups).map((s) => ({
    title: s.title,
    categories: s.members,
  }));
}
