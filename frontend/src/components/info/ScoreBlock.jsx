// Frontend: info component file for ScoreBlock.
//
// A row of figures, not a row of coloured chips: each score is a large
// display numeral under a mono label, separated by hairlines.
function Figure({ label, value }) {
  const empty = value == null || value === "";
  return (
    <div className="pr-6 mr-6 border-r border-border last:border-r-0 last:mr-0 last:pr-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mb-1">
        {label}
      </div>
      <div
        className={`font-display text-3xl leading-none tabular-nums ${
          empty ? "text-text-faint" : "text-text"
        }`}
      >
        {empty ? "—" : value}
      </div>
    </div>
  );
}

export default function ScoreBlock({
  malScore,
  malRank,
  anilistScore,
  updatedAt,
}) {
  return (
    <div className="flex flex-wrap items-end gap-y-4">
      <Figure label="MAL score" value={malScore} />
      <Figure label="MAL rank" value={malRank ? `#${malRank}` : null} />
      <Figure label="AniList" value={anilistScore} />
      {/* Absent, not blanked. The server nulls this for a viewer without
          field_group.system_info, and an em-dash under a "Last updated" label
          would announce that there is a date here they are not being shown. */}
      {updatedAt && (
        <div className="ml-auto text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mb-1">
            Last updated
          </div>
          <div className="font-mono text-xs text-text-muted">
            {new Date(updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
