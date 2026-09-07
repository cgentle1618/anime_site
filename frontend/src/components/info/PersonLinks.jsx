// Frontend: info component file for PersonLinks.
//
// Every media payload carries BOTH the legacy credit strings (comma joined,
// no ids: `director`, `author_plot`, `writer`, …) and `credit_refs`, keyed by
// role and carrying {system_id, display_name, label} — built by
// app/services/domain/credits.attach_link_fields. The refs are what a page can
// link with; the string is the fallback for a credit that never resolved to a
// person row, and for a viewer without the Credits permission, for whom
// credit_refs is gated away to {}.
//
// The studio half of the same idea lives in StudioLinks.jsx; studios are one
// role, so theirs needs no role key.
import { Link } from "react-router-dom";

export function PersonLinks({ refs }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {refs.map((ref, i) => (
        <span key={ref.system_id}>
          <Link
            to={`/person/${ref.system_id}`}
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
 * The value for an InfoCard credit row: links when the entry carries refs for
 * that role, the plain legacy string when it does not, and null when there is
 * no credit at all so InfoRow renders its own em dash.
 *
 * `role` is the credit-role key (author, illustrator, director, …), NOT the
 * legacy payload key — `legacyValue` carries whatever the page was already
 * showing, since the two differ (composer is served as `music`, manga's author
 * as `author_plot`).
 */
export function creditValue(item, role, legacyValue) {
  const refs = item?.credit_refs?.[role] || [];
  if (refs.length) return <PersonLinks refs={refs} />;
  return legacyValue || null;
}

/**
 * What this credit is called on this media type, from the refs themselves.
 *
 * credit_label() on the backend owns the vocabulary (原作 on a manga, Author on
 * a novel, Writer on a comic); a page that hard-coded its own heading would be
 * a second copy of it. Falls back to what the page passes when there are no
 * refs to read a label from.
 */
export function creditLabel(item, role, fallback) {
  return item?.credit_refs?.[role]?.[0]?.label || fallback;
}
