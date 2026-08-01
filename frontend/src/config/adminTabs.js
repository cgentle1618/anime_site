// The media-type tabs shown on the admin Add / Modify / Form Defaults pages.
// Shared so the three pages can't drift out of sync; each page supplies its own
// verb prefix for the label.

export const ADMIN_TABS = [
  { key: "anime", icon: "fa-tv", label: "Anime Entry" },
  { key: "anime-movie", icon: "fa-film", label: "Anime Movie" },
  { key: "movie", icon: "fa-ticket-alt", label: "Movie" },
  { key: "tv-show", icon: "fa-video", label: "TV Show" },
  { key: "cartoon", icon: "fa-paint-brush", label: "Cartoon" },
  { key: "manga", icon: "fa-book", label: "Manga Entry" },
  { key: "novel", icon: "fa-book-open", label: "Novel Entry" },
  { key: "franchise", icon: "fa-sitemap", label: "Franchise" },
  { key: "series", icon: "fa-layer-group", label: "Series" },
  { key: "options", icon: "fa-cog", label: "System Option" },
];

/** Tabs backed by a form factory — everything but System Options. */
export const FORM_TABS = ADMIN_TABS.filter((t) => t.key !== "options");

/** Prefixes each label with a verb, e.g. withVerb("Add") -> "Add Anime Entry". */
export function withVerb(tabs, verb) {
  return tabs.map((t) => ({ ...t, label: `${verb} ${t.label}` }));
}
