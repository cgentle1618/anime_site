// Frontend: the shared shell behind /quote and /meme.
//
// Both pages are the same thing with a different row: a header, a filter bar,
// then a card per media entry listing that entry's items. Only the row and the
// filter controls differ, so those are injected and everything else lives here.
import { Link } from "react-router-dom";

import MediaLoadingState from "./MediaLoadingState";
import { getCoverUrl } from "../../lib/covers";
import { Chip, Eyebrow } from "../ui/primitives";

export const controlCls =
  "bg-surface border border-border-strong text-text text-xs px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand";

// Media type values as stored in the media_type column (hyphenated, matching
// watch_order_item and MEDIA_CONFIG).
// The grouping tiers have no cover, so their header shows a spine label
// naming the tier instead. Kept under the old name so callers need not change.
export const TIER_ICONS = {
  series: "Series",
  franchise: "Fran.",
  collection: "Coll.",
};

export const MEDIA_TYPE_FILTERS = [
  { value: "", label: "All media" },
  { value: "anime", label: "Anime" },
  { value: "anime-movie", label: "Anime Movie" },
  { value: "movie", label: "Movie" },
  { value: "tv-show", label: "TV Show" },
  { value: "cartoon", label: "Cartoon" },
  { value: "manga", label: "Manga" },
  { value: "novel", label: "Novel" },
  { value: "comic", label: "Comic" },
];

// A tag on a row. Colour never names a category, so every tone but `brand`
// (the one thing a page points at) collapses to ink; the prop is kept so
// callers keep working.
export function Pill({ children, tone = "gray" }) {
  return <Chip tone={tone === "brand" ? "brand" : "ink"}>{children}</Chip>;
}

export function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1.5 border font-mono text-[10px] uppercase tracking-[0.12em] transition ${
        active
          ? "bg-brand text-on-brand border-brand"
          : "bg-surface border-border-strong text-text-muted hover:border-text hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * @param icon          Accepted for compatibility; the header no longer shows one
 * @param title         Page title
 * @param subtitle      Muted line under the title
 * @param filters       JSX for the filter bar (rendered inside the flex row)
 * @param groups        The /grouped payload
 * @param itemsKey      Which array on a group holds the items ("quotes"/"memes")
 * @param noun          Singular noun for counts and empty state
 * @param renderRow     (item) => JSX for one row
 */
export default function GroupedEntryPage({
  icon: _icon,
  title,
  subtitle,
  filters,
  groups = [],
  isLoading,
  error,
  itemsKey,
  noun,
  renderRow,
}) {
  const itemsOf = (group) => group[itemsKey] || [];
  const total = groups.reduce((n, g) => n + itemsOf(g).length, 0);
  const plural = (n) => (n === 1 ? noun : `${noun}s`);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-text leading-none">
          {title}
        </h1>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </header>

      {/* Filter bar: a flat strip on the canvas */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
        {filters}
      </div>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText={`Loading ${noun}s...`}
          errorTitle={`Error loading ${noun}s.`}
        />
      ) : (
        <>
          <Eyebrow>
            {total} {plural(total)} across {groups.length} entr
            {groups.length === 1 ? "y" : "ies"}
          </Eyebrow>

          {!groups.length && (
            <div className="border border-dashed border-border-strong px-4 py-8 text-center">
              <p className="text-sm text-text-faint">
                No {noun}s match these filters. Clear a filter to see more.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {groups.map((group) => {
              // Quote groups carry entry_*, meme groups owner_* — a meme's
              // owner may be a tier, so it cannot be called an entry.
              const ownerType = group.owner_type ?? group.media_type;
              const ownerId = group.owner_id ?? group.entry_id;
              const name = group.owner_display_name ?? group.entry_display_name;
              const navPath = group.owner_nav_path ?? group.entry_nav_path;
              const isTier = !!group.owner_is_tier;
              const count = itemsOf(group).length;

              return (
              <div
                key={`${ownerType}-${ownerId}`}
                className="bg-surface border border-border overflow-hidden"
              >
                {/* Owner header */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  {group.missing ? (
                    <>
                      <div className="w-9 h-12 bg-surface-2 border border-dashed border-border-strong shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-text-faint">
                          Unlinked or deleted owner
                        </p>
                        <p className="font-mono text-[10px] text-text-faint truncate">
                          {ownerType} · {ownerId}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {isTier ? (
                        // Tiers have no cover column — a franchise's cover is
                        // derived from its entries on the frontend, which is
                        // more work than a group header is worth.
                        <div className="w-9 h-12 bg-ink text-ink-text flex items-center justify-center shrink-0">
                          <span
                            className="font-mono text-[9px] uppercase tracking-[0.16em] whitespace-nowrap"
                            style={{ writingMode: "vertical-rl" }}
                          >
                            {TIER_ICONS[ownerType] || "Group"}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={getCoverUrl(group.cover_image_file)}
                          alt=""
                          className="w-9 h-12 object-cover shrink-0 border border-border"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {navPath ? (
                            <Link
                              to={navPath}
                              className="font-display text-base font-semibold text-text hover:text-brand truncate"
                            >
                              {name}
                            </Link>
                          ) : (
                            // Series has no page of its own.
                            <span className="font-display text-base font-semibold text-text truncate">
                              {name}
                            </span>
                          )}
                          {group.owner_label && isTier && (
                            <Pill tone="brand">{group.owner_label}</Pill>
                          )}
                        </div>
                        <Eyebrow>
                          {count} {plural(count)}
                        </Eyebrow>
                      </div>
                    </>
                  )}
                </div>

                <div className="p-3 space-y-2">
                  {itemsOf(group).map((item) => renderRow(item))}
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
