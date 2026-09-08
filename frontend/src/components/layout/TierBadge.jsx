// The grouping-tier identity mark shared by the Collection, Franchise and
// Series hubs.
//
// The three hubs look alike by design - same hero card, same cover slot, same
// badge row - so nothing in the layout tells you which tier you are on. This
// spells the tier out in a chip above the title. Colour does not encode the
// tier (design-system rule 5); the word does.
import { Chip } from "../ui/primitives";

export const TIERS = {
  collection: { label: "Collection" },
  franchise: { label: "Franchise" },
  series: { label: "Series" },
};

/**
 * Tailwind classes for the hero card's top edge. Every tier gets the same
 * ink rule now that colour no longer names the tier; kept as a function so
 * the hubs' call sites do not change.
 */
export function tierAccent(tier) {
  return TIERS[tier] ? "border-t-2 border-t-ink" : "";
}

/**
 * `prefix` qualifies the tier without replacing it - the Franchise hub passes
 * its franchise_type, so the chip reads "ANIME FRANCHISE" rather than a bare
 * "ANIME", which would look like a media type instead of a tier.
 */
export default function TierBadge({ tier, prefix }) {
  const meta = TIERS[tier];
  if (!meta) return null;
  return <Chip>{prefix ? `${prefix} ${meta.label}` : meta.label}</Chip>;
}
