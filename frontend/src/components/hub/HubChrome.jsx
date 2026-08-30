// The page chrome shared by the Collection, Franchise and Series hubs: the
// outer shell, the breadcrumb row, the hero card and its cover slot.
//
// These are deliberately thin wrappers that take `children` rather than a prop
// per field. The hero's *contents* stay written out in each hub's own file, so
// changing what the Series hero shows is still a local edit there; you only
// come here when a change should land on all three tiers at once.
import { Link } from "react-router-dom";
import { FALLBACK_SVG } from "../../utils/media";
import { tierAccent } from "../layout/TierBadge";

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

/**
 * Breadcrumb row. `trail` is the ancestors, each `{ to, icon, label }`;
 * `current` is this page, rendered as plain bold text. Quick Edit sits inline
 * here rather than in a separate admin toolbar, so `editId` is the system_id
 * the Modify page should open.
 */
export function HubBreadcrumb({ trail = [], current, editId, isAdmin }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <nav className="text-sm text-text-faint flex items-center gap-1.5 flex-wrap min-w-0">
        {trail.map((crumb) => (
          <span key={crumb.to} className="flex items-center gap-1.5">
            <Link to={crumb.to} className="hover:text-brand font-medium">
              {crumb.icon && <i className={`fas ${crumb.icon} mr-1`}></i>}
              {crumb.label}
            </Link>
            <span>/</span>
          </span>
        ))}
        <span className="font-bold text-text truncate">{current}</span>
      </nav>
      {isAdmin && editId && (
        <Link
          to={`/modify?id=${editId}`}
          className="shrink-0 text-xs font-bold text-text-faint hover:text-brand transition flex items-center gap-1.5 border border-border bg-surface rounded-lg px-3 py-1.5"
        >
          <i className="fas fa-pen text-[10px]"></i>
          Quick Edit
        </Link>
      )}
    </div>
  );
}

/**
 * The hero card, with the tier's accent stripe across the top. Kept separate
 * from HubHeroRow so a hub can put content below the row - all three hang
 * their Remark box off the bottom of the card, outside the columns.
 */
export function HubCard({ tier, children }) {
  return (
    <div
      className={`bg-surface rounded-2xl border border-border shadow-sm p-6 ${tierAccent(tier)}`}
    >
      {children}
    </div>
  );
}

/** The hero's column layout: cover, then whatever the tier puts beside it. */
export function HubHeroRow({ children }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-6">
      {children}
    </div>
  );
}

/** The hero's poster slot: fixed 2:3 box, shared fallback on a broken image. */
export function HubCover({ src }) {
  return (
    <div className="w-28 sm:w-36 lg:w-40 shrink-0">
      <div className="w-full aspect-[2/3] bg-surface-2 rounded-xl overflow-hidden border border-border">
        <img
          src={src}
          alt="Cover"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
    </div>
  );
}
