// Frontend: statistics page file for StatsGameSpend.
import computeGameSpend, { NO_CURRENCY, formatMoney } from "./gameSpend";
import { Eyebrow, Slip } from "../../components/ui/primitives";

function SpendColumn({ column }) {
  const { label, currencies, copies, converted } = column;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text">
          {label}
        </h4>
        <span className="font-mono text-[11px] text-text-faint">
          {copies} {copies === 1 ? "copy" : "copies"}
        </span>
      </div>

      {currencies.length === 0 ? (
        <p className="font-mono text-[11px] text-text-faint">No priced copies.</p>
      ) : (
        <dl className="space-y-1.5">
          {currencies.map(({ code, cents, copies: count }) => (
            <div key={code} className="flex items-baseline gap-3">
              <dt
                className={`w-12 shrink-0 font-mono text-[11px] ${
                  code === NO_CURRENCY ? "text-text-faint" : "text-text-muted"
                }`}
                // The uncurrencied bucket is an em dash on screen; without
                // this a screen reader reads it as nothing at all.
                title={code === NO_CURRENCY ? "No currency recorded" : code}
              >
                {code}
              </dt>
              <dd className="flex-1 text-right font-mono text-sm tabular-nums text-text">
                {formatMoney(NO_CURRENCY, cents)}
              </dd>
              <dd className="w-10 text-right font-mono text-[11px] text-text-faint tabular-nums">
                {count}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Converted totals. Absent entirely when no rates are configured -
          a spend figure built from a rate nobody entered is worse than no
          figure, because it looks exactly like a real one. */}
      {converted.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dotted border-border-strong/60 space-y-1.5">
          {converted.map(({ code, cents, missing }) => (
            <div key={code} className="flex items-baseline gap-3">
              <dt className="w-12 shrink-0 font-mono text-[11px] text-text-muted">
                ≈ {code}
              </dt>
              <dd className="flex-1 text-right font-mono text-sm font-semibold tabular-nums text-text">
                {formatMoney(NO_CURRENCY, cents)}
              </dd>
              <dd className="w-10 text-right">
                {missing.length > 0 && (
                  <span
                    className="font-mono text-[11px] text-text-faint"
                    title={`No rate for ${missing.join(", ")}; excluded from this total.`}
                  >
                    part
                  </span>
                )}
              </dd>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What the game collection cost.
 *
 * Owned counts every copy with a price; Bought narrows to the ones actually
 * purchased. Both are shown per currency and, when rates have been entered on
 * the admin page, converted into USD and TWD as well.
 */
export default function StatsGameSpend({ games, fxRates }) {
  const spend = computeGameSpend(games, fxRates);

  // Nothing priced anywhere: a wall of zeroes says less than no block at all.
  if (spend.isEmpty) return null;

  return (
    <section>
      <Eyebrow className="mb-2">Games</Eyebrow>
      <h2 className="font-display text-2xl font-semibold text-text mb-4">
        Total Spend
      </h2>

      <Slip
        title="Game Spend"
        actions={
          spend.asOf ? (
            <Eyebrow>Rates as of {spend.asOf}</Eyebrow>
          ) : (
            <Eyebrow>No rates set</Eyebrow>
          )
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {spend.columns.map((column) => (
            <SpendColumn key={column.key} column={column} />
          ))}
        </div>
      </Slip>
    </section>
  );
}
