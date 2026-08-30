// The heading above one tab's entry grid on a grouping-tier hub.
//
// Shared by the Collection, Franchise and Series hubs so a section reads the
// same wherever it turns up. Presentation only - the caller owns the icon,
// the wording and the count.

export default function SectionHeader({ icon, title, subtitle, count }) {
  return (
    <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-border">
      <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
        <i className={`fas ${icon} text-brand`}></i>
      </div>
      <div>
        <h2 className="text-xl font-black text-text tracking-tight leading-none">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-text-faint font-medium mt-0.5">{subtitle}</p>
        )}
      </div>
      {count !== undefined && (
        <span className="ml-auto bg-surface-2 text-text-muted px-3 py-1 rounded-full text-xs font-bold border border-border">
          {count} entries
        </span>
      )}
    </div>
  );
}
