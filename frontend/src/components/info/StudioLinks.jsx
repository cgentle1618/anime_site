// Frontend: info component file for StudioLinks.
//
// Anime and anime-movie payloads carry BOTH a legacy `studio` string (comma
// joined, no ids) and `studio_refs` (id + display name, built by
// app/services/domain/credits.attach_link_fields). The refs are what a page
// can link with; the string is the fallback for an entry whose studio never
// resolved to a row, and for a viewer without the Credits permission, for
// whom studio_refs is gated away.
import { Link } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";

export function StudioLinks({ refs, base = "/studio" }) {
  // `base` is the detail route with its leading slash; entityPath wants the
  // bare type segment, and it is what tells a studio ref from a publisher one.
  const type = base.replace(/^\//, "");
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {refs.map((ref, i) => {
        const path = entityPath(type, ref);
        return (
          <span key={ref.system_id}>
            {path ? (
              <Link to={path} className="text-brand hover:underline">
                {ref.display_name}
              </Link>
            ) : (
              ref.display_name
            )}
            {i < refs.length - 1 && <span aria-hidden="true">,</span>}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The value for an InfoCard "Studio" row: links when the entry carries refs,
 * the plain string when it does not, and null when there is no studio at all
 * so InfoRow renders its own em dash.
 */
export function studioValue(item) {
  const refs = item?.studio_refs || [];
  if (refs.length) return <StudioLinks refs={refs} />;
  return item?.studio || null;
}

/**
 * The same rule for a publisher row, on any of the six media types that
 * credit one. Publisher is shaped after Studio on the backend, so the ref
 * list reads identically and only the detail route it links to differs.
 */
export function publisherValue(item) {
  const refs = item?.publisher_refs || [];
  if (refs.length) return <StudioLinks refs={refs} base="/publisher" />;
  return item?.publisher || null;
}

/**
 * What this media type calls its publisher row. One publisher role reads
 * 台灣代理商 on an anime and 發行商 on a game; the backend owns that mapping
 * (credit_label in app/utils/credit_roles.py) and ships it on every
 * PublisherRef, so no page hard-codes a variant. The fallback covers an entry
 * with no publisher credited yet — and a viewer without the Credits
 * permission, for whom publisher_refs is gated away.
 */
export function publisherLabel(item, fallback) {
  return item?.publisher_refs?.[0]?.label || fallback;
}
