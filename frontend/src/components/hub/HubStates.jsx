// The loading, error and empty screens shared by the Collection, Franchise and
// Series hubs.
//
// Keeping the three tiers on one set means a hub that fails to load looks the
// same whichever tier you were on, instead of the Collection hub blanking the
// viewport while the other two render inline.
import { Link } from "react-router-dom";

/** `label` names the tier, e.g. "Loading Series Hub...". */
export function HubLoading({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
        <p className="text-text-faint font-medium">{label}</p>
      </div>
    </div>
  );
}

/**
 * `backTo`/`backLabel` are optional: the Collection hub offers a way back to
 * its library, the other two rely on the breadcrumb they never rendered.
 */
export function HubError({ title, message, backTo, backLabel }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
        <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
        <p className="font-bold">{title}</p>
        {message && <p className="text-sm mt-1">{message}</p>}
        {backTo && (
          <Link
            to={backTo}
            className="text-brand hover:underline text-sm mt-3 inline-block font-bold"
          >
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * A section that owns nothing yet - no member franchises, no watch orders.
 * Boxed, because it stands in for content the page would otherwise draw in a
 * card. `children` takes an optional call to action.
 */
export function HubEmpty({ icon, message, hint, children }) {
  return (
    <div className="text-center py-16 bg-surface rounded-xl border border-border">
      <i className={`fas ${icon} text-text-faint/60 text-3xl mb-3`}></i>
      <p className="text-text-faint font-medium">{message}</p>
      {hint && <p className="text-sm text-text-faint mt-1">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Distinct from HubEmpty: the section does own entries, they are just all
 * filtered out. Unboxed, because the surrounding tab already draws the frame.
 */
export function FilterEmpty() {
  return (
    <div className="text-center py-16 text-text-faint">
      <i className="fas fa-ghost text-3xl mb-3"></i>
      <p className="font-medium">No entries match the current filters.</p>
    </div>
  );
}
