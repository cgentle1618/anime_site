// Frontend: read-only renderer for one watch order's steps.
//
// Used in two places at two densities: compact inside the Franchise/Collection
// page tab, roomy on the standalone /watch-order/:id page. Guests see it too,
// so nothing here writes.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ADMIN_TABS } from "../../config/adminTabs";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { getCardStatusConfig } from "../../lib/status";

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
};

// Types a step always covers whole, so an admin is never offered a from/to.
// A movie is one sitting; manga and novels are stepped through as a unit here
// rather than by chapter. Anything not listed - including a null media_type -
// keeps the inputs, so an unrecognised type loses no control.
const WHOLE_ONLY_TYPES = new Set(["movie", "anime-movie", "manga", "novel"]);

export const supportsEpisodeRange = (mediaType) =>
  !WHOLE_ONLY_TYPES.has(mediaType);

// The unit a step's from/to pair is counted in. Manga and novels store chapter
// numbers, a comic run stores issue numbers, and everything else stores
// episodes. An unlisted or null type falls back to "Ep", matching the label
// those steps have always carried.
const RANGE_UNITS = { manga: "Ch", novel: "Ch", comic: "#" };

/** "Ep 1-10", "Ep 5", "Ch 1-40", "# 1-12" — or nothing when the step is the whole entry. */
function rangeLabel(item) {
  if (item.ep_start == null && item.ep_end == null) return null;
  const unit = RANGE_UNITS[item.media_type] || "Ep";
  if (item.ep_start != null && item.ep_end != null) {
    return item.ep_start === item.ep_end
      ? `${unit} ${item.ep_start}`
      : `${unit} ${item.ep_start}-${item.ep_end}`;
  }
  return item.ep_start != null
    ? `${unit} ${item.ep_start}+`
    : `${unit} up to ${item.ep_end}`;
}

/**
 * Describes an order's scope from the media types its steps use.
 *
 * `short` is for tight spots (a <select> option, a list subtitle); `full`
 * names the types and is used where there is room. Returns null for an empty
 * order, which has no scope to describe yet.
 */
// Icons come from the admin tab registry rather than a second hand-kept map,
// so a media type looks the same here as everywhere else in the app.
const TYPE_ICONS = Object.fromEntries(ADMIN_TABS.map((t) => [t.key, t.icon]));

export function mediaScope(mediaTypes) {
  const types = mediaTypes || [];
  if (types.length === 0) return null;

  const chips = types.map((t) => ({
    slug: t,
    label: TYPE_LABELS[t] || t,
    icon: TYPE_ICONS[t] || "fa-circle",
  }));

  if (types.length === 1) {
    return {
      cross: false,
      icon: chips[0].icon,
      short: `${chips[0].label} only`,
      full: `${chips[0].label} only`,
      chips,
    };
  }
  return {
    cross: true,
    // Reads as "several stacked types"; exists in both FontAwesome 5 and 6,
    // which this project mixes.
    icon: "fa-layer-group",
    short: "Cross-type",
    full: `Cross-type · ${chips.map((c) => c.label).join(" · ")}`,
    chips,
  };
}

/**
 * The scope rendered as its own line, meant to sit directly above an order's
 * title so it reads before the name rather than competing with the other
 * badges below it.
 */
export function MediaScopeLine({ mediaTypes, className = "", short = false }) {
  const scope = mediaScope(mediaTypes);
  if (!scope) return null;

  const tone = scope.cross ? "text-sky-600" : "text-gray-500";

  // Compact form for a row subtitle, where the per-type chips would not fit.
  if (short) {
    return (
      <span
        className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wide ${tone} ${className}`}
      >
        <i className={`fas ${scope.icon}`}></i>
        {scope.short}
      </span>
    );
  }

  return (
    <p
      className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest ${tone} ${className}`}
    >
      <i className={`fas ${scope.icon}`}></i>
      {scope.cross ? (
        <>
          Cross-type
          <span className="text-gray-300">·</span>
          {scope.chips.map((c) => (
            <span key={c.slug} className="flex items-center gap-1 text-gray-500">
              <i className={`fas ${c.icon} text-[10px]`}></i>
              {c.label}
            </span>
          ))}
        </>
      ) : (
        scope.full
      )}
    </p>
  );
}

