// Frontend: the grid card a person or a studio is shown as.
//
// Lifted out of PersonLibrary/StudioLibrary when /search grew person and
// studio sections: three pages drawing the same card by hand is three places
// for it to drift. The two types differ only in their spine label, their
// image column, and the word in the alt text — everything else, including the
// credit count under the name, is the same card.
import { Link } from "react-router-dom";

import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";

function StaffCard({ to, label, name, imageFile, imageAlt, creditCount }) {
  const coverUrl = getCoverUrl(imageFile);
  const credits = creditCount ?? 0;

  return (
    <Link
      to={to}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer group"
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            {label}
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <img
            src={coverUrl}
            alt={imageAlt}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {credits} credit{credits !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}

export function PersonCard({ person }) {
  return (
    <StaffCard
      to={`/person/${person.system_id}`}
      label="Person"
      name={person.display_name || "Unknown Person"}
      imageFile={person.photo_file}
      imageAlt="Photo"
      creditCount={person.credit_count}
    />
  );
}

export function StudioCard({ studio }) {
  return (
    <StaffCard
      to={`/studio/${studio.system_id}`}
      label="Studio"
      name={studio.display_name || "Unknown Studio"}
      imageFile={studio.logo_file}
      imageAlt="Logo"
      creditCount={studio.credit_count}
    />
  );
}

export default StaffCard;
