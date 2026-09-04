// Frontend: the primary navigation tree, as data.
//
// Both the desktop tab strip and the mobile drawer render from this file, so a
// nav change is a one-place edit. Nothing here knows about styling.
//
// Item shape:
//   label    text shown to the reader
//   icon     Font Awesome class
//   to       route the item links to
//   matches  extra path prefixes that also count as "inside" this item, so a
//            detail page (/anime/123) lights up the library tab it belongs to
//   dev      true for placeholders that route to /under-development
//   divider  true for a rule between item groups (admin menu only)
//
// Sections either carry `items` (a single list) or `columns` (a mega-panel).

export const NAV_SECTIONS = [
  {
    key: "library",
    label: "Library",
    columns: [
      {
        heading: "Groups",
        items: [
          {
            label: "Collection",
            icon: "fas fa-boxes-stacked",
            to: "/library/collection",
            matches: ["/collection"],
          },
          {
            label: "Franchise",
            icon: "fas fa-layer-group",
            to: "/library/franchise",
            matches: ["/franchise", "/series", "/watch-order"],
          },
        ],
      },
      {
        heading: "Entities",
        items: [
          {
            label: "Studio",
            icon: "fas fa-building",
            to: "/library/studio",
            matches: ["/studio"],
          },
        ],
      },
      {
        heading: "ACG",
        items: [
          {
            label: "Anime",
            icon: "fas fa-tv",
            to: "/library/anime",
            matches: ["/anime"],
          },
          {
            label: "Anime Movie",
            icon: "fas fa-film",
            to: "/library/anime-movie",
            matches: ["/anime-movie"],
          },
          {
            label: "Manga",
            icon: "fas fa-book",
            to: "/library/manga",
            matches: ["/manga"],
          },
          {
            label: "Novel",
            icon: "fas fa-book-open",
            to: "/library/novel",
            matches: ["/novel"],
          },
          { label: "Seiyuu", icon: "fas fa-microphone", dev: true },
        ],
      },
      {
        heading: "Reality",
        items: [
          {
            label: "TV Show",
            icon: "fas fa-video",
            to: "/library/tv-show",
            matches: ["/tv-show"],
          },
          {
            label: "Movie",
            icon: "fas fa-ticket-alt",
            to: "/library/movie",
            matches: ["/movie"],
          },
          {
            label: "Cartoon",
            icon: "fas fa-laugh-squint",
            to: "/library/cartoon",
            matches: ["/cartoon"],
          },
          {
            label: "Comic",
            icon: "fas fa-book-open",
            to: "/library/comic",
            matches: ["/comic"],
          },
        ],
      },
    ],
  },
  {
    key: "track",
    label: "Track",
    items: [
      { label: "Plan", icon: "fas fa-clipboard-list", to: "/plan" },
      { label: "Seasonal", icon: "fas fa-leaf", to: "/seasonal" },
      {
        label: "Future Releases",
        icon: "fas fa-calendar-plus",
        to: "/future-releases",
      },
      { label: "Completions", icon: "fas fa-history", to: "/completions" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    items: [
      { label: "Statistics", icon: "fas fa-chart-bar", to: "/statistics" },
      { label: "Quotes", icon: "fas fa-quote-left", to: "/quote" },
      { label: "Memes", icon: "fas fa-face-grin-squint", to: "/meme" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    // The permission a viewer must hold to see this tab at all. `adminOnly`
    // is still read as a synonym for requires: "admin".
    requires: "admin",
    items: [
      { label: "Control Center", icon: "fas fa-cog", to: "/system" },
      { label: "Data History", icon: "fas fa-history", to: "/data-history" },
      { label: "Review Queue", icon: "fas fa-tasks", to: "/review-queue" },
      {
        label: "System Options",
        icon: "fas fa-list-check",
        to: "/options",
      },
      { divider: true },
      { label: "Add Entry", icon: "fas fa-plus-circle", to: "/add" },
      { label: "Modify Entry", icon: "fas fa-edit", to: "/modify" },
      { label: "Delete Entry", icon: "fas fa-trash-alt", to: "/delete" },
      { label: "Form Defaults", icon: "fas fa-sliders-h", to: "/defaults" },
      { divider: true },
      { label: "Relations", icon: "fas fa-diagram-project", to: "/relations" },
      { divider: true },
      { label: "Users", icon: "fas fa-users", to: "/users" },
      { label: "Roles", icon: "fas fa-user-shield", to: "/roles" },
      {
        label: "Content Labels",
        icon: "fas fa-tags",
        to: "/content-labels",
      },
      { label: "Watch Orders", icon: "fas fa-list-ol", to: "/watch-orders" },
    ],
  },
];

// Every link in a section, whether it came from `items` or from `columns`.
export function sectionItems(section) {
  return section.columns
    ? section.columns.flatMap((c) => c.items)
    : section.items;
}

// A prefix owns a path when it is the path itself or a parent segment of it.
// Segment-aware so "/library/anime" does not claim "/library/anime-movie".
function ownsPath(prefix, pathname) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Which item the current route sits under, or null when the route belongs to
// no section (home, login, search).
export function activeItem(pathname, sections = NAV_SECTIONS) {
  for (const section of sections) {
    for (const item of sectionItems(section)) {
      const prefixes = [item.to, ...(item.matches || [])].filter(Boolean);
      if (prefixes.some((p) => ownsPath(p, pathname))) return { section, item };
    }
  }
  return null;
}

// The tab to mark as current, or null on routes that own no tab.
export function activeSectionKey(pathname, sections = NAV_SECTIONS) {
  return activeItem(pathname, sections)?.section.key ?? null;
}

// The permission a section needs, or null when anyone may see it.
// `adminOnly: true` is the old spelling of requires: "admin".
export function sectionRequirement(section) {
  return section.requires ?? (section.adminOnly ? "admin" : null);
}

// The sections a viewer may see. `has` comes from useAuth().
export function visibleSections(sections, has) {
  return sections.filter((section) => {
    const needed = sectionRequirement(section);
    return !needed || has(needed);
  });
}