/**
 * "Ep. Special 0", "Ep. Special 14.5" — the episode number a special sits at,
 * not a count. 0 is a real value, so this tests for null rather than falsiness.
 * Anime is the only type with the column.
 */
export function specialLabel(item) {
  if (item.ep_special == null) return null;
  return `Ep. Special ${item.ep_special}`;
}

/**
 * Folds a flat step list into the blocks a page draws: part boxes and the
 * loose runs between them.
 *
 * Parts do not sort the guide — reading order is the server's, and a part is
 * whichever run of *adjacent* steps shares a section_id. The backend keeps
 * those runs unbroken, so one part is always one box.
 *
 * Step numbers run 1..N across the whole guide, never restarting inside a
 * part: the reader counts steps, not steps-within-a-part.
 *
 * A step naming a part that is not in `sections` — a deleted part, or a
 * hand-edited Sheets restore pointing at another order's — falls into a loose
 * run rather than vanishing, so an admin can see it and fix it.
 *
 * `includeEmpty` adds a box for a part that holds no steps yet, placed by its
 * own `position` in the same stream as the items. The editor needs those (you
 * have to be able to drop the first step into a new part); the guide does not,
 * since an empty part has nothing to wrap.
 */
export function buildBlocks(items, sections, { includeEmpty = false } = {}) {
  const byId = new Map((sections || []).map((s) => [s.system_id, s]));
  const rows = items || [];

  const blocks = [];
  const filled = new Set();
  let number = 0;

  const push = (block) => {
    blocks.push(block);
    return block;
  };

  // Parts with no steps, in stream order, drained as the items pass them by.
  const empties = includeEmpty
    ? (sections || [])
        .filter((s) => !rows.some((i) => i.section_id === s.system_id))
        .sort(
          (a, b) =>
            (a.position ?? Number.MAX_SAFE_INTEGER) -
            (b.position ?? Number.MAX_SAFE_INTEGER)
        )
    : [];
  let nextEmpty = 0;

  for (const item of rows) {
    // An empty part sits wherever its position falls among the steps, which is
    // where the admin created it.
    while (
      nextEmpty < empties.length &&
      (empties[nextEmpty].position ?? Number.MAX_SAFE_INTEGER) <=
        (item.position ?? Number.MAX_SAFE_INTEGER)
    ) {
      const section = empties[nextEmpty++];
      filled.add(section.system_id);
      push({ kind: "part", key: `part-${section.system_id}`, section, rows: [] });
    }

    const section = item.section_id ? byId.get(item.section_id) : null;
    const last = blocks[blocks.length - 1];
    const row = { item, number: ++number };

    if (section) {
      if (last?.kind === "part" && last.section.system_id === section.system_id) {
        last.rows.push(row);
      } else {
        filled.add(section.system_id);
        push({
          kind: "part",
          key: `part-${section.system_id}`,
          section,
          rows: [row],
        });
      }
    } else if (last?.kind === "loose") {
      last.rows.push(row);
    } else {
      push({ kind: "loose", key: `loose-${blocks.length}`, rows: [row] });
    }
  }

  // Anything anchored past the last step, plus every empty part when the guide
  // has no steps at all.
  for (let i = nextEmpty; i < empties.length; i += 1) {
    const section = empties[i];
    if (filled.has(section.system_id)) continue;
    push({ kind: "part", key: `part-${section.system_id}`, section, rows: [] });
  }

  return blocks;
}

function entryPath(item) {
  const navPath = MEDIA_CONFIG[item.media_type]?.navPath;
  return navPath ? `${navPath}/${item.entry_id}` : null;
}

