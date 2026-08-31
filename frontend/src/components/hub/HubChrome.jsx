// The page chrome shared by the Collection, Franchise and Series hubs, in the
// archive look: mono breadcrumb, dashed admin strip, cover with an ink spine
// strip and the rating stamp, underline tab bar, section slips.
//
// Each hub still owns its hero *contents* (the fields beside the cover) and
// its tab wiring; you only come here when a change should land on all three
// tiers at once. See docs/frontend/design-system.md.
import { Link } from "react-router-dom";
import { FALLBACK_SVG } from "../../utils/media";
import { Eyebrow, Slip, RatingStamp, ProgressRule } from "../ui/primitives";

/**
 * The card grid every hub lays its entries out on - member franchises on the
 * Collection hub, media entries on the other two.
 */
export const GRID_CLS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

/** The centred column every hub page sits in. */
export function HubShell({ children }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {children}
    </div>
  );
}

/** The select styling the hubs' inline admin dropdowns share. */
export const SELECT_CLS =
  "border border-border-strong bg-surface text-text px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand";

/** A toggle pill for the hubs' filter rows: brand outline when active. */
export const pillCls = (active) =>
  `border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] leading-none transition ${
    active
      ? "border-brand text-brand bg-brand-soft"
      : "border-border text-text-muted hover:border-border-strong hover:text-text"
  }`;

/**
 * Breadcrumb row: a catalogue path set in mono. `trail` is the ancestors,
 * each `{ to, label }`; `current` is this page.
 */
export function Crumbs({ trail, current }) {
  return (
    <nav
      className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint flex items-center gap-3 flex-wrap"
      aria-label="Breadcrumb"
    >
      {trail.map((c) => (
        <span key={c.to} className="flex items-center gap-3">
          <Link to={c.to} className="hover:text-brand transition">
            {c.label}
          </Link>
          <span aria-hidden="true">/</span>
        </span>
      ))}
      <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
        {current}
      </span>
    </nav>
  );
}

/** The dashed admin strip; `editId` is the system_id Modify should open. */
export function AdminStrip({ editId }) {
  return (
    <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        Admin
      </div>
      <Link
        to={`/modify?id=${editId}`}
        className="border border-border-strong text-text bg-surface px-3 py-1.5 text-sm font-medium hover:border-text transition"
      >
        Quick edit
      </Link>
    </div>
  );
}

/**
 * Cover with the ink spine strip, the rating stamp and - when the tier tracks
 * completion - a progress rule along the bottom edge. Leave `total` undefined
 * to drop the rule (a collection tracks no completion).
 */
export function HeroCover({ src, spine, id, rating, done, total, pct }) {
  return (
    <div className="flex border border-border bg-surface">
      <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center justify-between py-2">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {spine}
        </span>
        <span
          className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {id}
        </span>
      </div>
      <div className="relative flex-1 min-w-0">
        <RatingStamp
          rating={rating}
          size="md"
          tilt
          className="absolute top-2 right-2 z-10"
        />
        <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
          <img
            src={src}
            alt="Cover"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
        {total !== undefined && (
          <>
            <ProgressRule value={total > 0 ? done / total : 0} />
            <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              <span>Completed</span>
              <span className="text-text">
                {done} / {total} · {pct}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A labelled value in the hero: mono eyebrow over the content. */
export function Field({ label, className = "", children }) {
  return (
    <div className={className}>
      <Eyebrow className="mb-1">{label}</Eyebrow>
      {children}
    </div>
  );
}

/**
 * The underline tab bar. `groups` is [{ label, tabs, counted }] in display
 * order; a group with no tabs is dropped. `counted` asks for a count on each
 * of that group's tabs, resolved through `getCount`.
 */
export function HubTabs({ groups, activeTab, onSelect, getCount }) {
  const filled = groups.filter((g) => g.tabs.length > 0);
  return (
    <div className="flex items-end gap-6 border-b border-border overflow-x-auto">
      {filled.map((group) => (
        <div key={group.label} className="flex items-end gap-1 shrink-0">
          <Eyebrow className="pr-2 pb-2.5">{group.label}</Eyebrow>
          {group.tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onSelect(tab)}
                className={`px-3 pb-2 pt-1 -mb-px font-mono text-[11px] uppercase tracking-[0.14em] border-b-2 transition whitespace-nowrap ${
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {tab}
                {group.counted && (
                  <span className="ml-1.5 text-text-faint">{getCount(tab)}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** One tab's body: a slip with the count at the right end of the title row. */
export function Section({ title, subtitle, count, children }) {
  return (
    <Slip
      title={title}
      actions={
        count !== undefined && (
          <span className="font-mono text-[11px] text-text-faint">
            {count} {count === 1 ? "entry" : "entries"}
          </span>
        )
      }
    >
      {subtitle && <p className="text-xs text-text-faint mb-3">{subtitle}</p>}
      {children}
    </Slip>
  );
}
