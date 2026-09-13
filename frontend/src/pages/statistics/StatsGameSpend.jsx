// Frontend: statistics page file for StatsGameSpend.
import computeGameSpend, {
  NO_CURRENCY,
  costPerHour,
  formatMoney,
  spendByStorefront,
  spendByYear,
} from "./gameSpend";
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
 * One breakdown row: a label, what it actually cost in each currency, and
 * the converted figures beside them.
 *
 * Actuals and conversions on one line rather than in two blocks: the two
 * answer different questions ("what left my account" and "what is that
 * worth") and reading them apart means holding a row in your head while you
 * scroll to find its other half.
 */
function BreakdownRow({ bucket }) {
  const { key, currencies, copies, converted } = bucket;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 border-b border-dotted border-border last:border-0">
      <span className="w-24 shrink-0 font-mono text-[11px] text-text truncate" title={key}>
        {key}
      </span>

      <span className="flex flex-wrap gap-x-3 gap-y-0.5 flex-1 min-w-[8rem] justify-end">
        {currencies.map(({ code, cents }) => (
          <span key={code} className="font-mono text-sm tabular-nums text-text">
            {formatMoney(code, cents)}
          </span>
        ))}
      </span>

      {converted.length > 0 && (
        <span className="flex gap-x-3 shrink-0 justify-end">
          {converted.map(({ code, cents, missing }) => (
            <span
              key={code}
              className="font-mono text-[11px] tabular-nums text-text-muted"
              title={
                missing.length > 0
                  ? `No rate for ${missing.join(", ")}; excluded from this figure.`
                  : undefined
              }
            >
              ≈ {formatMoney(code, cents)}
              {missing.length > 0 && "*"}
            </span>
          ))}
        </span>
      )}

      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-text-faint tabular-nums">
        {copies}
      </span>
    </div>
  );
}

function BreakdownCard({ title, subtitle, buckets }) {
  if (buckets.length === 0) return null;
  return (
    <Slip title={title} actions={subtitle ? <Eyebrow>{subtitle}</Eyebrow> : null}>
      <div>
        {buckets.map((bucket) => (
          <BreakdownRow key={bucket.key} bucket={bucket} />
        ))}
      </div>
    </Slip>
  );
}

/** A single "≈ USD 0.42 / hour" figure, for whichever targets have a rate. */
function PerHour({ perHour, className = "" }) {
  return (
    <span className={`flex gap-3 ${className}`}>
      {Object.entries(perHour).map(([code, cents]) => (
        <span key={code} className="font-mono tabular-nums text-text">
          ≈ {formatMoney(code, cents)}
          <span className="text-text-faint"> /h</span>
        </span>
      ))}
    </span>
  );
}

function ValueCard({ value }) {
  return (
    <Slip
      title="Value"
      actions={<Eyebrow>Rates as of {value.asOf}</Eyebrow>}
    >
      <div className="mb-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-faint mb-1">
          Overall
        </div>
        <PerHour perHour={value.overall} className="text-lg" />
        <p className="mt-1 font-mono text-[11px] text-text-faint">
          {Math.round(value.hours).toLocaleString()} hours over {value.titles}{" "}
          priced {value.titles === 1 ? "title" : "titles"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "Best value", titles: value.best },
          { label: "Worst value", titles: value.worst },
        ].map(({ label, titles }) => (
          <div key={label}>
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-faint mb-1.5">
              {label}
            </div>
            <div className="space-y-1">
              {titles.map((title) => (
                <div
                  key={title.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-sm text-text truncate" title={title.name}>
                    {title.name}
                  </span>
                  <PerHour perHour={title.perHour} className="text-[11px] shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Two ways to be left out, and they mean different things - so both
          are named rather than rolled into one "excluded" number. */}
      {(value.excluded > 0 || value.unconvertible > 0) && (
        <p className="mt-4 pt-3 border-t border-dotted border-border-strong/60 font-mono text-[11px] text-text-faint">
          {value.excluded > 0 && (
            <>Excludes {value.excluded} priced{" "}
            {value.excluded === 1 ? "title" : "titles"} with no hours logged.{" "}</>
          )}
          {value.unconvertible > 0 && (
            <>
              {value.unconvertible}{" "}
              {value.unconvertible === 1 ? "title has" : "titles have"} no rate
              for {value.unconvertible === 1 ? "its" : "their"} currency.
            </>
          )}
        </p>
      )}
    </Slip>
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

  const years = spendByYear(games, fxRates);
  const storefronts = spendByStorefront(games, fxRates);
  // Null without rates, by design - see costPerHour.
  const value = costPerHour(games, fxRates);

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

      {value && (
        <div className="mt-6">
          <ValueCard value={value} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="By Year"
          subtitle="when acquired"
          buckets={years}
        />
        <BreakdownCard
          title="By Storefront"
          subtitle="where bought"
          buckets={storefronts}
        />
      </div>
    </section>
  );
}
