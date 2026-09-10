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
//   requires the permission a viewer must hold to see this one row, for the
//            admin-only pages that sit inside a tab everyone may open
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
          {
            label: "Publisher",
            icon: "fas fa-copyright",
            to: "/library/publisher",
            matches: ["/publisher"],
          },
          {
            label: "Person",
            icon: "fas fa-user",
            to: "/library/person",
            matches: ["/person"],
          },
          {
            label: "Character",
            icon: "fas fa-masks-theater",
            to: "/library/character",
            matches: ["/character"],
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
          {
            label: "Game",
            icon: "fas fa-gamepad",
            to: "/library/game",
            matches: ["/game"],
          },
          {
            label: "Seiyuu",
            icon: "fas fa-microphone",
            to: "/library/seiyuu",
          },
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
      // Plan and Seasonal are per-user pages: their APIs answer 401 to a
      // stranger and their routes redirect to login (App.jsx, ProtectedRoute
      // requireAuth), so showing the rows logged out would only bounce people.
      // self.list is the nav's spelling of "a signed-in member" - the guest
      // role does not hold it and both user and admin do, which is why the
      // Settings row below is gated the same way.
      { label: "Plan", icon: "fas fa-clipboard-list", to: "/plan", requires: "self.list" },
      { label: "Seasonal", icon: "fas fa-leaf", to: "/seasonal", requires: "self.list" },
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
      // Per-user, like Plan and Seasonal above: the page is built from the
      // caller's own seasonal rows.
      { label: "Statistics", icon: "fas fa-chart-bar", to: "/statistics", requires: "self.list" },
      { label: "Quotes", icon: "fas fa-quote-left", to: "/quote" },
      { label: "Memes", icon: "fas fa-face-grin-squint", to: "/meme" },
      // Relations and Watch Orders are ways of reading the collection, so they
      // belong here rather than in Admin — but only an admin may open them, so
      // the rows (and the rule above them) carry their own permission.
      { divider: true, requires: "admin" },
      {
        label: "Relations",
        icon: "fas fa-diagram-project",
        to: "/relations",
        requires: "admin",
      },
      {
        label: "Watch Orders",
        icon: "fas fa-list-ol",
        to: "/watch-orders",
        requires: "admin",
      },
      // The account's own settings. Not in Admin: that whole section is
      // requires: "admin", and this is the one page a member who is not an
      // administrator has of their own.
      { divider: true, requires: "self.list" },
      {
        label: "Settings",
        icon: "fas fa-sliders-h",
        to: "/settings",
        requires: "self.list",
      },
    ],
  },
  {
    key: "entry",
    label: "Entry",
    requires: "admin",
    items: [
      { label: "Add Entry", icon: "fas fa-plus-circle", to: "/add" },
      { label: "Modify Entry", icon: "fas fa-edit", to: "/modify" },
      { label: "Delete Entry", icon: "fas fa-trash-alt", to: "/delete" },
      { label: "Form Defaults", icon: "fas fa-sliders-h", to: "/defaults" },
    ],
  },
  {
    key: "note",
    label: "Note",
    requires: "admin",
    // The three read-only inventories of how the data is described: the
    // vocabulary, its translations, and which columns each external API
    // writes. Editing lives on Add/Modify under System.
    items: [
      {
        label: "System Options",
        icon: "fas fa-list-check",
        to: "/options",
      },
      {
        label: "Alias Conversion",
        icon: "fas fa-right-left",
        to: "/aliases",
      },
      {
        label: "External APIs",
        icon: "fas fa-cloud-arrow-down",
        to: "/external-apis",
      },
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
      { divider: true },
      { label: "Users", icon: "fas fa-users", to: "/users" },
      { label: "Roles", icon: "fas fa-user-shield", to: "/roles" },
      {
        label: "Content Labels",
        icon: "fas fa-tags",
        to: "/content-labels",
      },
    ],
  },
];

// Every link in a section, whether it came from `items` or from `columns`.
export function sectionItems(section) {
  return section.columns
    ? section.columns.flatMap((c) => c.items)
    : (section.items ?? []);
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

// The permission a single row needs, or null when anyone may see it.
export function itemRequirement(item) {
  return item.requires ?? (item.adminOnly ? "admin" : null);
}

// The rows of one list a viewer may see.
export function visibleItems(items, has) {
  return items.filter((item) => {
    const needed = itemRequirement(item);
    return !needed || has(needed);
  });
}

// The same section with the rows this viewer may not see removed. Returns the
// section itself when nothing was dropped, and always hands back the original
// item objects — Nav marks the current row by identity.
function withVisibleItems(section, has) {
  if (section.columns) {
    const columns = section.columns
      .map((col) => ({ ...col, items: visibleItems(col.items, has) }))
      .filter((col) => col.items.length > 0);
    const kept = columns.reduce((n, col) => n + col.items.length, 0);
    return kept === sectionItems(section).length
      ? section
      : { ...section, columns };
  }
  if (!section.items) return section;
  const items = visibleItems(section.items, has);
  return items.length === section.items.length ? section : { ...section, items };
}

// The sections a viewer may see, each trimmed to the rows they may see. A
// section left with nothing but dividers is dropped along with them.
export function visibleSections(sections, has) {
  return sections
    .filter((section) => {
      const needed = sectionRequirement(section);
      return !needed || has(needed);
    })
    .map((section) => withVisibleItems(section, has))
    .filter(
      (section) =>
        !(section.items || section.columns) ||
        sectionItems(section).some((item) => !item.divider),
    );
}
