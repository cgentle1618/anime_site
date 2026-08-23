// The grouping-tier identity mark shared by the Collection, Franchise and
// Series hubs.
//
// The three hubs look alike by design - same hero card, same cover slot, same
// badge row - so nothing in the layout tells you which tier you are on. This
// gives each one a colour and a spelled-out name: a filled pill above the
// title, and a matching accent stripe across the top of the hero card.

export const TIERS = {
  collection: {
    label: "Collection",
    icon: "fa-boxes-stacked",
    pill: "bg-amber-500",
    accent: "border-t-4 border-t-amber-500",
  },
  franchise: {
    label: "Franchise",
    icon: "fa-sitemap",
    pill: "bg-indigo-600",
    accent: "border-t-4 border-t-indigo-600",
  },
  series: {
    label: "Series",
    icon: "fa-layer-group",
    pill: "bg-teal-600",
    accent: "border-t-4 border-t-teal-600",
  },
};

/** Tailwind classes for the hero card's top stripe, e.g. on the Franchise hub. */
export function tierAccent(tier) {
  return TIERS[tier]?.accent || "";
}

/**
 * `prefix` qualifies the tier without replacing it - the Franchise hub passes
 * its franchise_type, so the pill reads "ANIME FRANCHISE" rather than a bare
 * "ANIME", which would look like a media type instead of a tier.
 */
export default function TierBadge({ tier, prefix }) {
  const meta = TIERS[tier];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${meta.pill} text-white px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-sm`}
    >
      <i className={`fas ${meta.icon}`}></i>
      {prefix ? `${prefix} ${meta.label}` : meta.label}
    </span>
  );
}
