// The loading, error and empty screens shared by the Collection, Franchise and
// Series hubs.
//
// Keeping the three tiers on one set means a hub that fails to load looks the
// same whichever tier you were on, instead of the Collection hub blanking the
// viewport while the other two render inline.
import { Link } from "react-router-dom";
import { Eyebrow } from "../ui/primitives";

/** `label` names the tier, e.g. "Loading series hub...". */
export function HubLoading({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
        <p className="text-text-faint">{label}</p>
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
      <div className="text-center border border-danger bg-danger/10 p-6">
        <p className="font-bold text-danger">{title}</p>
        {message && <p className="text-sm mt-1 text-text-muted">{message}</p>}
        {backTo && (
          <Link
            to={backTo}
            className="text-brand hover:underline text-sm mt-3 inline-block"
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
 * slip. `icon` is still accepted by callers and ignored; `children` takes an
 * optional call to action.
 */
export function HubEmpty({ message, hint, children }) {
  return (
    <div className="text-center py-12 border border-dashed border-border-strong">
      <Eyebrow className="mb-1">Empty</Eyebrow>
      <p className="text-text-muted text-sm">{message}</p>
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
    <div className="text-center py-16 text-text-faint text-sm">
      No entries match the current filters.
    </div>
  );
}
