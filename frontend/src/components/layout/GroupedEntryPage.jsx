// Frontend: the shared shell behind /quote and /meme.
//
// Both pages are the same thing with a different row: a header, a filter bar,
// then a card per media entry listing that entry's items. Only the row and the
// filter controls differ, so those are injected and everything else lives here.
import { Link } from "react-router-dom";

import MediaLoadingState from "./MediaLoadingState";
import { getCoverUrl } from "../../lib/covers";

export const controlCls =
  "bg-surface border border-border text-text-muted rounded-lg text-xs font-medium px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30";

// Media type values as stored in the media_type column (hyphenated, matching
// watch_order_item and MEDIA_CONFIG).
// The grouping tiers have no cover, so their header shows an icon instead.
export const TIER_ICONS = {
  series: "fa-layer-group",
  franchise: "fa-sitemap",
  collection: "fa-boxes-stacked",
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

export function Pill({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-surface-2 text-text-muted",
    brand: "bg-brand/10 text-brand",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-brand/10 text-brand"
          : "bg-surface border border-border text-text-faint hover:text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * @param icon          Font Awesome class for the header tile
 * @param title         Page title
 * @param subtitle      Muted line under the title
 * @param filters       JSX for the filter bar (rendered inside the flex row)
 * @param groups        The /grouped payload
 * @param itemsKey      Which array on a group holds the items ("quotes"/"memes")
 * @param noun          Singular noun for counts and empty state
 * @param renderRow     (item) => JSX for one row
 */
export default function GroupedEntryPage({
  icon,
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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className={`fas ${icon} text-brand text-lg`}></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-text tracking-tight leading-none">
            {title}
          </h1>
          <p className="text-xs text-text-faint font-medium mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">{filters}</div>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText={`Loading ${noun}s...`}
          errorTitle={`Error loading ${noun}s.`}
        />
      ) : (
        <>
          <p className="text-xs text-text-faint font-medium">
            {total} {plural(total)} across {groups.length} entr
            {groups.length === 1 ? "y" : "ies"}
          </p>

          {!groups.length && (
            <div className="bg-surface rounded-xl border border-border shadow-sm p-8 text-center">
              <p className="text-sm text-text-faint italic">
                No {noun}s match these filters.
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
                className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden"
              >
                {/* Owner header */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  {group.missing ? (
                    <>
                      <div className="w-9 h-12 rounded bg-surface-2 flex items-center justify-center shrink-0">
                        <i className="fas fa-unlink text-text-faint/60 text-xs" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-text-faint italic">
                          Unlinked / deleted owner
                        </p>
                        <p className="text-[10px] text-text-faint/60 font-mono truncate">
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
                        <div className="w-9 h-12 rounded bg-brand-soft flex items-center justify-center shrink-0 border border-brand/10">
                          <i
                            className={`fas ${TIER_ICONS[ownerType] || "fa-layer-group"} text-brand/60 text-sm`}
                          />
                        </div>
                      ) : (
                        <img
                          src={getCoverUrl(group.cover_image_file)}
                          alt=""
                          className="w-9 h-12 rounded object-cover shrink-0 border border-border"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {navPath ? (
                            <Link
                              to={navPath}
                              className="text-sm font-bold text-text hover:text-brand truncate"
                            >
                              {name}
                            </Link>
                          ) : (
                            // Series has no page of its own.
                            <span className="text-sm font-bold text-text truncate">
                              {name}
                            </span>
                          )}
                          {group.owner_label && isTier && (
                            <Pill tone="brand">{group.owner_label}</Pill>
                          )}
                        </div>
                        <p className="text-[10px] text-text-faint font-medium">
                          {count} {plural(count)}
                        </p>
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
