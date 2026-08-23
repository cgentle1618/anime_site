// Frontend: the "Related Entries" card on every media detail page.
//
// Read-only: editing lives on the admin /relations page. One component for all
// seven media types, because a relation is type-agnostic - an anime's source
// may be a manga and its alternative an anime movie, so a per-page block that
// only knew its own table could never render the full picture.
//
// Replaces the hand-rolled prequel_id / sequel_id / alternative blocks each
// detail page used to carry. Those could show only same-table links and only
// three kinds; this shows all nine, in either direction, across every table.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Order only - the
// labels themselves arrive already resolved for the side being viewed.
const FAMILY_ORDER = ["timeline", "equivalence", "branch", "derivation"];

// One accent per family rather than per kind: nine colours would be noise, and
// the family is what tells you how to read the link.
const FAMILY_COLOR = {
  timeline: "text-orange-500",
  equivalence: "text-blue-500",
  branch: "text-purple-500",
  derivation: "text-green-500",
};

export default function RelationsSection({ mediaType, entryId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!mediaType || !entryId) return;
    let cancelled = false;

    fetch(
      buildUrl(endpoints.mediaRelation.forEntry(), {
        media_type: mediaType,
        entry_id: entryId,
      }),
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setRows([]));

    return () => {
      cancelled = true;
    };
  }, [mediaType, entryId]);

  // Hidden entirely when there is nothing to show, as the blocks it replaces
  // were.
  if (rows.length === 0) return null;

  const ordered = [...rows].sort(
    (a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family)
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
        <i className="fas fa-project-diagram mr-1.5"></i>Related Entries
      </h3>
      <div className="flex flex-col gap-3">
        {ordered.map((row) => {
          const other = row.other;

          // A dangling endpoint stays visible rather than vanishing: entries
          // are FK-less, and a silently dropped row is one nobody ever fixes.
          if (other.missing) {
            return (
              <div
                key={row.system_id}
                className="bg-red-50 rounded-lg border border-red-200 p-2"
              >
                <div className="text-[9px] font-bold uppercase tracking-wider text-red-500 mb-0.5">
                  {row.label}
                </div>
                <div className="text-xs font-medium text-red-700 break-all">
                  Missing entry {other.entry_id}
                </div>
              </div>
            );
          }

          // nav_path is null only for Series, which media relations never
          // point at, but guard anyway rather than emit a dead link.
          const body = (
            <>
              <img
                src={getCoverUrl(other.cover_image_file)}
                className="w-10 h-14 object-cover rounded shadow-sm shrink-0"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
                alt=""
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
                    FAMILY_COLOR[row.family] || "text-gray-500"
                  }`}
                >
                  {row.label}
                </div>
                <div className="text-sm font-bold text-gray-900 truncate">
                  {other.display_name}
                </div>
                <div className="text-[11px] text-gray-500">
                  {other.label}
                  {row.remark ? ` · ${row.remark}` : ""}
                </div>
              </div>
            </>
          );

          const className =
            "bg-gray-50 rounded-lg border border-gray-200 p-2 flex items-center gap-3 transition";

          return other.nav_path ? (
            <Link
              key={row.system_id}
              to={other.nav_path}
              className={`${className} cursor-pointer hover:bg-brand/5 hover:border-brand/30`}
            >
              {body}
            </Link>
          ) : (
            <div key={row.system_id} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
