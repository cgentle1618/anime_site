// Frontend: plan page file for PlanToRewatch.
//
// One render path for all eight tabs. Which scopes a tab shows comes from the
// rewatch scope map, so anime shows only a Franchise section and comic only
// Series and Entries - the page never hardcodes a tier again.
import { useState } from "react";
import { REWATCH_TABS, scopesFor } from "../../config/planNextGroups";
import { Eyebrow } from "../../components/ui/primitives";
import PlanNextCard from "./PlanNextCard";

const SCOPE_LABELS = {
  franchise: "Franchises",
  series: "Series",
  entry: "Entries",
};

export default function PlanToRewatch({ planRows }) {
  const [tab, setTab] = useState("anime");

  const rows = planRows.filter(
    (row) => row.kind === "rewatch" && row.media_type === tab,
  );
  const scopes = scopesFor("rewatch", tab);

  return (
    <section>
      <h2 className="font-display text-3xl font-semibold text-text leading-none mb-4 pb-3 border-b border-border">
        To rewatch
      </h2>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {REWATCH_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface border-border-strong text-text-muted hover:border-text hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border-strong">
          <Eyebrow className="mb-1">Empty</Eyebrow>
          <p className="text-text-muted text-sm">Nothing marked for rewatch.</p>
          <p className="text-text-faint text-xs mt-1">
            Toggle it on a detail page or in Modify.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {scopes
            .slice()
            .reverse() // Franchise first, then Series, then Entries.
            .map((scope) => {
              const inScope = rows
                .filter((row) => row.scope === scope)
                .sort((a, b) =>
                  (a.display_name || "").localeCompare(b.display_name || ""),
                );
              if (inScope.length === 0) return null;
              return (
                <div key={scope}>
                  <div className="flex items-baseline justify-between mb-3 pb-1 border-b border-border">
                    <Eyebrow as="h3" className="text-text-muted">
                      {SCOPE_LABELS[scope]}
                    </Eyebrow>
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      {inScope.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {inScope.map((row) => (
                      <PlanNextCard key={row.system_id} row={row} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