function StepRow({ item, index, roomy }) {
  const label = rangeLabel(item);
  const special = specialLabel(item);
  const path = entryPath(item);
  // getCardStatusConfig, not getStatusStyle: reading statuses ("Active
  // Reading", "Might Read") have no entry in the watching style map and would
  // all fall back to the same grey.
  const statusStyle = item.status
    ? getCardStatusConfig(item.media_type, item.status)
    : null;

  // A deleted entry leaves the step behind on purpose, so it stays visible and
  // can be removed rather than silently vanishing from the guide.
  if (item.missing) {
    return (
      <li className="flex items-center gap-3 py-3 px-3 rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <span className="w-7 h-7 shrink-0 rounded-full bg-gray-200 text-gray-500 text-xs font-black flex items-center justify-center">
          {index}
        </span>
        <i className="fas fa-triangle-exclamation text-gray-400"></i>
        <span className="text-sm font-medium text-gray-400">
          Entry no longer exists
        </span>
      </li>
    );
  }

  const body = (
    <>
      <span
        className={`shrink-0 rounded-full bg-brand/10 text-brand font-black flex items-center justify-center ${
          roomy ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs"
        }`}
      >
        {index}
      </span>

      <img
        src={getCoverUrl(item.cover_image_file)}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.src = FALLBACK_SVG;
        }}
        className={`shrink-0 rounded-lg object-cover bg-gray-100 ${
          roomy ? "w-14 h-20" : "w-10 h-14"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`font-bold text-gray-900 truncate ${
              roomy ? "text-base" : "text-sm"
            }`}
          >
            {item.display_name}
          </span>
          {label && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 whitespace-nowrap">
              {label}
            </span>
          )}
          {item.importance === "Essential" && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 whitespace-nowrap">
              Essential
            </span>
          )}
          {item.importance === "Recommended" && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200 whitespace-nowrap">
              Recommended
            </span>
          )}
          {item.importance === "Optional" && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
              Optional
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-[11px] font-bold text-gray-400">
            {TYPE_LABELS[item.media_type] || item.media_type}
          </span>
          {item.release_display && (
            <span className="text-[11px] font-medium text-gray-400">
              {item.release_display}
            </span>
          )}
          {item.total_episodes != null && (
            <span className="text-[11px] font-medium text-gray-400">
              {item.total_episodes} total
            </span>
          )}
          {special && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 whitespace-nowrap">
              {special}
            </span>
          )}
          {statusStyle && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusStyle.cls}`}
            >
              {item.status}
            </span>
          )}
        </div>

        {item.note && (
          <p
            className={`text-gray-500 font-medium mt-1 ${
              roomy ? "text-sm" : "text-xs"
            }`}
          >
            {item.note}
          </p>
        )}
      </div>
    </>
  );

  const rowClass = `flex items-center gap-3 rounded-xl border transition-colors ${
    roomy ? "py-3 px-4" : "py-2.5 px-3"
  } ${
    item.importance === "Optional"
      ? "border-gray-100 bg-gray-50/60 opacity-75 hover:opacity-100"
      : "border-gray-200 bg-white hover:border-brand/40"
  }`;

  return (
    <li>
      {path ? (
        <Link to={path} className={rowClass}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

// The three ways a reader can narrow a guide. "essentials" is the answer to
// "what is the shortest path through this?", which hiding optional steps alone
// does not give - a franchise can be mostly Normal steps and still have a
// handful that carry the story.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "no-optional", label: "Hide optional" },
  { key: "essentials", label: "Essentials only" },
];

/**
 * `limit` caps how many steps are drawn inline - the hub pages pass one so a
 * long cross-franchise order does not run the page off the screen, and point
 * `fullHref` at the order's own page for the rest. The full page itself passes
 * neither and draws every step.
 */
export default function WatchOrderGuide({
  list,
  roomy = false,
  limit,
  fullHref,
}) {
  const [filter, setFilter] = useState("all");

  const items = useMemo(() => list?.items || [], [list]);
  const optionalCount = items.filter((i) => i.importance === "Optional").length;
  const essentialCount = items.filter(
    (i) => i.importance === "Essential"
  ).length;

  const visible = useMemo(() => {
    if (filter === "essentials") {
      return items.filter((i) => i.importance === "Essential");
    }
    if (filter === "no-optional") {
      return items.filter((i) => i.importance !== "Optional");
    }
    return items;
  }, [items, filter]);

  // The cap applies to what the active filter leaves, so "Essentials only" on
  // a long order can still fit inline without truncation.
  const shown = limit ? visible.slice(0, limit) : visible;
  const hiddenCount = visible.length - shown.length;

  // Blocks are built from what survives the filter and the cap, not from the
  // whole order: a part whose every step is Optional disappears with them
  // rather than leaving a titled empty box behind.
  const blocks = useMemo(
    () => buildBlocks(shown, list?.sections),
    [shown, list?.sections]
  );

  if (!list) return null;

  if (!items.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <i className="fas fa-list-ol text-2xl mb-2"></i>
        <p className="font-medium text-sm">This watch order has no steps yet.</p>
      </div>
    );
  }

  return (
    <div>
      {/*
        The note belongs to the order below it, not to the picker above, so it
        sits closer to the guide than to the controls it would otherwise look
        attached to. Padding rather than a margin: as the first child of this
        wrapper a top margin collapses out and merges with the picker's own
        bottom margin, leaving the gap unchanged.
      */}
      {list.remark && (
        <p
          className={`text-gray-600 font-medium pt-3 mb-3 ${
            roomy ? "text-sm" : "text-xs"
          }`}
        >
          {list.remark}
        </p>
      )}

      {/*
        Only worth showing when a filter would actually change the list: a
        guide whose steps are all Normal has nothing to narrow to.
      */}
      {(optionalCount > 0 || essentialCount > 0) && (
        <div className="inline-flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-gray-100">
          {FILTERS.map((f) => {
            // Each option is hidden unless it has something to act on, so a
            // guide with optional steps but no essential ones does not offer
            // an "Essentials only" view that would come back empty.
            if (f.key === "no-optional" && optionalCount === 0) return null;
            if (f.key === "essentials" && essentialCount === 0) return null;
            const count =
              f.key === "no-optional"
                ? optionalCount
                : f.key === "essentials"
                  ? essentialCount
                  : null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`text-xs font-bold px-2.5 py-1 rounded-md transition-colors ${
                  filter === f.key
                    ? "bg-white text-brand shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
                {count != null && ` (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/*
        A filter can empty the list even though the guide has steps, so this
        says so rather than leaving a blank space under the controls.
      */}
      {!visible.length && (
        <p className="text-sm font-medium text-gray-400 py-6 text-center">
          No steps match this filter.
        </p>
      )}

      {/*
        Numbering follows the visible rows, so hiding optional steps renumbers
        1..N instead of leaving gaps the reader has to mentally close — and it
        runs straight through the parts rather than restarting inside each one,
        because the reader counts steps, not steps-within-a-part.
      */}
      <div className="flex flex-col gap-2">
        {blocks.map((block) =>
          block.kind === "part" ? (
            <section
              key={block.key}
              className={`rounded-2xl border border-gray-200 bg-gray-50/60 overflow-hidden ${
                roomy ? "mt-2 first:mt-0" : "mt-1.5 first:mt-0"
              }`}
            >
              {/*
                The part's name and note ride on the box rather than floating
                above the steps as a rule did, so which steps belong to the
                part is shown by the container instead of being inferred from
                where the next heading happens to start.
              */}
              <header className="px-3 py-2 bg-white/70 border-b border-gray-200">
                <div className="flex items-baseline gap-2">
                  <h4
                    className={`font-black text-gray-800 tracking-tight ${
                      roomy ? "text-base" : "text-sm"
                    }`}
                  >
                    {block.section.section_name || "Untitled Section"}
                  </h4>
                  <span className="text-[10px] font-black text-gray-400 whitespace-nowrap">
                    {block.rows.length}
                    {block.rows.length === 1 ? " step" : " steps"}
                  </span>
                </div>
                {block.section.remark && (
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    {block.section.remark}
                  </p>
                )}
              </header>

              <ol className="flex flex-col gap-2 p-2">
                {block.rows.map((row) => (
                  <StepRow
                    key={row.item.system_id}
                    item={row.item}
                    index={row.number}
                    roomy={roomy}
                  />
                ))}
              </ol>
            </section>
          ) : (
            /*
              An unfiled run. It carries no frame on purpose: these steps
              belong to no part, and boxing them would invent a part the admin
              never made. They sit wherever their positions put them, which
              may be before, between or after the part boxes.
            */
            <ol key={block.key} className="flex flex-col gap-2">
              {block.rows.map((row) => (
                <StepRow
                  key={row.item.system_id}
                  item={row.item}
                  index={row.number}
                  roomy={roomy}
                />
              ))}
            </ol>
          )
        )}
      </div>

      {/*
        Truncation is stated rather than silent: a reader who sees ten steps
        needs to know the order does not end there.
      */}
      {hiddenCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-gray-400">
            Showing {shown.length} of {visible.length} steps
          </span>
          {fullHref && (
            <Link
              to={fullHref}
              className="text-xs font-bold text-brand hover:underline whitespace-nowrap"
            >
              See all {visible.length}
              <i className="fas fa-arrow-up-right-from-square ml-1"></i>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
