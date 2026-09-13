// Frontend: statistics page file for gameSpend.
//
// Totals what the game collection cost, out of the copy rows the game list
// already carries. Pure functions, no React: the arithmetic here is the part
// worth testing, and it is easier to test when nothing has to be rendered.

// Subtotals are kept in minor units (cents) and only divided at the end.
// Summing 0.1 + 0.2 in float across a few hundred copies drifts by enough to
// show in the last printed digit, and a spend total that does not tie out to
// the copies it came from reads as a bug even when it is off by a cent.
const toCents = (value) => {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 100);
};

// A copy with no currency recorded still cost something, so it is counted
// and shown - under this key, which is not a currency code and so can never
// collide with one. It simply cannot be converted.
export const NO_CURRENCY = "—";

const normaliseCode = (raw) => {
  const code = (raw || "").trim().toUpperCase();
  return code || NO_CURRENCY;
};

/**
 * Every priced copy across every game, flattened.
 *
 * A copy counts when it records a price. Nothing is filtered on ownership or
 * acquisition here: a gifted or free copy simply has no price to add, so it
 * drops out on its own and the rule stays one sentence.
 */
function pricedCopies(games) {
  const rows = [];
  (games || []).forEach((game) => {
    (game.copies || []).forEach((copy) => {
      const cents = toCents(copy.price_paid);
      if (cents === null) return;
      rows.push({ cents, code: normaliseCode(copy.price_currency), copy });
    });
  });
  return rows;
}

function subtotal(rows) {
  const byCurrency = {};
  rows.forEach(({ cents, code }) => {
    if (!byCurrency[code]) byCurrency[code] = { code, cents: 0, copies: 0 };
    byCurrency[code].cents += cents;
    byCurrency[code].copies += 1;
  });
  return Object.values(byCurrency).sort(
    // Biggest spend first, but the uncurrencied bucket always last: it is a
    // data-quality remark, not a result, and it should not lead the column.
    (a, b) =>
      (a.code === NO_CURRENCY) - (b.code === NO_CURRENCY) || b.cents - a.cents,
  );
}

/**
 * Convert a per-currency subtotal into one target currency.
 *
 * `rates` is units-of-currency per one unit of `base`, so a TWD amount
 * reaches the base by dividing and leaves it by multiplying.
 *
 * Returns null when the target itself has no rate - there is no total to
 * show, and showing one built from a missing rate is the failure this guards
 * against. `missing` names the currencies that could not be converted, so
 * the page can say the figure is partial instead of quietly undercounting.
 */
export function convertSubtotal(rows, fx, target) {
  if (!fx || !fx.rates || !fx.base) return null;
  const targetRate = fx.rates[target];
  if (!targetRate) return null;

  let cents = 0;
  const missing = [];
  rows.forEach((row) => {
    const rate = fx.rates[row.code];
    if (!rate) {
      missing.push(row.code);
      return;
    }
    cents += (row.cents / rate) * targetRate;
  });
  return { code: target, cents: Math.round(cents), missing };
}

const TARGETS = ["USD", "TWD"];

/**
 * One column of the spend block.
 *
 * `rows` are the priced copies that belong in it; the caller decides which,
 * so "owned" and "bought" differ only by that filter.
 */
function column(key, label, rows, fx) {
  const currencies = subtotal(rows);
  return {
    key,
    label,
    currencies,
    copies: rows.length,
    converted: TARGETS.map((target) => convertSubtotal(currencies, fx, target))
      .filter(Boolean),
  };
}

/**
 * The whole block: what the collection cost, owned and bought.
 *
 * Owned is every priced copy. Bought narrows to the ones actually purchased,
 * so a bundled or subscription copy that happens to carry a price does not
 * inflate what was spent buying games.
 */
export default function computeGameSpend(games, fxRates) {
  const fx = fxRates && fxRates.base ? fxRates : null;
  const all = pricedCopies(games);
  const bought = all.filter(({ copy }) => copy.acquisition === "Bought");

  return {
    columns: [
      column("owned", "Owned", all, fx),
      column("bought", "Bought", bought, fx),
    ],
    asOf: fx ? fx.asOf || fx.as_of || null : null,
    // Nothing priced anywhere - the caller hides the block rather than
    // printing a wall of zeroes on a collection with no purchases recorded.
    isEmpty: all.length === 0,
  };
}

/**
 * "USD 412.50". Currency first, matching the game detail page's copy rows.
 *
 * Grouped thousands, because these totals get long - and always two decimal
 * places even for a whole number, so a column of them lines up on the point.
 */
export function formatMoney(code, cents) {
  const amount = (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return code === NO_CURRENCY ? amount : `${code} ${amount}`;
}
