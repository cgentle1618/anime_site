// Frontend: info component file for PublisherLinks.
//
// The publisher twin of StudioLinks.jsx. An entry that carries publisher
// credits gets BOTH a legacy `publisher` string (comma joined, no ids) and
// `publisher_refs` (id + display name, built by
// app/services/domain/credits.attach_link_fields). The refs are what a page
// can link with; the string is the fallback for an entry whose publisher
// never resolved to a row, and for a viewer without the Credits permission,
// for whom publisher_refs is gated away.
import { Link } from "react-router-dom";

export function PublisherLinks({ refs }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {refs.map((ref, i) => (
        <span key={ref.system_id}>
          <Link
            to={`/publisher/${ref.system_id}`}
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
 * The value for an InfoCard "Publisher" row: links when the entry carries
 * refs, the plain string when it does not, and null when there is no
 * publisher at all so InfoRow renders its own em dash.
 */
export function publisherValue(item) {
  const refs = item?.publisher_refs || [];
  if (refs.length) return <PublisherLinks refs={refs} />;
  return item?.publisher || null;
}
