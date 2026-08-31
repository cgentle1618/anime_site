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
import { Eyebrow } from "../../components/ui/primitives";
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
      <h2 className="font-display text-3xl font-semibold text-text leading-none mb-4 pb-3 border-b border-border">
        Watch next
      </h2>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {PLAN_TABS.map((t) => (
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

      {rows.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border-strong">
          <Eyebrow className="mb-1">Empty</Eyebrow>
          <p className="text-text-muted text-sm">Nothing queued here yet.</p>
        </div>
      )}

      <div className="space-y-8">
        {bucketOrder.map((bucket) => {
          const bucketRows = grouped[bucket] || [];
          if (bucketRows.length === 0) return null;
          return (
            <div key={bucket}>
              <div className="flex items-baseline justify-between mb-3 pb-1 border-b border-border">
                <Eyebrow as="h3" className="text-text-muted">
                  {labels[bucket] ?? UNGROUPED_LABELS[tab] ?? "Ungrouped"}
                </Eyebrow>
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
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
