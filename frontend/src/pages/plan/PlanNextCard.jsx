// Frontend: one planned thing on the Plan page.
//
// Entries keep the look they had before plan_next; franchise and series cards
// carry an explicit tier badge, because the three scopes now sit side by side
// in the same bucket and would otherwise be indistinguishable.
import { Link } from "react-router-dom";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import { SCOPE_LABELS } from "../../config/planNextGroups";

export default function PlanNextCard({ row }) {
  if (row.missing) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        Missing {row.scope} &middot; {row.target_id}
      </div>
    );
  }

  const badge = SCOPE_LABELS[row.scope];
  const body = (
    <>
      <div className="aspect-[3/4] bg-gray-100 rounded-xl overflow-hidden">
        <img
          src={getCoverUrl(row.cover_image_file)}
          alt={row.display_name || ""}
          onError={(e) => {
            e.currentTarget.src = FALLBACK_SVG;
          }}
          className="w-full h-full object-cover"
        />
      </div>
      {badge && (
        <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {badge}
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-6 pb-2">
        <p className="text-white text-xs font-bold leading-tight truncate">
          {row.display_name}
        </p>
      </div>
    </>
  );

  const className =
    "group relative rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block";

  return row.nav_path ? (
    <Link to={`${row.nav_path}/${row.target_id}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
