// How the /options page arranges the Tier 1 closed enums.
//
// /api/constants hands back one flat map of ~26 keys, and alphabetical order
// scatters the ones an admin reads together: anime_airing_type sits three
// screens above cartoon_airing_type, the three region lists never meet. The
// groups below are presentation only - nothing in the data says two enums are
// related, and no business logic reads this file.
//
// A group is a heading plus the keys it claims, in the order they should be
// read (not alphabetically: anime before cartoon, the media types in the
// registry's own order). Keys the endpoint does not serve are skipped, so a
// removed enum shrinks its group instead of printing a blank card.

/** Group definitions, in the order they appear on the page. */
export const TIER1_GROUPS = [
  {
    title: "Airing Type",
    keys: ["anime_airing_type", "cartoon_airing_type"],
  },
  {
    title: "Entry Type",
    keys: ["movie_type", "novel_type", "comic_type"],
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
    ],
  },
  {
    title: "My Progress",
    keys: ["watching_status", "reading_status"],
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

/** The heading the leftovers live under. */
export const UNGROUPED_TITLE = "Other";

/**
 * Arrange the served enum keys into the sections the page renders.
 *
 * Returns `[{ title, keys }]` in display order: every group that claimed at
 * least two of the served keys, then one `Other` section holding the rest in
 * alphabetical order. Two is the threshold because a group of one is not a
 * group - it is a heading that says the same thing as the card under it, and
 * it reads better among the leftovers.
 *
 * Every served key comes back exactly once, so the section index and the
 * cards can never disagree about what exists.
 */
export function groupTier1Keys(keys) {
  const remaining = new Set(keys);
  const sections = [];

  for (const group of TIER1_GROUPS) {
    const present = group.keys.filter((key) => remaining.has(key));
    if (present.length < 2) continue;
    present.forEach((key) => remaining.delete(key));
    sections.push({ title: group.title, keys: present });
  }

  const leftovers = [...remaining].sort();
  if (leftovers.length > 0) {
    sections.push({ title: UNGROUPED_TITLE, keys: leftovers });
  }
  return sections;
}
