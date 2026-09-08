// Frontend: the "archive" design primitives.
//
// The UI is styled as a physical media archive: index slips, spine labels,
// a rating stamp. Every page composes these instead of inventing its own
// card/badge/label markup, so the look stays consistent and a change here
// changes it everywhere. See docs/frontend/design-system.md.

// A small mono caption in uppercase - the label above a value, a section
// title, a breadcrumb. `as` lets it be a heading when it titles a section.
export function Eyebrow({ as: Tag = "div", className = "", children, ...rest }) {
  return (
    <Tag
      className={`font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// An index slip: a flat bordered section with a mono title on a dotted rule.
// `actions` sits at the right end of the title row. `padded={false}` lets
// tables and lists run edge to edge.
export function Slip({
  title,
  actions,
  padded = true,
  className = "",
  bodyClassName = "",
  children,
  ...rest
}) {
  return (
    <section className={`bg-surface border border-border ${className}`} {...rest}>
      {(title || actions) && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          {title && (
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted shrink-0">
              {title}
            </h3>
          )}
          <span className="flex-1 border-t border-dotted border-border-strong/60" />
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`${padded ? "p-4" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

// The rating stamp: an outlined square in the brand hue with the rank letter
// set in the display face. `size` is "sm" (cards, lists) or "md" (detail).
// A null rating renders nothing - there is no "unrated" stamp.
export function RatingStamp({ rating, size = "sm", tilt = false, className = "" }) {
  if (!rating) return null;
  const dims =
    size === "md"
      ? "w-11 h-11 border-2 text-2xl"
      : "w-7 h-7 border text-sm";
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 border-brand text-brand font-display font-bold leading-none bg-surface/85 ${dims} ${
        tilt ? "rotate-[-6deg]" : ""
      } ${className}`}
      title={`My rating: ${rating}`}
      aria-label={`Rating ${rating}`}
    >
      {rating}
    </span>
  );
}

// A chip: mono text on a faint fill with a hairline border and a slight
// radius - softer than the slips around it. Colour does not encode a
// category - every chip is ink, except `tone="brand"` for the one thing the
// page wants to point at and `tone="danger"` for destructive/critical states.
const CHIP_TONES = {
  ink: "border-border bg-surface-2/60 text-text-muted",
  brand: "border-brand/40 bg-brand-soft text-brand",
  danger: "border-danger/40 bg-danger/10 text-danger",
  muted: "border-border bg-surface-2/40 text-text-faint",
};
export function Chip({ tone = "ink", className = "", children, ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] leading-none whitespace-nowrap ${CHIP_TONES[tone] || CHIP_TONES.ink} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

// A thin progress rule. `value` in [0, 1].
export function ProgressRule({ value, className = "" }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`h-1 bg-surface-2 ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Buttons. Three kinds only: `primary` (brand fill), `outline` (ink border),
// `danger` (destructive, outlined red). No icons unless the label is absent.
const BUTTON_KINDS = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  outline: "border border-border-strong text-text hover:border-text bg-surface",
  danger: "border border-danger text-danger hover:bg-danger hover:text-white",
  ghost: "text-text-muted hover:text-text hover:bg-surface-2",
};
export function Button({ kind = "outline", size = "md", className = "", children, ...rest }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${pad} ${BUTTON_KINDS[kind] || BUTTON_KINDS.outline} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
