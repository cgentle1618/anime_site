// Frontend: the "Related Entries" card on every media detail page.
//
// Read-only: editing lives on the admin /relations page. One component for all
// seven media types, because a relation is type-agnostic - an anime's source
// may be a manga and its alternative an anime movie, so a per-page block that
// only knew its own table could never render the full picture.
//
// Replaces the hand-rolled prequel_id / sequel_id / alternative blocks each
// detail page used to carry. Those could show only same-table links and only
// three kinds; this shows every kind, in either direction, across every table.
//
// It also shows more than the canvas does. A transitive kind - Alternative,
// Corresponding - is stored pair by pair but describes a whole set, and the
// server closes over the chain for this card alone (see relations_for_entry).
// The graph keeps drawing stored rows, so a group of peers stays a few lines
// rather than a mesh; those extra rows arrive here with `derived` and a `via`.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { Chip, Slip } from "../ui/primitives";

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Order only - the
// labels themselves arrive already resolved for the side being viewed.
const FAMILY_ORDER = ["timeline", "equivalence", "branch", "derivation"];

// A derived row stands for no stored row, so system_id is null on it and the
// pair plus the kind is the only identity it has.
const rowKey = (row) =>
  row.system_id ||
  `${row.relation_type}:${row.other.media_type}:${row.other.entry_id}`;

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
    <Slip title="Related entries" padded={false}>
      {ordered.map((row) => {
        const other = row.other;

        // A dangling endpoint stays visible rather than vanishing: entries
        // are FK-less, and a silently dropped row is one nobody ever fixes.
        if (other.missing) {
          return (
            <div
              key={rowKey(row)}
              className="px-4 py-2.5 border-b border-border last:border-b-0"
            >
              <Chip tone="danger" className="mb-1">
                {row.label}
              </Chip>
              <div className="text-xs text-danger break-all">
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
              className="w-10 h-14 object-cover shrink-0 border border-border"
              onError={(e) => {
                e.target.src = FALLBACK_SVG;
              }}
              alt=""
            />
            <div className="min-w-0 flex-1">
              {/* The kind is a chip, not a colour: nine hues would be noise. */}
              <Chip className="mb-1">{row.label}</Chip>
              <div className="text-sm font-medium text-text truncate">
                {other.display_name}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                {other.label}
                {row.remark ? ` · ${row.remark}` : ""}
                {/* A derived row has no relation of its own behind it - it
                    is implied by a chain of peers - so it says which link it
                    came through. Without that, an entry appears here that
                    the relations canvas draws no line to, and the graph
                    looks broken rather than deliberately uncluttered. */}
                {row.derived && row.via ? ` · via ${row.via}` : ""}
              </div>
            </div>
          </>
        );

        const className =
          "px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 transition";

        return other.nav_path ? (
          <Link
            key={rowKey(row)}
            to={other.nav_path}
            className={`${className} cursor-pointer hover:bg-brand-soft`}
          >
            {body}
          </Link>
        ) : (
          <div key={rowKey(row)} className={className}>
            {body}
          </div>
        );
      })}
    </Slip>
  );
}
