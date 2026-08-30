// Frontend: plan page file for PlanWatchNext.
//
// One render path for all eight media types. Before plan_next this file was
// 695 lines of seven near-identical blocks, each re-implementing filter ->
// group -> sort -> render; the uniform plan_next table behind it is what
// collapsed them, and is why comic finally has a tab.
import { useState } from "react";
import {
  PLAN_TABS,
  SIZE_GROUPS,
  UNGROUPED_LABELS,
} from "../../config/planNextGroups";
import { groupByBucket } from "../../utils/planNext";
import PlanNextCard from "./PlanNextCard";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function byExpectation(a, b) {
  return (
    (EXPECTATION_WEIGHT[a.expectation] ?? 99) -
    (EXPECTATION_WEIGHT[b.expectation] ?? 99)
  );
}

export default function PlanWatchNext({ planRows }) {
  const [tab, setTab] = useState("anime");

  const rows = planRows
    .filter((r) => r.kind === "next" && r.media_type === tab)
    .sort(byExpectation);
  const grouped = groupByBucket(rows, tab);
  const labels = Object.fromEntries(
    (SIZE_GROUPS[tab] ?? []).map((g) => [g.key, g.label]),
  );
  const bucketOrder = [...(SIZE_GROUPS[tab] ?? []).map((g) => g.key), "ungrouped"];

  return (
    <section>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-border">
        <h2 className="text-xl font-black text-text flex items-center gap-2">
          <i className="fas fa-list-ol text-brand/70"></i>
          Watch Next
        </h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {PLAN_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-text-faint hover:text-text-muted"
              }`}
            >
              <i className={`fas ${t.icon} text-xs`}></i>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-surface rounded-xl border border-dashed border-border">
          <i className="fas fa-list-ol text-3xl text-text-faint/60 mb-3"></i>
          <p className="text-text-faint font-medium">Nothing queued here yet.</p>
        </div>
      )}

      <div className="space-y-8">
        {bucketOrder.map((bucket) => {
          const bucketRows = grouped[bucket] || [];
          if (bucketRows.length === 0) return null;
          return (
            <div key={bucket}>
              <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
                <h3 className="text-sm font-black text-text-muted uppercase tracking-wider">
                  {labels[bucket] ?? UNGROUPED_LABELS[tab] ?? "Ungrouped"}
                </h3>
                <span className="text-xs font-bold text-text-faint bg-surface-2 px-2 py-0.5 rounded-full border border-border">
                  {bucketRows.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {bucketRows.map((row) => (
                  <PlanNextCard key={row.system_id} row={row} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
