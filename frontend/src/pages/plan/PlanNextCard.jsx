// Frontend: one planned thing on the Plan page.
//
// Franchise and series cards carry an explicit tier label, because the three
// scopes now sit side by side in the same bucket and would otherwise be
// indistinguishable.
import { Link } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { SCOPE_LABELS } from "../../config/planNextGroups";

export default function PlanNextCard({ row }) {
  if (row.missing) {
    return (
      <div className="border border-danger bg-danger/10 p-3 text-sm text-danger">
        Missing {row.scope} &middot; {row.target_id}
      </div>
    );
  }

  const badge = SCOPE_LABELS[row.scope];
  // Entry-scope rows keep reading cover_image_file directly, same as before.
  // Franchise/series rows have no such column - usePlanData resolves their
  // coverUrl via getCoverForSlot / the series member-entry fallback, since
  // Franchise and Series only carry cover_entry_id / type_covers.
  const src = row.coverUrl || getCoverUrl(row.cover_image_file);
  const body = (
    <>
      <div className="relative aspect-[3/4] bg-surface-2 overflow-hidden">
        <img
          src={src}
          alt={row.display_name || ""}
          onError={(e) => {
            e.currentTarget.src = FALLBACK_SVG;
          }}
          className="w-full h-full object-cover"
        />
        {badge && (
          <span className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white">
            {badge}
          </span>
        )}
      </div>
      <p className="font-display text-sm text-text leading-tight truncate px-2 py-1.5 border-t border-border">
        {row.display_name}
      </p>
    </>
  );

  const className =
    "group relative overflow-hidden bg-surface border border-border hover:border-border-strong transition-colors block";

  return row.nav_path ? (
    <Link to={`${row.nav_path}/${row.target_id}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
