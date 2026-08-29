// Frontend: plan page file for PlanToRewatch.
//
// One render path for all eight tabs. Which scopes a tab shows comes from the
// rewatch scope map, so anime shows only a Franchise section and comic only
// Series and Entries - the page never hardcodes a tier again.
import { useState } from "react";
import { REWATCH_TABS, scopesFor } from "../../config/planNextGroups";
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
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-redo text-brand/70"></i>
          To Rewatch
        </h2>
      </div>

      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {REWATCH_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={`fas ${t.icon} text-xs`}></i>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 font-medium">Nothing marked for rewatch.</p>
          <p className="text-gray-400 text-xs mt-1">
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
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                    {SCOPE_LABELS[scope]}
                  </h3>
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
