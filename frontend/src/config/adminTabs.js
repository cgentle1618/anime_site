// The media-type tabs shown on the admin Add / Modify / Delete / Form Defaults
// pages. Shared so the pages can't drift out of sync.
//
// Tabs are split into two groups so the selector can be rendered as a
// two-level bar (pick a group, then a tab within it) instead of one long
// horizontally-scrolling row.

export const TAB_GROUPS = [
  { key: "entries", icon: "fa-photo-film", label: "Entries" },
  { key: "structure", icon: "fa-sitemap", label: "Structure" },
];

export const ADMIN_TABS = [
  { key: "anime", group: "entries", icon: "fa-tv", label: "Anime Entry" },
  {
    key: "anime-movie",
    group: "entries",
    icon: "fa-film",
    label: "Anime Movie",
  },
  { key: "movie", group: "entries", icon: "fa-ticket-alt", label: "Movie" },
  { key: "tv-show", group: "entries", icon: "fa-video", label: "TV Show" },
  {
    key: "cartoon",
    group: "entries",
    icon: "fa-paint-brush",
    label: "Cartoon",
  },
  { key: "manga", group: "entries", icon: "fa-book", label: "Manga Entry" },
  {
    key: "novel",
    group: "entries",
    icon: "fa-book-open",
    label: "Novel Entry",
  },
  {
    key: "collection",
    group: "structure",
    icon: "fa-boxes-stacked",
    label: "Collection",
  },
  {
    key: "franchise",
    group: "structure",
    icon: "fa-sitemap",
    label: "Franchise",
  },
  {
    key: "series",
    group: "structure",
    icon: "fa-layer-group",
    label: "Series",
  },
  {
    key: "quote",
    group: "structure",
    icon: "fa-quote-left",
    label: "Quote",
  },
  {
    key: "options",
    group: "structure",
    icon: "fa-cog",
    label: "System Option",
  },
];

/**
 * Tabs backed by a form factory — everything but System Options and Quote.
 * Neither is a media entry, so neither has default field values to edit.
 */
export const FORM_TABS = ADMIN_TABS.filter(
  (t) => t.key !== "options" && t.key !== "quote",
);

/** The Fav 3x3 grid editor — only the Modify page offers it. */
export const FAV3X3_TAB = {
  key: "fav3x3",
  group: "structure",
  icon: "fa-th",
  label: "Fav 3×3",
};

/** The group key a tab belongs to, falling back to the first group. */
export function groupOf(tabs, tabKey) {
  return tabs.find((t) => t.key === tabKey)?.group ?? TAB_GROUPS[0].key;
}
