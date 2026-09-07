// Frontend: info component file for StudioLinks.
//
// Anime and anime-movie payloads carry BOTH a legacy `studio` string (comma
// joined, no ids) and `studio_refs` (id + display name, built by
// app/services/domain/credits.attach_link_fields). The refs are what a page
// can link with; the string is the fallback for an entry whose studio never
// resolved to a row, and for a viewer without the Credits permission, for
// whom studio_refs is gated away.
import { Link } from "react-router-dom";

export function StudioLinks({ refs, base = "/studio" }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {refs.map((ref, i) => (
        <span key={ref.system_id}>
          <Link
            to={`${base}/${ref.system_id}`}
            className="text-brand hover:underline"
          >
            {ref.display_name}
          </Link>
          {i < refs.length - 1 && <span aria-hidden="true">,</span>}
        </span>
      ))}
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
 * The same rule for a game's "Publisher" row. Publisher is shaped after
 * Studio on the backend, so the ref list reads identically and only the
 * detail route it links to differs.
 */
export function publisherValue(item) {
  const refs = item?.publisher_refs || [];
  if (refs.length) return <StudioLinks refs={refs} base="/publisher" />;
  return item?.publisher || null;
}
